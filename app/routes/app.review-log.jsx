import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendReviewRequest } from "../utils/birdeye.server";

const STATUS_TONES = {
  sent: "success",
  failed: "critical",
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const logs = await db.reviewLog.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    logs: logs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  };
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const logId = formData.get("logId");

  if (!logId) return { error: "Missing logId" };

  const log = await db.reviewLog.findFirst({
    where: { id: logId, shop: session.shop },
  });
  if (!log) return { error: "Not found" };

  if (intent === "retry") {
    await sendReviewRequest(
      {
        id: log.orderId,
        email: log.email,
        customer: { first_name: log.firstName },
      },
      session.shop
    );
    return { success: true };
  }

  return { error: "Unknown intent" };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReviewLogPage() {
  const { logs } = useLoaderData();
  const fetcher = useFetcher();

  const pendingId =
    fetcher.state !== "idle" ? fetcher.formData?.get("logId") : null;

  return (
    <s-page heading="BirdEye Review Requests">
      <s-section heading={`Logs (${logs.length})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Order ID</s-table-header>
            <s-table-header listSlot="secondary">Email</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Attempts</s-table-header>
            <s-table-header listSlot="labeled">Error</s-table-header>
            <s-table-header listSlot="labeled">Date</s-table-header>
            <s-table-header listSlot="inline">Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {logs.map((log) => {
              const isPending = pendingId === log.id;
              return (
                <s-table-row key={log.id}>
                  <s-table-cell>
                    <s-text>{log.orderId}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{log.email || "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS_TONES[log.status] || "attention"}>
                      {log.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{log.attempts}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone={log.errorMessage ? "critical" : undefined}>
                      {log.errorMessage || "—"}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {new Date(log.createdAt).toLocaleDateString(undefined, {
                        timeZone: "UTC",
                      })}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {log.status === "failed" && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="retry" />
                        <input type="hidden" name="logId" value={log.id} />
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
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>

        {logs.length === 0 && (
          <s-box padding="base">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-text tone="subdued">No review requests logged yet.</s-text>
            </s-stack>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}
