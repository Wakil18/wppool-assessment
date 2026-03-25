import db from "../db.server";
import { syncOrderToHoodslyHub } from "../utils/hoodslyhub.server";

/**
 * GET /api/retry-processor
 *
 * Finds all OrderSync records that are due for a retry and re-syncs them.
 * Call this from a cron job or scheduled task.
 *
 * Optional security: set CRON_SECRET env var and pass it as
 *   Authorization: Bearer <CRON_SECRET>
 */
export const loader = async ({ request }) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const now = new Date();
  const due = await db.orderSync.findMany({
    where: {
      status: "failed",
      retryCount: { lt: 3 },
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
  });

  const results = [];
  for (const record of due) {
    const result = await syncOrderToHoodslyHub(record.id);
    results.push({ id: record.id, orderId: record.orderId, ...result });
  }

  console.log(`[RetryProcessor] Processed ${results.length} due record(s)`);
  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
};
