# Agent Context — M2S Shopify App

> This file exists so any AI model (or human developer) picking up this repo immediately understands what is being built, why, and how — without needing prior conversation history.

---

## What This Is

A Shopify embedded app built on top of the official Shopify React Router 7 template. It is part of a **Magento-to-Shopify (M2S) migration assignment** for a range-hood e-commerce store (HoodslyCo / Novaxion project). The goal is to implement three systems that don't exist out-of-the-box in Shopify:

1. **Product Configurator Engine** — multi-field, conditional, price-adder-aware product customizer stored as product metafields; rendered on storefront via a Theme App Extension.
2. **Order Sync to HoodslyHub** — reliable order delivery to an external OMS with exponential backoff retry and an admin log UI.
3. **Bonus integrations** — Order Report, HubSpot CRM sync, BirdEye review requests, Rush Order priority queue.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (full-stack SSR, replaces Remix) |
| UI | React 18 + Shopify Polaris web components (`<s-*>` tags) |
| Backend | Node.js >=20.19 (same process as frontend, SSR) |
| Database | SQLite via Prisma 6 (`prisma/dev.sqlite`) |
| Shopify SDK | `@shopify/shopify-app-react-router` v1.1.0 |
| Shopify API | GraphQL Admin API — ApiVersion.October25 |
| Build | Vite 6 |
| Auth | Shopify OAuth; sessions stored in Prisma `Session` table |

---

## Environment Variables

```
SHOPIFY_API_KEY=               # From Shopify Partners dashboard
SHOPIFY_API_SECRET=            # From Shopify Partners dashboard
SHOPIFY_APP_URL=               # Tunneled URL (auto-set by shopify app dev)
SCOPES=                        # Comma-separated access scopes
DATABASE_URL=                  # Defaults to file:dev.sqlite

HOODSLYHUB_ENDPOINT=           # URL of HoodslyHub POST endpoint
                               # Defaults to /api/mock/hoodslyhub (internal mock)
MOCK_HOODSLYHUB_FAIL=          # Set to "true" to simulate HoodslyHub failures

HUBSPOT_ACCESS_TOKEN=          # HubSpot private app token (bonus)
BIRDEYE_API_KEY=               # BirdEye API key (bonus)
BIRDEYE_ENDPOINT=              # BirdEye endpoint (defaults to /api/mock/birdeye)
MOCK_BIRDEYE_FAIL=             # Set to "true" to simulate BirdEye failures
```

---

## Directory Layout

```
m2s/
├── AGENT_CONTEXT.md           ← This file
├── IMPLEMENTATION_PLAN.md     ← Step-by-step phased execution plan
├── shopify.app.toml           ← App config: client_id, scopes, webhooks, metafield defs
├── shopify.web.toml           ← Dev server commands
├── prisma/
│   ├── schema.prisma          ← Session model (auth) + OrderSync model (task 2)
│   └── migrations/            ← Auto-generated Prisma migrations
├── app/
│   ├── db.server.js           ← Prisma client singleton (do not modify)
│   ├── shopify.server.js      ← Shopify app initialisation + auth exports
│   ├── root.jsx               ← React Router root shell
│   ├── routes/
│   │   ├── app.jsx            ← Embedded app shell + main nav
│   │   ├── app._index.jsx     ← Home/dashboard page
│   │   │
│   │   │   ── TASK 1: Product Configurator ──
│   │   ├── app.configurator._index.jsx     ← Product list with "Edit Configurator" links
│   │   ├── app.configurator.$productId.jsx ← Schema builder UI (loader+action+UI)
│   │   │
│   │   │   ── TASK 2: Order Sync ──
│   │   ├── app.order-sync._index.jsx       ← Admin log UI (table, filters, retry button)
│   │   ├── webhooks.orders.create.jsx      ← orders/create webhook handler
│   │   ├── api.retry-processor.jsx         ← Internal polling endpoint for retries
│   │   ├── api.mock.hoodslyhub.jsx         ← Mock HoodslyHub endpoint
│   │   │
│   │   │   ── BONUS ──
│   │   ├── app.order-report.jsx            ← Filtered order report + CSV export
│   │   ├── webhooks.orders.fulfilled.jsx   ← orders/fulfilled → BirdEye
│   │   └── api.mock.birdeye.jsx            ← Mock BirdEye endpoint
│   └── utils/
│       ├── retry.server.js                 ← withRetry() exponential backoff utility
│       ├── hoodslyhub.server.js            ← syncOrderToHoodslyHub()
│       ├── hubspot.server.js               ← HubSpot contact+deal sync (bonus)
│       └── birdeye.server.js               ← BirdEye review request (bonus)
└── extensions/
    └── product-configurator/              ← Theme App Extension (task 1b)
        ├── extension.toml
        ├── blocks/configurator.liquid     ← Storefront configurator form
        └── assets/configurator.js         ← Condition eval + price calc + cart submit
```

