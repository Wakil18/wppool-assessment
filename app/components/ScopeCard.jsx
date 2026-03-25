/* eslint-disable react/prop-types */

const productCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  background: "#fff",
};

const productImageStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "6px",
  background: "#f1f2f3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontSize: "20px",
  color: "#8c9196",
};

export function ScopeCard({
  scopeType,
  setScopeType,
  scopeValue,
  setScopeValue,
  tagInput,
  setTagInput,
  collectionLabel,
  setCollectionLabel,
  productLabels,
  setProductLabels,
  shopify,
}) {
  async function pickCollection() {
    const result = await shopify.resourcePicker({ type: "collection", multiple: false });
    if (result?.length) {
      setScopeValue([result[0].id]);
      setCollectionLabel(result[0].title);
    }
  }

  async function pickProducts() {
    const preselected = scopeValue.map((id) => ({ id }));
    const result = await shopify.resourcePicker({
      type: "product",
      multiple: 10,
      selectionIds: preselected,
    });
    if (result?.length) {
      setScopeValue(result.map((p) => p.id));
      setProductLabels(result.map((p) => ({ id: p.id, title: p.title, image: p.images[0]?.originalSrc, })));
    }
  }

  function removeProduct(productId) {
    const idx = scopeValue.indexOf(productId);
    if (idx === -1) return;
    setScopeValue(scopeValue.filter((id) => id !== productId));
    setProductLabels(productLabels.filter((p) => p.id !== productId));
  }

  return (
    <s-section heading="Product Scope">
      <s-stack direction="block" gap="base">
        <s-text tone="subdued">The options will be applied to the selected scope of products</s-text>

        <s-divider></s-divider>

        {/* Scope type choice list */}
        <s-choice-list
          label="Apply to"
          name="scopeType"
          values={[scopeType]}
          onChange={(e) => {
            const selected = e.currentTarget.values[0];
            setScopeType(selected);
            setScopeValue([]);
            setTagInput("");
            setCollectionLabel("");
            setProductLabels([]);
          }}
        >
          <s-choice value="all">All Products</s-choice>
          <s-choice value="collections">By Collection</s-choice>
          <s-choice value="tags">By Tag</s-choice>
          <s-choice value="manual">Specific Products</s-choice>
        </s-choice-list>

        {/* Conditional scope pickers */}
        {scopeType !== "all" && (
          <>
            <s-divider></s-divider>

            {/* Collections */}
            {scopeType === "collections" && (
              <s-stack direction="block" gap="base">
                {!(collectionLabel || scopeValue[0]) ? (
                  <s-box
                    padding="loose"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                    style={{ textAlign: "center" }}
                  >
                    <s-stack direction="block" gap="base" alignItems="center" padding="base">
                      <s-text tone="subdued">No collection selected</s-text>
                      <s-button onClick={pickCollection}>Browse collections</s-button>
                    </s-stack>
                  </s-box>
                ) : (
                  <>
                    <div style={productCardStyle}>
                      <div style={{ ...productImageStyle, fontSize: "22px" }}>🗂️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{collectionLabel || scopeValue[0]}</div>
                      </div>
                      <s-button
                        variant="secondary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel="Remove collection"
                        onClick={() => { setScopeValue([]); setCollectionLabel(""); }}
                      />
                    </div>
                    <s-button variant="secondary" onClick={pickCollection}>Change collection</s-button>
                  </>
                )}
              </s-stack>
            )}

            {/* Tags */}
            {scopeType === "tags" && (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Tags (write the comma-separated tags here)"
                  placeholder="tag1, tag2, tag3"
                  help-text="Enter comma-separated tags (e.g. premium, outdoor)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.currentTarget.value)}
                />
                {tagInput.trim() && (
                  <s-stack direction="block" gap="small">
                    {tagInput.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                      <div key={tag} style={productCardStyle}>
                        <div style={{ ...productImageStyle, fontSize: "18px" }}>🏷️</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>{tag}</div>
                        </div>
                        <s-button
                          variant="secondary"
                          tone="critical"
                          icon="delete"
                          accessibilityLabel={`Remove tag ${tag}`}
                          onClick={() => {
                            const updated = tagInput.split(",").map((t) => t.trim()).filter((t) => t && t !== tag);
                            setTagInput(updated.join(", "));
                          }}
                        />
                      </div>
                    ))}
                  </s-stack>
                )}
              </s-stack>
            )}

            {/* Manual — product cards */}
            {scopeType === "manual" && (
              <s-stack direction="block" gap="base">
                {productLabels.length === 0 ? (
                  <s-box
                    padding="loose"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                    style={{ textAlign: "center" }}
                  >
                    <s-stack direction="block" gap="base" alignItems="center" padding="base">
                      <s-text tone="subdued">No products selected</s-text>
                      <s-button onClick={pickProducts}>Browse products</s-button>
                    </s-stack>
                  </s-box>
                ) : (
                  <>
                    <s-stack direction="block" gap="small">
                      {productLabels.map((product) => (
                        <div key={product.id} style={productCardStyle}>
                          <div style={productImageStyle}>
                            {product.image ? <img src={product.image} alt={product.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>📦</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>{product.title}</div>
                          </div>
                          <s-button
                            variant="secondary"
                            tone="critical"
                            onClick={() => removeProduct(product.id)}
                            icon="delete"
                            accessibilityLabel="Remove product"
                          />
                        </div>
                      ))}
                    </s-stack>
                    <s-stack direction="inline" gap="large" alignItems="center">
                      <s-button variant="secondary" onClick={pickProducts}>
                        {/* {scopeValue.length > 0
                          ? `${scopeValue.length} product${scopeValue.length !== 1 ? "s" : ""} selected — edit`
                          : "Browse products"} */}
                          Browse products
                      </s-button>
                      <s-text tone="subdued">Maximum 10 products</s-text>
                    </s-stack>
                  </>
                )}
              </s-stack>
            )}
          </>
        )}
      </s-stack>
    </s-section>
  );
}
