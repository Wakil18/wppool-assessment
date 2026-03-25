# Implementation Plan — M2S Shopify App

> Phased execution plan for the Magento-to-Shopify assignment.
> See `AGENT_CONTEXT.md` for full project context, data models, and architecture.

---

## Phase 0 — Repository Documentation ✅

**Goal:** Ensure any developer or AI model picking up this repo has immediate context.

- [x] Create `AGENT_CONTEXT.md` — full project context, stack, data models, env vars, GraphQL operations
- [x] Create `IMPLEMENTATION_PLAN.md` — this file

---

## Phase 1 — Foundation & Configuration ✅

**Goal:** Set up DB schema, Shopify scopes, and webhook registrations needed by all downstream phases.

### 1.1 Update `prisma/schema.prisma`
Add `OrderSync` model:
```prisma
model OrderSync {
  id            String    @id @default(cuid())
  orderId       String
  shop          String
  status        String    // pending | synced | failed | permanently_failed
  retryCount    Int       @default(0)
  lastAttemptAt DateTime?
  nextRetryAt   DateTime?
  payload       String    // JSON.stringify of full order payload
  errorMessage  String?
  orderTotal    String
  customerEmail String
  isRush        Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@unique([orderId, shop])
}
```

### 1.2 Run Prisma migration
```bash
npx prisma migrate dev --name add_order_sync
```

### 1.3 Update `shopify.app.toml`
- Add scopes: `read_orders`, `write_orders`
- Add webhook subscriptions:
  - `orders/create → /webhooks/orders/create`
  - `orders/fulfilled → /webhooks/orders/fulfilled`
- Add product metafield definition:
  - namespace: `app`, key: `configurator_definition`, type: `json`

---

## Phase 2a — Task 1a: Product Configurator Admin UI (REDESIGNED)

**Goal:** Admin interface to create and manage reusable **Option Sets** — a configurator definition scoped to all products, a collection, specific tags, or up to 10 manually picked products. This replaces the original per-product approach.

> **Redesign rationale:** The original per-product approach required merchants to configure each product individually and loaded a paginated list of all products. The Option Set model lets merchants define a schema once and apply it broadly, which is far more practical for large catalogs.

---

### Confirmed Decisions

| Decision | Value |
|----------|-------|
| `app.configurator.$productId.jsx` | **Deleted** — fully replaced by Option Sets |
| Manual scope max products | **10** (`multiple: 10` in `shopify.resourcePicker`) |
| Tags storage | **Shop metafield registry** — `configurator_tag_registry` JSON map `{ "tag": definition }`. No per-product fan-out. Resolved by Theme Extension JS at runtime. |
| Priority (multiple sets matching one product) | **manual > tags > collections > all** — enforced in Theme Extension (Phase 3). Admin UI does not enforce this. |
| UI component policy | **Shopify web components exclusively** (`<s-*>` tags). Native `<input type="radio">` fallback for radio group only if `<s-radio-group>` is unavailable. |
| Multiple sets targeting same tag | Last save wins for that tag key in registry — acceptable for MVP |
| Delete set | DB record removed; metafield on resource is left in place for MVP |

---

### DB Model

New `OptionSet` model in `prisma/schema.prisma`:
```prisma
model OptionSet {
  id         String   @id @default(cuid())
  shop       String
  name       String
  scopeType  String   // all | collections | tags | manual
  scopeValue String   @db.Text  // JSON array: [] for all, [collectionGid], ["tag1","tag2"], [productGid,...]
  definition String   @db.Text  // JSON: { version: "1", fields: [...] }
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([shop])
}
```

### Configurator JSON Schema (stored in the `definition` column and written to Shopify metafields)
```json
{
  "version": "1",
  "fields": [
    {
      "id": "uuid",
      "type": "dropdown | radio | text | info",
      "label": "Color",
      "required": true,
      "displayOrder": 1,
      "options": [
        { "value": "painted", "label": "Painted to Match", "priceAdder": 150 }
      ],
      "conditions": [
        { "fieldId": "other-uuid", "operator": "equals | not_equals", "value": "yes" }
      ]
    }
  ]
}
```
- `options` only for `dropdown`/`radio` types
- `info` = read-only message block (no input, no priceAdder)
- `text` = free-form text input (no options, no priceAdder)
- `conditions` = AND logic; all must be true for field to show
- `priceAdder` = USD dollars

### Metafield Storage Strategy

