/* eslint-disable react/prop-types */
import { FieldEditor } from "./FieldEditor";

const TYPE_TONE = {
  dropdown: "info",
  radio: "success",
  text: "attention",
  info: "new",
};

export function FieldsCard({
  fields,
  sortedFields,
  editingId,
  setEditingId,
  editingField,
  handleSaveField,
  handleDeleteField,
}) {
  return (
    <s-section heading={`Configurator Fields (${fields.length})`}>
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Fields are rendered in ascending Display Order. Conditions use AND
          logic — all must be true for the field to appear on the storefront.
        </s-paragraph>
        
        <s-divider></s-divider>

        {sortedFields.map((field) => {
          const isEditing = editingId === field.id;
          return (
            <div key={field.id}>
              {isEditing ? (
                <FieldEditor
                  initialField={field}
                  allFields={fields}
                  onSave={handleSaveField}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  style={{ opacity: editingId && editingId !== field.id ? 0.4 : 1 }}
                >
                  <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                    <s-stack direction="inline" gap="base" alignItems="center" style={{ flex: 1 }}>
                      <s-text tone="subdued">#{field.displayOrder}</s-text>
                      <s-badge tone={TYPE_TONE[field.type]}>{field.type}</s-badge>
                      <s-text fontWeight="semibold">{field.label}</s-text>
                      {field.required && <s-badge tone="critical">required</s-badge>}
                      {field.options?.length > 0 && (
                        <s-text tone="subdued">
                          {field.options.length} option{field.options.length !== 1 ? "s" : ""}
                        </s-text>
                      )}
                      {field.conditions?.length > 0 && (
                        <s-text tone="subdued">
                          {field.conditions.length} condition{field.conditions.length !== 1 ? "s" : ""}
                        </s-text>
                      )}
                    </s-stack>
                    <s-stack direction="inline" gap="base">
                      <s-button
                        variant="secondary"
                        onClick={() => setEditingId(field.id)}
                        disabled={editingId !== null}
                      >
                        Edit
                      </s-button>
                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={() => handleDeleteField(field.id)}
                        disabled={editingId !== null}
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-box>
              )}
            </div>
          );
        })}

        {editingId === "__new__" && (
          <FieldEditor
            initialField={editingField}
            allFields={fields}
            onSave={handleSaveField}
            onCancel={() => setEditingId(null)}
          />
        )}

        {fields.length === 0 && editingId === null && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-paragraph>
              No fields yet — click &ldquo;Add Field&rdquo; to get started.
            </s-paragraph>
          </s-box>
        )}

        {editingId === null && (
          <s-button onClick={() => setEditingId("__new__")}>+ Add Field</s-button>
        )}
      </s-stack>
    </s-section>
  );
}
