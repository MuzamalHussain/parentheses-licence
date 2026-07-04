# Admin Operating Manual

This manual describes current admin/support workflows in Parentheses Licence.

## Access

Admins sign in through the frontend:

```text
https://app.blogpoint.net/login
```

Admin routes are under:

```text
/admin
```

Create the first admin from the backend environment:

```bash
cd backend
node scripts/create-admin.js admin@example.com StrongPass123
```

Roles:

- `admin`: full management access.
- `support`: read/support-oriented access; destructive writes usually require admin.
- `customer`: portal access only.

## Dashboard

Path:

```text
/admin
```

Shows customer totals, license stats, recent licenses, and recent audit logs from `GET /api/v1/admin/dashboard`.

## Creating Products

Path:

```text
/admin/products
```

Product fields:

- `name`: required.
- `slug`: optional. If omitted, the backend slugifies the name.
- `description`: optional.
- `status`: `active` or `archived`.

API:

```text
POST /api/v1/products
PATCH /api/v1/products/:id
DELETE /api/v1/products/:id
```

Delete is a soft archive, not a hard delete.

## Creating Plans

Plans belong to products.

Fields:

- `name`
- `allowedSites`: `0` means unlimited.
- `priceUSD`
- `priceLocal`
- `durationDays`
- `renewalType`: `recurring` or `one-time`
- `isActive`

API:

```text
POST /api/v1/products/:productId/plans
PATCH /api/v1/products/:productId/plans/:id
DELETE /api/v1/products/:productId/plans/:id
```

Plan delete deactivates the plan.

## Uploading Versions

Path:

```text
/admin/downloads
```

API:

```text
POST /api/v1/admin/products/:productId/versions
```

Upload uses `multipart/form-data`:

- `file`: `.zip`
- `versionNumber`: semver, for example `1.2.3`
- `changelog`
- `minWpVersion`
- `minPhpVersion`

Validation behavior:

- The file must be a ZIP.
- Duplicate version numbers for one product are rejected.
- Plugin upload security checks compare slug/version metadata when strict mode is enabled.
- Uploaded versions start unpublished.

## Publishing, Unpublishing, and Rollback

API:

```text
POST /api/v1/admin/products/:productId/versions/:id/publish
POST /api/v1/admin/products/:productId/versions/:id/unpublish
POST /api/v1/admin/products/:productId/versions/:id/rollback
DELETE /api/v1/admin/products/:productId/versions/:id
```

Publishing one version automatically unpublishes all other versions for that product. Rollback republishes an older version. Deleting is allowed only for unpublished version records; files may remain on disk.

## Issuing Licenses

Path:

```text
/admin/licenses
```

API:

```text
POST /api/v1/admin/licenses
```

Fields:

- `userId`
- `productId`
- `planId`
- `expiresAt`: optional ISO date, nullable.
- `allowedSitesOverride`: optional.
- `notes`: optional.

If `expiresAt` is omitted and the plan is recurring with `durationDays`, the backend derives an expiry date. `allowedSites` comes from the plan unless overridden.

## Managing Licenses

API:

```text
GET /api/v1/admin/licenses
GET /api/v1/admin/licenses/:id
PATCH /api/v1/admin/licenses/:id
POST /api/v1/admin/licenses/:id/suspend
POST /api/v1/admin/licenses/:id/reinstate
POST /api/v1/admin/licenses/:id/revoke
POST /api/v1/admin/licenses/:id/reset-activations
```

Use suspend for temporary access blocks, revoke for permanent access removal, and reset activations to clear all active domains.

## Managing Customers

Path:

```text
/admin/users
```

API:

```text
GET /api/v1/admin/users
GET /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id/role
PATCH /api/v1/admin/users/:id/toggle-active
```

Admins cannot change their own role or deactivate themselves through these endpoints.

## Orders and Refund Flags

Path:

```text
/admin/orders
```

API:

```text
GET /api/v1/admin/orders
GET /api/v1/admin/orders/:id
GET /api/v1/admin/orders/stats
POST /api/v1/admin/orders/:id/mark-refunded
```

Marking an order refunded records the order state and revokes the associated license if present. It does not issue a gateway refund through Stripe or local PSP.

## Coupons

Path:

```text
/admin/coupons
```

API:

```text
GET /api/v1/admin/coupons
POST /api/v1/admin/coupons
POST /api/v1/admin/coupons/validate
GET /api/v1/admin/coupons/:id
PATCH /api/v1/admin/coupons/:id
DELETE /api/v1/admin/coupons/:id
```

Coupon types:

- `percentage`: value cannot exceed 100.
- `fixed`: fixed amount discount.

Delete deactivates the coupon.

## Downloads

Admin uploads and publishes plugin versions. Customers request downloads from their portal. Download records can be reviewed through customer/admin API surfaces depending on view.

Customer download flow:

1. Customer has an active license.
2. Customer requests a download token.
3. Backend returns a short-lived single-use URL.
4. Backend revalidates entitlement before streaming the ZIP.

## Domains

Path:

```text
/admin/domains
```

API:

```text
GET /api/v1/admin/domains
GET /api/v1/admin/domains/stats
GET /api/v1/admin/domains/:licenseId/history
POST /api/v1/admin/domains/:licenseId/force-deactivate
```

Use force deactivate when a customer cannot access the original site, a domain is abusive, or support needs to free a slot.

## Support

Path:

```text
/admin/support
```

API:

```text
GET /api/v1/admin/support/tickets
GET /api/v1/admin/support/tickets/stats
GET /api/v1/admin/support/tickets/:id
POST /api/v1/admin/support/tickets/:id/reply
PATCH /api/v1/admin/support/tickets/:id/status
```

Statuses:

- `open`: awaiting staff action.
- `pending`: awaiting customer action.
- `closed`: resolved.

Admin replies move tickets to `pending`.

## Audit Logs

Path:

```text
/admin/audit
```

API:

```text
GET /api/v1/admin/audit
```

Filter by `action`, `targetType`, and `actorEmail`. Audit logs are important for license, payment, support, and domain actions.

## Diagnostics

API:

```text
GET /api/v1/admin/diagnostics
GET /api/v1/admin/diagnostics?verifySmtp=true
```

Diagnostics include environment readiness, database, storage, Redis/cache, notification queue, and maintenance state. Use `verifySmtp=true` only when testing email provider connectivity.

## Settings

Path:

```text
/admin/settings
```

API:

```text
GET /api/v1/admin/settings
GET /api/v1/admin/settings/feature-flags
GET /api/v1/admin/settings/payment-providers
PATCH /api/v1/admin/settings/:key
PATCH /api/v1/admin/settings/:key/secret
```

Current secret settings are env-managed. The secret update endpoint intentionally rejects real secret changes until encrypted settings storage exists.
