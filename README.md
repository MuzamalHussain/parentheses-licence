# Parentheses Licence

Parentheses Licence is a MERN licensing portal with a Node/Express backend, React frontend, MongoDB persistence, admin management tools, customer portal flows, plugin version downloads, payment gateway foundations, and deployment documentation.

## Project Structure

```text
parentheses-licence/
├── backend/
├── frontend/
├── docs/
├── DEPLOYMENT.md
├── docker-compose.yml
└── README.md
```

## Local Setup

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

See `DEPLOYMENT.md` for Docker Compose and production deployment notes.

## Environment Files

Real `.env` files are intentionally ignored and must not be committed. Use the provided backend `.env.example` and `.env.production.example` templates to configure each environment.
