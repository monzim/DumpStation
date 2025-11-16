# Swagger/OpenAPI Integration Complete ✅

The PostgreSQL Backup Service now has complete Swagger/OpenAPI documentation for the REST API.

## What Was Added

### 1. Dependencies
- **swaggo/swag** v1.16.2 - Swagger documentation generator
- **swaggo/http-swagger** v1.3.3 - Swagger UI middleware
- **swaggo/files** - Static file handler for Swagger UI

### 2. API Documentation Annotations
All 22 API endpoints now have complete Swagger documentation:

#### Authentication (2 endpoints)
- `POST /api/v1/auth/login` - Request OTP
- `POST /api/v1/auth/verify` - Verify OTP and get JWT

#### Storage Configurations (5 endpoints)
- `GET /api/v1/storage` - List all storage configs
- `POST /api/v1/storage` - Create storage config
- `GET /api/v1/storage/{id}` - Get storage config by ID
- `PUT /api/v1/storage/{id}` - Update storage config
- `DELETE /api/v1/storage/{id}` - Delete storage config

#### Notification Configurations (5 endpoints)
- `GET /api/v1/notifications` - List all notification configs
- `POST /api/v1/notifications` - Create notification config
- `GET /api/v1/notifications/{id}` - Get notification config by ID
- `PUT /api/v1/notifications/{id}` - Update notification config
- `DELETE /api/v1/notifications/{id}` - Delete notification config

#### Database Configurations (7 endpoints)
- `GET /api/v1/databases` - List all database configs
- `POST /api/v1/databases` - Create database config
- `GET /api/v1/databases/{id}` - Get database config by ID
- `PUT /api/v1/databases/{id}` - Update database config
- `DELETE /api/v1/databases/{id}` - Delete database config
- `POST /api/v1/databases/{id}/backup` - Trigger manual backup
- `GET /api/v1/databases/{id}/backups` - List backups for database

#### Backups (2 endpoints)
- `GET /api/v1/backups/{id}` - Get backup by ID
- `POST /api/v1/backups/{id}/restore` - Restore from backup

#### Statistics (1 endpoint)
- `GET /api/v1/stats` - Get system statistics

### 3. Swagger UI Route
- **Public URL**: `http://localhost:8080/swagger/index.html`
- **No authentication required** to view documentation
- **Interactive API testing** available through Swagger UI

### 4. Generated Files
- `docs/docs.go` - Go code with embedded Swagger spec
- `docs/swagger.json` - OpenAPI 2.0 JSON specification
- `docs/swagger.yaml` - OpenAPI 2.0 YAML specification

## How to Use

### Access Swagger UI

1. **Start the server**:
   ```bash
   make dev
   # or
   go run cmd/server/main.go
   ```

2. **Open Swagger UI**:
   ```bash
   open http://localhost:8080/swagger/index.html
   ```

3. **Browse and test the API** directly from your browser

### Using Authentication in Swagger UI

Since most endpoints require JWT authentication:

1. **Get a JWT token**:
   - Click on `POST /api/v1/auth/login`
   - Click "Try it out"
   - Click "Execute"
   - Check Discord webhook for OTP code

2. **Verify OTP**:
   - Click on `POST /api/v1/auth/verify`
   - Enter username (default: "admin") and OTP code
   - Copy the JWT token from response

3. **Authorize**:
   - Click the **"Authorize"** button at the top
   - Enter: `Bearer YOUR_JWT_TOKEN`
   - Click "Authorize"

4. **Test protected endpoints**:
   - All authenticated requests will now include your JWT token

### Regenerate Documentation

After modifying handler annotations:

```bash
# Regenerate Swagger docs
~/go/bin/swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal

# Rebuild
make build
```

Or add to Makefile:

```makefile
swagger: ## Generate Swagger documentation
	swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal
```

## File Changes

### [cmd/server/main.go](cmd/server/main.go)
Added Swagger metadata annotations at the top:
```go
// @title PostgreSQL Backup Service API
// @version 1.0
// @description A RESTful API service for managing PostgreSQL database backups
// @host localhost:8080
// @BasePath /api/v1
// @securityDefinitions.apikey BearerAuth
```

### [internal/handlers/handlers.go](internal/handlers/handlers.go)
Added Swagger annotations to all 22 handler functions. Example:
```go
// Login godoc
// @Summary Request OTP for authentication
// @Description Sends a one-time password to the configured Discord webhook
// @Tags Authentication
// @Accept json
// @Produce json
// @Param body body models.LoginRequest false "Login request"
// @Success 200 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
```

### [internal/handlers/router.go](internal/handlers/router.go)
Added Swagger UI route:
```go
import (
    httpSwagger "github.com/swaggo/http-swagger"
    _ "github.com/monzim/db_proxy/v1/docs"
)

// In SetupRoutes:
r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)
```

## Swagger Annotation Tags

### Common Tags Used

- `@Summary` - Short description (1 line)
- `@Description` - Detailed description
- `@Tags` - Group endpoints (Authentication, Storage, etc.)
- `@Accept` - Request content type (json)
- `@Produce` - Response content type (json)
- `@Security` - Authentication requirement (BearerAuth)
- `@Param` - Request parameters (path, query, body)
- `@Success` - Success response (status code + type)
- `@Failure` - Error response (status code + type)
- `@Router` - Endpoint path and HTTP method

