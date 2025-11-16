# GORM Migration Guide

This project has been set up to use GORM ORM and Swagger for API documentation. This guide explains the migration and how to complete it.

## What's Been Done

### 1. Dependencies Added
- ✅ **GORM**: `gorm.io/gorm@v1.25.5` and `gorm.io/driver/postgres@v1.5.4`
- ✅ **Swagger**: `github.com/swaggo/swag@v1.8.12` and `github.com/swaggo/http-swagger@v1.3.4`

### 2. Models Updated
- ✅ All models now have GORM struct tags (`gorm:""`)
- ✅ Foreign key relationships defined
- ✅ Hooks (`BeforeCreate`) for UUID generation
- ✅ Swagger example tags added for API documentation

### 3. Database Layer Updated
- ✅ New `database/database.go` uses GORM
- ✅ Auto-migration replaces manual SQL migrations
- ✅ Connection pooling configured

## Remaining Work

To complete the GORM migration, you need to:

### 1. Update Repository Layer

The `internal/repository/repository.go` file needs to be rewritten to use GORM instead of raw SQL. Here's the pattern:

**Old (SQL)**:
```go
func (r *Repository) GetUser(id uuid.UUID) (*models.User, error) {
    user := &models.User{}
    query := `SELECT * FROM users WHERE id = $1`
    err := r.db.QueryRow(query, id).Scan(&user.ID, &user.Name, ...)
    return user, err
}
```

**New (GORM)**:
```go
func (r *Repository) GetUser(id uuid.UUID) (*models.User, error) {
    var user models.User
    result := r.db.First(&user, "id = ?", id)
    if result.Error == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &user, result.Error
}
```

### 2. Add Swagger Annotations

Add Swagger comments to handlers in `internal/handlers/handlers.go`:

```go
// Login godoc
// @Summary Request OTP for authentication
// @Description Sends a one-time password to the configured Discord webhook
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body models.LoginRequest false "Login request (optional)"
// @Success 200 {object} map[string]string "OTP sent successfully"
// @Failure 400 {object} models.APIError
// @Failure 500 {object} models.APIError
// @Router /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
    // ... existing code
}
```

### 3. Add Swagger Main Annotation

Update `cmd/server/main.go` to include Swagger metadata:

```go
// @title PostgreSQL Backup Service API
// @version 1.0
// @description A RESTful API for managing PostgreSQL database backups
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.swagger.io/support
// @contact.email support@swagger.io

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8080
// @BasePath /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and JWT token.

func main() {
    // ... existing code
}
```

### 4. Generate Swagger Docs

Install swag CLI and generate docs:

```bash
go install github.com/swaggo/swag/cmd/swag@v1.8.12
swag init -g cmd/server/main.go -o docs
```

### 5. Serve Swagger UI

Add Swagger route in `internal/handlers/router.go`:

```go
import (
    httpSwagger "github.com/swaggo/http-swagger"
    _ "github.com/monzim/db_proxy/v1/docs" // Import generated docs
)

func SetupRoutes(h *Handler, jwtMgr *auth.JWTManager) *mux.Router {
    r := mux.NewRouter()

    // ... existing routes

    // Swagger documentation
    r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

    return r
}
```

### 6. Update Main.go

Replace the migration call in `cmd/server/main.go`:

**Old**:
```go
if err := db.RunMigrations("migrations"); err != nil {
    log.Fatalf("Failed to run migrations: %v", err)
}
```

**New**:
```go
if err := db.AutoMigrate(); err != nil {
    log.Fatalf("Failed to run auto-migration: %v", err)
}
```

## Quick Migration Steps

Here's a quick checklist to complete the migration:

```bash
# 1. Install swag CLI
go install github.com/swaggo/swag/cmd/swag@v1.8.12

# 2. Rewrite repository to use GORM (see examples below)
# Edit: internal/repository/repository.go

# 3. Add Swagger annotations to all handlers
# Edit: internal/handlers/handlers.go

# 4. Add main Swagger annotation
# Edit: cmd/server/main.go

# 5. Update main.go to use AutoMigrate
# Edit: cmd/server/main.go

# 6. Generate Swagger documentation
swag init -g cmd/server/main.go -o docs

# 7. Add Swagger route
# Edit: internal/handlers/router.go

# 8. Build and test
go build -o backup-service ./cmd/server
./backup-service
```

