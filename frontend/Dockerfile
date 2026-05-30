# Build stage
FROM node:22.14.0-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Development stage
# Kept above the production stage so that the default build target
# (no --target flag = last stage) resolves to production, not dev.
FROM node:22.14.0-slim AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production stage (Next.js Node.js server)
# MUST remain the last stage so that `docker build` without --target
# (used by docker-compose.yml -> make build) selects production by default.
FROM node:22.14.0-slim AS production
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
ENV API_URL=http://news-api:8100
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
