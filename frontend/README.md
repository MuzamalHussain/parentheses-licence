# Parentheses Licence Frontend

React + Vite single page application for the customer portal and admin/support console.

## Requirements

- Node.js 20 or newer for production parity.
- Backend API reachable through `VITE_API_URL`.

## Install

```bash
cd frontend
npm install
```

## Run Development

```bash
npm run dev
```

Vite serves the app locally, typically at `http://localhost:5173`.

## Environment

Vite reads build-time variables prefixed with `VITE_`.

```text
VITE_API_URL=http://localhost:5000/api/v1
```

Production:

```text
VITE_API_URL=https://api.blogpoint.net/api/v1
```

The backend must allow the frontend origin through `CLIENT_URL` or `CORS_ORIGIN`.

## Build

```bash
npm run build
```

The production output is `dist/`.

## Preview

```bash
npm run preview
```

## Vercel Deployment

Recommended settings:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Environment: VITE_API_URL=https://api.blogpoint.net/api/v1
```

The included `vercel.json` rewrites all routes to `index.html`, which prevents browser refreshes on `/login`, `/dashboard`, and `/admin` from returning 404.

## Routing Notes

Public routes:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

Customer/support/admin portal routes:

- `/dashboard`
- `/dashboard/plans`
- `/dashboard/licenses`
- `/dashboard/downloads`
- `/dashboard/orders`
- `/dashboard/support`

Admin/support routes:

- `/admin`
- `/admin/products`
- `/admin/licenses`
- `/admin/users`
- `/admin/orders`
- `/admin/coupons`
- `/admin/domains`
- `/admin/downloads`
- `/admin/support`
- `/admin/audit`
- `/admin/settings`

The frontend stores the access token in `localStorage` and sends it as `Authorization: Bearer <token>`. The refresh token is an HTTP-only cookie sent with `withCredentials: true`.

## Scripts

```text
npm run dev       Start Vite dev server
npm run build     Build static assets
npm run lint      Run ESLint
npm test          Alias for lint
npm run preview   Preview production build locally
npm run typecheck Print no-TypeScript notice
```
