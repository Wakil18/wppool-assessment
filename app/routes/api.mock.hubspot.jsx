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

  console.log("[Mock HubSpot] Received payload:", JSON.stringify(payload, null, 2));

  if (process.env.MOCK_HUBSPOT_FAIL === "true") {
    console.log("[Mock HubSpot] Configured to fail — returning 503");
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ status: "accepted", contactId: "mock-contact", dealId: "mock-deal" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
