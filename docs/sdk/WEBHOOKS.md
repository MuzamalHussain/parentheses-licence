# SDK Webhook Guide Reference

Webhook delivery is handled by the server-side webhook engine.

SDK consumers should:

- Store webhook secrets securely
- Verify `X-Parentheses-Signature`
- Reject stale timestamps
- Treat event `id` values as idempotency keys

Full webhook endpoint administration remains in the admin dashboard.
