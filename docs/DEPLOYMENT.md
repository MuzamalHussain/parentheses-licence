# Deployment Guide

This runbook covers the current intended production deployment:

```text
Frontend: https://app.blogpoint.net
Backend:  https://api.blogpoint.net
API base: https://api.blogpoint.net/api/v1
Backend:  Railway
Frontend: Vercel
Database: MongoDB Atlas
SMTP:     Gmail SMTP app password or another SMTP account
```

## Pre-Deployment Checks

From the repository root:

```bash
npm run lint
npm run build
npm test
```

Backend readiness:

```bash
cd backend
npm run check:production-readiness
```

## MongoDB Atlas

1. Create or select a production Atlas cluster.
2. Create a database user with read/write access to `parentheses_licensing`.
3. Copy the SRV connection string.
4. URL-encode special characters in the password.
5. Set:

```text
MONGO_URI=mongodb+srv://<user>:<encoded-password>@<cluster>/parentheses_licensing?retryWrites=true&w=majority
MONGO_DB_NAME=parentheses_licensing
```

If Railway cannot resolve the SRV record, set:

```text
DNS_SERVERS=8.8.8.8,1.1.1.1
```

## Railway Backend

Recommended project settings:

```text
Root Directory: backend
Start Command: npm start
Healthcheck Path: /live
```

Required variables:

```text
NODE_ENV=production
APP_ENV=production
DEPLOYMENT_TARGET=railway
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net
MONGO_URI=<atlas-uri>
MONGO_DB_NAME=parentheses_licensing
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<different-random-secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM="BlogPoint <no-reply@app.blogpoint.net>"
```

For a launch with payments disabled:

```text
ENABLE_STRIPE=false
ENABLE_LOCAL_PSP=false
```

If using the older alias names, these are also accepted when the primary flag is unset:

```text
STRIPE_ENABLED=false
LOCAL_PSP_ENABLED=false
```

Operational storage note: Railway filesystems can be ephemeral. Current plugin ZIP uploads are stored on local disk under `backend/storage/plugin-versions` by the upload middleware. Use a Railway volume or plan for object storage before relying on uploaded ZIPs across redeploys.

## Vercel Frontend

Recommended project settings:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Environment Variable: VITE_API_URL=https://api.blogpoint.net/api/v1
```

The checked-in `frontend/vercel.json` rewrites all paths to `index.html` for SPA routing.

After deploy, configure the custom domain:

```text
app.blogpoint.net -> Vercel frontend
```

## Gmail SMTP

1. Enable 2-Step Verification on the Gmail account.
2. Generate an app password.
3. Set:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM="BlogPoint <gmail-address>"
SMTP_REPLY_TO=<support-address>
EMAIL_PROVIDER=smtp
STARTUP_VERIFY_SMTP=false
```

Use the app password, not the account password.

## CORS

The backend builds allowed origins from `CLIENT_URL` and `CORS_ORIGIN`.

Production:

```text
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net
```

Temporary production plus local admin testing:

```text
CORS_ORIGIN=https://app.blogpoint.net,http://localhost:5173
```

Origins must not include a path or trailing slash mismatch. Example valid origin:

```text
https://app.blogpoint.net
```

Example invalid value:

```text
https://app.blogpoint.net/login
```

## Custom Domains

Configure DNS:

```text
app.blogpoint.net -> Vercel
api.blogpoint.net -> Railway
```

Then update variables:

Frontend:

```text
VITE_API_URL=https://api.blogpoint.net/api/v1
```

Backend:

```text
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net
```

Webhook URLs:

```text
https://api.blogpoint.net/api/v1/webhooks/stripe
https://api.blogpoint.net/api/v1/webhooks/local
```

WordPress updater URL:

```text
https://api.blogpoint.net/api/wp/updater/check
```

## Post-Deployment Verification

Backend:

```text
GET https://api.blogpoint.net/live
GET https://api.blogpoint.net/ready
GET https://api.blogpoint.net/health
```

Frontend:

```text
https://app.blogpoint.net/login
https://app.blogpoint.net/register
https://app.blogpoint.net/admin
```

Create the first admin account from a Railway shell or equivalent backend environment:

```bash
node scripts/create-admin.js admin@example.com StrongPass123
```

Smoke test:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123 \
node scripts/e2e-smoke-test.js https://api.blogpoint.net/api/v1
```

The smoke test creates real records in the target database. Use staging first.

## Rollback Steps

Railway backend:

1. Open Railway service deployments.
2. Select the last known good deployment.
3. Redeploy or rollback from Railway UI.
4. Confirm `/live` and `/ready`.
5. Watch logs for `server.started`.

Vercel frontend:

1. Open Vercel deployments.
2. Promote the previous successful deployment.
3. Confirm `VITE_API_URL` still points to the intended backend.
4. Test `/login`, `/dashboard`, and `/admin` refresh behavior.

Database:

1. Prefer Atlas snapshots or point-in-time restore.
2. Do not restore production over a live app without stopping writes.
3. Record the restore timestamp and affected release.

Uploaded ZIP files:

1. If local filesystem storage is used, rollback code does not restore deleted ZIP files.
2. Keep a separate artifact archive for uploaded plugin packages.
3. Re-upload versions from admin if needed after rollback.
