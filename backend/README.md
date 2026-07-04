# Parentheses Licence Backend

Express API for authentication, products, plans, orders, licenses, plugin activation, WordPress updater checks, signed downloads, support, audit logs, diagnostics, and admin operations.

## Requirements

- Node.js 20 or newer for production parity.
- MongoDB. Atlas is recommended for production.
- Redis is optional locally and recommended in multi-instance production.
- SMTP credentials for real email verification and password reset flows.

## Install

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` before starting. At minimum, set:

```text
MONGO_URI=...
MONGO_DB_NAME=parentheses_licensing
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CLIENT_URL=http://localhost:5173
```

## Run Development

```bash
npm run dev
```

The API defaults to `http://localhost:5000`.

## Production Start

```bash
npm start
```

Production expects `NODE_ENV=production`. Startup validates environment and readiness. The process exits when critical production checks fail, and startup logs include masked environment state plus the initialization step where failure occurred.

## Environment Variables

Use [../docs/ENVIRONMENT.md](../docs/ENVIRONMENT.md) as the source of truth. Important production variables:

- `NODE_ENV=production`
- `APP_ENV=production`
- `DEPLOYMENT_TARGET=railway`
- `PORT`
- `CLIENT_URL`
- `CORS_ORIGIN`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `ENABLE_STRIPE` / `STRIPE_ENABLED`
- `ENABLE_LOCAL_PSP` / `LOCAL_PSP_ENABLED`
- `REDIS_ENABLED`, `REDIS_URL`
- `BACKUP_READINESS_STRICT`

Provider behavior:

- If Stripe is enabled, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must be real production values in production readiness checks.
- If local PSP is enabled, `LOCAL_PSP_MERCHANT_ID` and `LOCAL_PSP_SECRET_KEY` must not be dummy placeholders.
- If email is not fully configured, production readiness fails because registration and password reset depend on SMTP delivery.
- If Redis is disabled, the app falls back to in-memory rate limiting and logs a production warning.

## Admin Creation

Use the script after MongoDB is reachable:

```bash
node scripts/create-admin.js admin@example.com StrongPass123
```

Alternatively:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123 node scripts/create-admin.js
```

The script creates or updates the account, promotes it to admin, and marks email verified.

## Scripts

```text
npm start                         Start src/server.js
npm run dev                       Start with nodemon
npm run build                     Verify backend JavaScript files load syntactically
npm run lint                      Run repository lint guard
npm test                          Run all backend phase tests
npm run check:production-readiness Validate production config/readiness
npm run check:phase7c-indexes     Check Phase 7C duplicate/index safety
```

Targeted tests:

```text
npm run test:phase7b              Webhook reliability
npm run test:phase7c              Payment transaction safety
npm run test:phase7d              License activation race safety
npm run test:phase7e              PSP gateway hardening
npm run test:phase7f              WordPress updater flow
npm run test:phase7g              Plugin upload security
npm run test:phase7h              Auth/session security
npm run test:phase7i              Notification infrastructure
npm run test:phase7j              License engine hardening
npm run test:phase7k              API security hardening
npm run test:phase7l              Performance/scalability
npm run test:phase7m              Observability
npm run test:phase7n              Operational resilience
npm run test:phase8a              Release engineering
```

## API Mounts

- `/health`, `/live`, `/ready`, `/metrics`
- `/api`
- `/api/v1/auth`
- `/api/v1/products`
- `/api/v1/orders`
- `/api/v1/licenses`
- `/api/v1/downloads/*`
- `/api/v1/plugin`
- `/api/wp/updater`
- `/api/v1/support`
- `/api/v1/admin/*`
- `/api/v1/webhooks/stripe`
- `/api/v1/webhooks/local`

See [../docs/API.md](../docs/API.md).

## Troubleshooting

- CORS origin blocked: set `CLIENT_URL` and `CORS_ORIGIN` to exact origins, no trailing path.
- Railway restart loop: inspect `startup.*` logs and `server.start_failed` stack.
- MongoDB auth failure: verify Atlas username, password, database user permissions, and URL encoding.
- Email failures: use a Gmail app password, not the Gmail account password.
- Admin login fails: confirm the admin is active, role is `admin`, CORS origin is allowed, and JWT secrets are stable.

Full runbook: [../docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md).
