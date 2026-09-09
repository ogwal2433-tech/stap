# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# corepack ships with Node 20 — much faster than `npm install -g pnpm`
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies — cache the pnpm content-addressable store across builds
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared first
RUN pnpm --filter @stap/shared build

# ── Branding ──────────────────────────────────────────────────────────
# The frontend is static files behind nginx, so there is no server to ask at
# page load what deployment this is. The brand is therefore baked in here, and
# each branded stack builds its own image.
#
# Left unset these are empty, resolveBranding() falls back to the defaults in
# @stap/shared, and the image is the original STAP Security build — so the
# existing deployment is unaffected by this argument existing.
ARG VITE_APP_NAME=""
ARG VITE_APP_TAGLINE=""
ARG VITE_COMPANY_NAME=""
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_TAGLINE=$VITE_APP_TAGLINE \
    VITE_COMPANY_NAME=$VITE_COMPANY_NAME

# Build web
RUN pnpm --filter web build

# ── Stage 2: Production (Nginx serves static files) ───────────────────
FROM nginx:alpine AS production

# Copy built React files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy custom Nginx config for React Router
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s \
  CMD wget -qO- http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
