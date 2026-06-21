# Phase 7A Safety Baseline

## What Changed

- Added a centralized backend environment config loader at `backend/src/config/env.js`.
- Added read-only feature flag metadata/status for admin visibility.
- Added durable settings foundation:
  - `Setting` model
  - default setting seed definitions
  - admin-only settings API
  - admin settings UI page
- Cleaned env templates and ignore rules so real `.env` files stay local.

## How To Run Locally

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Local MongoDB must be running, or `MONGO_URI` must point to MongoDB Atlas.

## Required Env Vars

Core required variables:

- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_URL`

Optional services:

- Redis is optional when `REDIS_ENABLED=false`.
- SMTP is optional for boot, but required for real email verification/password reset delivery.
- Stripe and local PSP credentials are optional for boot, but required when those payment paths are exercised.

## Settings Added

- `general.siteName`
- `licensing.defaultStatus`
- `downloads.maxPluginZipMB`
- `payments.defaultCurrency`
- `email.fromName`
- `email.smtpPassword` secret, env-managed
- `payments.stripeSecretKey` secret, env-managed
- `payments.stripeWebhookSecret` secret, env-managed
- `security.requireStrongPasswords`
- `wordpressUpdater.releaseChannel`
- `maintenance.maintenanceMode`

All settings are foundation-only in Phase 7A. They do not override existing environment config or business behavior.

## Feature Flags Added

- `ENABLE_STRIPE`
- `ENABLE_LOCAL_PSP`
- `ENABLE_EMAIL_VERIFICATION_ENFORCEMENT`
- `ENABLE_WORDPRESS_UPDATER`
- `ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT`
- `ENABLE_ADVANCED_SESSION_SECURITY`
- `ENABLE_WEBHOOK_STRICT_IDEMPOTENCY`
- `ENABLE_PAYMENT_TRANSACTIONS`
- `ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD`

Flags are read-only in the admin UI and sourced from env. Future-phase flags are labeled as reserved.

## Rollback Steps

1. Remove the admin settings route mount from `backend/src/app.js`.
2. Remove `backend/src/routes/adminSettings.js`, `backend/src/controllers/adminSettingsController.js`, `backend/src/models/Setting.js`, `backend/src/config/defaultSettings.js`, and `backend/src/config/featureFlags.js`.
3. Revert config reads back to direct env reads if needed.
4. Remove the settings route/nav/page from the frontend.
5. Keep `.gitignore` and env-template cleanup unless there is a specific reason to revert it.

## QA Checklist

- [ ] Backend installs and starts.
- [ ] Frontend installs and builds.
- [ ] Existing login still works.
- [ ] Existing admin dashboard still works.
- [ ] Existing customer dashboard still works.
- [ ] Existing license routes compile.
- [ ] Existing payment routes compile.
- [ ] New settings API requires admin auth.
- [ ] Non-admin cannot access settings API.
- [ ] Secrets are masked.
- [ ] Feature flags are read-only.
- [ ] No `.env` is included in source/package output.
- [ ] No hardcoded production secret exists outside local ignored env files.
