# Phase 7N Operational Resilience

This phase prepares Parentheses Licence for production operation without changing product, licensing, payment, updater, or frontend behavior.

## Startup Gates

The backend now performs production readiness checks during startup:

- environment posture
- database connection
- upload storage writability
- backup root writability
- restore prerequisites
- Redis status when enabled
- optional SMTP verification

Production startup fails when critical production environment checks fail. Backup readiness is strict in production by default.

Run the same checks before deploy:

```bash
cd backend
npm run check:production-readiness
```

## Environment Isolation

Use distinct values per environment:

- `NODE_ENV`
- `APP_ENV`
- `DEPLOYMENT_TARGET`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- payment/webhook secrets
- SMTP credentials

`NODE_ENV=production` requires `APP_ENV=production`.

## Backup Strategy

The application prepares backup readiness, but external backup execution remains an infrastructure task.

Database:

- Use MongoDB Atlas scheduled snapshots for production.
- Keep point-in-time recovery enabled where available.
- For manual export, use `mongodump` from a trusted host.

Uploads:

- `UPLOAD_ROOT` defaults to `uploads`.
- Compose mounts `plugin_uploads` at `/app/uploads/plugins`.
- Production platforms with ephemeral disks require a persistent volume or object storage before launch.

Configuration:

- Back up deployment-provider environment variables through the provider UI or CLI.
- Do not commit real `.env` files.
- Keep `CONFIG_BACKUP_INCLUDE_ENV=false` unless using a secure secrets vault.

## Restore Strategy

Restore validation checks:

- database URI and name exist
- upload directory exists and is readable/writable
- auth secrets are present
- backup root is writable

After restore:

1. Restore MongoDB snapshot or dump.
2. Restore uploaded plugin ZIPs to `UPLOAD_ROOT/plugins`.
3. Restore deployment environment variables.
4. Run `npm run check:production-readiness`.
5. Boot backend and verify `/ready`.
6. Run the smoke test against staging before production traffic.

## Graceful Shutdown

The backend handles `SIGTERM` and `SIGINT` by:

- stopping HTTP intake
- closing Redis when used
- disconnecting MongoDB
- emitting structured shutdown logs

## Maintenance Foundation

The following flags are now centrally configured for future operational controls:

- `MAINTENANCE_MODE`
- `READ_ONLY_MODE`
- `EMERGENCY_SHUTDOWN`

They are diagnostic-only in Phase 7N.
