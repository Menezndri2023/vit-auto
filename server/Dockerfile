# ── Stage 1 : Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Installer les dépendances (cache si package.json inchangé)
COPY package*.json ./
RUN npm ci --only=production

# Copier les sources
COPY . .

# ── Stage 2 : Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Sécurité : utilisateur non-root
RUN addgroup -g 1001 -S nodejs && adduser -S vitauto -u 1001

# Dossier logs
RUN mkdir -p /app/logs && chown vitauto:nodejs /app/logs

# Copier depuis builder
COPY --from=builder --chown=vitauto:nodejs /app/node_modules ./node_modules
COPY --chown=vitauto:nodejs . .

USER vitauto

EXPOSE 5001

# Health check Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
