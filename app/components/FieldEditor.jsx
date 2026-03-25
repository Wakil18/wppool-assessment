/* eslint-disable react/prop-types */
import { useState } from "react";

const FIELD_TYPE_OPTIONS = [
  { value: "dropdown", label: "Dropdown" },
  { value: "radio", label: "Radio" },
  { value: "text", label: "Text Input" },
  { value: "info", label: "Info Block" },
];

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function FieldEditor({ initialField, allFields, onSave, onCancel }) {
  const [form, setForm] = useState(initialField);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const addOption = () =>
    set("options", [...form.options, { label: "", value: "", priceAdder: 0 }]);
  const updateOption = (i, key, value) => {
    const opts = [...form.options];
    opts[i] = { ...opts[i], [key]: value };
    if (key === "label") opts[i].value = slugify(value);
    set("options", opts);
  };
  const removeOption = (i) =>
    set("options", form.options.filter((_, idx) => idx !== i));

  const addCondition = () =>
    set("conditions", [
      ...form.conditions,
      { fieldId: "", operator: "equals", value: "" },
    ]);
  const updateCondition = (i, key, value) => {
    const conds = [...form.conditions];
    conds[i] = { ...conds[i], [key]: value };
    set("conditions", conds);
  };
  const removeCondition = (i) =>
    set("conditions", form.conditions.filter((_, idx) => idx !== i));

  const hasOptions = form.type === "dropdown" || form.type === "radio";

  const conditionableFields = allFields.filter(
    (f) =>
      f.id !== initialField.id &&
      (f.type === "dropdown" || f.type === "radio")
  );

  function handleSave() {
    if (!form.label.trim()) {
      // eslint-disable-next-line no-alert
      alert("Label is required.");
      return;
    }
    if (hasOptions && form.options.length === 0) {
      // eslint-disable-next-line no-alert
      alert("Add at least one option for dropdown/radio fields.");
      return;
    }
    onSave(form);
  }

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="base">

        {/* Type + Label + Order + Required */}
        <s-grid gridTemplateColumns="150px 1fr 90px auto" gap="base" alignItems="end">
          <s-select
            label="Type"
            value={form.type}
            onChange={(e) => set("type", e.currentTarget.value)}
          >
            {FIELD_TYPE_OPTIONS.map((o) => (
              <s-option key={o.value} value={o.value}>{o.label}</s-option>
            ))}
          </s-select>

          <s-text-field
            label="Label"
            placeholder="e.g. Color"
            value={form.label}
            onChange={(e) => set("label", e.currentTarget.value)}
          />

          <s-number-field
            label="Order"
            min={1}
            value={form.displayOrder}
            onChange={(e) => set("displayOrder", parseInt(e.currentTarget.value, 10) || 1)}
          />

          <s-checkbox
            checked={form.required}
            onChange={(e) => set("required", e.currentTarget.checked)}
            label="Required field"
          ></s-checkbox>
        </s-grid>

        {/* Options */}
        {hasOptions && (
          <s-stack direction="block" gap="base">
            <s-divider></s-divider>
            <s-text fontWeight="semibold">
              Options
              {/* <s-text tone="subdued">— value auto-fills from label; price in USD</s-text> */}
            </s-text>

            {form.options.map((opt, i) => (
              <s-grid key={i} gridTemplateColumns="1fr 120px auto" gap="base" alignItems="end">
                <s-text-field
                  label="Label"
                  placeholder="Label (e.g. Painted to Match)"
                  value={opt.label}
                  onChange={(e) => updateOption(i, "label", e.currentTarget.value)}
                />
                {/* <s-text-field
                  label="Value"
                  placeholder="auto-filled"
                  value={opt.value}
                  onChange={(e) => updateOption(i, "value", e.currentTarget.value)}
                /> */}
                <s-number-field
                  label="Price"
                  placeholder="$0.00"
                  min={0}
                  step={0.01}
                  value={opt.priceAdder}
                  onChange={(e) => updateOption(i, "priceAdder", parseFloat(e.currentTarget.value) || 0)}
                />
                <s-button variant="secondary" tone="critical" onClick={() => removeOption(i)}>×</s-button>
              </s-grid>
            ))}

            <s-button variant="secondary" onClick={addOption}>+ Add Option</s-button>
          </s-stack>
        )}

        {/* Conditions */}
        <s-stack direction="block" gap="base">
          <s-divider></s-divider>
          <s-text fontWeight="semibold">
            Visibility Conditions
          </s-text>

          {form.conditions.length === 0 && (
            <s-text tone="subdued">No conditions — field is always visible.</s-text>
          )}

          {form.conditions.map((cond, i) => (
            <s-grid key={i} gridTemplateColumns="1fr 130px 1fr auto" gap="base" alignItems="end">
              <s-select
                label="Field"
                placeholder="Select field…"
                value={cond.fieldId}
                onChange={(e) => updateCondition(i, "fieldId", e.currentTarget.value)}
              >
                {conditionableFields.map((f) => (
                  <s-option key={f.id} value={f.id}>{f.label}</s-option>
                ))}
              </s-select>
              <s-select
                label="Operator"
                value={cond.operator}
                onChange={(e) => updateCondition(i, "operator", e.currentTarget.value)}
              >
                <s-option value="equals">equals</s-option>
                <s-option value="not_equals">not equals</s-option>
              </s-select>
              <s-text-field
                label="Value"
                placeholder="Value"
                value={cond.value}
                onChange={(e) => updateCondition(i, "value", e.currentTarget.value)}
              />
              <s-button variant="secondary" tone="critical" onClick={() => removeCondition(i)}>×</s-button>
            </s-grid>
          ))}

          <s-button variant="secondary" onClick={addCondition}>+ Add Condition</s-button>
        </s-stack>

        {/* Actions */}
        <s-stack direction="inline" gap="base">
          <s-button onClick={handleSave}>Save Field</s-button>
          <s-button variant="secondary" onClick={onCancel}>Cancel</s-button>
        </s-stack>

      </s-stack>
    </s-box>
  );
}
