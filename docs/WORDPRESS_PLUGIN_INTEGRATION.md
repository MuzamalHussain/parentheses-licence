# WordPress Plugin Integration Guide

This guide documents the current API contract for integrating a WordPress plugin with Parentheses Licence.

Production endpoints:

```text
Activation API: https://api.blogpoint.net/api/v1/plugin
Updater API:    https://api.blogpoint.net/api/wp/updater
```

## Security Model

- WordPress plugin endpoints do not use customer JWTs.
- The license key is the credential.
- Requests are rate limited by IP and license key.
- Domains are normalized by the backend.
- Download links are signed, short-lived, single-use tokens.
- Plugin ZIP files are never served from a public static directory.

## Activation

```text
POST /api/v1/plugin/activate
```

Body:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "domain": "https://example.com",
  "product": "blogpoint-pro"
}
```

`product` is optional in the controller, but recommended. It should match the product slug.

Success:

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

Site limit response:

```json
{
  "success": false,
  "message": "Site limit reached (1 site allowed). Deactivate another domain first.",
  "allowedSites": 1,
  "usedSites": 1,
  "activeDomains": ["example.com"]
}
```

## Validation

```text
POST /api/v1/plugin/check
```

Body:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "domain": "https://example.com",
  "product": "blogpoint-pro"
}
```

Success:

```json
{
  "success": true,
  "valid": true,
  "domainValid": true,
  "message": "License is valid."
}
```

Failure:

```json
{
  "success": false,
  "valid": false,
  "message": "License is invalid or not entitled for this domain."
}
```

## Deactivation

```text
POST /api/v1/plugin/deactivate
```

Body:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "domain": "https://example.com",
  "product": "blogpoint-pro"
}
```

If the domain was not active, the endpoint still returns success with a message that the domain was not activated.

## Domain Replacement

```text
POST /api/v1/plugin/replace-domain
```

Body:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "oldDomain": "old.example.com",
  "newDomain": "new.example.com",
  "product": "blogpoint-pro"
}
```

Use this when a plugin install migrates domains and the customer needs to move the activation without manually deactivating first.

## Lightweight Update Check

```text
POST /api/v1/plugin/update-check
```

Body:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "domain": "https://example.com",
  "product": "blogpoint-pro",
  "currentVersion": "1.0.0"
}
```

Response:

```json
{
  "success": true,
  "updateAvailable": true,
  "domainActivated": true,
  "currentVersion": "1.0.0",
  "latestVersion": "1.2.3",
  "changelog": "Release notes",
  "minWpVersion": "6.0",
  "minPhpVersion": "8.1",
  "releasedAt": "2026-07-03T12:00:00.000Z"
}
```

This endpoint reports availability but does not issue a package URL. Use the WordPress updater contract below for secure package delivery.

## WordPress Updater Check

```text
POST /api/wp/updater/check
```

Body:

```json
{
  "license_key": "XXXX-XXXX-XXXX-XXXX",
  "site_url": "https://example.com",
  "plugin_slug": "blogpoint-pro",
  "current_version": "1.0.0"
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

Update available:

```json
{
  "success": true,
  "update_available": true,
  "plugin_slug": "blogpoint-pro",
  "new_version": "1.2.3",
  "requires": "6.0",
  "tested": "",
  "requires_php": "8.1",
  "package": "https://api.blogpoint.net/api/wp/updater/download/signed-token",
  "changelog": "Release notes",
  "release_notes": "Release notes",
  "checksum": "sha256",
  "expires_at": "2026-07-03T12:00:00.000Z"
}
```

## Secure Download Flow

1. Plugin calls `/api/wp/updater/check`.
2. Backend validates license, product slug, active domain, and latest published version.
3. Backend creates a `Download` record with purpose `wordpress_update`.
4. Backend returns a signed `package` URL.
5. WordPress downloads the package using `GET /api/wp/updater/download/:token`.
6. Backend verifies token, license state, published version, active domain, file path, and single-use status.
7. Backend marks the token used before streaming the ZIP.

## License Key Handling

- Store the license key in WordPress options.
- Do not log the full key.
- Send the key only over HTTPS.
- Normalize and trim user input before sending, but let the backend remain the source of truth.
- Treat `403` as invalid, not activated, expired, suspended, revoked, or not entitled.

## Site and Domain Behavior

- Activation stores normalized domains in the license `activeDomains` array.
- Repeating activation for the same domain is idempotent.
- `allowedSites=0` means unlimited sites.
- If site limit is reached, activation returns `403` with `allowedSites`, `usedSites`, and `activeDomains`.
- Production defaults reject localhost/private host activation unless license engine env flags allow them.

## Error Handling

Handle these statuses:

| Status | Meaning |
| --- | --- |
| `200` | Success or no update. |
| `201` | New activation created. |
| `403` | License invalid, domain not active, site limit reached, or token invalid. |
| `404` | Version/file/license resource not found. |
| `422` | Required field missing or invalid domain/request. |
| `429` | Rate limit exceeded. |

## PHP Snippets

These snippets use the current API contract and WordPress HTTP functions.

### Activate

```php
function blogpoint_activate_license($license_key) {
    $response = wp_remote_post('https://api.blogpoint.net/api/v1/plugin/activate', [
        'timeout' => 15,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'licenseKey' => $license_key,
            'domain' => home_url(),
            'product' => 'blogpoint-pro',
        ]),
    ]);

    if (is_wp_error($response)) {
        return ['success' => false, 'message' => $response->get_error_message()];
    }

    return json_decode(wp_remote_retrieve_body($response), true);
}
```

### Validate

```php
function blogpoint_check_license($license_key) {
    $response = wp_remote_post('https://api.blogpoint.net/api/v1/plugin/check', [
        'timeout' => 15,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'licenseKey' => $license_key,
            'domain' => home_url(),
            'product' => 'blogpoint-pro',
        ]),
    ]);

    if (is_wp_error($response)) {
        return false;
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    return !empty($body['success']) && !empty($body['valid']) && !empty($body['domainValid']);
}
```

### Updater Check

```php
function blogpoint_update_check($license_key, $current_version) {
    $response = wp_remote_post('https://api.blogpoint.net/api/wp/updater/check', [
        'timeout' => 15,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'license_key' => $license_key,
            'site_url' => home_url(),
            'plugin_slug' => 'blogpoint-pro',
            'current_version' => $current_version,
        ]),
    ]);

    if (is_wp_error($response)) {
        return null;
    }

    return json_decode(wp_remote_retrieve_body($response), true);
}
```

## Admin Setup Required Before Plugin Use

1. Create a product with slug matching the plugin slug.
2. Create at least one active plan.
3. Upload a WordPress plugin ZIP for that product.
4. Publish the intended version.
5. Issue or sell a license to the customer.
6. Activate from the WordPress plugin.
