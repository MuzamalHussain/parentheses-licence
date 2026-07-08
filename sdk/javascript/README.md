# Parentheses Licence JavaScript SDK

## Quick Start

```js
const { ParenthesesLicenceClient } = require("@parentheses/licence-sdk");

const client = new ParenthesesLicenceClient({
  apiKey: process.env.PARENTHESES_API_KEY,
  baseUrl: "https://your-license-server.example",
});

const products = await client.products.list();
```

## Authentication

The SDK sends `Authorization: Bearer <apiKey>` automatically and includes SDK/API compatibility headers.

## Modules

- `products`
- `versions`
- `licenses`
- `orders`
- `downloads`
- `customers`
- `payments`
- `webhooks`
- `activations`

## Pagination

```js
const page = await client.products.list({ limit: 100 });
const next = await page.nextPage();

for await (const product of page.autoPagination()) {
  console.log(product.name);
}
```

## Errors

Typed errors include:

- `AuthenticationError`
- `PermissionDeniedError`
- `ValidationError`
- `RateLimitError`
- `LicenseNotFoundError`
- `ProductNotFoundError`
- `ServerError`

## Webhook Guide Reference

Webhook deliveries are managed by the server-side Phase 12C webhook engine. Use the Public API and admin dashboard for endpoint metadata; verify webhook signatures with the documented `X-Parentheses-Signature` header format.
