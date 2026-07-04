# Release Checklist

Use this checklist for Phase 8B readiness and every production release.

## Code Quality

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run verify:release`
- [ ] Backend `npm run check:production-readiness`
- [ ] No real secrets in git diff.
- [ ] No `.env` file committed.

## Environment Verification

- [ ] `NODE_ENV=production`
- [ ] `APP_ENV=production`
- [ ] `DEPLOYMENT_TARGET=railway`
- [ ] `CLIENT_URL=https://app.blogpoint.net`
- [ ] `CORS_ORIGIN=https://app.blogpoint.net`
- [ ] `VITE_API_URL=https://api.blogpoint.net/api/v1`
- [ ] `MONGO_URI` points to production Atlas.
- [ ] `MONGO_DB_NAME=parentheses_licensing`
- [ ] JWT access and refresh secrets are long, random, and different.
- [ ] SMTP fields are complete.
- [ ] Disabled providers use `ENABLE_STRIPE=false` and/or `ENABLE_LOCAL_PSP=false`.
- [ ] Enabled providers have real production credentials.
- [ ] `BACKUP_READINESS_STRICT` is appropriate for the host storage setup.

## Deployment

- [ ] Railway backend deployed from `backend/`.
- [ ] Railway health check uses `/live`.
- [ ] Vercel frontend deployed from `frontend/`.
- [ ] Vercel output directory is `dist`.
- [ ] Custom domain `api.blogpoint.net` points to Railway.
- [ ] Custom domain `app.blogpoint.net` points to Vercel.
- [ ] TLS certificates are active.

## Admin Account

- [ ] First admin created in production database:

```bash
node scripts/create-admin.js admin@example.com StrongPass123
```

- [ ] Admin can log in from `https://app.blogpoint.net/login`.
- [ ] Admin sees `/admin`.
- [ ] Admin account is active and role is `admin`.

## SMTP

- [ ] Registration email sends.
- [ ] Verify-email link opens frontend.
- [ ] Forgot-password email sends.
- [ ] Reset-password flow completes.
- [ ] Optional diagnostics SMTP check passes.

## Product and Version

- [ ] Product created with correct slug.
- [ ] Plan created with expected site limit and price.
- [ ] Plugin ZIP uploaded.
- [ ] Version metadata is correct.
- [ ] Version published.
- [ ] Old versions remain unpublished unless intentionally rolled back.

## License Activation Test

- [ ] License issued to test customer.
- [ ] Plugin activation succeeds for test domain.
- [ ] Repeated activation for same domain is idempotent.
- [ ] Validation endpoint returns `valid=true`.
- [ ] Site limit behavior is correct.
- [ ] Deactivation frees a site slot.

## Updater Test

- [ ] `/api/wp/updater/check` returns no update for current latest version.
- [ ] `/api/wp/updater/check` returns `update_available=true` for older version.
- [ ] Package URL downloads ZIP once.
- [ ] Reusing package URL returns an error.
- [ ] Suspended/revoked license cannot download update.

## Download Test

- [ ] Customer sees entitled version in `/dashboard/downloads`.
- [ ] Download request returns a URL.
- [ ] URL streams ZIP once.
- [ ] Reusing URL returns an error.
- [ ] Expired/suspended/revoked license cannot download.

## Payments

- [ ] If Stripe enabled, checkout starts with real/test-mode Stripe key as appropriate.
- [ ] Stripe webhook endpoint configured:

```text
https://api.blogpoint.net/api/v1/webhooks/stripe
```

- [ ] If local PSP enabled, provider credentials are real and webhook is configured:

```text
https://api.blogpoint.net/api/v1/webhooks/local
```

- [ ] Disabled providers are not offered for production checkout.

## Operations

- [ ] `/live` returns 200.
- [ ] `/ready` returns 200.
- [ ] `/health` returns success.
- [ ] Admin diagnostics reviewed.
- [ ] Audit log records admin actions.
- [ ] Backup plan exists for MongoDB Atlas.
- [ ] Plugin ZIP artifact backup exists outside ephemeral app storage.
- [ ] Rollback path confirmed for Railway and Vercel.

## Documentation

- [ ] Root README reviewed.
- [ ] Backend README reviewed.
- [ ] Frontend README reviewed.
- [ ] Environment guide reviewed.
- [ ] Deployment guide reviewed.
- [ ] API docs reviewed.
- [ ] WordPress integration guide reviewed.
- [ ] Admin/customer manuals reviewed.
- [ ] Troubleshooting guide reviewed.

## Release Decision

- [ ] Known gaps documented.
- [ ] Release owner approved.
- [ ] Support contact ready.
- [ ] Monitoring/log access verified.