| Scope | Resource | Metafield Namespace/Key | Notes |
|---|---|---|---|
| `all` | Shop | `$app / configurator_all_definition` | Overwritten on each save |
| `collections` | Collection (GID in `scopeValue[0]`) | `$app / configurator_definition` | Single `metafieldsSet` mutation |
| `tags` | Shop | `$app / configurator_tag_registry` | Load existing JSON map, merge/update tag keys, write back |
| `manual` | Each Product GID in `scopeValue` (≤ 10) | `$app / configurator_definition` | Bulk `metafieldsSet` with one entry per product |

### 2.1 Prisma migration
```bash
npx prisma db push
```
Create `prisma/migrations/20260319000001_add_option_set/migration.sql` with MySQL DDL, mark applied.

### 2.2 Rewrite `app/routes/app.configurator._index.jsx` → Option Set list
- Loader: `prisma.optionSet.findMany({ where: { shop } })`
- Action: `intent: "delete"` + `setId` → `prisma.optionSet.delete`
- UI: rows showing name, scope type badge, field count, Edit / Delete buttons
- Empty state section; "New Option Set" primary action → `navigate("/app/configurator/new")`

### 2.3 Create `app/routes/app.configurator.$setId.jsx` → Option Set editor
- **Loader:** `setId === "new"` → return empty scaffold `{ set: null, shopId: "..." }`; else `prisma.optionSet.findUnique`
  - Also queries `{ shop { id } }` to get Shop GID for metafield writes
- **Action:** DB upsert → metafield fan-out per strategy table above → return `{ success, errors }`
- **Scope selector section** (`<s-section heading="Product Scope">`):
  - Name: `<s-text-field>` or styled native `<input>`
  - 4 radio options in `<s-stack direction="inline" gap="loose">`:
    - **All Products** — no extra UI
    - **By Collection** — `<s-button>` → `shopify.resourcePicker({ type: 'collection', multiple: false })`; shows selected collection title
    - **By Tag** — text input for comma-separated tags; renders tag chips in `<s-stack>`
    - **Manual Selection** — `<s-button>` → `shopify.resourcePicker({ type: 'product', multiple: 10 })`; lists product titles; max 10 enforced
- **Field builder section** (`<s-section heading="Configurator Fields">`):
  - Field list sorted by `displayOrder`; collapsed rows with `<s-badge>` type chip, label, field count summary
  - Inline `FieldEditor` sub-component per active edit:
    - `<s-select>` for field type (fallback: native `<select>`)
    - `<s-text-field>` for label, option label/value inputs
    - `<s-checkbox>` for required toggle
    - `<s-stack>` for all layout (replaces all `display: grid`/`display: flex` divs)
    - Options section (dropdown/radio only): label → auto-slugified value + priceAdder per option
    - Conditions section: fieldId selector (other dropdown/radio fields only) + operator + value; AND logic
    - Delete cleans up orphaned conditions referencing the deleted field's ID
  - "Add Field" button; "Save Configurator" submits full JSON via `useFetcher`
  - Toast: `useEffect` on `fetcher.data.success` → `shopify.toast.show("Saved!")`

### 2.4 Update `app/routes/app.jsx` ✅ (already done)
Nav links already added:
```jsx
<s-link href="/app/configurator">Configurator</s-link>
<s-link href="/app/order-sync">Order Sync</s-link>
```

---

## Phase 2b — Task 1b: Cart Transform Shopify Function

**Goal:** Apply configurator price adders at the Shopify checkout level. This is the **only Shopify-native way** to modify a line item's price — the storefront JS display is cosmetic only; the Cart Transform Function is what actually charges the correct amount.

> **Why this is required:** Shopify does not allow price overrides from the storefront. Without this function, the cart and checkout would always show the base variant price regardless of what options were selected. The Cart Transform Function runs server-side inside Shopify's infrastructure and is the authoritative price source.

### How It Works

1. Customer selects options in the storefront configurator → selections stored as `line_item.properties` (e.g., `Color: Painted to Match`)
2. Customer adds to cart
3. Shopify triggers the Cart Transform Function for that cart
4. Function reads:
   - Each line item's `attributes` (= `line_item.properties`) via `input.graphql`
   - The product's `app.configurator_definition` metafield (same file, via the product variant relationship)
5. For each line item, function iterates all attributes, looks up the matching field + option in the metafield JSON, sums all `priceAdder` values
6. If `totalPriceAdder > 0`: returns an `expandOperation` that replaces the line item with itself at `originalPrice + totalPriceAdder`
7. If no adders apply: returns no operation (line item unchanged, Shopify charges base price)

