import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------------------------------------------------------------------------
// Scope metadata
// ---------------------------------------------------------------------------

const SCOPE_LABELS = {
  all: "All Products",
  collections: "By Collection",
  tags: "By Tag",
  manual: "Manual Selection",
};

const SCOPE_TONES = {
  all: "info",
  collections: "success",
  tags: "attention",
  manual: "new",
};

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const optionSets = await prisma.optionSet.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      scopeType: true,
      scopeValue: true,
      definition: true,
      updatedAt: true,
    },
  });

  return {
    optionSets: optionSets.map((s) => ({
      ...s,
      fieldCount: (() => {
        try {
          return JSON.parse(s.definition)?.fields?.length ?? 0;
        } catch {
          return 0;
        }
      })(),
      scopeDisplay: (() => {
        try {
          const vals = JSON.parse(s.scopeValue);
          if (!vals.length) return null;
          if (s.scopeType === "tags") return vals.join(", ");
          return `${vals.length} selected`;
        } catch {
          return null;
        }
      })(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const setId = formData.get("setId");

  if (intent === "delete") {
    await prisma.optionSet.deleteMany({
      where: { id: setId, shop: session.shop },
    });
    return { deleted: true };
  }

  return { error: "Unknown intent" };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConfiguratorIndex() {
  const { optionSets } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const pendingDeleteId =
    fetcher.state !== "idle" ? fetcher.formData?.get("setId") : null;

  const visibleSets = optionSets.filter((s) => s.id !== pendingDeleteId);

  function handleDelete(id) {
    // eslint-disable-next-line no-alert
    if (!confirm("Delete this Option Set? The metafield on Shopify resources will remain.")) return;
    fetcher.submit({ intent: "delete", setId: id }, { method: "POST" });
  }

  return (
    <s-page heading="Product Configurator">
      <s-button
        slot="primary-action"
        onClick={() => navigate("/app/configurator/new")}
      >
        New Option Set
      </s-button>

      <s-section heading={`Option Sets (${visibleSets.length})`}>
        {visibleSets.length === 0 && (
          <s-box padding="loose">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>No Option Sets yet</s-heading>
              <s-paragraph>
                Create your first Option Set to start building product
                configurators.
              </s-paragraph>

              <s-button slot="primary-action" onClick={() => navigate("/app/configurator/new")}>
                Create Option Set
              </s-button>

            </s-stack>
          </s-box>
        )}

        <s-stack direction="block" gap="base">
          {visibleSets.map((set) => (
            <s-box
              key={set.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-stack direction="block" gap="tight">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text fontWeight="bold">{set.name}</s-text>
                    <s-badge tone={SCOPE_TONES[set.scopeType]}>
                      {SCOPE_LABELS[set.scopeType]}
                    </s-badge>
                  </s-stack>
                  <s-text tone="subdued">
                    {set.fieldCount} field{set.fieldCount !== 1 ? "s" : ""}
                    {set.scopeDisplay ? ` · ${set.scopeDisplay}` : ""}
                    {" · Updated "}
                    {new Date(set.updatedAt).toLocaleDateString()}
                  </s-text>
                </s-stack>

                <s-stack direction="inline" gap="base">
                  <s-button
                    variant="secondary"
                    onClick={() => navigate(`/app/configurator/${set.id}`)}
                  >
                    Edit
                  </s-button>
                  <s-button
                    variant="secondary"
                    tone="critical"
                    onClick={() => handleDelete(set.id)}
                  >
                    Delete
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
