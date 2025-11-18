# Docker Setup Guide - Multi-Version PostgreSQL Support

This guide explains how to properly Dockerize the DumpStation backup service with support for multiple PostgreSQL versions.

## Overview

The Docker setup includes:

- **Multi-stage Dockerfile**: Optimized for production with PostgreSQL client tools (v12-v16)
- **Enhanced docker-compose**:
  - Backup service API
  - Service database (PostgreSQL 15)
  - Test databases (PostgreSQL 12, 14, 16)
  - MinIO for S3-compatible storage testing
- **Automated Makefile targets**: Easy build and deployment commands

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Backup Service Container                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Go Application (backup-service binary)             │
│  ├─ Internal database (PostgreSQL 15)               │
│  ├─ Version Manager                                 │
│  └─ PostgreSQL Client Tools                         │
│      ├─ PostgreSQL 12 tools                         │
│      ├─ PostgreSQL 13 tools                         │
│      ├─ PostgreSQL 14 tools                         │
│      ├─ PostgreSQL 15 tools                         │
│      └─ PostgreSQL 16 tools                         │
│                                                     │
└─────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │   PG12  │         │   PG14  │         │   PG16  │
    │(Legacy) │         │  (Test) │         │ (Latest)│
    └─────────┘         └─────────┘         └─────────┘
```

## Quick Start

### 1. Build and Start Services

```bash
# Build the Docker image
make docker-build

# Start all services (includes multi-version PostgreSQL)
make docker-up

# Verify PostgreSQL versions are available in container
make docker-verify-versions
```

### 2. Access the Services

- **Backup Service API**: http://localhost:8080
- **Swagger Documentation**: http://localhost:8080/swagger/index.html
- **MinIO Console**: http://localhost:9001 (user: minioadmin, pass: minioadmin)

### 3. Test Multi-Version Backup

```bash
# Test pg_dump availability for different versions
make docker-test-multiversion

# View service logs
make docker-logs-service

# View all PostgreSQL instances
make docker-logs-postgres
```

## Dockerfile Details

### Multi-Stage Build

The Dockerfile uses a 3-stage build process:

#### Stage 1: Builder

- Compiles the Go application
- Output: `backup-service` binary

#### Stage 2: PostgreSQL Tools Builder

- Pulls PostgreSQL client tools for versions 12, 13, 14, 15, 16
- Organizes tools in `/pg-tools/{version}/bin/` structure
- Supports multiple installation paths for flexibility

#### Stage 3: Runtime

- Lightweight Alpine Linux base
- Includes PostgreSQL client libraries (`libpq`)
- Has multi-version PostgreSQL tools available
- Includes health checks
- Ready for production deployment

### PostgreSQL Client Tools Installation

The Dockerfile installs and organizes tools as follows:

```
/usr/lib/postgresql/
├── 12/
│   └── bin/
│       ├── pg_dump
│       ├── psql
│       ├── pg_restore
│       └── ...
├── 13/
│   └── bin/ ...
├── 14/
│   └── bin/ ...
├── 15/
│   └── bin/ ...
└── 16/
    └── bin/ ...
```

This structure matches the version detection logic in `internal/backup/version.go`.

## Docker Compose Configuration

### Services Included

1. **postgres** (PostgreSQL 15)

   - Port: 5432
   - Purpose: Internal service database
   - Database: `backup_service`

2. **postgres-12** (PostgreSQL 12-Alpine)

   - Port: 5433
   - Purpose: Legacy database for testing
   - Database: `testdb_12`
   - User: `backup_user`

3. **postgres-14** (PostgreSQL 14-Alpine)

   - Port: 5434
   - Purpose: Mid-version database for testing
   - Database: `testdb_14`
   - User: `backup_user`

4. **postgres-16** (PostgreSQL 16-Alpine)

   - Port: 5435
   - Purpose: Latest version for testing
   - Database: `testdb_16`
   - User: `backup_user`

5. **backup-service** (Custom Docker image)

   - Port: 8080
   - Depends on all PostgreSQL services
   - Environment: See Configuration section

6. **minio** (S3-compatible storage)
   - Port: 9000 (API), 9001 (Console)
   - Purpose: Local testing of S3/R2 backup uploads

### Network

All services communicate via `backup_network` bridge network:

```
Services can reference each other by hostname:
- backup_service → postgres:5432
- backup_service → postgres-12:5432
- backup_service → postgres-14:5432
- backup_service → postgres-16:5432
- backup_service → minio:9000
```

## Makefile Commands

### Building

```bash
# Standard development image
make docker-build

