import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  cartTransformCreatedSuccess,
  getCartTransformCreateMutationWithHandle,
  GET_SHOP_DATA_QUERY,
  GET_ADDER_VARIANT_ID_QUERY,
  GET_ADDER_PRODUCT_STATUS_QUERY,
  UPDATE_PRODUCT_STATUS_MUTATION,
  CREATE_ADDER_PRODUCT_MUTATION,
  SET_METAFIELDS_MUTATION,
} from "./helpers/graphqlQueries";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  hooks: {
    afterAuth: async ({ session, admin }) => {
      shopify.registerWebhooks({ session });

      // ── 1. Fetch fresh shop data from Shopify API ────────────────────────────
      let shopGid, shopName, shopEmail, shopCurrency, shopTimezone;
      try {
        const shopRes = await admin.graphql(GET_SHOP_DATA_QUERY);
        const shopData = (await shopRes.json()).data?.shop;
        shopGid = shopData?.id;
        shopName = shopData?.name;
        shopEmail = shopData?.email;
        shopCurrency = shopData?.currencyCode;
        shopTimezone = shopData?.ianaTimezone;
      } catch (e) {
        console.error("[afterAuth] Failed to fetch shop data:", e);
      }

      // ── 2. Upsert Shop record — tracks installs and caches provisioning state ─
      let shopRecord = null;
      if (shopGid) {
        try {
          shopRecord = await prisma.shop.upsert({
            where: { gid: shopGid },
            update: {
              name: shopName,
              email: shopEmail,
              currency: shopCurrency,
              timezone: shopTimezone,
              installationsCount: { increment: 1 },
              uninstalledAt: null,
            },
            create: {
              gid: shopGid,
              myshopifyDomain: session.shop,
              name: shopName,
              email: shopEmail,
              currency: shopCurrency,
              timezone: shopTimezone,
            },
          });
        } catch (e) {
          console.error("[afterAuth] Shop upsert failed:", e);
        }
      }

      // ── 3. Cart transform activation (skip if already cached in DB) ──────────
      if (!shopRecord?.cartTransformActivated) {
        try {
          const cartTransformFunctionHandle = process.env.CART_TRANSFORM_FUNCTION_HANDLE;
          const activateRes = await admin.graphql(
            getCartTransformCreateMutationWithHandle(),
            { variables: { functionHandle: cartTransformFunctionHandle } }
          );
          const activateData = await activateRes.json();

          if (cartTransformCreatedSuccess(activateData)) {
            console.log(`[afterAuth] Cart transform activated for ${session.shop}`);
            if (shopRecord) {
              await prisma.shop.update({
                where: { gid: shopGid },
                data: { cartTransformActivated: true },
              });
              shopRecord.cartTransformActivated = true;
            }
          } else {
            console.warn("[afterAuth] Cart transform activation failed:", activateData?.data?.cartTransformCreate?.userErrors);
          }
        } catch (e) {
          console.error("[afterAuth] Cart transform activation error:", e);
        }
      }

      // ── 4. Adder variant provisioning (skip if cached in DB) ─────────────────
      if (!shopRecord?.adderVariantId) {
        try {
          // Check Shopify metafield first — handles legacy stores provisioned before DB tracking
          const checkRes = await admin.graphql(GET_ADDER_VARIANT_ID_QUERY);
          const checkData = await checkRes.json();
          const existingVariantId = checkData.data?.shop?.metafield?.value;

          if (existingVariantId) {
            // Legacy store: cache the variant GID in DB now
            if (shopRecord) {
              await prisma.shop.update({
                where: { gid: shopGid },
                data: { adderVariantId: existingVariantId },
              });
            }

            // Also upgrade DRAFT → UNLISTED if needed (one-time migration)
            const statusRes = await admin.graphql(GET_ADDER_PRODUCT_STATUS_QUERY, {
              variables: { variantId: existingVariantId },
            });
            const statusData = await statusRes.json();
            const product = statusData.data?.node?.product;

            if (product?.status === "DRAFT") {
              const upgradeRes = await admin.graphql(UPDATE_PRODUCT_STATUS_MUTATION, {
                variables: { input: { id: product.id, status: "UNLISTED" } },
              });
              const upgradeData = await upgradeRes.json();
              if (upgradeData.data?.productUpdate?.userErrors?.length) {
                console.warn("[afterAuth] Failed to upgrade adder product:", upgradeData.data.productUpdate.userErrors);
              } else {
                console.log(`[afterAuth] Upgraded adder product to UNLISTED: ${product.id}`);
              }
            } else {
              console.log(`[afterAuth] Adder variant from metafield, cached in DB: ${existingVariantId}`);
            }
          } else {
            // Fresh install: create the hidden UNLISTED "Custom Options" product
            const createRes = await admin.graphql(CREATE_ADDER_PRODUCT_MUTATION, {
              variables: { input: { title: "Custom Options", status: "UNLISTED" } },
            });
            const createData = await createRes.json();
            const variantId = createData.data?.productCreate?.product?.variants?.nodes?.[0]?.id;

            if (!variantId) {
              console.warn("[afterAuth] Failed to create adder product:", createData?.data?.productCreate?.userErrors);
            } else {
              // Store in metafield (read by the WASM cart transform function at runtime)
              await admin.graphql(SET_METAFIELDS_MUTATION, {
                variables: {
                  metafields: [{
                    ownerId: shopGid,
                    namespace: "$app",
                    key: "configurator_adder_variant_id",
                    type: "single_line_text_field",
                    value: variantId,
                  }],
                },
              });
              // And cache in DB for fast provisioning checks on future afterAuth calls
              if (shopRecord) {
                await prisma.shop.update({
                  where: { gid: shopGid },
                  data: { adderVariantId: variantId },
                });
              }
              console.log(`[afterAuth] Adder variant created and stored: ${variantId}`);
            }
          }
        } catch (e) {
          console.error("[afterAuth] Adder variant provisioning error:", e);
        }
      } else {
        console.log(`[afterAuth] Provisioning already complete for ${session.shop} (DB cache hit)`);
      }
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
