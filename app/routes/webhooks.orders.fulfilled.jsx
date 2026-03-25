import { authenticate } from "../shopify.server";
import { sendReviewRequest } from "../utils/birdeye.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Fire-and-forget — BirdEye failures must not affect the 200 response.
  // sendReviewRequest uses withRetry internally with short in-process delays.
  sendReviewRequest(payload, shop).catch((err) => {
    console.error("[BirdEye] Unhandled error:", err.message || err);
  });

  return new Response(null, { status: 200 });
};
