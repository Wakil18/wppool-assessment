# M2S — Multi-channel Merchandising Suite

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
- [Troubleshooting](#troubleshooting)

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

---

## Troubleshooting

### Database tables don't exist

```
The table `main.Session` does not exist in the current database.
```

Run the setup script to apply migrations:

```bash
npm run setup
```

### Navigating inside the embedded app breaks the session

Shopify embedded apps run inside an iFrame. To avoid session/navigation issues:

1. Use `Link` from `react-router` — never use raw `<a>` tags for in-app navigation
2. Use `redirect` from `authenticate.admin`, not from `react-router`
3. Use `useFetcher` / `useSubmit` from `react-router` for form submissions

### JWT "nbf" claim timestamp check failed

Your machine's clock is out of sync. Enable **"Set time and date automatically"** in your system's Date & Time settings.

### Webhooks failing HMAC validation

Webhooks created manually in the Shopify admin are not signed with your app secret. Only use webhooks declared in `shopify.app.toml`. See: [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions).

### Shop-specific webhook subscriptions not updating

If you're registering webhooks in the `afterAuth` hook, switch to declaring them in `shopify.app.toml` — Shopify will sync changes automatically on every `shopify app deploy`. If you must use shop-specific webhooks, uninstall and reinstall the app to force `afterAuth` to run again.

### Prisma engine errors on Windows ARM64

```
Unable to require query_engine-windows.dll.node
```

Set this env var to use binary engine mode:

```bash
PRISMA_CLIENT_ENGINE_TYPE=binary
```

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)
