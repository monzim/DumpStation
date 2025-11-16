# Quick Start Guide

This guide will help you get the PostgreSQL Backup Service up and running in minutes.

## Prerequisites

- Go 1.21+ installed
- PostgreSQL installed (with `pg_dump` and `psql` tools)
- Access to AWS S3 or Cloudflare R2
- Discord webhook URL (optional, for notifications)

## Step 1: Setup Database

Create a PostgreSQL database for the service:

```bash
createdb backup_service
```

## Step 2: Configure Environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
# Database Configuration
DB_PASSWORD=your_postgres_password

# JWT Configuration (generate a strong secret!)
JWT_SECRET=$(openssl rand -base64 32)

# Discord Configuration (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_here
```

## Step 3: Build and Run

### Option A: Using Make (Recommended)

```bash
# Download dependencies
make deps

# Run the service
make dev
```

### Option B: Using Go Directly

```bash
# Download dependencies
go mod download

# Run the service
source .env
go run cmd/server/main.go
```

### Option C: Using Docker Compose

```bash
# Start everything with Docker
docker-compose up -d

# View logs
docker-compose logs -f backup-service
```

## Step 4: Authenticate

The service will start on `http://localhost:8080`.

### Get an OTP

```bash
# Simple - no body required
curl -X POST http://localhost:8080/api/v1/auth/login
```

Check your Discord channel for the OTP code (sent via webhook).

### Verify OTP and Get JWT

```bash
curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"otp": "123456"}'
```

Save the JWT token returned in the response.

## Step 5: Configure Your First Backup

Export your JWT token for convenience:

```bash
export TOKEN="your-jwt-token-here"
```

### 5.1 Add Storage Configuration

For Cloudflare R2:

```bash
curl -X POST http://localhost:8080/api/v1/storage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My R2 Bucket",
    "provider": "r2",
    "bucket": "my-backups",
    "region": "auto",
    "endpoint": "https://your-account-id.r2.cloudflarestorage.com",
    "access_key": "your-r2-access-key",
    "secret_key": "your-r2-secret-key"
  }'
```

For AWS S3:

```bash
curl -X POST http://localhost:8080/api/v1/storage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My S3 Bucket",
    "provider": "s3",
    "bucket": "my-backups",
    "region": "us-east-1",
    "access_key": "your-aws-access-key",
    "secret_key": "your-aws-secret-key"
  }'
```

Save the `id` from the response - you'll need it in the next step.

### 5.2 Add Notification Configuration (Optional)

```bash
curl -X POST http://localhost:8080/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DevOps Alerts",
    "discord_webhook_url": "https://discord.com/api/webhooks/your-webhook"
  }'
```

Save the `id` from the response.

### 5.3 Configure Database for Backup

```bash
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Database",
    "host": "localhost",
    "port": 5432,
    "dbname": "mydb",
    "user": "postgres",
    "password": "postgres",
    "schedule": "0 2 * * *",
    "storage_id": "storage-id-from-step-5.1",
    "notification_id": "notification-id-from-step-5.2",
    "rotation_policy": {
      "type": "days",
      "value": 30
    }
  }'
```

The schedule `"0 2 * * *"` means daily at 2:00 AM.

## Step 6: Trigger a Manual Backup (Optional)

Test your configuration with a manual backup:

```bash
curl -X POST http://localhost:8080/api/v1/databases/{database-id}/backup \
  -H "Authorization: Bearer $TOKEN"
```

Replace `{database-id}` with the ID from step 5.3.

## Step 7: View Backup History

```bash
curl -X GET http://localhost:8080/api/v1/databases/{database-id}/backups \
  -H "Authorization: Bearer $TOKEN"
```

## Common Cron Schedules

- `"0 2 * * *"` - Daily at 2:00 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 0 * * 0"` - Weekly on Sunday at midnight
- `"0 3 1 * *"` - Monthly on the 1st at 3:00 AM
- `"*/30 * * * *"` - Every 30 minutes

## Next Steps

- Review the full [README.md](README.md) for complete documentation
- Explore the API using the [swag.json](swag.json) OpenAPI specification
- Set up monitoring using the `/stats` endpoint
- Configure additional databases for backup

## Troubleshooting

### "Failed to connect to database"
- Ensure PostgreSQL is running
- Check DB_PASSWORD in .env
- Verify database exists: `psql -l`

### "pg_dump: command not found"
- Install PostgreSQL client tools
- macOS: `brew install postgresql`
- Ubuntu: `apt-get install postgresql-client`

### "OTP not received"
- Verify DISCORD_WEBHOOK_URL is correct
- Check Discord webhook permissions
- Look for service logs for errors

### "Invalid or expired token"
- Request a new OTP
- Check JWT_SECRET is set correctly
- Ensure token hasn't expired (default: 24 hours)

## Getting Help

- Check the logs: `docker-compose logs -f` or view stdout
- Review the [README.md](README.md)
- Open an issue on GitHub

Enjoy automated PostgreSQL backups! 🎉
