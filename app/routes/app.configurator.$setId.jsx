/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { FieldsCard } from "../components/FieldsCard";
import { OptionSetNameCard } from "../components/OptionSetNameCard";
import { ScopeCard } from "../components/ScopeCard";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { GET_SHOP_ID_QUERY } from "../helpers/graphqlQueries";
import { fanOutMetafield } from "../helpers/metafields.server";
import { createEmptyField, createSnapshot } from "../helpers/fieldUtils";

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);

  // Get shop GID (needed for shop-scoped metafields)
  const shopRes = await admin.graphql(GET_SHOP_ID_QUERY);
  const { data: shopData } = await shopRes.json();
  const shopId = shopData.shop.id;

  if (params.setId === "new") {
    return {
      set: null,
      shopId,
      shop: session.shop,
    };
  }

  const set = await prisma.optionSet.findFirst({
    where: { id: params.setId, shop: session.shop },
  });

  if (!set) throw new Response("Option Set not found", { status: 404 });

  // Pre-resolve collection title for the collections scope display
  let initialCollectionLabel = "";
  if (set.scopeType === "collections") {
    let collectionId = null;
    try { const ids = JSON.parse(set.scopeValue ?? "[]"); collectionId = ids[0] ?? null; } catch { /* ignore */ }
    if (collectionId) {
      const colRes = await admin.graphql(
        `query GetCollectionLabel($id: ID!) { collection(id: $id) { title } }`,
        { variables: { id: collectionId } }
      );
      const { data: colData } = await colRes.json();
      initialCollectionLabel = colData?.collection?.title ?? "";
    }
  }

  // Pre-resolve product GIDs → titles/images for the manual scope display
  let initialProductLabels = [];
  if (set.scopeType === "manual") {
    let productIds = [];
    try { productIds = JSON.parse(set.scopeValue ?? "[]"); } catch { /* ignore */ }
    if (productIds.length > 0) {
      const nodesRes = await admin.graphql(
        `query GetProductLabels($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage { url }
            }
          }
        }`,
        { variables: { ids: productIds } }
      );
      const { data: nodesData } = await nodesRes.json();
      initialProductLabels = (nodesData?.nodes ?? [])
        .filter(Boolean)
        .map((p) => ({ id: p.id, title: p.title, image: p.featuredImage?.url ?? null }));
    }
  }

  return { set, shopId, shop: session.shop, initialProductLabels, initialCollectionLabel };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = formData.get("name");
  const scopeType = formData.get("scopeType");
  const scopeValue = formData.get("scopeValue"); // JSON string
  const definitionJson = formData.get("definition"); // JSON string

  // Basic validation
  if (!name?.trim()) return { success: false, errors: [{ message: "Name is required." }] };
  if (!definitionJson) return { success: false, errors: [{ message: "Definition is missing." }] };

  // Get shop GID
  const shopRes = await admin.graphql(GET_SHOP_ID_QUERY);
  const { data: shopData } = await shopRes.json();
  const shopId = shopData.shop.id;

  // Upsert in DB
  const data = {
    shop: session.shop,
    name: name.trim(),
    scopeType,
    scopeValue,
    definition: definitionJson,
  };

  let set;
  if (params.setId === "new") {
    set = await prisma.optionSet.create({ data });
  } else {
    set = await prisma.optionSet.update({
      where: { id: params.setId },
      data,
    });
  }

  // Fan-out to Shopify metafields
  const metafieldErrors = await fanOutMetafield(admin, scopeType, scopeValue, definitionJson, shopId);

  if (metafieldErrors.length > 0) {
    return { success: false, errors: metafieldErrors, setId: set.id };
  }

  return { success: true, setId: set.id };
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function OptionSetEditor() {
  const { set, shopId, initialProductLabels = [], initialCollectionLabel = "" } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  // ---- Initial values (stable references derived from loader data) ----
  const initialName = set?.name ?? "";
  const initialScopeType = set?.scopeType ?? "all";
  const initialScopeValue = (() => {
    try { return JSON.parse(set?.scopeValue ?? "[]"); } catch { return []; }
  })();
  const initialTagInput = (() => {
    if (set?.scopeType === "tags") {
      try { return JSON.parse(set.scopeValue).join(", "); } catch { return ""; }
    }
    return "";
  })();
  const initialFields = (() => {
    try { return JSON.parse(set?.definition ?? '{"fields":[]}').fields; } catch { return []; }
  })();

  // ---- State ----
  const [name, setName] = useState(initialName);
  const [scopeType, setScopeType] = useState(initialScopeType);
  const [scopeValue, setScopeValue] = useState(initialScopeValue);
  const [tagInput, setTagInput] = useState(initialTagInput);
  const [collectionLabel, setCollectionLabel] = useState(initialCollectionLabel);
  const [productLabels, setProductLabels] = useState(initialProductLabels);
  const [fields, setFields] = useState(initialFields);
  const [editingId, setEditingId] = useState(null);

  const isSaving = fetcher.state !== "idle";
  const isNew = !set;

  // ---- Stable initial snapshot (re-baselined after successful save) ----
  const initialSnapshotRef = useRef(
    createSnapshot({ name: initialName, scopeType: initialScopeType, scopeValue: initialScopeValue, tagInput: initialTagInput, fields: initialFields })
  );

  const isDirty = createSnapshot({ name, scopeType, scopeValue, tagInput, fields }) !== initialSnapshotRef.current;

  // ---- Setters ----
  const handleNameChange = (v) => setName(v);
  const handleScopeTypeChange = (v) => setScopeType(v);
  const handleScopeValueChange = (v) => setScopeValue(v);
  const handleTagInputChange = (v) => setTagInput(v);

  // ---- Toast on save result ----
  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.success) {
      initialSnapshotRef.current = createSnapshot({ name, scopeType, scopeValue, tagInput, fields });
      shopify.toast.show("Option Set saved!");
      if (isNew && fetcher.data.setId) {
        navigate(`/app/configurator/${fetcher.data.setId}`, { replace: true });
      }
    } else if (fetcher.data.errors?.length) {
      shopify.toast.show(
        fetcher.data.errors.map((e) => e.message).join(", "),
        { isError: true }
      );
    }
  }, [fetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Discard ----
  function handleDiscard() {
    setName(initialName);
    setScopeType(initialScopeType);
    setScopeValue(initialScopeValue);
    setTagInput(initialTagInput);
    setCollectionLabel(initialCollectionLabel);
    setProductLabels(initialProductLabels);
    setFields(initialFields);
    setEditingId(null);
    // snapshot effect will auto-hide the bar once state resets
  }

  // ---- Field helpers ----
  const sortedFields = [...fields].sort((a, b) => a.displayOrder - b.displayOrder);
  const nextDisplayOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.displayOrder)) + 1 : 1;

  const handleSaveField = useCallback((savedField) => {
    if (editingId === "__new__") {
      setFields((prev) => [...prev, { ...savedField, id: crypto.randomUUID() }]);
    } else {
      setFields((prev) => prev.map((f) => (f.id === editingId ? savedField : f)));
    }
    setEditingId(null);
  }, [editingId]);

  const handleDeleteField = useCallback((id) => {
    setFields((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f) => ({ ...f, conditions: f.conditions.filter((c) => c.fieldId !== id) }))
    );
  }, []);

  // ---- Submit ----
  const handleSubmit = useCallback(() => {
    if (fields.length === 0) {
      shopify.toast.show("Please add at least one field before saving.", { isError: true });
      return;
    }
    if (editingId !== null) {
      shopify.toast.show(
        "Please save or cancel the open field editor before saving the Option Set.",
        { isError: true }
      );
      return;
    }
    const effectiveScopeValue =
      scopeType === "tags"
        ? JSON.stringify(tagInput.split(",").map((t) => t.trim()).filter(Boolean))
        : JSON.stringify(scopeValue);

    fetcher.submit(
      {
        name,
        scopeType,
        scopeValue: effectiveScopeValue,
        definition: JSON.stringify({ version: "1", fields }),
        shopId,
      },
      { method: "POST" }
    );
  }, [editingId, fields, name, scopeType, scopeValue, tagInput, shopId, shopify, fetcher]);

  const editingField =
    editingId === "__new__"
      ? createEmptyField(nextDisplayOrder)
      : fields.find((f) => f.id === editingId) ?? null;

  return (
    <s-page heading={isNew ? "New Option Set" : `Edit: ${set.name}`}>

      <s-button
        slot="primary-action"
        onClick={handleSubmit}
        {...(isSaving ? { loading: true } : {})}
      >
        Save Option Set
      </s-button>

      {isDirty && (
        <s-button slot="secondary-actions" variant="secondary" tone="critical" onClick={handleDiscard}>
          Discard Changes
        </s-button>
      )}

      {/* <s-link
        // slot="breadcrumb-actions"
        onClick={(e) => { e.preventDefault(); navigate("/app/configurator"); }}
      >
        Back
      </s-link> */}

      <s-button slot="secondary-action" variant="secondary" onClick={() => navigate("/app/configurator")}>
        ← Back
      </s-button>

      <s-box paddingBlockStart="base" />

      {/* Card 1: Name */}
      <OptionSetNameCard value={name} onChange={handleNameChange} />

      {/* Card 2: Scope */}
      <ScopeCard
        scopeType={scopeType}
        setScopeType={handleScopeTypeChange}
        scopeValue={scopeValue}
        setScopeValue={handleScopeValueChange}
        tagInput={tagInput}
        setTagInput={handleTagInputChange}
        collectionLabel={collectionLabel}
        setCollectionLabel={setCollectionLabel}
        productLabels={productLabels}
        setProductLabels={setProductLabels}
        shopify={shopify}
      />

      {/* Card 3: Configurator Fields */}
      <FieldsCard
        fields={fields}
        sortedFields={sortedFields}
        editingId={editingId}
        setEditingId={setEditingId}
        editingField={editingField}
        handleSaveField={handleSaveField}
        handleDeleteField={handleDeleteField}
      />

      {/* Card 4: JSON Preview */}
      {/* {fields.length > 0 && (
        <s-section heading="Definition Preview (JSON)">
          <s-paragraph>
            This JSON is stored as a product/collection/shop metafield and read
            by the Theme App Extension at runtime.
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin: 0, fontSize: "12px", overflowX: "auto" }}>
              <code>{JSON.stringify({ version: "1", fields }, null, 2)}</code>
            </pre>
          </s-box>
        </s-section>
      )} */}

      {/* Save / Discard buttons at bottom */}
      <s-stack direction="inline" gap="base">
        <s-button
          onClick={handleSubmit}
          {...(isSaving ? { loading: true } : {})}
        >
          Save Option Set
        </s-button>
        {isDirty && (
          <s-button variant="secondary" tone="critical" onClick={handleDiscard}>
            Discard Changes
          </s-button>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
