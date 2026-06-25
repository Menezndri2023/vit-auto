# ── Stage 1 : Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2 : Serveur Nginx ───────────────────────────────────────────────────
FROM nginx:alpine AS production

# Config Nginx optimisée pour SPA
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Assets buildés
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/api/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
