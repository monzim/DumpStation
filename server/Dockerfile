# =============================================================================
# Multi-stage Dockerfile for DumpStation
# Supports PostgreSQL client versions 12, 13, 14, 15, 16, 17
# Optimized for faster CI/CD builds with better layer caching
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with PostgreSQL clients (cached layer)
# This layer rarely changes and can be cached across builds
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS postgres-base

ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages and PostgreSQL clients in ONE layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    tzdata \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client-12 \
    postgresql-client-13 \
    postgresql-client-14 \
    postgresql-client-15 \
    postgresql-client-16 \
    postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /var/cache/apt/archives/*

# -----------------------------------------------------------------------------
# Stage 2: Build the Go binary
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS builder

# Build arguments for cross-compilation
ARG TARGETOS
ARG TARGETARCH

WORKDIR /build

# Copy go mod files first for better layer caching
COPY go.mod go.sum ./

# Download dependencies (cached if go.mod/go.sum unchanged)
RUN go mod download

# Copy the source code
COPY . .

# Build the application for target platform
# CGO_ENABLED=0 creates a static binary
# -ldflags="-s -w" strips debug info for smaller binary
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
    -ldflags="-s -w" \
    -o backup-service \
    ./cmd/server

# -----------------------------------------------------------------------------
# Stage 3: Runtime image
# -----------------------------------------------------------------------------
FROM postgres-base AS runtime

# Labels for container metadata
LABEL org.opencontainers.image.title="DumpStation"
LABEL org.opencontainers.image.description="Database backup service with multi-version PostgreSQL support"
LABEL org.opencontainers.image.source="https://github.com/monzim/DumpStation"

# Set environment variables
ENV TZ=UTC \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8080

WORKDIR /app

# Create non-root user for security
RUN groupadd --gid 1000 appgroup \
    && useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

# Create necessary directories
RUN mkdir -p /app/migrations /app/docs /tmp/backups \
    && chown -R appuser:appgroup /app /tmp/backups

# Copy the binary from builder
COPY --from=builder --chown=appuser:appgroup /build/backup-service /app/backup-service

# Copy migrations and docs
COPY --chown=appuser:appgroup migrations/ /app/migrations/
COPY --chown=appuser:appgroup docs/ /app/docs/

# Switch to non-root user
USER appuser

# Expose the application port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

# Run the application
ENTRYPOINT ["/app/backup-service"]
