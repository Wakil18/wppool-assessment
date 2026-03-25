export function createEmptyField(displayOrder = 1) {
  return {
    id: "",
    type: "dropdown",
    label: "",
    required: false,
    displayOrder,
    options: [],
    conditions: [],
  };
}

export function createSnapshot({ name, scopeType, scopeValue, tagInput, fields }) {
  return JSON.stringify({
    name,
    scopeType,
    scopeValue: [...(scopeValue ?? [])].sort(),
    tagInput,
    fields,
  });
}
