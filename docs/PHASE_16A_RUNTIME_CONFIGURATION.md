# Phase 16A Runtime Configuration Foundation

## Architecture

`SettingsService` is the sole public API for future runtime-setting consumers. It coordinates definitions, validation, layered resolution, persistence, encryption, caching, audit records, and version history. `SettingsRepository` owns database access only. Current application modules are intentionally not migrated in Phase 16A.

Resolution is deterministic:

1. Runtime override: process-local and temporary; reserved for operational controls.
2. Database: records in `runtime_settings`; the primary source for future migrated runtime keys.
3. Environment: the definition's explicit `envKey`; fallback only.
4. Validated default: the definition's final fallback.

Infrastructure configuration (`NODE_ENV`, `PORT`, MongoDB connectivity, JWT bootstrap secrets, and `APP_ENCRYPTION_KEY`) remains environment-first because it is required before database-backed configuration is available.

## Components

- `SettingDefinitionRegistry` registers namespaced keys, groups, types, defaults, access flags, encryption flags, validators, descriptions, and future UI metadata.
- `SettingValidators` supports string, number, boolean, enum, array, object, URL, email, host, port, secret, duration, currency, locale, timezone, and custom validators.
- `SettingsCache` provides TTL expiry, key/group/bulk invalidation, reload support, and hit/miss/eviction statistics.
- `SettingsRepository` provides reads, writes, grouping, search, bulk updates, version history, and audit persistence without resolution logic.
- `SettingsEncryptionProvider` adapts the existing AES-256-GCM implementation backed by `APP_ENCRYPTION_KEY`. It exposes encrypt, decrypt, explicit key rotation, masking, and status.
- `RuntimeSettingVersion` records immutable create/update/delete/import-ready revisions for later history, diff, rollback, restore, and snapshot features.
- `RuntimeSettingAudit` records configuration-specific events without storing plaintext secret values.

## API

The service exposes `get`, `set`, `has`, `remove`, `reload`, `clearCache`, `getGroup`, `getMany`, `export`, `import`, `setOverride`, `removeOverride`, and `cacheStats`. Reads can request metadata to inspect source and version. Import validation completes before writes begin. Masked secret exports are not re-imported.

## Environment Access Audit and Migration Map

The backend currently centralizes many variables through `src/config/env.js`, but direct access remains in legacy modules. Phase 16A records these consumers without changing them.

| Category | Current variables/areas | Current consumers | Future treatment |
| --- | --- | --- | --- |
| Infrastructure | `NODE_ENV`, `APP_ENV`, `PORT`, `MONGO_URI`, `MONGO_DB_NAME`, `DNS_SERVERS`, JWT secrets/expiry/issuer/audience, `APP_ENCRYPTION_KEY`, Redis bootstrap | `config/env`, database/server startup, JWT, encryption, scripts | Remain env-first; expose read-only operational metadata where safe |
| SMTP/email | `EMAIL_*`, `SMTP_*`, `STARTUP_VERIFY_SMTP` | `config/env`, notification provider, startup diagnostics, integration resolver | Define and migrate in Phase 16B or its dedicated email phase |
| Stripe/payments | `STRIPE_*`, `ENABLE_STRIPE`, local PSP variables, payment transaction flags | `config/env`, integration manager, payment services | Register payment definitions and migrate provider-by-provider |
| Wise/HBL | Wise API/profile/webhook variables and HBL provider credentials/config | integration provider catalog and payment integrations | Migrate only with provider-specific validation and connection tests |
| AI | provider API keys, `AI_SETTINGS_SECRET`, model/routing options | AI manager, integration catalog, developer examples | Migrate after encrypted definitions and provider health wiring |
| Storage/downloads | `STORAGE_PROVIDER`, upload/backup roots, plugin ZIP and download-token limits | `config/env`, storage, downloads, backup services | Keep bootstrap paths env-first where required; migrate runtime policies |
| Feature flags | `ENABLE_*`, maintenance/read-only/emergency controls | `config/env`, feature-flag/config consumers | Migrate individually with safe defaults and reload semantics |
| WordPress/licensing | updater enforcement, license engine and download-token variables | license/updater configs and controllers | Migrate only after compatibility and security regression coverage |
| Security | auth limits, API security limits, upload security, session security, webhook security | `config/env`, `config/apiSecurity`, middleware/services | Separate bootstrap secrets from runtime policy settings |
| Performance/operations | memory/query/cache thresholds, backup metadata, observability and deployment variables | performance config, resilience, backup/deployment services | Migrate tunable runtime values; preserve deployment bootstrap values |
| Integration catalog | provider field environment fallbacks read directly | `IntegrationManager` | Eventually adapt provider resolution to `SettingsService` definitions |
| Admin settings legacy | `Setting` model and `adminSettingsController` environment checks | existing Settings page | Preserve until a later explicit migration; no UI changes in Phase 16A |

## Extension Guide

1. Register the group if it is not part of the standard group list.
2. Register a complete definition with a dot-path key and explicit `envKey` when fallback is required.
3. Register a custom validator only when built-in validators cannot express the constraint.
4. Consume the value exclusively through `SettingsService`; do not add a new direct `process.env` read for runtime settings.
5. Mark credentials `encrypted: true`, keep them invisible by default, and never include plaintext in audit metadata.
6. Add database-priority, environment-fallback, validation, cache-invalidation, failure-path, and module regression tests.
7. Migrate one bounded module at a time, retaining the environment fallback until deployment data has been verified.

## Operational Notes

The in-memory cache is instance-local. Writes invalidate the local key immediately; multi-instance invalidation can later be attached without changing consumers. Runtime overrides are also instance-local and disappear on restart. Database indexes support key lookup, grouped reads, audit chronology, and key/version history.
