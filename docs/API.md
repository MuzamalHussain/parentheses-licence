# API Documentation

Default production API base:

```text
https://api.blogpoint.net/api/v1
```

Local API base:

```text
http://localhost:5000/api/v1
```

## Conventions

Most JSON responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "message": "Human readable error.",
  "requestId": "request-id"
}
```

Validation errors return HTTP `422`. Invalid JSON returns HTTP `400`. Expired or invalid JWTs return HTTP `401`.

## Authentication

Access token:

```text
Authorization: Bearer <accessToken>
```

Refresh token:

- Sent as an HTTP-only `refreshToken` cookie.
- Frontend sends credentials with `withCredentials: true`.

Roles:

```text
customer
support
admin
```

## Health and Version

These routes are mounted outside `/api/v1`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Basic health response. |
| GET | `/live` | Public | Process liveness check. |
| GET | `/ready` | Public | Readiness check, returns `503` if not ready. |
| GET | `/metrics` | Public | Diagnostics-derived metric snapshot. |
| GET | `/api` | Public | API version discovery. |

## Auth Endpoints

### Register

```text
POST /auth/register
```

Body:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "StrongPass123",
  "companyName": "Example Co"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Account created. Please check your email to verify your account.",
  "data": {
    "id": "userId",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "customer",
    "emailVerified": false,
    "isActive": true
  }
}
```

### Login

```text
POST /auth/login
```

Body:

```json
{
  "email": "ada@example.com",
  "password": "StrongPass123"
}
```

Response:

```json
{
  "success": true,
  "message": "Logged in successfully.",
  "data": {
    "user": { "id": "userId", "role": "customer" },
    "accessToken": "jwt"
  }
}
```

### Refresh

```text
POST /auth/refresh
```

Requires refresh cookie. Returns a new access token.

### Logout

```text
POST /auth/logout
```

Clears the refresh cookie and revokes the current refresh session when possible.

### Email and Password

| Method | Path | Body/Query |
| --- | --- | --- |
| GET | `/auth/verify-email?token=<token>` | Verification token query. |
| POST | `/auth/forgot-password` | `{ "email": "ada@example.com" }` |
| POST | `/auth/reset-password` | `{ "token": "...", "password": "NewPass123" }` |
| GET | `/auth/me` | Requires bearer token. |

## Public Product and Plan Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/products` | Optional | List active products for public/customer, all for admin. |
| GET | `/products/:id` | Optional | Product detail with plans. |
| GET | `/products/:productId/plans` | Optional | Active plans for public/customer, all for admin. |
| GET | `/products/:productId/plans/:id` | Optional | Plan detail. |

Pagination query fields where supported:

```text
page, limit, status, search, productId, userId
```

## Customer Endpoints

All customer endpoints require bearer auth.

### Orders

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/orders/checkout` | Create a pending order and return gateway checkout URL. |
| GET | `/orders` | List current user's orders. |
| GET | `/orders/:id` | Get current user's order. |

Checkout body:

```json
{
  "productId": "64f000000000000000000001",
  "planId": "64f000000000000000000002",
  "gateway": "stripe",
  "couponCode": "LAUNCH10"
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "orderId": "orderId",
    "checkoutUrl": "https://checkout-provider/session",
    "amount": 49,
    "currency": "USD",
    "discountAmount": 0
  }
}
```

### Licenses

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/licenses/summary` | Customer dashboard license totals. |
| GET | `/licenses` | List current user's licenses. |
| GET | `/licenses/:id` | Get current user's license. |
| GET | `/licenses/:id/activation-history` | Activation/deactivation history. |
| POST | `/licenses/:id/deactivate-domain` | Remove a domain from the license. |

Deactivate body:

```json
{
  "domain": "example.com"
}
```

