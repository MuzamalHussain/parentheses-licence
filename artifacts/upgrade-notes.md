# Upgrade Notes - Parentheses Licence 1.0.0

Generated: 2026-07-08T06:45:28.911Z

## Database

No explicit migration scripts are required for 1.0.0. Existing MongoDB collections remain compatible with the current Mongoose models.

## Environment

Review docs/ENVIRONMENT.md before upgrade. Prefer ENABLE_STRIPE and ENABLE_LOCAL_PSP over legacy alias flags.

## Storage

Back up uploaded plugin ZIPs before deployment or rollback, especially on ephemeral hosting.

## Deployment

Deploy backend first, confirm /live and /ready, then deploy frontend with VITE_API_URL pointing at the backend API.
