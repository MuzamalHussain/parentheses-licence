# Environment Guide

This guide documents the environment variables used by the current codebase. Do not commit real `.env` files or production secrets.

## Loading Rules

- `backend/src/server.js` calls `dotenv.config()` for local files.
- Railway/Vercel variables should be configured in their dashboards.
- Vite exposes only variables beginning with `VITE_` to the frontend bundle.
- Production startup validates critical backend config and can exit if required values are missing or unsafe.

## Backend Core

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `development` | `production`, `development`, or `test`. Production enables stricter checks. |
| `APP_ENV` | Production | `NODE_ENV` | Must be `production` when `NODE_ENV=production`. |
| `DEPLOYMENT_TARGET` | No | `local` | Use `railway` for Railway. |
| `PORT` | No | `5000` | Railway usually injects this. The app listens on this value. |
| `CLIENT_URL` | Yes | `http://localhost:5173` | Primary frontend origin. Used for email links and CORS. |
| `CORS_ORIGIN` | No | empty | Comma-separated extra browser origins. Combined with `CLIENT_URL`, trimmed, and deduplicated. |

Production CORS example:

```text
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net,http://localhost:5173
```

Do not include paths such as `/login`; use origins only.

## Database

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | none | MongoDB connection string. Use Atlas for production. |
| `MONGO_DB_NAME` | Recommended | `parentheses_licensing` | Database selected by Mongoose. Keep production and test DBs separate. |
| `DNS_SERVERS` | No | empty | Comma-separated DNS resolvers for Atlas SRV lookup issues. Example: `8.8.8.8,1.1.1.1`. |

Production Atlas example:

```text
MONGO_URI=mongodb+srv://<user>:<url-encoded-password>@<cluster>/<db>?retryWrites=true&w=majority
MONGO_DB_NAME=parentheses_licensing
```

## Authentication and Sessions

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | Yes | none | Must be at least 32 chars in production. |
| `JWT_REFRESH_SECRET` | Yes | none | Must differ from access secret and be at least 32 chars in production. |
| `JWT_ACCESS_EXPIRES` | No | `15m` | Access token lifetime. |
| `JWT_REFRESH_EXPIRES` | No | `7d` | Refresh token cookie/session lifetime. |
| `JWT_ISSUER` | No | `parentheses-licensing` | JWT issuer. |
| `JWT_AUDIENCE` | No | `parentheses-licensing-users` | JWT audience. |
| `AUTH_MAX_FAILED_LOGIN_ATTEMPTS` | No | `5` | Login lock threshold. |
| `AUTH_LOGIN_LOCKOUT_MINUTES` | No | `15` | Lock duration. |
| `AUTH_MAX_REFRESH_SESSIONS` | No | `5` | Max persisted refresh sessions per user. |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Redis

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `REDIS_ENABLED` | No | `false` | Enables Redis-backed rate limit support. |
| `REDIS_URL` | When enabled | `redis://localhost:6379` | Redis connection URL. |

When Redis is disabled, the app falls back to in-memory rate limiting and logs a production warning.

## Email and SMTP

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SMTP_HOST` | Production | none | SMTP host. Gmail: `smtp.gmail.com`. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_USER` | Production | none | SMTP username. |
| `SMTP_PASS` | Production | none | SMTP password or app password. |
| `SMTP_FROM` | Production | none | From header. Example: `"BlogPoint <no-reply@app.blogpoint.net>"`. |
| `SMTP_REPLY_TO` | No | none | Reply-to address. |
| `EMAIL_PROVIDER` | No | `smtp` | Current implemented provider is `smtp`. |
| `EMAIL_RETRY_COUNT` | No | `2` | Retry attempts for notification delivery. |
| `EMAIL_TIMEOUT_MS` | No | `10000` | SMTP timeout. |
| `STARTUP_VERIFY_SMTP` | No | `false` | If true, startup diagnostics attempt provider verification. |

`EMAIL_ENABLED` may appear in local env files, but current backend config determines email readiness from SMTP fields rather than this variable.

