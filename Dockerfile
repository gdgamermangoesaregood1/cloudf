# syntax=docker/dockerfile:1

# ---- deps: install dependencies -------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app -------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy values so build-time env validation passes; the running container
# always receives real values via docker-compose's env_file/environment.
ENV APP_DB_PASSWORD=build-only-placeholder
ENV SQLI_DB_PASSWORD=build-only-placeholder
RUN npm run build

# ---- runner: minimal production image -------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# ---- migrator: one-off migration runner (uses the Postgres owner/superuser
#      credentials, unlike the "runner" app image above) --------------------
FROM node:20-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY db ./db
CMD ["npx", "tsx", "db/migrate.ts"]

