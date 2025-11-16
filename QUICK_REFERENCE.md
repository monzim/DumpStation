# Quick Reference Guide

## 🚀 Getting Started

### Start the Server
```bash
make dev
# Server starts at http://localhost:8080
```

### Access Swagger UI
```bash
open http://localhost:8080/swagger/index.html
```

## 📚 Key URLs

- **Swagger UI**: http://localhost:8080/swagger/index.html
- **API Base**: http://localhost:8080/api/v1
- **Health Check**: http://localhost:8080/api/v1/stats

## 🔐 Authentication Flow

1. **Request OTP**:
   ```bash
   curl -X POST http://localhost:8080/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin"}'
   ```

2. **Check Discord** for OTP code

3. **Verify OTP**:
   ```bash
   curl -X POST http://localhost:8080/api/v1/auth/verify \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "otp": "123456"}'
   ```

4. **Use JWT Token**:
   ```bash
   export TOKEN="your-jwt-token-here"
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/v1/databases
   ```

## 📝 Common Commands

### Build & Run
```bash
make build          # Build binary
make dev            # Run in development
make test           # Run tests
make swagger        # Regenerate API docs
make clean          # Clean build artifacts
```

### Database
```bash
# Auto-migration runs on startup
# No manual migration needed with GORM
```

### Swagger
```bash
# Regenerate after changing handler annotations
make swagger

# Manual regeneration
swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal
```

## 🗂️ Project Structure

```
db_proxy/
├── cmd/server/              # Application entry point
├── internal/
│   ├── auth/               # JWT & OTP authentication
│   ├── backup/             # Backup execution
│   ├── config/             # Configuration
│   ├── database/           # GORM database layer
│   ├── handlers/           # HTTP handlers
│   ├── middleware/         # HTTP middleware
│   ├── models/             # GORM models
│   ├── notification/       # Discord notifications
│   ├── repository/         # GORM repository (data access)
│   ├── scheduler/          # Cron scheduler
│   └── storage/            # S3/R2 storage
├── docs/                   # Generated Swagger docs
└── migrations/             # Legacy SQL migrations (not used with GORM)
```

## 🔧 Technologies

- **Go 1.21** - Programming language
- **GORM** - ORM for database operations
- **PostgreSQL** - Database (config & targets)
- **Gorilla Mux** - HTTP router
- **JWT** - Authentication
- **Swagger/OpenAPI** - API documentation
- **Discord Webhooks** - Notifications & OTP
- **AWS SDK** - S3/R2 storage
- **Cron** - Backup scheduling

## 📊 API Endpoints Summary

### Authentication (Public)
- `POST /auth/login` - Request OTP
- `POST /auth/verify` - Verify OTP, get JWT

### Storage Configs (Protected)
- `GET /storage` - List all
- `POST /storage` - Create
- `GET /storage/{id}` - Get one
- `PUT /storage/{id}` - Update
- `DELETE /storage/{id}` - Delete

### Notification Configs (Protected)
- `GET /notifications` - List all
- `POST /notifications` - Create
- `GET /notifications/{id}` - Get one
- `PUT /notifications/{id}` - Update
- `DELETE /notifications/{id}` - Delete

### Database Configs (Protected)
- `GET /databases` - List all
- `POST /databases` - Create
- `GET /databases/{id}` - Get one
- `PUT /databases/{id}` - Update
- `DELETE /databases/{id}` - Delete
- `POST /databases/{id}/backup` - Manual backup
- `GET /databases/{id}/backups` - List backups

### Backups (Protected)
- `GET /backups/{id}` - Get backup details
- `POST /backups/{id}/restore` - Restore

### Statistics (Protected)
- `GET /stats` - System statistics

## 🎯 Typical Workflow

### 1. Setup Storage Backend
```bash
# Via Swagger UI or curl
POST /api/v1/storage
{
  "name": "Production S3",
  "provider": "s3",
  "bucket": "my-backups",
  "region": "us-east-1",
  "access_key": "...",
  "secret_key": "..."
}
```

### 2. Setup Notification
```bash
POST /api/v1/notifications
{
  "name": "Backup Alerts",
  "discord_webhook_url": "https://discord.com/api/webhooks/..."
}
```

### 3. Add Database
```bash
POST /api/v1/databases
{
  "name": "Production DB",
  "host": "db.example.com",
  "port": 5432,
  "db_name": "myapp",
  "username": "postgres",
  "password": "...",
  "schedule": "0 2 * * *",
  "storage_id": "uuid-from-step-1",
  "notification_id": "uuid-from-step-2",
  "rotation_policy": {
    "type": "keep_last",
    "value": 7
  }
}
```

### 4. Monitor
```bash
GET /api/v1/stats
GET /api/v1/databases/{id}/backups
```

## 📖 Documentation Files

- **[README.md](README.md)** - Main documentation
- **[SWAGGER_INTEGRATION.md](SWAGGER_INTEGRATION.md)** - Swagger guide
- **[GORM_MIGRATION_COMPLETE.md](GORM_MIGRATION_COMPLETE.md)** - GORM migration details
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - Auth system guide
- **[QUICKSTART.md](QUICKSTART.md)** - Getting started

## 🐛 Troubleshooting

### Server won't start
```bash
# Check .env file exists
ls -la .env

# Check PostgreSQL is running
psql -U postgres -h localhost
```

### Swagger UI not loading
```bash
# Regenerate docs
make swagger

# Rebuild
make build

# Check URL
open http://localhost:8080/swagger/index.html
```

### Authentication issues
```bash
# Check Discord webhook is configured
grep DISCORD_WEBHOOK_URL .env

# Request new OTP
curl -X POST http://localhost:8080/api/v1/auth/login
```

### Build errors
```bash
# Update dependencies
go mod tidy

# Clear cache
go clean -cache

# Rebuild
make build
```

## 🔑 Environment Variables

Required:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=backup_service

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# JWT
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRATION_HOURS=24

# Discord (optional but recommended)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
OTP_EXPIRATION_MINUTES=5
```

## 💡 Tips

1. **Use Swagger UI** for testing - it's interactive and shows examples
2. **Check Discord** for OTP codes and backup notifications
3. **GORM auto-migration** runs on startup - no manual migrations needed
4. **JWT tokens expire** - get a new one when needed
5. **Backup rotation** is automatic based on policy
6. **Manual backups** don't affect scheduled backups

## 📞 Support

- Issues: https://github.com/monzim/db_proxy/issues
- Documentation: See docs/ folder
- Swagger UI: http://localhost:8080/swagger/index.html
