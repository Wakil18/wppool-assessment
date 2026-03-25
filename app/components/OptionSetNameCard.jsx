/* eslint-disable react/prop-types */

export function OptionSetNameCard({ value, onChange }) {
  return (
    <s-section heading="Option Set Details">
      <s-stack direction="block" gap="base">
        <s-text tone="subdued">Will be shown in the admin to identify this option set</s-text>

        <s-divider></s-divider>
      
        <s-stack direction="block" gap="small">
          <s-text-field
            label="Name"
            placeholder="The option name"
            value={value}
            maxlength="150"
            onInput={(e) => onChange(e.currentTarget.value)}
          />
        </s-stack>
      </s-stack>
    </s-section>
  );
}
