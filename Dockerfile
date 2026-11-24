# ─── SocialHub Pro production image ────────────────────────────────────────────
# Multi-stage build. Runtime keeps only production dependencies and the
# standalone Next.js server output.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# SQLite lives on a volume in production; the build only needs a throwaway path.
ENV DATABASE_PATH=/tmp/build.db
ENV SEED_DEMO=false
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/socialhub.db
ENV STORAGE_DIR=/app/storage/uploads

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone output + static assets + public files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Schema and seed are applied at boot by lib/db bootstrap
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

RUN mkdir -p /app/data /app/storage/uploads && chown -R nextjs:nodejs /app/data /app/storage

USER nextjs
EXPOSE 3000
VOLUME ["/app/data", "/app/storage/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "server.js"]
