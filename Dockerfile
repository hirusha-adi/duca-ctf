FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.mjs ./
# prisma generate only needs DATABASE_URL to load config, not a live database
ENV DATABASE_URL="postgresql://duca:duca@localhost:5432/duca_ctf"
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://duca:duca@localhost:5432/duca_ctf"
RUN npm run build

# Minimal Prisma CLI install for `migrate deploy` (includes transitive deps like effect)
FROM base AS migrator
WORKDIR /app
ENV DATABASE_URL="postgresql://duca:duca@localhost:5432/duca_ctf"
RUN npm init -y >/dev/null 2>&1 \
  && npm install --no-audit --no-fund prisma@7.8.0 dotenv@17.4.2

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV UPLOAD_DIR=/app/data/uploads

RUN apk add --no-cache su-exec \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data/uploads \
  && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Standalone tracing omits @prisma/adapter-pg; seed/admin scripts require it at runtime.
COPY --from=builder /app/node_modules/@prisma/adapter-pg ./node_modules/@prisma/adapter-pg
COPY --from=builder /app/node_modules/@prisma/driver-adapter-utils ./node_modules/@prisma/driver-adapter-utils
COPY --from=builder /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma/create-client.js ./prisma/create-client.js
COPY --from=builder /app/src/lib/default-site-pages.js ./src/lib/default-site-pages.js

COPY --from=migrator /app/node_modules ./prisma-cli/node_modules

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
