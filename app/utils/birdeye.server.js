import { withRetry } from "./retry.server.js";
import db from "../db.server.js";

function getEndpoint() {
  return (
    process.env.BIRDEYE_ENDPOINT ||
    `${process.env.SHOPIFY_APP_URL || "http://localhost:3000"}/api/mock/birdeye`
  );
}

/**
 * Sends a review request to BirdEye after order fulfillment.
 * Uses withRetry for in-process retries (3 attempts, 2 s base delay).
 * Designed to be fire-and-forget from the webhook handler.
 * @param {object} order  - Shopify order payload (id, email, customer)
 * @param {string} shop   - myshopify domain of the originating store
 */
export async function sendReviewRequest(order, shop) {
  const endpoint = getEndpoint();
  const email = order.email || order.customer?.email || "";
  const firstName = order.customer?.first_name || "";
  const orderId = String(order.id);
  const payload = { customerEmail: email, firstName, orderId };

  // Use a short base delay (2 s) since this runs in-process.
  // In production, offload to a proper job queue instead.
  const { success, attempts, error } = await withRetry(
    async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`BirdEye returned HTTP ${res.status}`);
    },
    3,
    2_000
  );

  if (success) {
    console.log(`[BirdEye] Review request sent for order ${orderId} after ${attempts} attempt(s)`);
  } else {
    console.warn(
      `[BirdEye] Review request failed after ${attempts} attempt(s): ${error?.message || error}`
    );
  }

  // Persist result to ReviewLog if shop is provided
  if (shop) {
    try {
      await db.reviewLog.upsert({
        where: { orderId_shop: { orderId, shop } },
        create: {
          shop,
          orderId,
          email,
          firstName,
          status: success ? "sent" : "failed",
          attempts,
          errorMessage: error?.message ?? null,
        },
        update: {
          status: success ? "sent" : "failed",
          attempts,
          errorMessage: error?.message ?? null,
          updatedAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error("[BirdEye] Failed to persist ReviewLog:", dbErr.message);
    }
  }
}
