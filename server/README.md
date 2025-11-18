# DumpStation

A comprehensive RESTful API service built with Go for managing, scheduling, and monitoring PostgreSQL database backups to cloud storage (AWS S3 or Cloudflare R2). Features Discord-based authentication with OTP and real-time notifications.

## Features

- **Database Management**: Add, configure, and manage multiple PostgreSQL databases for backup
- **Flexible Storage**: Support for AWS S3 and Cloudflare R2 storage backends
- **Automated Scheduling**: Cron-based backup scheduling for automated backups
- **Backup Rotation**: Configurable retention policies (count-based or time-based)
- **Discord Integration**:
  - OTP-based authentication via single Discord webhook
  - Real-time notifications for backup status (success/failure)
  - Single-user design optimized for personal use
- **Manual Backups**: Trigger on-demand backups for any configured database
- **Restore Operations**: Restore databases from any backup to the original or a different target
- **Monitoring & Statistics**: System-wide statistics including success rates and storage usage
- **JWT Authentication**: Secure API access with JSON Web Tokens
- **Swagger/OpenAPI**: Complete interactive API documentation at `/swagger/index.html`
- **GORM ORM**: Type-safe database operations with auto-migration
- **Comprehensive Logging**: Detailed request/response logging with error tracking and performance metrics

## Architecture

The service is built with a clean, modular architecture:

```
cmd/server/          - Application entry point
internal/
  ├── auth/          - JWT and OTP authentication
  ├── backup/        - Backup execution logic
  ├── config/        - Configuration management
  ├── database/      - Database connection and migrations
  ├── handlers/      - HTTP request handlers
  ├── middleware/    - HTTP middleware (auth, CORS, logging)
  ├── models/        - Data models
  ├── notification/  - Discord notifications
  ├── repository/    - Database operations
  ├── scheduler/     - Cron-based job scheduling
  └── storage/       - Cloud storage operations (S3/R2)
migrations/          - SQL database migrations
```

## Requirements

- Go 1.21+
- PostgreSQL 12+ (for both the service database and target databases)
- `pg_dump` and `psql` tools installed
- AWS S3 or Cloudflare R2 account
- Discord webhook URL (optional, for notifications)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd dumpstation
```

2. Install dependencies:

```bash
go mod download
```

3. Create a PostgreSQL database for the service:

```bash
createdb backup_service
```

4. Copy and configure environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Build the application:

```bash
go build -o backup-service ./cmd/server
```

## Configuration

All configuration is done via environment variables. See [.env.example](.env.example) for all available options.

### Key Configuration Options:

- **Server**: `SERVER_HOST`, `SERVER_PORT`
- **Database**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **JWT**: `JWT_SECRET`, `JWT_EXPIRATION_HOURS`
- **Discord**: `DISCORD_WEBHOOK_URL`, `OTP_EXPIRATION_MINUTES`

## Running the Service

### Development

```bash
# Source environment variables
source .env

# Run the service
go run cmd/server/main.go
```

### Production

```bash
# Build binary
go build -o dumpstation ./cmd/server

# Run with environment file
./dumpstation
```

### Docker (Optional)

```bash
docker build -t dumpstation .
docker run -p 8080:8080 --env-file .env dumpstation
```

## API Documentation

### Interactive Swagger UI

Access the complete interactive API documentation at:

**http://localhost:8080/swagger/index.html**

Features:

- All 22 endpoints documented with examples
- Try out API calls directly from browser
- Request/response schemas
- JWT authentication support
- Grouped by functionality (Auth, Storage, Databases, Backups, Stats)

### OpenAPI Specification

- **JSON**: `docs/swagger.json` - Import into Postman, Insomnia, etc.
- **YAML**: `docs/swagger.yaml` - Human-readable format

See [SWAGGER_INTEGRATION.md](SWAGGER_INTEGRATION.md) for complete documentation guide.

### API Endpoints

The API follows RESTful principles. All protected endpoints require a JWT token in the `Authorization` header as `Bearer <token>`.

### Base URL

```
http://localhost:8080/api/v1
```

### Authentication Flow

1. **Request OTP** (check your Discord webhook for the code):

```bash
# Simple - no body required (uses default 'admin' user)
curl -X POST http://localhost:8080/api/v1/auth/login

# Or with optional username
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'
```

2. **Verify OTP and Get JWT**:

```bash
curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"otp": "123456"}'
```

3. **Use JWT for authenticated requests**:

```bash
curl -X GET http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Main Endpoints

#### Storage Configuration

- `GET /storage` - List all storage configurations
- `POST /storage` - Create new storage configuration
- `GET /storage/{id}` - Get storage details
- `PUT /storage/{id}` - Update storage configuration
- `DELETE /storage/{id}` - Delete storage configuration

