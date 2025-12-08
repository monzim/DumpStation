# DumpStation Backend (Go API)

High-performance RESTful API service built with Go for managing, scheduling, and monitoring PostgreSQL database backups to cloud storage. This is the backend component of the DumpStation project.

🔗 **[Main Project Documentation](../README.md)** | 📖 **[API Documentation](http://localhost:8080/swagger/)** | 🚀 **[Deployment Guide](../docs/DEPLOYMENT.md)**

---

## 📋 Overview

The DumpStation backend is a production-ready Go application that handles:

- **Multi-Database Management**: Configure and monitor unlimited PostgreSQL databases (v12-17)
- **Automated Backups**: Cron-based scheduling with flexible rotation policies
- **Cloud Storage**: Native support for AWS S3, Cloudflare R2, and MinIO
- **Discord Integration**: OTP authentication and real-time notifications
- **Security**: JWT authentication, TOTP 2FA, multi-tenant isolation
- **Monitoring**: Comprehensive statistics, activity logs, and health checks
- **Version Awareness**: Automatic pg_dump/pg_restore version selection

---

## 🏗️ Architecture

### Technology Stack

- **Language**: Go 1.24+
- **Framework**: net/http with gorilla/mux router
- **ORM**: GORM v1.31.1 (PostgreSQL driver)
- **Authentication**:
  - JWT tokens (golang-jwt/jwt v5.3.0)
  - TOTP 2FA (pquerna/otp v1.5.0)
  - Discord webhook OTP
- **Scheduling**: robfig/cron v3.0.1
- **Storage**: AWS SDK for Go (S3/R2 compatible)
- **Validation**: go-playground/validator v10.28.0
- **CORS**: rs/cors v1.11.1
- **Documentation**: Swagger/OpenAPI (swaggo/swag v1.16.6)

### Project Structure

```
server/
├── cmd/server/              # Application entry point
│   └── main.go             # Server initialization
│
├── internal/               # Private application code
│   ├── auth/               # Authentication & authorization
│   │   ├── jwt.go          # JWT token management
│   │   ├── otp.go          # OTP generation/verification
│   │   └── two_factor.go   # TOTP 2FA implementation
│   │
│   ├── backup/             # Backup execution engine
│   │   ├── backup.go       # Core backup logic
│   │   ├── restore.go      # Restore operations
│   │   └── version.go      # Multi-version pg_dump support
│   │
│   ├── cleanup/            # Automatic cleanup service
│   │   └── cleanup.go      # Activity log retention
│   │
│   ├── config/             # Configuration management
│   │   └── config.go       # Environment variable loading
│   │
│   ├── database/           # Database connections
│   │   └── database.go     # GORM setup and migrations
│   │
│   ├── handlers/           # HTTP request handlers
│   │   ├── handlers.go     # CRUD endpoints
│   │   ├── routes.go       # Route registration
│   │   ├── user_handler.go # User profile & avatar
│   │   └── two_factor.go   # 2FA endpoints
│   │
│   ├── middleware/         # HTTP middleware
│   │   ├── auth.go         # JWT authentication
│   │   ├── cors.go         # CORS configuration
│   │   └── logging.go      # Request/response logging
│   │
│   ├── models/             # Data models (GORM)
│   │   └── models.go       # All entity definitions
│   │
│   ├── notification/       # Notification service
│   │   └── discord.go      # Discord webhook integration
│   │
│   ├── repository/         # Data access layer
│   │   └── repository.go   # GORM repository pattern
│   │
│   ├── scheduler/          # Cron job scheduling
│   │   └── scheduler.go    # Backup scheduling logic
│   │
│   ├── stats/              # Statistics calculation
│   │   └── stats.go        # Dashboard metrics
│   │
│   ├── storage/            # Cloud storage client
│   │   └── storage.go      # S3/R2 operations
│   │
│   ├── utils/              # Utility functions
│   │   └── name_generator.go # Human-readable names
│   │
│   └── validator/          # Request validation
│       └── validator.go    # Input validation
│
├── docs/                   # API documentation
│   ├── docs.go            # Swagger generated docs
│   ├── swagger.json       # OpenAPI spec (JSON)
│   └── swagger.yaml       # OpenAPI spec (YAML)
│
├── scripts/               # Database migration scripts
│   ├── migrate_backup_names.sql
│   ├── migrate_profile_picture.sql
│   └── migrate_user_isolation.sql
│
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Development environment
├── docker-compose.prod.yml # Production setup
├── Makefile               # Build automation
├── go.mod                 # Go dependencies
└── go.sum                 # Dependency checksums
```

---

## ✨ Key Features

### Multi-Version PostgreSQL Support

Automatically detects target database version and uses the correct pg_dump/pg_restore:

```go
// Supports PostgreSQL 12, 13, 14, 15, 16, 17
func (vm *VersionManager) GetPgDumpPath(version int) string {
    return fmt.Sprintf("/usr/lib/postgresql/%d/bin/pg_dump", version)
}
```

Docker image includes all PostgreSQL client tools from versions 12-17.

### Human-Readable Backup Names

Generates memorable backup names without external dependencies:

```
swift-falcon-20251208-143022
brave-dragon-20251208-091544
noble-tiger-20251208-202315
```

- 50 adjectives × 50 nouns = 2,500 unique combinations per day
- Date and time suffix for sorting
- No collisions within same day

### Multi-Tenant User Isolation

All resources are scoped to users:

```go
// Automatic user filtering in repository
func (r *Repository) GetDatabases(userID uint) ([]DatabaseConfig, error) {
    var databases []DatabaseConfig
    result := r.db.Where("user_id = ?", userID).Find(&databases)
    return databases, result.Error
}
```

Admin users can bypass isolation to view all data.

### Activity Logging

Comprehensive audit trail of all operations:

```go
type ActivityLog struct {
    Action       string // Create, Update, Delete, Backup, Restore, Login
    Level        string // Info, Warning, Error
    ResourceType string // Database, Backup, Storage, User
    ResourceID   string
    UserID       uint
    Details      string
    Timestamp    time.Time
}
```

Automatic cleanup after 60 days (configurable).

---

## 🚀 Quick Start

### Prerequisites

- **Go** 1.24+ ([install](https://go.dev/doc/install))
- **PostgreSQL** 15+ ([install](https://www.postgresql.org/download/))
- **pg_dump** and **psql** CLI tools
- **Discord Webhook URL** ([create webhook](https://support.discord.com/hc/en-us/articles/228383668))

### Installation

```bash
# Clone repository
git clone https://github.com/monzim/dumpstation.git
cd dumpstation/server

# Install dependencies
go mod download

# Copy environment file
cp .env.example .env

# Edit configuration (add Discord webhook, etc.)
nano .env

# Create database
createdb backup_service

# Run development server
make dev
```

The API will be available at `http://localhost:8080`

### Using Make Commands

```bash
make help          # Show all available commands
make dev           # Run with auto-reload (air)
make build         # Build production binary
make test          # Run tests with coverage
make swagger       # Generate Swagger docs
make lint          # Run golangci-lint
make format        # Format code with gofmt
make docker-build  # Build Docker image
make docker-up     # Start all services
make docker-down   # Stop all services
make docker-logs   # View service logs
make check-pg      # Check pg_dump versions
```

---

## ⚙️ Configuration

### Environment Variables

**Server:**

```env
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
```

**Database (DumpStation's internal database):**

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=backup_service
DB_SSLMODE=disable
```

**Authentication:**

```env
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRATION_MINUTES=10
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
OTP_EXPIRATION_MINUTES=5
```

**CORS:**

```env
CORS_ALLOWED_ORIGINS=*
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,PATCH
CORS_ALLOWED_HEADERS=Origin,Content-Type,Accept,Authorization,X-Requested-With,X-2FA-Token
CORS_ALLOW_CREDENTIALS=true
CORS_MAX_AGE=86400
```

**System:**

```env
SYSTEM_USERNAME=admin
SYSTEM_EMAIL=admin@yourdomain.com
```

See `.env.example` for complete configuration options.

---

## 📚 API Documentation

### Interactive Swagger UI

Full API documentation available at:

**http://localhost:8080/swagger/index.html**

Features:

- All endpoints with request/response examples
- Try API calls directly from browser
- Authentication support
- Schema definitions
- Grouped by functionality

### Generating Documentation

```bash
# Install swag
go install github.com/swaggo/swag/cmd/swag@latest

# Generate docs
make swagger

# Or manually
swag init -g cmd/server/main.go -o docs
```

### OpenAPI Files

- **JSON**: `docs/swagger.json` - Import into Postman/Insomnia
- **YAML**: `docs/swagger.yaml` - Human-readable format

---

## 🔐 Security Features

### Authentication Flow

1. **Request OTP**:
   ```bash
   POST /api/v1/auth/login
   {"username": "admin"}
   ```
2. **Check Discord** for OTP code

3. **Verify OTP** and get JWT:

   ```bash
   POST /api/v1/auth/verify
   {"username": "admin", "otp": "123456"}
   ```

4. **Use JWT** for all subsequent requests:
   ```bash
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

### Two-Factor Authentication (TOTP)

Optional 2FA for enhanced security:

```bash
# Setup 2FA
POST /api/v1/auth/2fa/setup

# Verify setup with authenticator app code
POST /api/v1/auth/2fa/verify-setup
{"code": "123456"}

# Login with 2FA
POST /api/v1/auth/verify
{"username": "admin", "otp": "123456"}

# Then provide 2FA code
X-2FA-Token: 654321
```

### Security Best Practices

1. **Use strong JWT secret** (64+ characters)
2. **Enable HTTPS** in production
3. **Rotate access keys** regularly
4. **Use dedicated backup users** with minimal permissions
5. **Enable 2FA** for admin accounts
6. **Monitor activity logs** for suspicious behavior

---

## 🧪 Testing

### Run Tests

```bash
# All tests
make test

# Specific package
go test ./internal/backup/...

# With coverage
go test -cover ./...

# Coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Test Structure

```go
func TestBackupService_CreateBackup(t *testing.T) {
    tests := []struct {
        name    string
        input   *DatabaseConfig
        want    *Backup
        wantErr bool
    }{
        {
            name: "successful backup",
            input: &DatabaseConfig{...},
            want: &Backup{Status: "success"},
            wantErr: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := service.CreateBackup(tt.input)
            // assertions...
        })
    }
}
```

---

## 🐳 Docker Deployment

### Development

```bash
# Start all services
make docker-up

# View logs
make docker-logs

# Stop services
make docker-down
```

Services started:

- **backup-service** (port 8080) - API server
- **postgres** (port 5432) - Service database
- **postgres-12/14/16** (ports 5433/5434/5435) - Test databases
- **minio** (ports 9000/9001) - Local S3 storage

### Production

```bash
# Build image
make docker-build

# Or with version tag
docker build -t dumpstation:1.0.0 .

# Run production compose
docker-compose -f docker-compose.prod.yml up -d
```

See [Deployment Guide](../docs/DEPLOYMENT.md) for production setup.

---

## 🔧 Development

### Code Style

- Follow [Effective Go](https://go.dev/doc/effective_go) guidelines
- Use `gofmt` for formatting
- Run `golangci-lint` before committing
- Write table-driven tests
- Document exported functions

### Adding New Endpoints

1. **Define model** in `internal/models/models.go`
2. **Add repository methods** in `internal/repository/repository.go`
3. **Create handler** in `internal/handlers/handlers.go`
4. **Register route** in `internal/handlers/routes.go`
5. **Add Swagger comments** for documentation
6. **Write tests**
7. **Generate docs**: `make swagger`

### Database Migrations

GORM handles migrations automatically on startup. For manual migrations:

```bash
# Create migration script
vim scripts/migrate_new_feature.sql

# Apply manually if needed
psql -h localhost -U postgres -d backup_service -f scripts/migrate_new_feature.sql
```

---

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:8080/health

# Response:
{"status":"healthy","timestamp":"2025-12-08T14:30:00Z"}
```

### Statistics Endpoint

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/stats

# Returns:
{
  "total_databases": 5,
  "total_backups_24h": 12,
  "successful_backups_24h": 11,
  "failed_backups_24h": 1,
  "total_storage_bytes": 5368709120
}
```

### Activity Logs

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/activity-logs?page=1&limit=50&action=Backup"
```

---

## 🐛 Troubleshooting

### Common Issues

**Database connection failed:**

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

**pg_dump not found:**

```bash
# Install PostgreSQL client tools
sudo apt install postgresql-client-15

# Check installation
which pg_dump
pg_dump --version
```

**OTP not received:**

```bash
# Test Discord webhook
curl -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'
```

**Swagger not updating:**

```bash
# Regenerate documentation
make swagger

# Restart server
make dev
```

---

## 📝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

**Quick checklist:**

- [ ] Code follows Go best practices
- [ ] Tests added for new features
- [ ] Swagger comments updated
- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] Documentation updated

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](../LICENSE) file.

---

## 🔗 Related Documentation

- **[Main README](../README.md)** - Project overview
- **[Deployment Guide](../docs/DEPLOYMENT.md)** - Production deployment
- **[Contributing Guide](../CONTRIBUTING.md)** - Development guidelines
- **[Frontend README](../web/README.md)** - React web interface
- **[Roadmap](../ROADMAP.md)** - Planned features

---

<div align="center">

**Built with ❤️ using Go**

[⬆ Back to Top](#dumpstation-backend-go-api)

</div>

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
- **JWT**: `JWT_SECRET`, `JWT_EXPIRATION_MINUTES`
- **Discord**: `DISCORD_WEBHOOK_URL`, `OTP_EXPIRATION_MINUTES`
- **CORS**: `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_METHODS`, `CORS_ALLOWED_HEADERS`, `CORS_EXPOSED_HEADERS`, `CORS_ALLOW_CREDENTIALS`, `CORS_MAX_AGE`, `CORS_DEBUG`

### CORS Configuration

The service supports configurable CORS settings via environment variables:

| Variable                 | Description                                            | Default                                                     |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| `CORS_ALLOWED_ORIGINS`   | Comma-separated list of allowed origins                | `*`                                                         |
| `CORS_ALLOWED_METHODS`   | Comma-separated list of allowed HTTP methods           | `GET,POST,PUT,DELETE,OPTIONS,PATCH`                         |
| `CORS_ALLOWED_HEADERS`   | Comma-separated list of allowed headers                | `Origin,Content-Type,Accept,Authorization,X-Requested-With` |
| `CORS_EXPOSED_HEADERS`   | Comma-separated list of headers exposed to the browser | (empty)                                                     |
| `CORS_ALLOW_CREDENTIALS` | Allow credentials (cookies, auth headers)              | `true`                                                      |
| `CORS_MAX_AGE`           | Preflight request cache duration in seconds            | `86400` (24 hours)                                          |
| `CORS_DEBUG`             | Enable CORS debug logging                              | `false`                                                     |

**Example configuration for production:**

```bash
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Origin,Content-Type,Accept,Authorization
CORS_ALLOW_CREDENTIALS=true
CORS_MAX_AGE=86400
CORS_DEBUG=false
```

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

**Single-User System**: This application operates in single-user mode. A default system user is created on first startup:

- **Username**: `example`
- **Email**: `exmaple@ex.com`

No additional users can be created via the API.

1. **Request OTP** (check your Discord webhook for the code):

```bash
# Login with username
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "example"}'

# Or login with email
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "exmaple@ex.com"}'
```

2. **Verify OTP and Get JWT**:

```bash
curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"username": "example", "otp": "123456"}'
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