### Downloads and Versions

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/products/:productId/versions` | Bearer | Entitlement-gated published version metadata. |
| POST | `/downloads/request` | Bearer | Create a short-lived single-use download token. |
| GET | `/downloads/history` | Bearer | Current user's download history. |
| GET | `/downloads/file/:token` | Token in URL | Stream ZIP file. |

Download request body:

```json
{
  "licenseId": "licenseId",
  "pluginVersionId": "optionalVersionId"
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "downloadUrl": "/api/v1/downloads/file/rawToken",
    "expiresAt": "2026-07-03T12:00:00.000Z",
    "version": {
      "id": "versionId",
      "versionNumber": "1.2.3",
      "changelog": "Release notes"
    }
  }
}
```

### Support

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/support/tickets` | List current user's tickets. |
| GET | `/support/tickets/:id` | Get current user's ticket. |
| POST | `/support/tickets` | Create ticket. |
| POST | `/support/tickets/:id/reply` | Reply to ticket. |

Create ticket body:

```json
{
  "subject": "Activation problem",
  "message": "The license will not activate.",
  "licenseId": "optionalLicenseId"
}
```

## WordPress Plugin Endpoints

These endpoints are called by WordPress plugins. They do not use JWT auth; the license key is the credential and rate limits are applied.

Mounted at:

```text
/api/v1/plugin
```

| Method | Path | Body |
| --- | --- | --- |
| POST | `/plugin/activate` | `{ "licenseKey": "...", "domain": "example.com", "product": "plugin-slug" }` |
| POST | `/plugin/deactivate` | `{ "licenseKey": "...", "domain": "example.com", "product": "plugin-slug" }` |
| POST | `/plugin/check` | `{ "licenseKey": "...", "domain": "example.com", "product": "plugin-slug" }` |
| POST | `/plugin/replace-domain` | `{ "licenseKey": "...", "oldDomain": "old.com", "newDomain": "new.com", "product": "plugin-slug" }` |
| POST | `/plugin/update-check` | `{ "licenseKey": "...", "domain": "example.com", "product": "plugin-slug", "currentVersion": "1.0.0" }` |

Activation success:

```json
{
  "success": true,
  "message": "License activated successfully.",
  "license": {
    "status": "active",
    "allowedSites": 1,
    "usedSites": 1,
    "activeDomains": ["example.com"]
  }
}
```

Validation success:

```json
{
  "success": true,
  "valid": true,
  "domainValid": true,
  "message": "License is valid."
}
```

### WordPress Updater Contract

Mounted at:

```text
/api/wp/updater
```

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/wp/updater/check` | WordPress-style update metadata and signed package URL. |
| GET | `/api/wp/updater/download/:token` | Single-use update package download. |

Check body:

```json
{
  "license_key": "XXXX-XXXX-XXXX-XXXX",
  "site_url": "https://example.com",
  "plugin_slug": "my-plugin",
  "current_version": "1.0.0"
}
```

Update available:

```json
{
  "success": true,
  "update_available": true,
  "plugin_slug": "my-plugin",
  "new_version": "1.2.3",
  "requires": "6.0",
  "tested": "",
  "requires_php": "8.1",
  "package": "https://api.blogpoint.net/api/wp/updater/download/token",
  "changelog": "Release notes",
  "release_notes": "Release notes",
  "checksum": "sha256",
  "expires_at": "2026-07-03T12:00:00.000Z"
}
```

No update:

```json
{
  "success": true,
  "update_available": false,
  "message": "Plugin is up to date."
}
```

## Admin Endpoints

Admin/support endpoints require bearer auth. Some write actions require `admin` specifically.

### Dashboard

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/dashboard` | admin, support |

### Users

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/users` | admin |
| GET | `/admin/users/:id` | admin |
| PATCH | `/admin/users/:id/role` | admin |
| PATCH | `/admin/users/:id/toggle-active` | admin |

Role body:

```json
{ "role": "support" }
```

### Products and Plans

Admin writes for products and plans are mounted on the public product path.

| Method | Path | Roles |
| --- | --- | --- |
| POST | `/products` | admin |
| PATCH | `/products/:id` | admin |
| DELETE | `/products/:id` | admin |
| POST | `/products/:productId/plans` | admin |
| PATCH | `/products/:productId/plans/:id` | admin |
| DELETE | `/products/:productId/plans/:id` | admin |

Product body:

```json
{
  "name": "BlogPoint Pro",
  "slug": "blogpoint-pro",
  "description": "Plugin description",
  "status": "active"
}
```

Plan body:

```json
{
  "name": "Single Site",
  "allowedSites": 1,
  "priceUSD": 49,
  "priceLocal": 14000,
  "durationDays": 365,
  "renewalType": "recurring",
  "isActive": true
}
```

### Plugin Versions

Mounted at `/admin/products/:productId/versions`.

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/products/:productId/versions` | admin, support |
| GET | `/admin/products/:productId/versions/:id` | admin, support |
| POST | `/admin/products/:productId/versions` | admin |
| PATCH | `/admin/products/:productId/versions/:id` | admin |
| POST | `/admin/products/:productId/versions/:id/publish` | admin |
| POST | `/admin/products/:productId/versions/:id/unpublish` | admin |
| POST | `/admin/products/:productId/versions/:id/rollback` | admin |
| DELETE | `/admin/products/:productId/versions/:id` | admin |