### Directory Structure

```
extensions/
  cart-transform/                     ← Generated by Shopify CLI
    shopify.extension.toml            ← Declares function type and metafield access
    src/
      run.js                          ← Function logic (JS)
      run.graphql                     ← Input query
```

### 2b.1 Generate the extension

```bash
shopify app generate extension --type cart_transform --name cart-transform
```

This creates `extensions/cart-transform/` with the scaffolded files.

> ⚠️ **Convention:** Extensions are **always** generated via `shopify app generate extension` CLI command first. Never create extension files manually from scratch. Only edit the files after the CLI has scaffolded the directory.

### 2b.2 `extensions/cart-transform/shopify.extension.toml`

Key config:
```toml
api_version = "2026-04"

[[extensions]]
type = "function"
name = "Cart Transform"
handle = "cart-transform"
    
  [extensions.input.variables]
  # No extra variables needed; metafield is read in input.graphql
```

### 2b.3 `extensions/cart-transform/src/run.graphql`

This query runs inside Shopify's function runtime — it has full access to all app-owned metafields:

```graphql
query RunInput {
  cart {
    lines {
      id
      quantity
      cost {
        amountPerQuantity {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          product {
            metafield(namespace: "app", key: "configurator_definition") {
              value
            }
          }
        }
      }
      attribute(key: "_all_properties") { value }
    }
  }
}
```

> **Note:** Shopify Cart Transform Functions receive individual line item attributes. To access all properties, iterate `attributes` on each line (Shopify passes every `line_item.properties` key as a separate `attribute`). The `_all_properties` key above is illustrative — the actual input query uses the standard `attributes` array:

```graphql
      attributes {
        key
        value
      }
```

### 2b.4 `extensions/cart-transform/src/run.js`

**Logic:**
```js
export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const metafieldRaw = line.merchandise?.product?.metafield?.value;
    if (!metafieldRaw) continue;

    const definition = JSON.parse(metafieldRaw);
    const attributeMap = Object.fromEntries(
      (line.attributes ?? []).map(a => [a.key, a.value])
    );

    // Sum all priceAdders for selected options
    let totalAdder = 0;
    for (const field of definition.fields) {
      if (field.type !== "dropdown" && field.type !== "radio") continue;
      const selectedValue = attributeMap[field.label];
      if (!selectedValue) continue;
      const option = field.options.find(o => o.value === selectedValue);
      if (option?.priceAdder) totalAdder += option.priceAdder;
    }

    if (totalAdder === 0) continue;

    const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
    const newPrice = (basePrice + totalAdder).toFixed(2);

    operations.push({
      expand: {
        cartLineId: line.id,
        title: line.merchandise.product?.title,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
            price: { adjustment: { fixedPricePerUnit: { amount: newPrice, currencyCode: line.cost.amountPerQuantity.currencyCode } } },
          },
        ],
      },
    });
  }

  return { operations };
}
```

> **Price adder unit:** `priceAdder` in the metafield JSON is stored as **USD dollars** (e.g., `150` = $150.00). `parseFloat` + `toFixed(2)` handles the decimal math.

### 2b.5 `extensions/cart-transform/shopify.extension.toml` — declare metafield access

```toml
[[extensions.metafields]]
namespace = "app"
key = "configurator_definition"
```

This grants the function read access to the metafield at runtime.

### What This Means for the Theme Extension (Phase 3)

The storefront JS price display in Phase 3 is **cosmetic** — it shows the customer what they'll pay as they make selections. The Cart Transform Function is the ground truth. Both must agree on the `priceAdder` values (they read from the same metafield), so they will always be in sync.

---

## Phase 3 — Task 1b: Theme App Extension (Storefront) ✅

**Goal:** Render the configurator on the product page in the storefront.

### 3.1 Generate extension
```bash
shopify app generate extension --type theme_app_extension --name product-configurator
```

### 3.2 `extensions/product-configurator/blocks/configurator.liquid`
- Read `{{ product.metafields.app.configurator_definition.value }}`
- Emit a `<div id="configurator-root">` with product base price as a `data-base-price` attribute
- Render a `<form id="configurator-form">` with hidden `add_to_cart` action
- Loop over fields (sorted by displayOrder), render per type:
  - `dropdown` → `<select name="properties[LABEL]">`
  - `radio` → `<input type="radio" name="properties[LABEL]">`
  - `text` → `<input type="text" name="properties[LABEL]">`
  - `info` → `<p class="info-block">LABEL</p>`