# Production-optimized image
make docker-build-prod

# Push to registry
IMAGE_REGISTRY=myregistry.azurecr.io make docker-push
```

### Starting/Stopping

```bash
# Start all services
make docker-up

# Stop all services
make docker-down

# Restart all services
make docker-restart

# Pre-pull PostgreSQL images (faster startup)
make docker-pull-versions
```

### Monitoring and Testing

```bash
# View all logs
make docker-logs

# View only backup service logs
make docker-logs-service

# View PostgreSQL container logs
make docker-logs-postgres

# Verify PostgreSQL versions in container
make docker-verify-versions

# Test multi-version backup capability
make docker-test-multiversion

# Open shell in container
make docker-shell

# Inspect container details
make docker-inspect
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# Internal Database (PostgreSQL 15)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=backup_service
DB_SSLMODE=disable

# JWT Configuration
JWT_SECRET=your-secure-secret-key-here
JWT_EXPIRATION_HOURS=24

# Discord Notifications (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
OTP_EXPIRATION_MINUTES=5

# S3/R2 Storage Configuration (optional for testing with MinIO)
STORAGE_PROVIDER=s3
S3_ENDPOINT=http://minio:9000
S3_BUCKET=backups
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=auto
```

### Override in docker-compose

Edit `docker-compose.yml` `backup-service` section to customize:

```yaml
environment:
  SERVER_HOST: 0.0.0.0
  SERVER_PORT: 8080
  DB_HOST: postgres
  DB_PORT: 5432
  # ... other variables
```

## Testing Multi-Version Backups

### 1. Initialize Databases

```bash
# Create tables in each PostgreSQL version for testing
docker exec backup_postgres_12 psql -U backup_user -d testdb_12 -c \
  "CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT);"

docker exec backup_postgres_14 psql -U backup_user -d testdb_14 -c \
  "CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT);"

docker exec backup_postgres_16 psql -U backup_user -d testdb_16 -c \
  "CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT);"
```

### 2. Add Databases via API

```bash
# Get JWT token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login | jq -r '.token')

# Add PostgreSQL 12 database
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "legacy_db_12",
    "host": "postgres-12",
    "port": 5432,
    "dbname": "testdb_12",
    "user": "backup_user",
    "password": "backup_pass_12",
    "schedule": "0 */6 * * *"
  }'

# Add PostgreSQL 14 database
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "standard_db_14",
    "host": "postgres-14",
    "port": 5432,
    "dbname": "testdb_14",
    "user": "backup_user",
    "password": "backup_pass_14",
    "schedule": "0 */6 * * *"
  }'

# Add PostgreSQL 16 database
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "latest_db_16",
    "host": "postgres-16",
    "port": 5432,
    "dbname": "testdb_16",
    "user": "backup_user",
    "password": "backup_pass_16",
    "schedule": "0 */6 * * *"
  }'
```

### 3. Trigger Backups

```bash
# Trigger backup for each database
curl -X POST http://localhost:8080/api/v1/databases/{id}/backup \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Verify Backups

```bash
# Check logs to see version detection
make docker-logs-service

# Look for lines like:
# "Using PostgreSQL version: 12 for database legacy_db_12"
# "Using PostgreSQL version: 14 for database standard_db_14"
# "Using PostgreSQL version: 16 for database latest_db_16"
```

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- At least 2GB free disk space
- Ports 8080, 5432, 9000, 9001 available (or configured differently)

### Steps

1. **Build Image**

   ```bash
   make docker-build-prod
   ```

2. **Create Production Environment**

   ```bash
   cp .env.example .env.production
   # Edit .env.production with production values
   ```

3. **Use Production Compose**

   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Verify**
   ```bash
   docker ps
   curl http://localhost:8080/api/v1/health
   ```