#### Notification Configuration

- `GET /notifications` - List all notification configurations
- `POST /notifications` - Create new notification configuration
- `GET /notifications/{id}` - Get notification details
- `PUT /notifications/{id}` - Update notification configuration
- `DELETE /notifications/{id}` - Delete notification configuration

#### Database Configuration

- `GET /databases` - List all database configurations
- `POST /databases` - Add new database for backup
- `GET /databases/{id}` - Get database details
- `PUT /databases/{id}` - Update database configuration
- `DELETE /databases/{id}` - Remove database from backups
- `POST /databases/{id}/backup` - Trigger manual backup

#### Backups

- `GET /databases/{id}/backups` - View backup history for a database
- `GET /backups/{id}` - Get specific backup details
- `POST /backups/{id}/restore` - Restore from a backup

#### Statistics

- `GET /stats` - Get system-wide statistics

## Example Workflow

### 1. Add Storage Configuration

```bash
curl -X POST http://localhost:8080/api/v1/storage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production R2 Bucket",
    "provider": "r2",
    "bucket": "my-backups",
    "region": "auto",
    "endpoint": "https://account-id.r2.cloudflarestorage.com",
    "access_key": "your-access-key",
    "secret_key": "your-secret-key"
  }'
```

### 2. Add Notification Configuration

```bash
curl -X POST http://localhost:8080/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DevOps Alerts",
    "discord_webhook_url": "https://discord.com/api/webhooks/..."
  }'
```

### 3. Configure Database for Backup

```bash
curl -X POST http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production DB",
    "host": "db.example.com",
    "port": 5432,
    "dbname": "production",
    "user": "backup_user",
    "password": "secure_password",
    "schedule": "0 2 * * *",
    "storage_id": "storage-uuid-here",
    "notification_id": "notification-uuid-here",
    "rotation_policy": {
      "type": "days",
      "value": 30
    }
  }'
```

### 4. Trigger Manual Backup

```bash
curl -X POST http://localhost:8080/api/v1/databases/{id}/backup \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Restore from Backup

```bash
curl -X POST http://localhost:8080/api/v1/backups/{backup-id}/restore \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_host": "staging-db.example.com",
    "target_port": 5432,
    "target_dbname": "staging",
    "target_user": "postgres",
    "target_password": "password"
  }'
```

## Backup Rotation Policies

Two types of rotation policies are supported:

### Count-based

Keep only the last N backups:

```json
{
  "rotation_policy": {
    "type": "count",
    "value": 7
  }
}
```

### Time-based

Keep backups for N days:

```json
{
  "rotation_policy": {
    "type": "days",
    "value": 30
  }
}
```

## Cron Schedule Format

Use standard cron expressions for backup schedules:

```
# Format: minute hour day month day-of-week
"0 2 * * *"       # Daily at 2:00 AM
"0 */6 * * *"     # Every 6 hours
"0 0 * * 0"       # Weekly on Sunday at midnight
"0 3 1 * *"       # Monthly on the 1st at 3:00 AM
```

## Security Considerations

1. **JWT Secret**: Use a strong, randomly generated JWT secret in production
2. **Database Credentials**: Store sensitive credentials securely (consider using secrets management)
3. **Storage Keys**: Rotate access keys regularly
4. **Discord Webhooks**: Keep webhook URLs private
5. **Network Security**: Use HTTPS in production and restrict network access
6. **Database Permissions**: Use dedicated backup users with minimal required permissions

## Monitoring

The service provides system-wide statistics via the `/stats` endpoint:

```bash
curl -X GET http://localhost:8080/api/v1/stats \
  -H "Authorization: Bearer $TOKEN"
```

Returns:

- Total configured databases
- Backups in last 24 hours
- Success/failure rates
- Total storage used

## Troubleshooting

### Common Issues

1. **Migration failures**: Ensure PostgreSQL user has CREATE privileges
2. **Backup failures**: Verify `pg_dump` is installed and accessible
3. **Storage errors**: Check storage credentials and bucket permissions
4. **OTP not received**: Verify Discord webhook URL is correct

### Logs

The service logs all operations to stdout. In production, redirect to a log file:

```bash
./dumpstation 2>&1 | tee -a dumpstation.log
```

## Development

### Running Tests

```bash
go test ./...
```

### Code Structure

- Follow Go best practices and conventions
- Use the repository pattern for database operations
- Keep handlers thin, business logic in services
- Use dependency injection for testability

## License

[Your License Here]

## Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.

## Support

For issues and questions, please open a GitHub issue or contact the maintainers.
