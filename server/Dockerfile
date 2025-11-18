# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy go mod files first
COPY go.mod go.sum ./
RUN go mod download

# Copy all source code and generated files
COPY . .

# Verify swagger docs exist and are readable
RUN ls -la docs/ && head -5 docs/docs.go

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o backup-service ./cmd/server

# PostgreSQL client tools stage - builds directory structure with multiple versions
FROM alpine:latest AS pg-tools-builder

# Install PostgreSQL client tools from standard repository
RUN apk add --no-cache \
    postgresql-client

# Create version-specific directories structure for compatibility
RUN mkdir -p /pg-tools && \
    for version in 12 13 14 15 16; do \
      mkdir -p /pg-tools/$version/bin; \
    done && \
    # Copy available tools to all version directories (symlinks for compatibility)
    mkdir -p /pg-tools/latest/bin && \
    for tool in pg_dump pg_restore psql pg_basebackup pg_receivewal pg_recvlogical createdb dropdb createuser dropuser vacuumdb reindexdb clusterdb vacuumlo; do \
      if command -v "$tool" > /dev/null 2>&1; then \
        for version in 12 13 14 15 16; do \
          ln -sf "$(which "$tool")" /pg-tools/$version/bin/$tool 2>/dev/null || true; \
        done; \
        ln -sf "$(which "$tool")" /pg-tools/latest/bin/$tool 2>/dev/null || true; \
      fi; \
    done && \
    # Verify at least pg_dump is available
    if [ ! -f /pg-tools/latest/bin/pg_dump ]; then \
      cp /usr/bin/pg_dump* /pg-tools/latest/bin/ 2>/dev/null || true; \
      for version in 12 13 14 15 16; do \
        cp /usr/bin/pg_dump* /pg-tools/$version/bin/ 2>/dev/null || true; \
      done; \
    fi

# Runtime stage
FROM alpine:latest

# Install runtime dependencies and CA certificates
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    libpq \
    openssl

# Copy PostgreSQL client tools from builder
COPY --from=pg-tools-builder /pg-tools /usr/lib/postgresql

# Create symlinks for standard PostgreSQL paths
RUN for version in 12 13 14 15 16; do \
      mkdir -p /usr/lib/postgresql/$version/bin && \
      if [ -d "/usr/lib/postgresql/$version/bin" ]; then \
        ln -sf /usr/lib/postgresql/$version/bin/* /usr/local/bin/ || true; \
      fi; \
    done

# Create healthcheck helper
RUN echo '#!/bin/bash\nset -e\ntest -f /root/backup-service || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/backup-service .

# Copy migrations
COPY --from=builder /app/migrations ./migrations

# Create necessary directories
RUN mkdir -p /root/logs /tmp/backups

# Set permissions
RUN chmod +x /root/backup-service

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/stats || exit 1

# Run the service with graceful shutdown support
CMD ["./backup-service"]
