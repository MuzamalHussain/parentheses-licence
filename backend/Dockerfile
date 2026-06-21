# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Uploads dir must exist and be writable (plugin ZIPs are stored on disk for MVP)
RUN mkdir -p uploads/plugins

# ── Runtime ──────────────────────────────────────────────────────────────────
ENV NODE_ENV=production
EXPOSE 5000

# Run as non-root for defense-in-depth
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

CMD ["node", "src/server.js"]
