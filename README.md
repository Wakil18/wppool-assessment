# M2S — WPPOOL assesment app

> A Shopify embedded app for multi-channel order synchronization, product configurator management, automated review requests, and order analytics.

![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Shopify API 2026-04](https://img.shields.io/badge/Shopify%20API-2026--04-blue)
![React Router 7](https://img.shields.io/badge/React%20Router-v7-orange)
![Prisma 6](https://img.shields.io/badge/Prisma-v6-indigo)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Features](#features)
  - [Product Configurator](#product-configurator)
  - [Order Sync](#order-sync)
  - [Order Report](#order-report)
  - [BirdEye Review Requests](#birdeye-review-requests)
- [Integrations](#integrations)
  - [HoodslyHub](#hoodslyhub)
  - [HubSpot CRM](#hubspot-crm)
  - [BirdEye](#birdeye)
- [Webhooks](#webhooks)
- [Retry Processor (Cron)](#retry-processor-cron)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | ≥ 18 | LTS recommended |
| [npm](https://www.npmjs.com/) | ≥ 9 | Bundled with Node |
| [MySQL](https://www.mysql.com/) | ≥ 8 | Must be running locally or accessible via URL |
| [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) | ≥ 3 | `npm install -g @shopify/cli` |
| Shopify Partner account | — | [Create one free](https://partners.shopify.com/signup) |
| Shopify Development store | — | Create from your Partner dashboard |

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url> m2s
cd m2s
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for a full reference.

### 4. Set up the database

Create a MySQL database named `m2s` (or the name in your `DB_URL`), then run migrations and generate the Prisma client:

```bash
npx prisma migrate deploy
```

### 5. Start local development

```bash
npm run dev
```

The CLI will:
- Log you into your Shopify Partner account
- Connect to your app (or prompt you to create one)
- Spin up a public HTTPS tunnel
- Set `SHOPIFY_APP_URL`, `SHOPIFY_API_KEY`, and `SHOPIFY_API_SECRET` automatically in your `.env`

Press **P** to open the app in your dev store.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | ✅ | Your app's API key (set automatically by `shopify app dev`) |
| `SHOPIFY_API_SECRET` | ✅ | Your app's API secret (set automatically by `shopify app dev`) |
| `SHOPIFY_APP_URL` | ✅ | The public HTTPS URL of your app (set automatically by `shopify app dev`) |
| `DB_URL` | ✅ | MySQL connection string, e.g. `mysql://root:password@localhost:3306/m2s` |
| `SCOPES` | ✅ | Shopify access scopes (see `shopify.app.toml` — do not change unless you know what you're doing) |
| `HOODSLYHUB_ENDPOINT` | ⬜ | HoodslyHub API endpoint. Falls back to the built-in mock at `/api/mock/hoodslyhub` |
| `BIRDEYE_ENDPOINT` | ⬜ | BirdEye API endpoint. Falls back to the built-in mock at `/api/mock/birdeye` |
| `HUBSPOT_API_KEY` | ⬜ | HubSpot private app API key. Falls back to the built-in mock at `/api/mock/hubspot` |
| `CRON_SECRET` | ⬜ | Bearer token to secure the `/api/retry-processor` endpoint. Recommended in production |
| `MOCK_HOODSLYHUB_FAIL` | ⬜ | Set to `true` to force the mock HoodslyHub endpoint to return `503` (for testing retries) |
| `MOCK_BIRDEYE_FAIL` | ⬜ | Set to `true` to force the mock BirdEye endpoint to return `503` (for testing retries) |
| `MOCK_HUBSPOT_FAIL` | ⬜ | Set to `true` to force the mock HubSpot endpoint to return `503` |
| `RETRY_DELAY_OVERRIDE_MS` | ⬜ | Override retry backoff delay in milliseconds (e.g. `2000` for fast testing) |

---

## Features

### Product Configurator

**Route:** `/app/configurator`

Allows merchants to define configurable product options (fields) and apply them to their catalog.

- **Create Option Sets** — define a named set of fields (text inputs, dropdowns, radio buttons) each with optional price adders
- **Scope targeting** — apply an Option Set to:
  - All products in the store
  - Specific collections
  - Products with specific tags
  - Manually selected products
- **Metafield publishing** — field definitions are written to Shopify product/collection/shop metafields, making them accessible to storefront themes and the cart transform extension
- **Cart transform extension** — a Shopify Functions extension reads configurator selections at checkout and automatically adds a hidden "Custom Options" line item with the correct price adder

### Order Sync

**Route:** `/app/order-sync`

Tracks the sync status of orders to the HoodslyHub CRM.

- Every new order (`orders/create` webhook) is automatically queued for sync
- Displays all sync records with statuses: `Pending`, `Synced`, `Failed`, `Permanently Failed`
- **Filter** by status or search by order ID / customer email
- **Manual retry** on permanently failed orders
- **Rush flag** — toggle a rush marker on any order for priority handling
- Exponential backoff retry logic: up to 3 attempts, then permanently failed

### Order Report

**Route:** `/app/order-report`

Analytics dashboard for order data, pulled live from the Shopify Admin GraphQL API.

- **Summary cards** — total orders, total revenue, average order value
- **Filters** — start date, end date, tag (partial match, client-side)
- Supports up to 250 orders per query (adjust `first` in the loader if needed)
- **Export CSV** — downloads a CSV of the currently filtered orders directly in the browser (works inside the Shopify iFrame)

### BirdEye Review Requests

**Route:** `/app/review-log`

Tracks automated review request emails sent to customers after order fulfillment.

- Every fulfilled order (`orders/fulfilled` webhook) automatically triggers a review request via BirdEye
- Uses in-process retry logic (3 attempts, 2 s base delay)
- All attempts are persisted to the `ReviewLog` database table with status (`sent` / `failed`) and attempt count
- **Manual retry** on failed entries directly from the admin UI

---

## Integrations

### HoodslyHub

Syncs new Shopify orders to the HoodslyHub CRM.

**Trigger:** `orders/create` webhook → `webhooks.orders.create.jsx`

| Variable | Default |
|---|---|
| `HOODSLYHUB_ENDPOINT` | `/api/mock/hoodslyhub` (built-in mock) |

The first sync attempt happens synchronously in the webhook handler. Subsequent retries are handled by the [retry processor](#retry-processor-cron). To enable the real integration, set `HOODSLYHUB_ENDPOINT` to your HoodslyHub API URL.

---

### HubSpot CRM

Creates or updates a HubSpot contact and deal for every new order.

**Trigger:** `orders/create` webhook → `webhooks.orders.create.jsx` (fire-and-forget)

| Variable | Default |
|---|---|
| `HUBSPOT_API_KEY` | Falls back to `/api/mock/hubspot` (built-in mock) |

**Flow:**
1. Search HubSpot for an existing contact by email
2. Create or update the contact (`email`, `firstname`, `lastname`)
3. Create a deal linked to the contact (`dealname` = order name, `amount` = order total)

If `HUBSPOT_API_KEY` is not set, the app logs to the mock endpoint instead of failing silently.

---

### BirdEye

Sends review request emails to customers after order fulfillment.

**Trigger:** `orders/fulfilled` webhook → `webhooks.orders.fulfilled.jsx` (fire-and-forget)

| Variable | Default |
|---|---|
| `BIRDEYE_ENDPOINT` | `/api/mock/birdeye` (built-in mock) |

Payload sent to BirdEye:

```json
{
  "customerEmail": "customer@example.com",
  "firstName": "Jane",
  "orderId": "12345678"
}
```

Results are persisted to the `ReviewLog` table whether the request succeeds or fails.

---

## Webhooks

All webhooks are declared in `shopify.app.toml` and registered automatically on `shopify app deploy`.

| Topic | URI | Handler |
|---|---|---|
| `orders/create` | `/webhooks/orders/create` | Creates `OrderSync` record; triggers HoodslyHub + HubSpot sync |
| `orders/fulfilled` | `/webhooks/orders/fulfilled` | Sends BirdEye review request; persists to `ReviewLog` |
| `app/uninstalled` | `/webhooks/app/uninstalled` | Marks shop as uninstalled; deletes sessions |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Updates session scope record when merchant grants/revokes scopes |

> **Note:** Webhooks created manually in the Shopify admin will fail HMAC validation. Always use app-specific webhooks defined in `shopify.app.toml`.

### Triggering webhooks via CLI

```bash
# Trigger an orders/create webhook with test data
shopify webhook trigger --topic orders/create

# Trigger an orders/fulfilled webhook
shopify webhook trigger --topic orders/fulfilled
```

> The `admin` object will be `undefined` for CLI-triggered webhooks since the shop is simulated.

---

## Retry Processor (Cron)

Failed HoodslyHub syncs are automatically retried via a dedicated endpoint.

**Endpoint:** `GET /api/retry-processor`

This endpoint finds all `OrderSync` records with `status = "failed"` where `nextRetryAt <= now()` and re-attempts the sync. It should be called on a schedule (e.g. every 5 minutes via cron, Render cron job, or GitHub Actions).

**Securing the endpoint** (recommended in production):

```bash
# In your .env
CRON_SECRET=your-secret-token
```

Then call the endpoint with a `Bearer` token:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  https://your-app-url.com/api/retry-processor
```

If `CRON_SECRET` is not set, the endpoint is open (acceptable for local dev, not for production).

---

## Testing

### Testing integrations with mock endpoints

All three integrations have local mock endpoints. By default they return a success response and log the payload to the console. No external credentials are needed for local development.

| Integration | Success mock | Force failure |
|---|---|---|
| HoodslyHub | `HOODSLYHUB_ENDPOINT` unset → auto mock | `MOCK_HOODSLYHUB_FAIL=true` |
| BirdEye | `BIRDEYE_ENDPOINT` unset → auto mock | `MOCK_BIRDEYE_FAIL=true` |
| HubSpot | `HUBSPOT_API_KEY` unset → auto mock | `MOCK_HUBSPOT_FAIL=true` |

**Example: test HoodslyHub retry logic**

```bash
# In .env — force every HoodslyHub call to fail
MOCK_HOODSLYHUB_FAIL=true
RETRY_DELAY_OVERRIDE_MS=2000   # shorten retry delay to 2 s for fast testing

# Trigger a new order webhook
shopify webhook trigger --topic orders/create

# Check the Order Sync dashboard at /app/order-sync
# The record will appear as "Failed" then retry automatically
# Call the retry processor to force a retry immediately:
curl http://localhost:3000/api/retry-processor
```

**Example: test BirdEye failure + manual retry**

```bash
MOCK_BIRDEYE_FAIL=true

# Trigger a fulfillment webhook
shopify webhook trigger --topic orders/fulfilled

# Go to /app/review-log — the row will show "failed"
# Click "Retry" to manually re-trigger the request
```

### Testing the Order Report CSV export

1. Navigate to `/app/order-report`
2. Optionally apply date/tag filters
3. Click **Export CSV** — a `.csv` file will download directly in the browser

### Running the retry processor manually

```bash
curl http://localhost:3000/api/retry-processor
```

---

## Building & Deployment

### Build for production

```bash
npm run build
```

### Start the production server

```bash
npm run start
```

### Deploy app config and extensions to Shopify

```bash
npm run deploy
```

### Docker (includes DB setup)

```bash
# Uses the docker-start script: npm run setup && npm run start
docker build -t m2s .
docker run -e DB_URL="mysql://..." -e SHOPIFY_API_KEY="..." m2s
```

### Hosting options

| Platform | Notes |
|---|---|
| [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run) | Most detailed Shopify-specific tutorial |
| [Fly.io](https://fly.io/docs/js/shopify/) | Quick single-machine deploy via CLI |
| [Render](https://render.com/docs/deploy-shopify-app) | Docker-based deploy with cron job support |

Set `NODE_ENV=production` in your hosting environment's env vars.