### Tag Examples

#### Path Parameter
```go
// @Param id path string true "Database Config ID (UUID)"
```

#### Body Parameter
```go
// @Param body body models.DatabaseConfigInput true "Database configuration"
```

#### Success Response
```go
// @Success 200 {object} models.DatabaseConfig "Database configuration"
// @Success 200 {array} models.Backup "List of backups"
```

#### Authentication
```go
// @Security BearerAuth
```

## Features

### Interactive Testing
- Test all API endpoints directly from browser
- Auto-generated request examples
- Real-time response viewing
- Error validation

### Model Documentation
All request/response models are documented:
- `LoginRequest`, `VerifyRequest`, `AuthResponse`
- `StorageConfig`, `StorageConfigInput`
- `NotificationConfig`, `NotificationConfigInput`
- `DatabaseConfig`, `DatabaseConfigInput`
- `Backup`, `RestoreRequest`, `RestoreJob`
- `SystemStats`

### Grouped by Tags
Endpoints organized into logical groups:
- **Authentication** - Login and OTP verification
- **Storage** - S3/R2 storage configurations
- **Notifications** - Discord webhook configs
- **Databases** - PostgreSQL database configs
- **Backups** - Backup and restore operations
- **Statistics** - System stats and metrics

## OpenAPI Specification

The generated OpenAPI 2.0 specification includes:

- All endpoint definitions with methods
- Request/response schemas
- Authentication requirements
- Parameter validations
- Example values
- Error responses

### Export Formats

1. **JSON** - `docs/swagger.json`
   - Use with Postman, Insomnia, or other API clients

2. **YAML** - `docs/swagger.yaml`
   - Human-readable format
   - Version control friendly

3. **Go** - `docs/docs.go`
   - Embedded in binary
   - No external files needed

## Integration with API Clients

### Postman
1. Import `docs/swagger.json`
2. Generates complete collection
3. All endpoints ready to test

### Insomnia
1. Import OpenAPI 2.0 specification
2. Use `docs/swagger.json` or `docs/swagger.yaml`

### Generated Clients
Use swagger-codegen or openapi-generator to create clients:

```bash
# Generate Go client
openapi-generator generate -i docs/swagger.json -g go -o client/

# Generate Python client
openapi-generator generate -i docs/swagger.json -g python -o client-python/

# Generate TypeScript/JavaScript client
openapi-generator generate -i docs/swagger.json -g typescript-axios -o client-ts/
```

## Configuration

### Change Host/Port
Update in [cmd/server/main.go](cmd/server/main.go):
```go
// @host your-domain.com:8080
// @BasePath /api/v1
```

### Change API Version
Update in [cmd/server/main.go](cmd/server/main.go):
```go
// @version 2.0
```

### Add More Metadata
```go
// @termsOfService http://swagger.io/terms/
// @contact.name API Support
// @contact.email support@example.com
// @license.name MIT
// @license.url https://opensource.org/licenses/MIT
```

## Best Practices

### 1. Keep Annotations Up-to-Date
Always regenerate docs after modifying handlers:
```bash
swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal
```

### 2. Add Example Values
Use `example` tags in model definitions:
```go
type User struct {
    Name string `json:"name" example:"John Doe"`
    Age  int    `json:"age" example:"30"`
}
```

### 3. Document All Error Cases
```go
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 404 {object} map[string]string "Not found"
// @Failure 500 {object} map[string]string "Internal server error"
```

### 4. Version Your API
Include version in path:
```go
// @BasePath /api/v1
```

## Troubleshooting

### Swagger UI Not Loading
- Check that server is running
- Verify route: `http://localhost:8080/swagger/index.html`
- Check browser console for errors

### Outdated Documentation
```bash
# Regenerate docs
swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal

# Rebuild application
make build
```

### Import Errors
Ensure docs package is imported:
```go
import _ "github.com/monzim/db_proxy/v1/docs"
```

### Authentication Issues in Swagger UI
- Get JWT token from `/api/v1/auth/verify`
- Click "Authorize" button
- Enter: `Bearer YOUR_TOKEN_HERE`
- Click "Authorize"

## Next Steps

### Optional Enhancements

1. **Add Request Examples**
   ```go
   // @Param body body models.LoginRequest false "Login request" SchemaExample({"username": "admin"})
   ```

2. **Add Response Examples**
   ```go
   // @Success 200 {object} models.User "User details" SchemaExample({"id": "uuid", "name": "John"})
   ```

3. **Add More Metadata**
   - API changelog
   - Known limitations
   - Rate limiting info

4. **Generate Client Libraries**
   Use openapi-generator to create SDK for your favorite language

## Status

✅ **Swagger Integration Complete**

- All 22 endpoints documented
- Swagger UI accessible at `/swagger/index.html`
- OpenAPI 2.0 specification generated
- JWT authentication documented
- All models documented
- Build successful
- Ready for production

Access the interactive API documentation at:
**http://localhost:8080/swagger/index.html**
