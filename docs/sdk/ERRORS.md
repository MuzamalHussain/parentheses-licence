# SDK Error Guide

The JavaScript SDK maps standard Public API errors to typed exceptions:

- `AuthenticationError`
- `PermissionDeniedError`
- `ValidationError`
- `RateLimitError`
- `LicenseNotFoundError`
- `ProductNotFoundError`
- `ServerError`

Every SDK error includes `code`, `status`, `requestId`, and the parsed API response when available.
