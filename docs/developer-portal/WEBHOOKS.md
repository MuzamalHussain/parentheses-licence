# Webhooks

Webhook deliveries include:

- `X-Parentheses-Signature`
- `X-Parentheses-Timestamp`
- `X-Parentheses-Event`

Consumers should verify the HMAC signature, reject stale timestamps, and treat event ids as idempotency keys.
