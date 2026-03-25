import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncOrderToHoodslyHub } from "../utils/hoodslyhub.server";
import { syncToHubSpot } from "../utils/hubspot.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload;
  const orderId = String(order.id);
  const orderTotal = order.total_price || "0.00";
  const customerEmail = order.email || order.customer?.email || "";

  // Upsert so duplicate Shopify deliveries are safely idempotent
  const record = await db.orderSync.upsert({
    where: { orderId_shop: { orderId, shop } },
    create: {
      orderId,
      shop,
      status: "pending",
      payload: JSON.stringify(order),
      orderTotal,
      customerEmail,
    },
    update: {
      // Re-delivery: reset so we re-attempt the sync
      status: "pending",
      payload: JSON.stringify(order),
      orderTotal,
      customerEmail,
      retryCount: 0,
      nextRetryAt: null,
      errorMessage: null,
    },
  });

  // Attempt 1 — synchronous, fires immediately
  await syncOrderToHoodslyHub(record.id);

  // HubSpot — non-blocking; failures must not affect the 200 response
  syncToHubSpot(order).catch((err) => {
    console.error("[HubSpot] Unhandled error:", err.message || err);
  });

  return new Response(null, { status: 200 });
};
