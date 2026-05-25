# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl openssl-dev libc6-compat

# corepack ships with Node 20 — much faster than `npm install -g pnpm`
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Skip Puppeteer's bundled Chrome download — system Chromium is used at runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install ALL dependencies — cache the pnpm content-addressable store across builds
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package first
RUN pnpm --filter @stap/shared build

# Generate Prisma client for Alpine (linux-musl)
RUN cd apps/api && pnpm exec prisma generate

# Build API
RUN pnpm --filter api build

# Produce a pruned production-only node_modules (no devDeps, resolves workspace packages)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter api deploy --prod /app/api-deploy

# Copy the generated Prisma client into the deploy (pnpm deploy doesn't include .prisma)
RUN cp -r node_modules/.prisma /app/api-deploy/node_modules/.prisma

# ── Stage 2: Production ───────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Cache apk packages across builds
RUN --mount=type=cache,id=apk-cache,target=/var/cache/apk \
    apk add --no-cache \
    openssl \
    libc6-compat \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Copy the pruned production deployment from builder
COPY --from=builder /app/api-deploy/node_modules ./node_modules

# Copy built application files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy prisma schema (needed for migrate deploy at runtime)
COPY apps/api/prisma ./apps/api/prisma

# Copy entrypoint script
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

# Create uploads directories
RUN mkdir -p /app/public/uploads/temp \
             /app/public/uploads/guards \
             /app/public/uploads/invoices \
             /app/public/uploads/payslips \
             /app/public/uploads/letters

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app/public
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
