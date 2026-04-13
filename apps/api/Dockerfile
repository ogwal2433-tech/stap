# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package.json files for all packages
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package first
RUN pnpm --filter @stap/shared build

# Generate Prisma client
RUN cd apps/api && pnpm exec prisma generate

# Build API
RUN pnpm --filter api build

# ── Stage 2: Production ───────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy prisma schema and generate client
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && pnpm exec prisma generate

# Copy built files from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy entrypoint script
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p /app/public/uploads/temp /app/public/uploads/guards

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]