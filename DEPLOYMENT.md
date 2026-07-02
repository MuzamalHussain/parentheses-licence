# Deployment Guide

This covers two paths: a quick local/staging run with Docker Compose, and a
production deployment checklist.

## 1. Local / staging — Docker Compose (fastest way to see the whole stack running)

```bash
cd project
cp backend/.env.example backend/.env   # fill in real Stripe/SMTP keys if you want to test those flows
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend:  http://localhost:5000
- MongoDB and Redis run as containers — no separate setup needed.

This is the fastest way to confirm the full stack boots correctly together
before deploying anywhere.

## 2. Production deployment

### 2.1 Database
- Create a **production** MongoDB Atlas cluster (separate from your dev cluster).
- Atlas gives you a replica set by default, which `paymentService.js` needs
  for the multi-document transaction guarantees around order/license creation.
- Whitelist your server's IP (or `0.0.0.0/0` only if you're using Atlas's
  built-in network security + strong credentials — IP allowlisting is safer).

### 2.2 Backend (Node API)
Pick ONE of:

**Option A — VPS (Hetzner, DigitalOcean, etc.) with Docker**
```bash
# On the server
git clone <your-repo>
cd project/backend
cp .env.production.example .env   # fill in real values
docker build -t parentheses-api .
docker run -d --name parentheses-api \
  --env-file .env \
  -p 5000:5000 \
  -v $(pwd)/uploads:/app/uploads \
  --restart unless-stopped \
  parentheses-api
```
Put nginx or Caddy in front for TLS termination (Let's Encrypt) and proxy
`api.parenthesessolutionsllc.com` → `localhost:5000`.

**Option B — Railway / Render (no server management)**
- Connect your repo, set the root directory to `backend/`.
- Add all variables from `.env.production.example` in the dashboard's
  environment variables section.
- These platforms handle TLS and process supervision for you.
- ⚠️ Important: the disk these platforms give you is usually **ephemeral**
  (wiped on redeploy). Since plugin ZIPs are stored on local disk in this
  MVP, either (a) accept that you'll need to re-upload versions after a
  redeploy, or (b) attach a persistent volume if the platform supports one,
  or (c) migrate `multer`'s disk storage to S3-compatible storage — flagged
  as a Phase 7+ item in the original execution plan.

### 2.3 Frontend (React build)
- Build with the **production** `VITE_API_URL` pointing at your live API:
  ```bash
  cd frontend
  VITE_API_URL=https://api.parenthesessolutionsllc.com/api/v1 npm run build
  ```
- Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare
  Pages) or serve it via the included `Dockerfile` + nginx on your VPS.
- Make sure `CLIENT_URL` in the backend `.env` matches this exact origin —
  CORS will reject requests otherwise.

### 2.4 DNS + SSL
- `app.parenthesessolutionsllc.com` → frontend
- `api.parenthesessolutionsllc.com` → backend
- Use Let's Encrypt (via Caddy, which auto-renews) or your host's managed TLS.

### 2.5 Stripe webhook
- In the Stripe dashboard, add an endpoint:
  `https://api.parenthesessolutionsllc.com/api/v1/webhooks/stripe`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
- Switch from test keys (`sk_test_...`) to live keys (`sk_live_...`) only
  once you've end-to-end tested a real test-mode purchase.

### 2.6 Local PSP webhook
- Configure the equivalent webhook URL with your chosen Pakistani PSP
  aggregator: `https://api.parenthesessolutionsllc.com/api/v1/webhooks/local`
- ⚠️ As flagged in the original execution plan: start the merchant
  onboarding/KYC paperwork with your chosen aggregator as early as possible —
  it's the one step in this whole project outside your direct control and
  can silently blow the timeline if left until the end.

### 2.7 Final pre-launch checklist
- [ ] `NODE_ENV=production` is set
- [ ] `APP_ENV=production` and `DEPLOYMENT_TARGET` match the host
- [ ] All JWT/Stripe/PSP secrets are real, unique, and not reused from dev
- [ ] `REDIS_ENABLED=true` with a real Redis instance (multi-instance-safe rate limiting)
- [ ] MongoDB Atlas production cluster, IP-restricted, strong credentials
- [ ] Persistent storage or object storage is configured for uploaded plugin ZIPs
- [ ] Database snapshots and upload backups are configured outside the app process
- [ ] Run `npm run check:production-readiness` inside the backend environment
- [ ] Run `node scripts/e2e-smoke-test.js` against the deployed API (see below)
- [ ] Confirm Stripe **and** local PSP webhooks each deliver a test event successfully
- [ ] Confirm `/health`, `/live`, and `/ready` from the public URL

## 3. Running the end-to-end smoke test

Two scripts live in `backend/scripts/` to verify the full business flow
described in the original plan: register → license issued → activate →
update-check → download → deactivate → admin suspend → coupon → support
ticket.

```bash
cd backend

# 1. Create an admin account (only needed once, or after a fresh DB)
node scripts/create-admin.js admin@parentheses.test AdminPass123

# 2. Start the API (in a separate terminal)
npm run dev

# 3. Run the smoke test against it
ADMIN_EMAIL=admin@parentheses.test ADMIN_PASSWORD=AdminPass123 \
  node scripts/e2e-smoke-test.js http://localhost:5000/api/v1
```

You should see a checklist of ✅ results ending in a pass/fail summary. Run
this after every deploy to a new environment (staging, then production)
before announcing the launch — it's the fastest way to catch a missed env
var or a webhook misconfiguration before a real customer does.

**Note:** step 5 (customer registration) requires email verification in the
real auth flow. If your SMTP isn't configured yet in the environment you're
testing, the customer login step may fail — that's expected and not a bug
in the test; either configure a real SMTP provider first, or temporarily
auto-verify in your dev database.