- Embed full configurator JSON in a `<script id="configurator-data" type="application/json">` block
- Include `<script src="{{ 'configurator.js' | asset_url }}" defer></script>`

### 3.3 `extensions/product-configurator/assets/configurator.js`
- On DOMContentLoaded: parse `#configurator-data` JSON
- **Condition evaluator**: `evaluateConditions(field, currentValues)` — returns bool
- On any input change: run condition evaluator for all fields → show/hide
- **Price calculator**: `basePrice + sum(priceAdder for each selected option)` → update displayed price
- On form submit: intercept, build `properties` object from all visible form fields, call `fetch('/cart/add.js', { method: 'POST', body: JSON.stringify({ id: variantId, quantity: 1, properties }) })` → redirect to `/cart`

---

## Phase 4 — Task 2: Order Sync Infrastructure ✅

**Goal:** Intercept orders/create webhooks, sync to HoodslyHub, handle failures with retry/backoff.

### 4.1 `app/utils/retry.server.js`
```js
export async function withRetry(fn, maxAttempts = 3, baseDelayMs = 120000) {
  // Attempt 1: immediate
  // Attempt 2: 2min delay (2^1 × baseDelayMs/60)
  // Attempt 3: 4min delay (2^2 × baseDelayMs/60)
  // Returns { success, attempts, error }
}
```

### 4.2 `app/routes/api.mock.hoodslyhub.jsx`
- `POST /api/mock/hoodslyhub`
- Returns 200 normally; returns 503 when `MOCK_HOODSLYHUB_FAIL=true`
- Logs received payload to console

### 4.3 `app/utils/hoodslyhub.server.js`
```js
export async function syncOrderToHoodslyHub(orderSyncId) {
  // 1. Fetch OrderSync record
  // 2. Build payload from stored JSON
  // 3. POST to HOODSLYHUB_ENDPOINT (default: /api/mock/hoodslyhub)
  // 4. Success: status → synced
  // 5. Failure: retryCount++, status → failed, nextRetryAt = now + 2^retryCount min
  // 6. retryCount >= 3: status → permanently_failed
}
```

### 4.4 `app/routes/webhooks.orders.create.jsx`
- Validate via `authenticate.webhook(request)` (HMAC check)
- Parse order from webhook body
- Create `OrderSync` record (status: `pending`, full payload in `payload` column)
- Immediately call `syncOrderToHoodslyHub(record.id)` (attempt 1)
- Respond 200

### 4.5 `app/routes/api.retry-processor.jsx`
- Queries `OrderSync` where `status = failed` AND `nextRetryAt <= now` AND `retryCount < 3`
- Calls `syncOrderToHoodslyHub(id)` for each
- Can be triggered by `setInterval` on server startup (in `shopify.server.js`) or manually via this endpoint

---

## Phase 5 — Task 2: Order Sync Admin Log UI ✅

**Goal:** Admin page showing all orders with sync status; searchable, filterable, with manual retry.

### 5.1 `app/routes/app.order-sync._index.jsx`
- Loader: Prisma query on `OrderSync` with optional filters (URL search params)
  - `?status=failed` → filter by status
  - `?q=search-term` → search by orderId or customerEmail
- Action: handles `_action=retry` → resets `retryCount=0`, `status=failed`, `nextRetryAt=now`, calls `syncOrderToHoodslyHub`
- UI:
  - Status filter tabs: All / Pending / Synced / Failed / Permanently Failed
  - Search text input
  - Polaris IndexTable columns: Order ID | Email | Status (badge) | Retry Count | Last Attempt | Actions
  - "Retry" button for `failed` and `permanently_failed` rows
  - Rush badge / toggle (bonus, Phase 9)

---

## Phase 6 — Bonus: Order Report ✅

**Goal:** Filtered, exportable order report.

### 6.1 `app/routes/app.order-report.jsx`
- Loader: accepts `?startDate=`, `?endDate=`, `?tag=` URL params
  - Builds Shopify GraphQL query string: `created_at:>DATE created_at:<DATE tag:TAG`
  - Queries `orders` (cursor-paginated, first 250)
