import {
  SET_METAFIELDS_MUTATION,
  GET_SHOP_TAG_REGISTRY_QUERY,
} from "./graphqlQueries";

// ---------------------------------------------------------------------------
// Metafield fan-out helpers (server-side, called from action)
// ---------------------------------------------------------------------------

export async function fanOutMetafield(admin, scopeType, scopeValue, definitionJson, shopId) {
  const errors = [];

  if (scopeType === "all") {
    // Write to Shop metafield configurator_all_definition
    const res = await admin.graphql(SET_METAFIELDS_MUTATION, {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "$app",
          key: "configurator_all_definition",
          type: "json",
          value: definitionJson,
        }],
      },
    });
    
    const { data } = await res.json();

    console.log({allSaveData: data});

    const errs = data.metafieldsSet?.userErrors ?? [];
    if (errs.length > 0) {
      console.error("[Configurator] fanOutMetafield 'all' userErrors:", JSON.stringify(errs));
    } else {
      console.log("[Configurator] fanOutMetafield 'all' → shop metafield written OK (id:", data.metafieldsSet?.metafields?.[0]?.id, ")");
    }
    errors.push(...errs);
  }

  else if (scopeType === "collections") {
    const collectionGids = JSON.parse(scopeValue);
    if (collectionGids.length > 0) {
      const res = await admin.graphql(SET_METAFIELDS_MUTATION, {
        variables: {
          metafields: collectionGids.map((gid) => ({
            ownerId: gid,
            namespace: "$app",
            key: "configurator_definition",
            type: "json",
            value: definitionJson,
          })),
        },
      });
      const { data } = await res.json();

      console.log({collectionSaveData: data});

      const errs = data.metafieldsSet?.userErrors ?? [];
      if (errs.length > 0) {
        console.error("[Configurator] fanOutMetafield 'collections' userErrors:", JSON.stringify(errs));
      } else {
        console.log("[Configurator] fanOutMetafield 'collections' →", collectionGids.length, "collection metafield(s) written OK");
      }
      errors.push(...errs);
    }
  }

  else if (scopeType === "tags") {
    // Load existing registry, merge, write back
    const registryRes = await admin.graphql(GET_SHOP_TAG_REGISTRY_QUERY, {
      variables: { ownerId: shopId },
    });
    const { data: regData } = await registryRes.json();
    let registry = {};
    try {
      registry = JSON.parse(regData?.node?.metafield?.value ?? "{}");
    } catch { /* start fresh */ }

    const tags = JSON.parse(scopeValue);
    const definition = JSON.parse(definitionJson);
    for (const tag of tags) {
      registry[tag] = definition;
    }

    const res = await admin.graphql(SET_METAFIELDS_MUTATION, {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "$app",
          key: "configurator_tag_registry",
          type: "json",
          value: JSON.stringify(registry),
        }],
      },
    });
    const { data } = await res.json();

    console.log({tagRegistrySaveData: data});

    const errs = data.metafieldsSet?.userErrors ?? [];
    if (errs.length > 0) {
      console.error("[Configurator] fanOutMetafield 'tags' userErrors:", JSON.stringify(errs));
    } else {
      console.log("[Configurator] fanOutMetafield 'tags' → tag registry written OK, tags:", tags);
    }
    errors.push(...errs);
  }

  else if (scopeType === "manual") {
    const productGids = JSON.parse(scopeValue);
    if (productGids.length > 0) {
      const res = await admin.graphql(SET_METAFIELDS_MUTATION, {
        variables: {
          metafields: productGids.map((gid) => ({
            ownerId: gid,
            namespace: "$app",
            key: "configurator_definition",
            type: "json",
            value: definitionJson,
          })),
        },
      });
      const { data } = await res.json();
      delete data.headers; // Remove headers from log for readability
      delete data.extensions; // Remove headers from log for readability

      console.log(JSON.stringify({manualSaveData: data}, null, 2));

      const errs = data.metafieldsSet?.userErrors ?? [];
      if (errs.length > 0) {
        console.error("[Configurator] fanOutMetafield 'manual' userErrors:", JSON.stringify(errs));
      } else {
        console.log("[Configurator] fanOutMetafield 'manual' →", productGids.length, "product metafield(s) written OK");
      }
      errors.push(...errs);
    }
  }

  return errors;
}
