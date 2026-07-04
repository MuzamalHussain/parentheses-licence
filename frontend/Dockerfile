# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_URL must be supplied at build time since Vite inlines env vars
# into the static bundle. Pass it via: docker build --build-arg VITE_API_URL=...
ARG VITE_API_URL=https://api.blogpoint.net/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Runtime: nginx serving the static build ───────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
