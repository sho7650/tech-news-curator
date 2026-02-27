FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsup.config.ts tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:22-slim AS production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN adduser --disabled-password --gecos "" --no-create-home --uid 10001 appuser
USER appuser
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:8100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
