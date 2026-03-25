// @ts-check

/**
 * @typedef {import("../generated/api").CartTransformRunInput} CartTransformRunInput
 * @typedef {import("../generated/api").CartTransformRunResult} CartTransformRunResult
 */

/**
 * @param {CartTransformRunInput} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  const operations = [];

  // The hidden "Custom Options" variant GID stored by afterAuth provisioning
  const adderVariantId = input.shop?.adderVariantId?.value ?? null;

  for (const line of input.cart.lines) {
    const variant = line.merchandise;
    if (!variant || !variant.product) continue;

    const metafieldRaw = variant.product.metafield?.value;
    if (!metafieldRaw) continue;

    const selectionsRaw = line.attribute?.value;
    if (!selectionsRaw) continue;

    let definition, selections;
    try {
      definition = JSON.parse(metafieldRaw);
      selections = JSON.parse(selectionsRaw);
    } catch {
      continue;
    }

    if (!Array.isArray(definition?.fields) || definition.fields.length === 0) continue;

    // Collect ALL fields with any selection: [{ fieldLabel, optionLabel, adder }]
    const adders = [];
    for (const field of definition.fields) {
      if (field.type === 'text') {
        const val = selections[field.id];
        if (!val) continue;
        adders.push({ fieldLabel: field.label, optionLabel: val, adder: 0 });
      } else if (field.type === 'dropdown' || field.type === 'radio') {
        const selectedValue = selections[field.id];
        if (!selectedValue) continue;
        const option = field.options?.find((o) => o.value === selectedValue);
        if (!option) continue;
        adders.push({
          fieldLabel: field.label,
          optionLabel: option.label,
          adder: Number(option.priceAdder ?? 0),
        });
      }
    }

    // Nothing to expand if no fields were selected
    if (adders.length === 0) continue;

    const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
    const totalAdder = adders.reduce((sum, a) => sum + a.adder, 0);

    if (!adderVariantId) {
      // Fallback: adder variant not provisioned — skip if only free options, else adjust price
      if (totalAdder === 0) continue;
      operations.push({
        lineExpand: {
          cartLineId: line.id,
          expandedCartItems: [
            {
              merchandiseId: variant.id,
              quantity: line.quantity,
              price: {
                adjustment: {
                  fixedPricePerUnit: { amount: (basePrice + totalAdder).toFixed(2) },
                },
              },
            },
          ],
        },
      });
      continue;
    }

    // Main path: original product at base price + one combined adder item with all options
    const expandedCartItems = [
      // Original product at its base price
      {
        merchandiseId: variant.id,
        quantity: line.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: basePrice.toFixed(2) },
          },
        },
      },
      // Single adder line carrying all selected options as attributes, price = sum of all adders
      {
        merchandiseId: adderVariantId,
        quantity: line.quantity,
        attributes: adders.map((a) => ({ key: a.fieldLabel, value: a.optionLabel })),
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: totalAdder.toFixed(2) },
          },
        },
      },
    ];

    operations.push({
      lineExpand: {
        cartLineId: line.id,
        // title: "GG",
        expandedCartItems,
      },
    });
  }

  return { operations };
}