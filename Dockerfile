# =============================================================================
# DumpStation server + web UI (single image)
#   docker build -t dumpstation .
# The Go server serves the API (/api/v1), the agent protocol (/agent/v1) and
# the web UI. PostgreSQL client tools 12–18 are included for direct backups.
# =============================================================================

# ---- Web UI ------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ---- PostgreSQL client tools -------------------------------------------------
FROM debian:bookworm-slim AS pg-clients
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release tzdata \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       postgresql-client-12 postgresql-client-13 postgresql-client-14 postgresql-client-15 \
       postgresql-client-16 postgresql-client-17 postgresql-client-18 \
    && apt-get purge -y gnupg lsb-release && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# ---- Go server -----------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS server
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /build
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
    -ldflags="-s -w -X github.com/monzim/db_proxy/v1/internal/handlers.Version=${VERSION}" \
    -o /out/dumpstation ./cmd/server

# ---- Runtime -----------------------------------------------------------------
FROM pg-clients
LABEL org.opencontainers.image.title="DumpStation" \
      org.opencontainers.image.description="Self-hosted PostgreSQL backup management (server + web UI)" \
      org.opencontainers.image.source="https://github.com/monzim/DumpStation" \
      org.opencontainers.image.licenses="MIT"
RUN groupadd --gid 1000 appgroup && useradd --uid 1000 --gid appgroup --no-create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app /tmp/dumpstation && chown appuser:appgroup /tmp/dumpstation
COPY --from=server /out/dumpstation /app/dumpstation
COPY --from=server /build/docs /app/docs
COPY --from=web /web/dist /app/web
ENV TZ=UTC \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8080 \
    WEB_DIR=/app/web \
    BACKUP_TEMP_DIR=/tmp/dumpstation
WORKDIR /app
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/v1/health || exit 1
ENTRYPOINT ["/app/dumpstation"]