---

## Database Models

### `Session` (existing — do not modify)
Managed by `@shopify/shopify-app-session-storage-prisma`. Stores Shopify OAuth sessions.

### `OrderSync` (added in Phase 1)
Tracks the sync state of every Shopify order sent to HoodslyHub.

```prisma
model OrderSync {
  id            String    @id @default(cuid())
  orderId       String                          // Shopify order GID e.g. gid://shopify/Order/12345
  shop          String                          // e.g. mystore.myshopify.com
  status        String                          // pending | synced | failed | permanently_failed
  retryCount    Int       @default(0)
  lastAttemptAt DateTime?
  nextRetryAt   DateTime?
  payload       String                          // JSON.stringify of full Shopify order object
  errorMessage  String?
  orderTotal    String                          // e.g. "149.99"
  customerEmail String
  isRush        Boolean   @default(false)       // Bonus: Rush Order flag
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([orderId, shop])
}
```

**Status transitions:**
```
(order created) → pending
pending         → synced            (successful POST to HoodslyHub)
pending/failed  → failed            (POST failed, retryCount < 3)
failed          → permanently_failed (retryCount >= 3)
permanently_failed → failed         (manual retry resets to failed, retryCount to 0)
```

---

## Configurator JSON Schema

The entire configurator definition for a product is stored as a single Shopify product metafield:
- **Namespace**: `app`
- **Key**: `configurator_definition`
- **Type**: `json`

### Full Schema Shape

```json
{
  "version": "1",
  "fields": [
    {
      "id": "uuid-v4-string",
      "type": "dropdown",
      "label": "Color",
      "required": true,
      "displayOrder": 1,
      "options": [
        { "value": "white", "label": "White", "priceAdder": 0 },
        { "value": "stainless", "label": "Stainless Steel", "priceAdder": 0 },
        { "value": "painted", "label": "Painted to Match", "priceAdder": 150 }
      ],
      "conditions": []
    },
    {
      "id": "another-uuid",
      "type": "text",
      "label": "Sherwin-Williams Color Code",
      "required": true,
      "displayOrder": 2,
      "options": [],
      "conditions": [
        { "fieldId": "uuid-v4-string", "operator": "equals", "value": "painted" }
      ]
    },
    {
      "id": "info-uuid",
      "type": "info",
      "label": "Note: Rush Manufacturing adds 5-7 business days.",
      "required": false,
      "displayOrder": 10,
      "options": [],
      "conditions": []
    }
  ]
}
```

### Field Types

| Type | Input rendered | Has options | Has priceAdder |
|------|---------------|-------------|----------------|
| `dropdown` | `<select>` | ✅ | ✅ (per option) |
| `radio` | `<input type="radio">` group | ✅ | ✅ (per option) |
| `text` | `<input type="text">` | ❌ | ❌ |
| `info` | Static message block | ❌ | ❌ |

### Condition Logic
- `conditions` array uses **AND** logic: all conditions must be true for the field to be visible
- Empty `conditions` array = always visible
- Operators: `equals`, `not_equals`
- `fieldId` references the `id` of another field in the same defintion

### Price Calculation
`cartPrice = product.variants[0].price + sum(priceAdder for each selected option)`

Price adders are in **USD dollars** (e.g., `150` = $150.00 added to cart price).

---

## HoodslyHub Integration

