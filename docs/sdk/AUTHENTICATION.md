# SDK Authentication Guide

The SDKs use bearer API keys and send:

- `Authorization: Bearer <apiKey>`
- `X-Parentheses-SDK-Version`
- `X-Parentheses-API-Version`

API keys remain scoped and rate limited by the server. Store keys outside source control and rotate them from the admin dashboard when needed.
