import prisma from "../db.server.js";

function getEndpoint() {
  const localBase = `http://localhost:${process.env.PORT || 3000}`;
  return process.env.HOODSLYHUB_ENDPOINT || `${localBase}/api/mock/hoodslyhub`;
}

/**
 * Attempts to sync one OrderSync record to HoodslyHub.
 * Updates the DB record based on the outcome:
 *
 *   Success               → status: "synced"
 *   Failure, retryCount < 3 → status: "failed", nextRetryAt = now + 2^(retryCount-1) * 2 min
 *   Failure, retryCount >= 3 → status: "permanently_failed"
 *
 * Called from:
 *   - webhooks.orders.create.jsx (attempt 1, synchronous)
 *   - api.retry-processor.jsx   (subsequent attempts, background)
 */
export async function syncOrderToHoodslyHub(orderSyncId) {
  const record = await prisma.orderSync.findUnique({ where: { id: orderSyncId } });
  if (!record) {
    console.error(`[HoodslyHub] OrderSync record not found: ${orderSyncId}`);
    return { success: false, error: "Record not found" };
  }

  const endpoint = getEndpoint();

  try {
    let payload;
    try {
      payload = JSON.parse(record.payload);
    } catch {
      throw new Error("Stored payload is not valid JSON");
    }

    // Sending data to the external HoodslyHub endpoint
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HoodslyHub returned HTTP ${res.status}`);
    }

    await prisma.orderSync.update({
      where: { id: orderSyncId },
      data: {
        status: "synced",
        lastAttemptAt: new Date(),
        errorMessage: null,
      },
    });

    console.log(`[HoodslyHub] Order ${record.orderId} synced successfully`);
    return { success: true };
  } catch (err) {
    const newRetryCount = record.retryCount + 1;
    const isPermanentlyFailed = newRetryCount >= 3;
    // Backoff: 2min after attempt 1, 4min after attempt 2
    const nextRetryAt = isPermanentlyFailed
      ? null
      : new Date(Date.now() + Math.pow(2, newRetryCount - 1) * 2 * 60 * 1000);

    await prisma.orderSync.update({
      where: { id: orderSyncId },
      data: {
        status: isPermanentlyFailed ? "permanently_failed" : "failed",
        retryCount: newRetryCount,
        lastAttemptAt: new Date(),
        nextRetryAt,
        errorMessage: err.message,
      },
    });

    console.warn(
      `[HoodslyHub] Order ${record.orderId} sync failed (attempt ${newRetryCount}): ${err.message}`
    );

    if (!isPermanentlyFailed) {
      const delayMs =
        process.env.RETRY_DELAY_OVERRIDE_MS != null
          ? Number(process.env.RETRY_DELAY_OVERRIDE_MS)
          : Math.pow(2, newRetryCount - 1) * 2 * 60 * 1000;
      console.log(
        `[HoodslyHub] Scheduling auto-retry for order ${record.orderId} in ${delayMs}ms`
      );
      setTimeout(() => syncOrderToHoodslyHub(orderSyncId), delayMs);
    }

    return { success: false, error: err.message };
  }
}