### Health Checks

The Dockerfile includes built-in health checks:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/stats || exit 1
```

Check container health:

```bash
docker ps -a
# HEALTH column should show "healthy"
```

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Test connection to each PostgreSQL instance
docker exec backup_service_api psql -h postgres-12 -U backup_user -d testdb_12 -c "SELECT version();"
docker exec backup_service_api psql -h postgres-14 -U backup_user -d testdb_14 -c "SELECT version();"
docker exec backup_service_api psql -h postgres-16 -U backup_user -d testdb_16 -c "SELECT version();"
```

### Missing PostgreSQL Tools

```bash
# Verify tools are installed in container
make docker-verify-versions

# Or manually check
docker exec backup_service_api ls -la /usr/lib/postgresql/*/bin/pg_dump
```

### Container Won't Start

```bash
# Check logs
docker-compose logs backup-service

# Common issues:
# - Port 8080 already in use: Change in docker-compose.yml
# - Database not ready: Increase healthcheck retries
# - Insufficient disk space: Check with "docker system df"
```

### Reset Everything

```bash
# Remove all containers, volumes, and images
docker-compose down -v
docker rmi postgres-backup-service:latest

# Rebuild and restart
make docker-build
make docker-up
```

## Volume Management

### Data Persistence

Volumes are created for each service:

```yaml
volumes:
  postgres_data: # Service database
  postgres_12_data: # PostgreSQL 12
  postgres_14_data: # PostgreSQL 14
  postgres_16_data: # PostgreSQL 16
  minio_data: # MinIO storage
```

### Backup Logs

Local `./logs` directory is mounted:

```
./logs:/root/logs
```

### Cleanup Volumes

```bash
# Remove volumes (WARNING: Deletes all data)
docker-compose down -v

# List volumes
docker volume ls

# Remove specific volume
docker volume rm postgres_data
```

## Performance Tuning

### For Large Databases

1. Increase memory limits in `docker-compose.yml`:

   ```yaml
   services:
     backup-service:
       deploy:
         resources:
           limits:
             cpus: "2"
             memory: 2G
   ```

2. Increase timeout for large backups:

   ```go
   // In internal/backup/backup.go
   ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour) // Increase as needed
   ```

3. Use volumes for better I/O:
   ```bash
   docker run -v backup_volume:/tmp/backups ...
   ```

### For Faster Builds

```bash
# Use BuildKit for faster image builds
export DOCKER_BUILDKIT=1
make docker-build
```

## Advanced Usage

### Running Only Specific Versions

Edit `docker-compose.yml` to remove services you don't need:

```yaml
# Comment out services you don't need
services:
  postgres: # Keep
  # postgres-12:  # Comment out if not needed
  postgres-14: # Keep
  # postgres-16:  # Comment out if not needed
  backup-service: # Keep
```

### Custom Base Image

Change the Alpine version in Dockerfile:

```dockerfile
FROM alpine:3.19  # Change version here
```

### Persistent Container Logs

Enable Docker log rotation in `docker-compose.yml`:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "10"
```

## Security Considerations

### Production Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET
- [ ] Remove MinIO from production (or restrict access)
- [ ] Use environment-specific `.env` files
- [ ] Enable HTTPS (use reverse proxy like nginx)
- [ ] Restrict network access to services
- [ ] Use secrets management (Docker Secrets, Vault)
- [ ] Scan images for vulnerabilities: `docker scan postgres-backup-service:latest`

### Network Security

```yaml
# Restrict MinIO access to backup-service only
services:
  minio:
    networks:
      - backup_internal # Separate network

  backup-service:
    networks:
      - backup_internal
      - backup_network # Network for external access
```

## Next Steps

1. Review `POSTGRESQL_VERSIONS.md` for version detection details
2. Check `QUICK_REFERENCE.md` for API usage examples
3. Review `AUTHENTICATION.md` for JWT/OTP setup
4. Deploy using `make docker-build && make docker-up`

---

**Last Updated**: November 17, 2025  
**Supported PostgreSQL Versions**: 12, 13, 14, 15, 16  
**Status**: Production Ready ✓