## GORM Repository Examples

### Create Operations

```go
func (r *Repository) CreateUser(discordUserID, discordUsername string) (*models.User, error) {
    user := &models.User{
        DiscordUserID:   discordUserID,
        DiscordUsername: discordUsername,
    }

    result := r.db.Create(user)
    return user, result.Error
}
```

### Read Operations

```go
// Get single record
func (r *Repository) GetStorageConfig(id uuid.UUID) (*models.StorageConfig, error) {
    var config models.StorageConfig
    result := r.db.First(&config, "id = ?", id)
    if result.Error == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &config, result.Error
}

// List all
func (r *Repository) ListDatabaseConfigs() ([]*models.DatabaseConfig, error) {
    var configs []*models.DatabaseConfig
    result := r.db.Preload("Storage").Preload("Notification").
        Order("created_at DESC").Find(&configs)
    return configs, result.Error
}
```

### Update Operations

```go
func (r *Repository) UpdateDatabaseConfig(id uuid.UUID, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
    var config models.DatabaseConfig
    if err := r.db.First(&config, "id = ?", id).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            return nil, nil
        }
        return nil, err
    }

    config.Name = input.Name
    config.Host = input.Host
    config.Port = input.Port
    // ... update other fields

    result := r.db.Save(&config)
    return &config, result.Error
}
```

### Delete Operations

```go
func (r *Repository) DeleteStorageConfig(id uuid.UUID) error {
    result := r.db.Delete(&models.StorageConfig{}, "id = ?", id)
    if result.RowsAffected == 0 {
        return gorm.ErrRecordNotFound
    }
    return result.Error
}
```

### Complex Queries

```go
// Stats with aggregation
func (r *Repository) GetSystemStats() (*models.SystemStats, error) {
    stats := &models.SystemStats{}

    // Total databases
    r.db.Model(&models.DatabaseConfig{}).Where("enabled = ?", true).Count(&stats.TotalDatabases)

    // Backups in last 24 hours
    yesterday := time.Now().Add(-24 * time.Hour)
    r.db.Model(&models.Backup{}).Where("created_at > ?", yesterday).Count(&stats.TotalBackups24h)

    // Success count
    var successCount int64
    r.db.Model(&models.Backup{}).Where("status = ? AND created_at > ?", "success", yesterday).Count(&successCount)

    if stats.TotalBackups24h > 0 {
        stats.SuccessRate24h = float64(successCount) / float64(stats.TotalBackups24h) * 100
    }

    // Total storage
    r.db.Model(&models.Backup{}).Where("status = ?", "success").
        Select("COALESCE(SUM(size_bytes), 0)").Scan(&stats.TotalStorageUsedBytes)

    return stats, nil
}
```

## Benefits of GORM

1. **Type Safety**: Compile-time checking of queries
2. **Auto Migration**: Database schema managed in code
3. **Relationships**: Automatic JOIN handling with `Preload()`
4. **Hooks**: `BeforeCreate`, `AfterFind`, etc.
5. **Less Boilerplate**: No manual SQL string building
6. **Query Builder**: Chainable query methods

## Testing After Migration

```bash
# Build
go build -o backup-service ./cmd/server

# Run with auto-migration
./backup-service

# Access Swagger UI
open http://localhost:8080/swagger/index.html
```

## Rollback Plan

If you need to rollback:

1. Restore old files:
```bash
mv internal/models/models.go.old internal/models/models.go
mv internal/database/database.go.old internal/database/database.go
```

2. Remove GORM dependencies from go.mod
3. Run `go mod tidy`

## Next Steps

1. Complete repository layer rewrite with GORM
2. Add Swagger annotations to all endpoints
3. Generate and test Swagger documentation
4. Update main.go to use AutoMigrate
5. Test all API endpoints
6. Update documentation

The migration will result in cleaner code, better type safety, and automatic API documentation!