- Action: `_action=export` → returns `text/csv` response
- UI:
  - Date range pickers + tag input + "Apply" button
  - Summary: Total Orders | Total Revenue | Average Order Value
  - Paginated DataTable: Order # | Date | Customer | Total | Tags
  - "Export CSV" button

---

## Phase 7 — Bonus: HubSpot CRM Sync ✅

**Goal:** On order creation, create or update HubSpot contact and deal.

### 7.1 `app/utils/hubspot.server.js`
```js
export async function syncToHubSpot(order) {
  // 1. Search contact by email: GET /crm/v3/objects/contacts/search
  // 2. If not found: POST /crm/v3/objects/contacts (create)
  // 3. If found: PATCH /crm/v3/objects/contacts/:id (update)
  // 4. Create deal: POST /crm/v3/objects/deals
  // 5. Associate deal with contact
}
```

### 7.2 Integration point
- Called inside `webhooks.orders.create.jsx` after HoodslyHub sync (non-blocking on failure)

---

## Phase 8 — Bonus: BirdEye Review Request ✅

**Goal:** After order fulfillment, send a review request via BirdEye API.

### 8.1 `app/routes/api.mock.birdeye.jsx`
- Mock `POST /api/mock/birdeye` endpoint — logs payload; fails if `MOCK_BIRDEYE_FAIL=true`

### 8.2 `app/utils/birdeye.server.js`
```js
export async function sendReviewRequest(order) {
  // POST to BIRDEYE_ENDPOINT with { customerEmail, firstName, orderId }
  // Reuses withRetry() from retry.server.js
}
```

### 8.3 `app/routes/webhooks.orders.fulfilled.jsx`
- Validate webhook HMAC
- Call `sendReviewRequest(order)`
- Respond 200

---

## Phase 9 — Bonus: Rush Order Management ✅

**Goal:** Admins can flag orders as Rush; rush orders sort to the top of the sync log.

### 9.1 `app/routes/api.toggle-rush.jsx`
- `POST /api/toggle-rush` with `{ orderSyncId }`
- Flips `isRush` boolean on `OrderSync` record
- Returns updated record

### 9.2 UI updates in `app/routes/app.order-sync._index.jsx`
- Add "Rush" badge column (orange, if `isRush=true`)
- Add "Mark Rush" / "Unmark Rush" button per row
- Default sort: rush orders first (`ORDER BY isRush DESC, createdAt DESC`)

---

## Testing Checklist

### Task 1 (Configurator)
- [ ] Navigate to `/app/configurator` → see product list
- [ ] Click "Edit Configurator" → schema builder loads
- [ ] Add fields: Color (dropdown, options with price adders), SW Color Code (text, conditional on Color=painted), Size (radio), Rush Manufacturing info block
- [ ] Save → metafield persisted (verify in Shopify admin or Polaris metafield viewer)
- [ ] Visit product on storefront → Theme App Extension renders fields
- [ ] Select "Painted to Match" → SW Color Code field appears
- [ ] Deselect → SW Color Code field hides
- [ ] Add to cart → Cart Transform Function applies price adder → cart total = base + priceAdder (verify in cart page and at checkout)
- [ ] Complete checkout → order in Shopify admin shows all field selections as line_item properties with correct total

### Task 2 (Order Sync)
- [ ] Place order → `/app/order-sync` shows `synced`
- [ ] Set `MOCK_HOODSLYHUB_FAIL=true` → place another order
- [ ] Sync log shows `pending → failed` (retry 1) → `failed` (retry 2) → `permanently_failed` (retry 3)
- [ ] Click "Retry" on permanently_failed order → status resets → retry fires → eventually syncs
- [ ] Search by email → filters correctly
- [ ] Filter by status tabs → filters correctly

### Bonus
- [ ] Order Report: filter by date range → correct order count/revenue/AOV
- [ ] CSV export: downloads correct CSV
- [ ] Rush: mark order as Rush → it moves to top of sync log

---

## Known Limitations & Production Gaps

| Limitation | Impact | Production Fix |
|------------|--------|----------------|
| No background job queue (no Redis/Bull) | Retries blocked if server restarts between retry windows | Use BullMQ + Redis |
| SQLite | Not suitable for multi-instance deployments | PostgreSQL or PlanetScale |
| Retry processor via setInterval | Crude scheduling, not durable | Proper job scheduler (Inngest, Trigger.dev) |
| No test suite | Manual testing only | Jest + Playwright |
| HubSpot/BirdEye use live API (if keys provided) | Rate limits in dev | Sandbox environments |
