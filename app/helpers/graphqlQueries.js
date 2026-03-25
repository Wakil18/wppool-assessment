export const GET_SHOP_ID_QUERY = `#graphql
  query GetShopId {
    shop { id }
  }
`;

export const GET_SHOP_DATA_QUERY = `#graphql
  query GetShopData {
    shop {
      id
      name
      email
      myshopifyDomain
      currencyCode
      ianaTimezone
    }
  }
`;

export const SET_METAFIELDS_MUTATION = `#graphql
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace value }
      userErrors { field message }
    }
  }
`;

export const GET_SHOP_TAG_REGISTRY_QUERY = `#graphql
  query GetTagRegistry($ownerId: ID!) {
    node(id: $ownerId) {
      ... on Shop {
        metafield(namespace: "$app", key: "configurator_tag_registry") {
          id
          value
        }
      }
    }
  }
`;

export const GET_CART_TRANSFORM_FUNCTION_QUERY = `#graphql
  query GetCartTransformFunction {
    shopifyFunctions(first: 25) {
      nodes {
        id
        apiType
        app {
          title
        }
      }
    }
  }
`;

// export const getCartTransformCreateMutationWithID = () => `#graphql
//   mutation cartTransformCreate($functionId: String!) {
//     cartTransformCreate(functionId: $functionId) {
//       cartTransform {
//         id
//         functionId
//       }
//       userErrors {
//         field
//         message
//       }
//     }
//   }
// `;

export const getCartTransformCreateMutationWithHandle = () => `#graphql
  mutation cartTransformCreate($functionHandle: String!) {
    cartTransformCreate(functionHandle: $functionHandle) {
      cartTransform {
        id
        functionId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const GET_ADDER_VARIANT_ID_QUERY = `#graphql
  query GetAdderVariantId {
    shop {
      metafield(namespace: "$app", key: "configurator_adder_variant_id") {
        value
      }
    }
  }
`;

export const CREATE_ADDER_PRODUCT_MUTATION = `#graphql
  mutation CreateAdderProduct($input: ProductCreateInput!) {
    productCreate(product: $input) {
      product {
        id
        variants(first: 1) {
          nodes {
            id
          }
        }
      }
      userErrors { field message }
    }
  }
`;

export const GET_ADDER_PRODUCT_STATUS_QUERY = `#graphql
  query GetAdderProductStatus($variantId: ID!) {
    node(id: $variantId) {
      ... on ProductVariant {
        product {
          id
          status
        }
      }
    }
  }
`;

export const UPDATE_PRODUCT_STATUS_MUTATION = `#graphql
  mutation UpdateProductStatus($input: ProductUpdateInput!) {
    productUpdate(product: $input) {
      product {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const cartTransformCreatedSuccess = (response) => {
  const cartTransformData = response?.data?.cartTransformCreate;

  const alreadyRegistered = cartTransformData?.userErrors?.some((err) =>
    err.message.toLowerCase().includes("already registered")
  );

  const hasTransformId = !!cartTransformData?.cartTransform?.id;

  return alreadyRegistered || hasTransformId;
};
