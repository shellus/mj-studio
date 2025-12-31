# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for better-sqlite3 and git for VitePress
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with pnpm store cache
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build with Nuxt cache
RUN --mount=type=cache,target=/app/node_modules/.cache \
    pnpm build

# Production stage
FROM node:20-alpine AS runner

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache libstdc++

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt

# Copy built application
COPY --from=builder --chown=nuxt:nodejs /app/.output /app/.output

# Copy database migrations (for auto-migration on startup)
COPY --from=builder --chown=nuxt:nodejs /app/server/database/migrations /app/server/database/migrations

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nuxt:nodejs /app/data

USER nuxt

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