## Payments

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ENABLE_STRIPE` | No | `true` | Primary flag used by config. |
| `STRIPE_ENABLED` | No | alias for `ENABLE_STRIPE` | Backward-compatible alias when `ENABLE_STRIPE` is unset. |
| `STRIPE_SECRET_KEY` | When Stripe enabled | none | Must be real in production readiness checks. |
| `STRIPE_WEBHOOK_SECRET` | When Stripe enabled | none | Required for Stripe webhook verification. |
| `ENABLE_LOCAL_PSP` | No | `true` | Primary local PSP flag. |
| `LOCAL_PSP_ENABLED` | No | alias for `ENABLE_LOCAL_PSP` | Backward-compatible alias when `ENABLE_LOCAL_PSP` is unset. |
| `LOCAL_PSP_BASE_URL` | When local PSP enabled | sandbox placeholder URL | Provider API base URL. |
| `LOCAL_PSP_MERCHANT_ID` | When local PSP enabled | dummy value | Must not be dummy in production if local PSP is enabled. |
| `LOCAL_PSP_SECRET_KEY` | When local PSP enabled | dummy value | Must not be dummy in production if local PSP is enabled. |

Disabled provider behavior:

- `ENABLE_STRIPE=false` or `STRIPE_ENABLED=false` prevents production readiness from requiring Stripe credentials.
- `ENABLE_LOCAL_PSP=false` or `LOCAL_PSP_ENABLED=false` prevents production readiness from requiring local PSP credentials.
- Checkout requests for a disabled/non-operational provider are rejected by provider status checks.

## Storage and Operations

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `STORAGE_PROVIDER` | No | `local` | Current downloads use local filesystem paths. |
| `UPLOAD_ROOT` | No | `uploads` | Used by operational readiness checks. |
| `BACKUP_ROOT` | No | `backups` | Used by operational readiness checks. |
| `CONFIG_BACKUP_INCLUDE_ENV` | No | `false` | Readiness metadata only; never commit env secrets. |
| `BACKUP_READINESS_STRICT` | No | `true` in production, else `false` | If true, startup fails when backup paths are not writable. |
| `MAINTENANCE_MODE` | No | `false` | Diagnostic state flag. |
| `READ_ONLY_MODE` | No | `false` | Diagnostic state flag. |
| `EMERGENCY_SHUTDOWN` | No | `false` | Diagnostic state flag. |

Important current storage note: admin ZIP upload middleware stores files under `backend/storage/plugin-versions`, while readiness checks also validate `UPLOAD_ROOT/plugins`. Do not assume uploaded plugin ZIPs are durable on ephemeral hosts unless persistent storage is configured for the actual storage path.

## Feature Flags

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ENABLE_EMAIL_VERIFICATION_ENFORCEMENT` | No | `true` | Reserved metadata flag; current login flow does not enforce email verification. |
| `ENABLE_WORDPRESS_UPDATER` | No | `true` | Reserved metadata flag; updater routes are mounted. |
| `ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT` | No | `true` in production, else `false` | When true, invalid plugin ZIP validation rejects upload. |
| `ENABLE_ADVANCED_SESSION_SECURITY` | No | `false` | Reserved metadata flag. |
| `ENABLE_WEBHOOK_STRICT_IDEMPOTENCY` | No | `false` | Reserved metadata flag. |
| `ENABLE_PAYMENT_TRANSACTIONS` | No | `false` | Reserved metadata flag. |
| `ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD` | No | `false` | Reserved metadata flag. |

