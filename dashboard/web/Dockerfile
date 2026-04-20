# syntax=docker/dockerfile:1.7

# ---------- deps: install + compile native modules ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 is a native module; node-gyp needs python + a C++ toolchain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- builder: compile Next.js ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runner: minimal production image ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nextjs \
 && useradd  --system --uid 1001 --gid nextjs nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next         ./.next
COPY --from=builder --chown=nextjs:nextjs /app/node_modules  ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/package.json  ./package.json
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./next.config.ts

USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]
