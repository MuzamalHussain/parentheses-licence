# Production Checklist - Parentheses Licence 1.0.0

Generated: 2026-07-08T06:45:28.911Z

- Confirm Railway backend variables match docs/ENVIRONMENT.md.
- Confirm Vercel frontend VITE_API_URL points to https://api.blogpoint.net/api/v1.
- Confirm MongoDB Atlas backups and restore permissions.
- Confirm SMTP sender, app password, and reply-to mailbox.
- Confirm CORS_ORIGIN includes https://app.blogpoint.net.
- Confirm /live and /ready pass after backend deployment.
- Confirm admin account exists and uses a strong password.
- Confirm plugin ZIP storage is persistent or externally backed up.
- Confirm WordPress activation, validation, update check, and secure download flows.
- Confirm rollback plan and uploaded ZIP backup before release.