Upload uses `multipart/form-data`:

```text
file=<zip>
versionNumber=1.2.3
changelog=Release notes
minWpVersion=6.0
minPhpVersion=8.1
```

Publishing one version unpublishes other versions for the product.

### Licenses

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/licenses/stats` | admin, support |
| GET | `/admin/licenses` | admin, support |
| GET | `/admin/licenses/:id` | admin, support |
| POST | `/admin/licenses` | admin |
| PATCH | `/admin/licenses/:id` | admin |
| POST | `/admin/licenses/:id/suspend` | admin |
| POST | `/admin/licenses/:id/reinstate` | admin |
| POST | `/admin/licenses/:id/revoke` | admin |
| POST | `/admin/licenses/:id/reset-activations` | admin |

Create body:

```json
{
  "userId": "userId",
  "productId": "productId",
  "planId": "planId",
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "allowedSitesOverride": 1,
  "notes": "Manual license"
}
```

### Orders

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/orders/stats` | admin, support |
| GET | `/admin/orders` | admin, support |
| GET | `/admin/orders/:id` | admin, support |
| POST | `/admin/orders/:id/mark-refunded` | admin |

### Coupons

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/coupons` | admin, support |
| POST | `/admin/coupons` | admin |
| POST | `/admin/coupons/validate` | admin, support |
| GET | `/admin/coupons/:id` | admin, support |
| PATCH | `/admin/coupons/:id` | admin |
| DELETE | `/admin/coupons/:id` | admin |

Create body:

```json
{
  "code": "LAUNCH10",
  "type": "percentage",
  "value": 10,
  "maxUses": 100,
  "expiresAt": "2026-12-31T00:00:00.000Z"
}
```

### Domains

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/domains/stats` | admin, support |
| GET | `/admin/domains` | admin, support |
| GET | `/admin/domains/:licenseId/history` | admin, support |
| POST | `/admin/domains/:licenseId/force-deactivate` | admin |

Force deactivate body:

```json
{ "domain": "example.com" }
```

### Support

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/admin/support/tickets/stats` | admin, support |
| GET | `/admin/support/tickets` | admin, support |
| GET | `/admin/support/tickets/:id` | admin, support |
| POST | `/admin/support/tickets/:id/reply` | admin, support |
| PATCH | `/admin/support/tickets/:id/status` | admin, support |

Status body:

```json
{ "status": "pending" }
```

### Audit, Diagnostics, Settings

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/audit` | admin | Audit log list. |
| GET | `/admin/diagnostics` | admin, support | System diagnostics. Query `verifySmtp=true` optionally verifies SMTP. |
| GET | `/admin/settings` | admin | Grouped settings. |
| GET | `/admin/settings/feature-flags` | admin | Read-only feature flags. |
| GET | `/admin/settings/payment-providers` | admin | Provider status. |
| PATCH | `/admin/settings/:key` | admin | Update non-secret setting. |
| PATCH | `/admin/settings/:key/secret` | admin | Currently returns conflict for real secret updates; update env instead. |

## Webhooks

Mounted under `/api/v1/webhooks` with raw JSON body parsing.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/webhooks/stripe` | Stripe webhook handler. |
| POST | `/webhooks/local` | Local PSP webhook handler. |

Stripe requires `STRIPE_WEBHOOK_SECRET`. Local PSP uses timestamp/HMAC guard behavior implemented in the webhook utilities/controllers.