## Plugin ZIP Limits

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PLUGIN_ZIP_MAX_UPLOAD_MB` | No | `50` | Configured limit for ZIP validation. |
| `PLUGIN_ZIP_MAX_UNCOMPRESSED_MB` | No | `150` | Uncompressed ZIP cap. |
| `PLUGIN_ZIP_MAX_FILES` | No | `2000` | File count cap. |
| `PLUGIN_ZIP_MAX_COMPRESSION_RATIO` | No | `20` | Compression ratio cap. |

The multer upload middleware also has a hardcoded 50 MB file-size cap.

## API Security and Rate Limits

| Variable | Required | Default |
| --- | --- | --- |
| `API_JSON_BODY_LIMIT` | No | `1mb` |
| `API_URLENCODED_BODY_LIMIT` | No | `256kb` |
| `API_WEBHOOK_BODY_LIMIT` | No | `256kb` |
| `API_RATE_GLOBAL_WINDOW_MS` | No | `900000` |
| `API_RATE_GLOBAL_MAX` | No | `300` |
| `API_RATE_AUTH_WINDOW_MS` | No | `900000` |
| `API_RATE_AUTH_MAX` | No | `10` |
| `API_RATE_DOWNLOAD_WINDOW_MS` | No | `60000` |
| `API_RATE_DOWNLOAD_MAX` | No | `30` |
| `API_RATE_WEBHOOK_WINDOW_MS` | No | `60000` |
| `API_RATE_WEBHOOK_MAX` | No | `120` |
| `API_RATE_ADMIN_WINDOW_MS` | No | `60000` |
| `API_RATE_ADMIN_MAX` | No | `180` |
| `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` | No | `300` |

## Performance

| Variable | Required | Default |
| --- | --- | --- |
| `API_PAGINATION_DEFAULT_LIMIT` | No | `20` |
| `API_PAGINATION_MAX_LIMIT` | No | `100` |
| `API_CUSTOMER_PAGINATION_MAX_LIMIT` | No | `50` |
| `DASHBOARD_CACHE_TTL_MS` | No | `30000` |
| `STATS_CACHE_TTL_MS` | No | `30000` |
| `SLOW_REQUEST_THRESHOLD_MS` | No | `750` |
| `MEMORY_LOG_HEAP_MB` | No | `256` |

## License Engine

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `LICENSE_ALLOW_LOCALHOST` | No | `true` outside production, `false` in production | Allows localhost activation/check domains. |
| `LICENSE_ALLOW_PRIVATE_HOSTS` | No | `true` outside production, `false` in production | Allows private-network domains. |
| `LICENSE_ALLOW_STAGING_DOMAINS` | No | `true` | Allows common staging domains. |
| `LICENSE_GRACE_PERIOD_DAYS` | No | `0` | Expiration grace period. |
| `LICENSE_DOWNLOAD_TOKEN_TTL_MS` | No | `600000` | Customer download token TTL. |
| `LICENSE_UPDATER_TOKEN_TTL_MS` | No | `600000` | WordPress updater download token TTL. |
| `LICENSE_KEY_SEGMENTS` | No | `4` | License key segment count. |
| `LICENSE_KEY_SEGMENT_LENGTH` | No | `4` | License key segment length. |
| `LICENSE_KEY_CHECKSUM` | No | `false` | Adds checksum behavior if enabled by key generator. |

## Scripts

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ADMIN_EMAIL` | No | `admin@parentheses.test` | Used by create-admin and smoke test scripts. |
| `ADMIN_PASSWORD` | No | `AdminPass123` | Used by create-admin and smoke test scripts. |

## Frontend

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VITE_API_URL` | Production | `http://localhost:5000/api/v1` | Inlined at build time by Vite. |

## Local Example

```text
NODE_ENV=development
APP_ENV=development
DEPLOYMENT_TARGET=local
PORT=5000
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=parentheses_licensing
REDIS_ENABLED=false
ENABLE_STRIPE=false
ENABLE_LOCAL_PSP=false
```

## Railway Production Example

```text
NODE_ENV=production
APP_ENV=production
DEPLOYMENT_TARGET=railway
CLIENT_URL=https://app.blogpoint.net
CORS_ORIGIN=https://app.blogpoint.net
MONGO_URI=mongodb+srv://<user>:<encoded-password>@<cluster>/parentheses_licensing?retryWrites=true&w=majority
MONGO_DB_NAME=parentheses_licensing
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<different-random-secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM="BlogPoint <no-reply@app.blogpoint.net>"
REDIS_ENABLED=false
ENABLE_STRIPE=false
ENABLE_LOCAL_PSP=false
BACKUP_READINESS_STRICT=false
ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT=false
```

For production commerce, replace disabled provider flags with real provider credentials and enable the provider only after testing.
