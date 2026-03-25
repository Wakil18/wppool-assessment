export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log("[Mock HoodslyHub] Received payload:", JSON.stringify(payload, null, 2));

  if (process.env.MOCK_HOODSLYHUB_FAIL === "true") {
    console.log("[Mock HoodslyHub] Configured to fail — returning 503");
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ status: "accepted", orderId: payload?.id }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
