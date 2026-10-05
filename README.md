# Hearth & Form

A furniture ecommerce application with a React / HTML / CSS / JavaScript storefront, Node.js + Express 5 REST API, and a relational SQLite database. The same Express API can run on Cloudflare Workers with D1; a portable Node server and Dockerfile are included.

## Features

- Responsive, warm editorial storefront with six seeded furniture products and local photography.
- Search, category and price filters, sorting, product details and stock visibility.
- Persistent guest/customer shopping bags; guest items merge into the account on sign-in.
- Customer registration, login, logout, password change, and persistent wishlists.
- Database-backed opaque sessions in HttpOnly / SameSite cookies; Secure cookies in production.
- Bcrypt password hashes, request validation, parameterized SQL, security headers, same-origin write protection and login/register throttling.
- Customer/admin roles checked in the API, with customers restricted to their own orders.
- Cash-on-delivery checkout, server-calculated prices and shipping, order confirmation and history.
- Atomic stock reservation and order creation, idempotent checkout, cancellation with inventory restoration.
- Admin product creation/editing/archival, stock management, and order status management.
- SQL migrations, deployment configuration, integration tests, CI workflow, and Docker support.

## Run locally

Requires Node.js 24 or later and npm. On Windows, use PowerShell or VS Code's terminal.

```sh
npm ci
```

Copy `.env.example` to `.env`, then:

```sh
npm run build
npm start
```

Open `http://localhost:3000`. Migrations run on startup and sample products seed on the first API request. Data lives in `data/store.sqlite` and is excluded from Git.

For development, run `npm start` in one terminal and `npm run dev` in a second. Open `http://localhost:4173`. Set `APP_ORIGIN=http://localhost:4173` in `.env` for development writes; the Vite server forwards API requests to port 3000. After changing `.env`, restart the Node server.

## Administrator

Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (at least 12 characters) in your private `.env`, then run:

```sh
npm run admin:create
```

Sign in using that account. Open **My account → Manage store** or `/admin`. The command can also securely promote/reset a known account. Do not commit `.env`. Never assign admin roles from browser input.

Optional hosted bootstrap uses these same environment values to create an administrator only if the email does not already exist. It never promotes an existing customer or resets an existing password. After the account exists, remove the bootstrap password from hosted environment variables. The initial password can be changed under My account; password changes invalidate all sessions.

## Deploy with Node / Docker

Build and run a single Node instance behind a TLS-terminating reverse proxy. Set `NODE_ENV=production`, an exact HTTPS `APP_ORIGIN`, `PORT`, and a persistent `DATABASE_PATH`. `npm start` serves the built frontend and API from one origin. No CORS configuration is required.

```sh
docker build -t hearth-and-form .
docker run -d --name hearth-store -p 3000:3000 \
  --env-file .env.production \
  -v hearth-data:/app/data hearth-and-form
```

Create `.env.production` separately, with `APP_ORIGIN=https://your-domain.example`, `NODE_ENV=production`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Never include it in an image or repository. Terminate HTTPS in front of port 3000. The Docker image runs as a non-root user. Mount the database directory to durable storage and back it up using SQLite's backup API or after stopping writes. Do not use an ephemeral filesystem for production orders. SQLite is intended for a single writable application instance; use the included D1 deployment path or adapt the repository for a distributed database when scaling to multiple independent servers.

## Sites / Cloudflare deployment

`npm run build` emits the frontend to `dist/client` and a bundled Express Worker to `dist/server/index.js`. `.openai/hosting.json` declares the logical D1 binding and Sites project identity. Drizzle migrations in `drizzle/` are applied before the Worker is published. Production environment values belong in the host's secret/environment settings, never this manifest.

Required production bindings: D1 `DB`, static assets `ASSETS`. Required compatibility: `nodejs_compat`, Node HTTP server support. Set `APP_ORIGIN` to the deployed HTTPS origin. The storefront's customer authentication is separate from the private Sites access boundary. Making this site public is a separate, explicit access decision.

## Database and pricing

Schema: `users`, `sessions`, `products`, `cart_items`, `wishlist`, `orders`, `order_items`, `rate_limits`. Monetary amounts are integer US cents. Shipping is $49, free from $1,000. No additional tax is configured. Orders hold a snapshot of product names, images, and prices so later catalog edits do not change order history. Products are archived, not hard deleted. Sessions expire after seven days; guest bag cookies last 30 days.

To change the schema, update `db/schema.ts`, run `npm run db:generate`, inspect the generated SQL, and commit the migration. Never rewrite applied migration files. `npm run db:migrate` applies pending migrations locally.

## Validation

```sh
npm test
npm run build
npm run test:worker
```

Integration tests exercise guest-cart merging, customer checkout, server-side totals, idempotent requests, concurrent last-item purchases, role enforcement, order isolation, origin checks, input validation, product management, stock restoration and session invalidation. The hosted-runtime test also checks static assets, the Express adapter, D1 migrations, secure cookies, and a complete checkout. Tests use isolated SQLite databases; they do not place production orders.

## Before accepting real customer orders

The application runs end to end, but its catalog, product dimensions, inventory, USD prices, shipping fee and delivery estimates are sample business data. Replace these with your actual stock and operating terms. Confirm delivery service areas and tax obligations, add your legal/privacy/returns policies and business contact information, and configure backups and monitoring.

Checkout is **cash on delivery**. There is no card payment integration, online refund processing, email delivery, email verification, forgotten-password email flow, or carrier integration. Those require your chosen providers and credentials. Signed-in customers can change their password; the admin CLI can reset an account when needed. The application does not claim that placing an order charges a card or dispatches a shipment.

## Source layout

- `src/main.jsx`, `src/style.css`: React interface and responsive styling.
- `server/app.js`: Express API, validation, authentication and authorization.
- `server/database.js`, `server/local-db.js`: prepared-query access and SQLite adapter.
- `server/index.js`, `server/worker.js`: Node and Cloudflare entry points.
- `db/schema.ts`, `drizzle/`: schema and versioned SQL migrations.
- `server/catalog.js`: sample product data.
- `tests/store.test.js`: integration tests.
- `public/images/`, `ASSET_CREDITS.md`: bundled photography and attribution.

An optional feature-detected WebMCP catalog search tool uses the same visible search state. It does not create orders. Supported-browser validation was unavailable in the build environment; the ordinary interface does not depend on WebMCP.