**Webhook flow:**
1. Shopify fires `orders/create` → `POST /webhooks/orders/create`
2. Handler creates `OrderSync` record (status: `pending`), stores full payload
3. Immediately attempts `syncOrderToHoodslyHub()` (attempt 1)
4. On failure: sets `retryCount=1`, `status=failed`, `nextRetryAt = now + 2min`
5. Retry processor polls and fires attempt 2 (delay: 2min), attempt 3 (delay: 4min)
6. After 3 failures: `status = permanently_failed`

**HoodslyHub payload shape:**
```json
{
  "orderId": "gid://shopify/Order/12345",
  "customerEmail": "customer@example.com",
  "lineItems": [
    {
      "title": "Range Hood",
      "quantity": 1,
      "price": "299.99",
      "properties": [
        { "name": "Color", "value": "Painted to Match" },
        { "name": "Sherwin-Williams Color Code", "value": "SW 7015" }
      ]
    }
  ],
  "shippingAddress": {
    "firstName": "Jane",
    "lastName": "Doe",
    "address1": "123 Main St",
    "city": "Austin",
    "province": "TX",
    "zip": "78701",
    "country": "US"
  },
  "orderTotal": "449.99"
}
```

**Retry schedule (exponential backoff):**
```
Attempt 1: immediate
Attempt 2: +2 minutes  (2^1 × 60s)
Attempt 3: +4 minutes  (2^2 × 60s)
After attempt 3 fails: permanently_failed
```

> **Known limitation:** There is no persistent background job queue (no Redis/Bull). Retries are scheduled via `nextRetryAt` timestamps in the DB and a `setInterval` polling loop started on server boot (or by calling `/api/retry-processor`). This is appropriate for a demo — a production system would use a proper job queue.

---

## Key GraphQL Operations

### Fetch product + configurator metafield
```graphql
query GetProductWithConfigurator($id: ID!) {
  product(id: $id) {
    id
    title
    variants(first: 1) {
      edges { node { price } }
    }
    metafield(namespace: "app", key: "configurator_definition") {
      id
      value
    }
  }
}
```

### Save configurator metafield
```graphql
mutation SetProductMetafield($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id key value }
    userErrors { field message }
  }
}
# Variables:
# { metafields: [{ ownerId: "gid://shopify/Product/123", namespace: "app",
#                  key: "configurator_definition", type: "json", value: "..." }] }
```

### Fetch orders for report (bonus)
```graphql
query GetOrders($query: String, $after: String) {
  orders(first: 50, query: $query, after: $after) {
    edges {
      node { id name email totalPriceSet { shopMoney { amount } } createdAt tags }
      cursor
    }
    pageInfo { hasNextPage }
  }
}
```

---

## Running Locally

```bash
npm install
npm run dev        # Starts Shopify CLI tunnel + dev server
```

First run will prompt you to select a development store and install the app.

```bash
npx prisma studio  # Browse DB in browser
npx prisma migrate dev --name <migration_name>  # After schema changes
```

## Extension Conventions

> **IMPORTANT:** Shopify extensions (Theme App Extensions, Shopify Functions, etc.) must **always** be scaffolded using the Shopify CLI first:
> ```bash
> shopify app generate extension --type <type> --name <name>
> ```
> Never create extension directories or files manually from scratch. The CLI generates the correct `shopify.extension.toml`, wires up the workspace entry in `package.json`, and ensures the extension is properly registered with the app. Only edit/replace file contents **after** the CLI has scaffolded the structure.

---

## Shopify Access Scopes Required

```
write_products
write_metaobject_definitions
write_metaobjects
read_orders
write_orders
```

---

## What Has Been Done vs What Is Left

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | AGENT_CONTEXT.md + IMPLEMENTATION_PLAN.md | ✅ Done |
| 1 | DB schema (OrderSync) + toml scopes/webhooks | ✅ Done |
| 2a | Configurator admin UI (schema builder) | ✅ Done |
| 2b | App nav links | ✅ Done |
| 3 | Theme App Extension (storefront configurator) | ✅ Done |
| 4 | Order sync infrastructure (HoodslyHub + retry) | ✅ Done |
| 5 | Order sync admin log UI | ✅ Done |
| 6 | Bonus: Order Report + CSV export | ✅ Done |
| 7 | Bonus: HubSpot CRM sync | ✅ Done |
| 8 | Bonus: BirdEye review request | ✅ Done |
| 9 | Bonus: Rush Order management | ✅ Done |
