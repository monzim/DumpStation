# =============================================================================
# Multi-stage Dockerfile for DB Proxy Backup Service
# Supports PostgreSQL client versions 12, 13, 14, 15, 16, 17
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the Go binary
# -----------------------------------------------------------------------------
FROM golang:1.24-bookworm AS builder

WORKDIR /build

# Copy go mod files first for better layer caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && go mod verify

# Copy the source code
COPY . .

# Verify swagger docs exist
RUN ls -la docs/ && head -5 docs/docs.go

# Build the application
# CGO_ENABLED=0 creates a static binary
# -ldflags="-s -w" strips debug info for smaller binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -a -installsuffix cgo \
    -o backup-service \
    ./cmd/server

# -----------------------------------------------------------------------------
# Stage 2: Runtime image with PostgreSQL client tools
# Using Debian for proper multi-version PostgreSQL support
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Labels for container metadata
LABEL org.opencontainers.image.title="DB Proxy Backup Service"
LABEL org.opencontainers.image.description="Database backup service with multi-version PostgreSQL support"
LABEL org.opencontainers.image.source="https://github.com/monzim/db_proxy"

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    # Application defaults
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8080

WORKDIR /app

# Install essential packages and PostgreSQL repository
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Add PostgreSQL official APT repository
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list

# Install PostgreSQL client tools for versions 12-17
# Each version installs to /usr/lib/postgresql/{VERSION}/bin/
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client-12 \
    postgresql-client-13 \
    postgresql-client-14 \
    postgresql-client-15 \
    postgresql-client-16 \
    postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Verify PostgreSQL tools installation
RUN echo "=== PostgreSQL Tools Verification ===" \
    && for version in 12 13 14 15 16 17; do \
        echo "PostgreSQL $version:"; \
        /usr/lib/postgresql/$version/bin/pg_dump --version; \
        /usr/lib/postgresql/$version/bin/psql --version; \
        /usr/lib/postgresql/$version/bin/pg_restore --version; \
    done

# Create non-root user for security
RUN groupadd --gid 1000 appgroup \
    && useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

# Create necessary directories
RUN mkdir -p /app/migrations /app/docs /tmp/backups \
    && chown -R appuser:appgroup /app /tmp/backups

# Copy the binary from builder
COPY --from=builder --chown=appuser:appgroup /build/backup-service /app/backup-service

# Copy migrations
COPY --chown=appuser:appgroup migrations/ /app/migrations/

# Copy swagger docs
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
