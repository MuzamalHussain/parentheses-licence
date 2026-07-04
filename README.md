# Parentheses Licence

Parentheses Licence is a commercial licensing platform for WordPress plugin products. It combines a Node/Express API, MongoDB persistence, a React customer/admin portal, plugin ZIP version management, signed downloads, license activation, update checks, support tickets, audit logging, and production readiness diagnostics.

## Architecture

```text
frontend/  React + Vite SPA served by Vercel, nginx, or another static host
backend/   Express API, MongoDB models, JWT auth, licensing, downloads, webhooks
docs/      Operating manuals, API reference, deployment, environment, release docs
.github/   CI and release quality gates
```

The frontend talks to the backend through `VITE_API_URL`, normally:

```text
https://api.blogpoint.net/api/v1
```

The backend accepts browser requests only from configured CORS origins. In production, set `CLIENT_URL=https://app.blogpoint.net` and include any additional allowed origins in `CORS_ORIGIN`.

## Main Capabilities

- Customer registration, login, password reset, email verification, refresh-token sessions.
- Admin, support, and customer role-gated portal areas.
- Product and plan management.
- License issuance, suspension, revocation, activation reset, and domain deactivation.
- WordPress plugin activation, validation, update check, and secure package download.
- Customer download request flow with short-lived single-use tokens.
- Stripe and local PSP checkout foundations with webhook routes.
- Support tickets, audit logs, diagnostics, health checks, and release scripts.

## Quick Start

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Docker Compose local stack:

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Local URLs:

```text
Frontend: http://localhost:8080
Backend:  http://localhost:5000
API:      http://localhost:5000/api/v1
```

## Environment Summary

Required backend production values include MongoDB, JWT secrets, frontend origin, and SMTP values. Stripe and local PSP credentials are required only when the corresponding provider flag is enabled.

Core production examples:

```text
NODE_ENV=production
APP_ENV=production
DEPLOYMENT_TARGET=railway
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=parentheses_licensing
JWT_ACCESS_SECRET=<64-byte-random-hex>
JWT_REFRESH_SECRET=<different-64-byte-random-hex>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM="BlogPoint <no-reply@app.blogpoint.net>"
```

Full environment documentation lives in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Deployment Overview

- Backend: Railway service rooted at `backend/`, command `npm start`, health check `/live`.
- Frontend: Vercel project rooted at `frontend/`, build command `npm run build`, output `dist`.
- Database: MongoDB Atlas, database name `parentheses_licensing`.
- Domains: `app.blogpoint.net` for the frontend and `api.blogpoint.net` for the backend.
- SMTP: Gmail app password or another SMTP provider supported through the current SMTP provider.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full deployment runbook.

## Documentation

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [Environment Guide](docs/ENVIRONMENT.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [API Documentation](docs/API.md)
- [WordPress Plugin Integration](docs/WORDPRESS_PLUGIN_INTEGRATION.md)
- [Admin Manual](docs/ADMIN_MANUAL.md)
- [Customer Manual](docs/CUSTOMER_MANUAL.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)

## Quality Gates

From the repository root:

```bash
npm run lint
npm run build
npm test
npm run verify:release
```

Backend-only:

```bash
cd backend
npm run build
npm test
npm run check:production-readiness
```

Frontend-only:

```bash
cd frontend
npm run lint
npm run build
```

## Security Notes

Never commit real `.env` files, SMTP passwords, JWT secrets, database credentials, Stripe keys, PSP secrets, license keys, or generated download tokens. The docs intentionally use placeholders for all production secrets.
