# Docker Deployment - Multi-Version PostgreSQL Support

Quick reference for using the pre-configured Docker setup with multiple PostgreSQL versions.

## TL;DR - Quick Start

```bash
# Build and start everything
make docker-build
make docker-up

# Verify it's working
make docker-verify-versions

# Access the API
curl http://localhost:8080/swagger/index.html
```

## What's Included

This Docker setup includes:

✅ **Application**: Go backup service  
✅ **Multi-version PostgreSQL**: 12, 13, 14, 15, 16 client tools  
✅ **Test Databases**: PostgreSQL 12, 14, 16 for testing  
✅ **Storage**: MinIO for S3-compatible testing  
✅ **Production Ready**: Health checks, logging, resource limits

## Available Makefile Commands

### Building

```bash
make docker-build              # Build standard image
make docker-build-prod         # Build production image
make docker-push              # Push to registry (needs IMAGE_REGISTRY env var)
```

### Starting/Stopping Services

```bash
make docker-up                # Start all services
make docker-down              # Stop all services
make docker-restart           # Restart all services
make docker-pull-versions     # Pre-download PostgreSQL images
```

### Monitoring

```bash
make docker-logs              # View all logs
make docker-logs-service      # View backup service logs only
make docker-logs-postgres     # View PostgreSQL logs only
make docker-verify-versions   # Check PostgreSQL versions
make docker-test-multiversion # Test backup capability
make docker-shell             # SSH into backup service container
make docker-inspect           # Show container details
```

## Service URLs

When running `make docker-up`:

| Service       | URL                                      | Credentials           |
| ------------- | ---------------------------------------- | --------------------- |
| Backup API    | http://localhost:8080                    | JWT required          |
| Swagger Docs  | http://localhost:8080/swagger/index.html | None                  |
| MinIO Console | http://localhost:9001                    | minioadmin/minioadmin |

## PostgreSQL Databases

### Service Database

- **Host**: postgres
- **Port**: 5432
- **Database**: backup_service
- **User**: postgres
- **Password**: postgres

### Test Databases

| Version | Host        | Port | DB        | User        | Password       |
| ------- | ----------- | ---- | --------- | ----------- | -------------- |
| 12      | postgres-12 | 5433 | testdb_12 | backup_user | backup_pass_12 |
| 14      | postgres-14 | 5434 | testdb_14 | backup_user | backup_pass_14 |
| 16      | postgres-16 | 5435 | testdb_16 | backup_user | backup_pass_16 |

Access from host:

```bash
psql -h localhost -p 5433 -U backup_user -d testdb_12  # PostgreSQL 12
psql -h localhost -p 5434 -U backup_user -d testdb_14  # PostgreSQL 14
psql -h localhost -p 5435 -U backup_user -d testdb_16  # PostgreSQL 16
```

## Docker Build Script

Alternative to Makefile:

```bash
./docker-build.sh build              # Build image
./docker-build.sh build-prod         # Production build
./docker-build.sh up                 # Start services
./docker-build.sh down               # Stop services
./docker-build.sh verify             # Check versions
./docker-build.sh test-multivers     # Test backups
./docker-build.sh shell              # SSH into container
./docker-build.sh push --registry my.registry.io
```

## Configuration

### Environment Variables

Create `.env` file:

```bash
# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=backup_service

# JWT
JWT_SECRET=your-secret-here
JWT_EXPIRATION_HOURS=24

# Discord (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Production

Use `docker-compose.prod.yml`:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Or via Makefile with custom env:

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Common Tasks

### Add a Database via API

```bash
# 1. Get JWT token
curl -X POST http://localhost:8080/api/v1/auth/login

# 2. Check Discord for OTP code

# 3. Verify OTP
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"otp":"123456"}' | jq -r '.token')

# 4. Add database
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my_database",
    "host": "postgres-14",
    "port": 5432,
    "dbname": "testdb_14",
    "user": "backup_user",
    "password": "backup_pass_14",
    "schedule": "0 2 * * *"
  }'
```

### Trigger Manual Backup

```bash
curl -X POST http://localhost:8080/api/v1/databases/{id}/backup \
  -H "Authorization: Bearer $TOKEN"
```

### Check Logs

```bash
# All services
make docker-logs

# Just backup service
docker-compose logs -f backup-service

# Just PostgreSQL
docker-compose logs -f postgres postgres-12 postgres-14 postgres-16
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs backup-service

# Common issues:
# - Port 8080 taken: Change in docker-compose.yml
# - Database not ready: Wait 30 seconds and retry
# - Out of disk space: Run `docker system prune -a`
```

### PostgreSQL tools not found

```bash
# Verify tools are installed
make docker-verify-versions

# Or manually
docker exec backup_service_api ls /usr/lib/postgresql/*/bin/pg_dump
```

### Can't connect to test databases

```bash
# Check if containers are running
docker ps | grep postgres

# Test connection
docker exec backup_service_api psql -h postgres-14 -U backup_user -d testdb_14 -c "SELECT version();"
```

### Reset everything

```bash
# Remove all containers and volumes
docker-compose down -v

# Remove images
docker rmi postgres-backup-service:latest

# Rebuild
make docker-build
make docker-up
```

## Performance Tips

### Faster builds

```bash
export DOCKER_BUILDKIT=1
make docker-build
```

### For large databases

- Increase timeout in `internal/backup/backup.go`
- Use host volumes: `-v /large-disk:/tmp/backups`
- Allocate more memory

### Persistent storage

```bash
docker-compose down -v        # Remove old volumes
docker volume create pg_data  # Create persistent volume
# Update docker-compose.yml to use named volume
```

## Production Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET
- [ ] Configure S3/R2 endpoints
- [ ] Enable HTTPS (via reverse proxy)
- [ ] Set resource limits
- [ ] Configure backup rotation
- [ ] Test restore process
- [ ] Set up monitoring/alerts
- [ ] Review security settings

## Support Files

- **Dockerfile**: Multi-stage Docker build with multi-version PG support
- **docker-compose.yml**: Development with test databases
- **docker-compose.prod.yml**: Production configuration
- **docker-build.sh**: Helper script for Docker operations
- **DOCKER_SETUP.md**: Complete Docker documentation

## Next Steps

1. Read [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed configuration
2. Read [POSTGRESQL_VERSIONS.md](POSTGRESQL_VERSIONS.md) for version detection
3. Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for API examples
4. Set up [AUTHENTICATION.md](AUTHENTICATION.md) for security

---

**Status**: Production Ready ✓  
**PostgreSQL Support**: 12, 13, 14, 15, 16  
**Last Updated**: November 17, 2025
