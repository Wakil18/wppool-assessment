const HUBSPOT_BASE = "https://api.hubapi.com";

async function syncToHubSpotMock(order) {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const email = order.email || order.customer?.email || "";
  const payload = {
    contact: {
      email,
      firstname: order.customer?.first_name || "",
      lastname: order.customer?.last_name || "",
    },
    deal: {
      name: `Order ${order.name || order.id}`,
      amount: String(order.total_price || "0"),
    },
  };
  try {
    const res = await fetch(`${baseUrl}/api/mock/hubspot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log(`[HubSpot Mock] Accepted for order ${order.id}:`, data);
  } catch (err) {
    console.error("[HubSpot Mock] Error:", err.message);
  }
}

/**
 * Creates or updates a HubSpot contact and deal for a Shopify order.
 * Falls back to mock endpoint when HUBSPOT_API_KEY is not configured.
 * Non-blocking — callers should fire-and-forget with .catch() for error logging.
 */
export async function syncToHubSpot(order) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    console.warn("[HubSpot] HUBSPOT_API_KEY not set — using mock endpoint");
    return syncToHubSpotMock(order);
  }

  const email = order.email || order.customer?.email || "";
  if (!email) {
    console.warn(`[HubSpot] Order ${order.id} has no email — skipping`);
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // 1. Search for existing contact by email
  let contactId;
  try {
    const searchRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
        properties: ["id", "email"],
        limit: 1,
      }),
    });
    const searchData = await searchRes.json();
    contactId = searchData.results?.[0]?.id;
  } catch (err) {
    console.error("[HubSpot] Contact search error:", err.message);
    return;
  }

  // 2. Upsert contact
  const contactProps = {
    email,
    firstname: order.customer?.first_name || "",
    lastname: order.customer?.last_name || "",
  };

  try {
    if (contactId) {
      await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ properties: contactProps }),
      });
    } else {
      const createRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ properties: contactProps }),
      });
      const createData = await createRes.json();
      contactId = createData.id;
    }
  } catch (err) {
    console.error("[HubSpot] Contact upsert error:", err.message);
    return;
  }

  if (!contactId) return;

  // 3. Create deal
  let dealId;
  try {
    const dealRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          dealname: `Order ${order.name || order.id}`,
          amount: String(order.total_price || "0"),
          closedate: new Date().toISOString().split("T")[0],
          dealstage: "closedwon",
          pipeline: "default",
        },
      }),
    });
    const dealData = await dealRes.json();
    dealId = dealData.id;
  } catch (err) {
    console.error("[HubSpot] Deal creation error:", err.message);
    return;
  }

  if (!dealId) return;

  // 4. Associate deal → contact
  try {
    await fetch(
      `${HUBSPOT_BASE}/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify([
          { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 },
        ]),
      }
    );
    console.log(`[HubSpot] Deal ${dealId} linked to contact ${contactId} for order ${order.id}`);
  } catch (err) {
    console.error("[HubSpot] Deal association error:", err.message);
  }
}
