import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncOrderToHoodslyHub } from "../utils/hoodslyhub.server";

const STATUS_LABELS = {
  pending: "Pending",
  synced: "Synced",
  failed: "Failed",
  permanently_failed: "Permanently Failed",
};

const STATUS_TONES = {
  pending: "attention",
  synced: "success",
  failed: "critical",
  permanently_failed: "critical",
};

const ALL_STATUSES = ["all", "pending", "synced", "failed", "permanently_failed"];

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const searchQuery = url.searchParams.get("q") || "";

  const where = { shop: session.shop };
  if (statusFilter !== "all") where.status = statusFilter;
  if (searchQuery) {
    where.OR = [
      { orderId: { contains: searchQuery } },
      { customerEmail: { contains: searchQuery } },
    ];
  }

  const orders = await db.orderSync.findMany({
    where,
    orderBy: [{ isRush: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return {
    orders: orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      lastAttemptAt: o.lastAttemptAt?.toISOString() ?? null,
      nextRetryAt: o.nextRetryAt?.toISOString() ?? null,
    })),
    statusFilter,
    searchQuery,
  };
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id");

  if (!id) return { error: "Missing id" };

  // Verify ownership before mutating
  const record = await db.orderSync.findFirst({
    where: { id, shop: session.shop },
  });
  if (!record) return { error: "Not found" };

  if (intent === "retry") {
    await syncOrderToHoodslyHub(id);
    return { success: true };
  }

  if (intent === "toggle-rush") {
    await db.orderSync.update({
      where: { id },
      data: { isRush: !record.isRush },
    });
    return { success: true };
  }

  return { error: "Unknown intent" };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderSyncPage() {
  const { orders, statusFilter, searchQuery } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();

  // Track which row has a pending action for optimistic UI
  const pendingId =
    fetcher.state !== "idle" ? fetcher.formData?.get("id") : null;

  function applyFilter(key, value) {
    const params = new URLSearchParams(searchParams);
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    setSearchParams(params);
  }

  const canRetry = (o) => o.status === "permanently_failed";

  return (
    <s-page heading="Order Sync">
      <s-section heading={`Orders (${orders.length})`}>
        {/* Table — filters slot renders natively inside the table card */}
        <s-table>
          <s-grid slot="filters" gap="large-500" gridTemplateColumns="1fr auto">
            <s-search-field
              label-accessibility-visibility="exclusive"
              placeholder="Order ID or email"
              value={searchQuery}
              onInput={(e) => applyFilter("q", e.currentTarget.value)}
            />
            <s-stack direction="inline" gap="base">
              {ALL_STATUSES.map((s) => (
                <s-button
                  key={s}
                  size="slim"
                  variant={statusFilter === s ? "primary" : "secondary"}
                  onClick={() => applyFilter("status", s)}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s] || s}
                </s-button>
              ))}
            </s-stack>
          </s-grid>

          <s-grid gap="large-500" gridTemplateColumns="1fr auto"></s-grid>

          <s-table-header-row>
            <s-table-header listSlot="primary">Order ID</s-table-header>
            <s-table-header listSlot="secondary">Email</s-table-header>
            <s-table-header listSlot="labeled" format="currency">Total</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Retries</s-table-header>
            <s-table-header listSlot="labeled">Last Attempt</s-table-header>
            <s-table-header listSlot="inline">Rush</s-table-header>
            <s-table-header listSlot="inline">Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {orders.map((order) => {
              const isPending = pendingId === order.id;
              return (
                <s-table-row key={order.id}>
                  <s-table-cell>
                    <s-text>{order.orderId}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{order.customerEmail || "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>${order.orderTotal}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="tight">
                      <s-badge tone={STATUS_TONES[order.status]}>
                        {STATUS_LABELS[order.status] || order.status}
                      </s-badge>
                      {order.errorMessage && (
                        <s-text tone="critical">{order.errorMessage}</s-text>
                      )}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{order.retryCount}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {order.lastAttemptAt
                        ? new Date(order.lastAttemptAt).toLocaleString()
                        : "—"}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {order.isRush && (
                      <s-badge tone="warning">Rush</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base">
                      {canRetry(order) && (
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="retry" />
                          <input type="hidden" name="id" value={order.id} />
                          <s-button
                            size="slim"
                            tone="critical"
                            type="submit"
                            disabled={isPending || undefined}
                          >
                            Retry
                          </s-button>
                        </fetcher.Form>
                      )}
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="toggle-rush" />
                        <input type="hidden" name="id" value={order.id} />
                        <s-button
                          size="slim"
                          variant="secondary"
                          type="submit"
                          disabled={isPending || undefined}
                        >
                          {order.isRush ? "Unmark Rush" : "Mark Rush"}
                        </s-button>
                      </fetcher.Form>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>

        {orders.length === 0 && (
          <s-box padding="base">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-text tone="subdued">No orders match the selected filters.</s-text>
            </s-stack>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}
