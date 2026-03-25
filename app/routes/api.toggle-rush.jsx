import db from "../db.server";

/**
 * POST /api/toggle-rush
 * Body (FormData): orderSyncId
 *
 * Flips the isRush boolean on an OrderSync record.
 * Used programmatically; the admin UI handles rush toggles via its own action.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const formData = await request.formData();
  const orderSyncId = formData.get("orderSyncId");

  if (!orderSyncId) {
    return new Response("Missing orderSyncId", { status: 400 });
  }

  const record = await db.orderSync.findUnique({ where: { id: orderSyncId } });
  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  const updated = await db.orderSync.update({
    where: { id: orderSyncId },
    data: { isRush: !record.isRush },
  });

  return new Response(JSON.stringify(updated), {
    headers: { "Content-Type": "application/json" },
  });
};
