# Troubleshooting Guide

## CORS Errors

Symptom:

```text
Error: Not allowed by CORS
```

Fix:

1. Set backend origins exactly:

```text
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net,http://localhost:5173
```

2. Set frontend:

```text
VITE_API_URL=https://api.blogpoint.net/api/v1
```

3. Redeploy backend after changing Railway env.
4. Redeploy frontend after changing Vercel env.

Origins must not include paths. Use `https://app.blogpoint.net`, not `https://app.blogpoint.net/login`.

## Railway Crash or Restart Loop

Check Railway logs for:

```text
startup.begin
startup.env.raw_snapshot
startup.env.validation_complete
startup.database.begin
server.start_failed
```

Common causes:

- Missing `MONGO_URI`.
- Invalid JWT secret length in production.
- `APP_ENV` not set to `production`.
- SMTP missing in production.
- Stripe/local PSP enabled without real credentials.
- Backup readiness strict with unwritable local paths.

Temporary launch with providers disabled:

```text
ENABLE_STRIPE=false
ENABLE_LOCAL_PSP=false
BACKUP_READINESS_STRICT=false
```

Do not use dummy credentials as production-ready provider credentials.

## MongoDB Bad Auth

Symptoms:

```text
bad auth
Authentication failed
database.connect_failed
```

Fix:

1. Confirm Atlas database username and password.
2. URL-encode special password characters.
3. Confirm the database user has read/write permissions.
4. Confirm `MONGO_DB_NAME=parentheses_licensing`.
5. Confirm Atlas network access allows Railway.

## Wrong Database

Symptoms:

- Login says invalid credentials even though local DB has users.
- Admin account exists locally but not in production.
- Products/licenses missing after deploy.

Fix:

1. Inspect Railway `MONGO_URI`.
2. Confirm Atlas cluster and database name.
3. Run `node scripts/create-admin.js ...` in the production backend environment if production DB is fresh.
4. Do not assume local `.env` is used by Railway.

## Vercel SPA 404

Symptom:

- `/login` works from app navigation but browser refresh returns 404.

Fix:

Confirm `frontend/vercel.json` is deployed:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Vercel settings:

```text
Root Directory: frontend
Output Directory: dist
```

## SMTP Failures

Symptoms:

- Registration fails while sending verification email.
- Password reset email is never delivered.
- Diagnostics SMTP check fails.

Fix:

1. Use Gmail app password, not account password.
2. Set all required fields:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM="BlogPoint <gmail-address>"
SMTP_REPLY_TO=<support-address>
```

3. Confirm Railway variables do not include accidental quotes around the password.
4. Use `/api/v1/admin/diagnostics?verifySmtp=true` after admin login.

## Admin Login Fails

Checklist:

1. Confirm CORS allows the frontend origin.
2. Confirm the admin exists in the same MongoDB database used by Railway.
3. Confirm `role=admin`.
4. Confirm `isActive=true`.
5. Confirm password is correct or reset with:

```bash
node scripts/create-admin.js admin@example.com StrongPass123
```

6. Confirm JWT secrets are stable across deploys. Changing refresh secret invalidates refresh sessions.

## Env Validation Failures

Common messages:

```text
JWT_ACCESS_SECRET must be at least 32 characters in production
JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET
Wildcard CORS origins are not allowed in production
APP_ENV must be production when NODE_ENV is production
```

Fix:

- Generate fresh access and refresh secrets.
- Do not reuse the same secret.
- Set `APP_ENV=production`.
- Replace `*` CORS with exact origins.

## Stripe Disabled but Still Required

If production readiness says Stripe keys are missing, set the current primary flag:

```text
ENABLE_STRIPE=false
```

The older alias is accepted when the primary flag is unset:

```text
STRIPE_ENABLED=false
```

Prefer `ENABLE_STRIPE`.

## Local PSP Disabled but Still Required

Set:

```text
ENABLE_LOCAL_PSP=false
```

The older alias is accepted when the primary flag is unset:

```text
LOCAL_PSP_ENABLED=false
```

Prefer `ENABLE_LOCAL_PSP`.

## Download Link Expired or Already Used

Customer and updater download URLs are short-lived and single-use.

Fix:

- Customer downloads: request a new download from `/dashboard/downloads`.
- WordPress updater: run update check again to receive a new package URL.

## Plugin Activation Rejected

Common causes:

- License status is suspended, revoked, or expired.
- Product slug does not match the license product.
- Domain is not valid under license engine policy.
- Site limit reached.
- License is not activated on that domain for validation/update checks.

Check admin license detail, active domains, and activation history.
