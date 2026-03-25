import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";

const ORDERS_QUERY = `#graphql
  query GetOrders($query: String, $first: Int!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          email
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          tags
          customer { firstName lastName }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Loader — also handles CSV export when ?export=1
// ---------------------------------------------------------------------------

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const startDate = url.searchParams.get("startDate") || "";
  const endDate = url.searchParams.get("endDate") || "";
  const tag = url.searchParams.get("tag") || "";
  const queryParts = [];
  if (startDate) queryParts.push(`created_at:>='${startDate}T00:00:00Z'`);
  if (endDate) queryParts.push(`created_at:<='${endDate}T23:59:59Z'`);

  const res = await admin.graphql(ORDERS_QUERY, {
    variables: {
      query: queryParts.join(" ") || undefined,
      first: 250,
    },
  });
  const data = await res.json();
  let orders = (data.data?.orders?.edges || []).map((e) => e.node);
  if (tag) {
    const tagLower = tag.toLowerCase();
    orders = orders.filter((o) =>
      (o.tags || []).some((t) => t.toLowerCase().includes(tagLower))
    );
  }

  const currency = orders[0]?.totalPriceSet?.shopMoney?.currencyCode || "USD";
  const totalRevenue = orders.reduce(
    (sum, o) => sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0),
    0
  );

  return {
    orders,
    summary: {
      totalOrders: orders.length,
      totalRevenue,
      avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      currency,
    },
    filters: { startDate, endDate, tag },
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderReportPage() {
  const { orders, summary, filters } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [startDateValue, setStartDateValue] = useState(filters.startDate);
  const [endDateValue, setEndDateValue] = useState(filters.endDate);
  const [tagValue, setTagValue] = useState(filters.tag);

  function applyFilters() {
    const params = new URLSearchParams(searchParams);
    if (startDateValue) params.set("startDate", startDateValue); else params.delete("startDate");
    if (endDateValue) params.set("endDate", endDateValue); else params.delete("endDate");
    if (tagValue) params.set("tag", tagValue); else params.delete("tag");
    setSearchParams(params);
  }

  function clearFilters() {
    setStartDateValue("");
    setEndDateValue("");
    setTagValue("");
    const params = new URLSearchParams(searchParams);
    params.delete("startDate");
    params.delete("endDate");
    params.delete("tag");
    setSearchParams(params);
  }

  function exportCSV() {
    const header = "Order #,Date,Customer,Email,Total,Currency\n";
    const rows = orders.map((o) => {
      const customer = o.customer
        ? `${o.customer.firstName || ""} ${o.customer.lastName || ""}`.trim()
        : "";
      return [
        `"${o.name}"`,
        `"${new Date(o.createdAt).toLocaleDateString(undefined, { timeZone: "UTC" })}"`,
        `"${customer}"`,
        `"${o.email || ""}"`,
        `"${o.totalPriceSet?.shopMoney?.amount || ""}"`,
        `"${o.totalPriceSet?.shopMoney?.currencyCode || ""}"`,
      ].join(",");
    });
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `order-report-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  function fmt(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      return `${currency} ${Number(amount).toFixed(2)}`;
    }
  }

  return (
    <s-page heading="Order Report">
      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <s-section heading="Summary">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight" alignItems="center">
              <s-text type="strong">{summary.totalOrders}</s-text>
              <s-text tone="subdued">Total Orders</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight" alignItems="center">
              <s-text type="strong">{fmt(summary.totalRevenue, summary.currency)}</s-text>
              <s-text tone="subdued">Total Revenue</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight" alignItems="center">
              <s-text type="strong">{fmt(summary.avgOrderValue, summary.currency)}</s-text>
              <s-text tone="subdued">Avg Order Value</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* ── Orders table with inline filters ─────────────────────────────── */}
      <s-section heading={`Orders (${orders.length})`}>
        <s-table>
          <s-box slot="filters" padding-block-end="base">
            <s-stack direction="block" gap="base">
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                <s-date-field
                  label="Start Date"
                  value={startDateValue}
                  onChange={(e) => setStartDateValue(e.currentTarget.value)}
                />
                <s-date-field
                  label="End Date"
                  value={endDateValue}
                  onChange={(e) => setEndDateValue(e.currentTarget.value)}
                />
                <s-text-field
                  label="Tag"
                  placeholder="e.g. wholesale"
                  value={tagValue}
                  onInput={(e) => setTagValue(e.currentTarget.value)}
                />
              </s-grid>
              <s-stack direction="inline" gap="base">
                <s-button onClick={applyFilters}>Apply Filters</s-button>
                <s-button variant="secondary" onClick={clearFilters}>Clear</s-button>
                <s-button
                  variant="secondary"
                  disabled={orders.length === 0 || undefined}
                  onClick={exportCSV}
                >
                  Export CSV
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>

          <s-table-header-row>
            <s-table-header listSlot="primary">Order #</s-table-header>
            <s-table-header listSlot="labeled">Date</s-table-header>
            <s-table-header listSlot="secondary">Customer</s-table-header>
            <s-table-header listSlot="labeled">Email</s-table-header>
            <s-table-header listSlot="labeled" format="currency">Total</s-table-header>
            <s-table-header listSlot="inline">Tags</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {orders.map((order) => {
              const customer = order.customer
                ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                : "—";
              return (
                <s-table-row key={order.id}>
                  <s-table-cell>
                    <s-text type="strong">{order.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{new Date(order.createdAt).toLocaleDateString(undefined, { timeZone: "UTC" })}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{customer || "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{order.email || "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {fmt(
                        parseFloat(order.totalPriceSet?.shopMoney?.amount || 0),
                        order.totalPriceSet?.shopMoney?.currencyCode || summary.currency
                      )}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="tight">
                      {(order.tags || []).map((t) => (
                        <s-badge key={t} tone="info">{t}</s-badge>
                      ))}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>

        {orders.length === 0 && (
          <s-box padding="base">
            <s-text tone="subdued">
              No orders match the selected filters. Try adjusting the date range or tag.
            </s-text>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}
