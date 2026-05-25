# =============================================================================
# Web Dockerfile — multi-stage build
#
# Stages:
#   deps    — install node_modules into its own layer. Re-runs only when
#             package.json (or any lockfile) changes, not when source changes.
#   builder — `bun run build` against the prepared node_modules.
#   runtime — slim final image with just node_modules + dist + the runtime
#             scripts. Doesn't carry the source tree or build tools.
#
# Why this is faster: previously every source change re-ran `bun install`
# because `COPY . .` invalidated all subsequent layers. Splitting deps into
# its own stage means Docker reuses the cached install whenever package.json
# is unchanged — which is the common case.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: install dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy every lockfile we recognise. Bun prefers bun.lock(b) when present,
# falls back to package-lock.json / pnpm-lock.yaml so the install is at
# least cache-friendly even if not perfectly deterministic. The trailing
# `*` keeps the COPY succeeding when only some of these exist.
COPY package.json ./
COPY bun.lock* bun.lockb* package-lock.json* pnpm-lock.yaml* ./

RUN bun install

# -----------------------------------------------------------------------------
# Stage 2: build the app
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun --bun run build

# -----------------------------------------------------------------------------
# Stage 3: runtime image
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine
WORKDIR /app

# vite preview needs the vite binary + its peer deps at runtime, so we keep
# node_modules. If you later switch to serving the static client bundle via
# nginx/caddy, you can drop node_modules and shrink this image further.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bun", "--bun", "run", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
