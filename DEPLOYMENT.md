# Deployment Guide

The canonical deployment guide has moved to [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Use this short checklist as an entry point:

```text
Frontend: https://app.blogpoint.net
Backend:  https://api.blogpoint.net
API base: https://api.blogpoint.net/api/v1
Backend host: Railway
Frontend host: Vercel
Database: MongoDB Atlas
SMTP: Gmail app password or another SMTP account
```

Before release:

```bash
npm run lint
npm run build
npm test
```

Backend production readiness:

```bash
cd backend
npm run check:production-readiness
```

Runtime readiness endpoint:

```text
GET https://api.blogpoint.net/ready
```

Full runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
