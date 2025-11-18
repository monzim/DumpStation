# Pause Config Backup Feature Added

## Overview

Added the ability to pause any config backup, allowing you to pause future backups and cleanup processes for any database configuration without deleting it.

## Changes Made

### 1. **Database Model** (`internal/models/models.go`)

- Added `Paused` boolean field to `DatabaseConfig` struct
- Default value: `false` (not paused)
- Automatically included in JSON responses

### 2. **Database Migration** (`migrations/003_add_paused_field.sql`)

- Created migration to add `paused` column to `database_configs` table
- Added index on `paused` column for faster queries
- Default value: `false`

### 3. **Repository Methods** (`internal/repository/repository.go`)

- **`PauseDatabaseConfig(id uuid.UUID) error`** - Pauses a specific database configuration
- **`UnpauseDatabaseConfig(id uuid.UUID) error`** - Resumes a paused database configuration

### 4. **API Endpoints** (New routes in `internal/handlers/router.go`)

- **POST** `/api/v1/databases/{id}/pause` - Pause a database configuration
  - Returns the updated DatabaseConfig with `paused: true`
  - Requires authentication
- **POST** `/api/v1/databases/{id}/unpause` - Resume a paused database configuration
  - Returns the updated DatabaseConfig with `paused: false`
  - Requires authentication

### 5. **Handler Functions** (`internal/handlers/handlers.go`)

- **`PauseDatabaseConfig`** - Handles pause requests
  - Validates config exists
  - Updates pause status
  - Logs the action
- **`UnpauseDatabaseConfig`** - Handles unpause requests
  - Validates config exists
  - Updates pause status
  - Logs the action

### 6. **Scheduler Updates** (`internal/scheduler/scheduler.go`)

- Modified `Start()` to skip paused configs when loading jobs at startup
- Modified `AddJob()` to skip adding jobs for paused configs
- When a config is paused, it won't be scheduled for automatic backups

### 7. **Backup Service Updates** (`internal/backup/backup.go`)

- Modified `cleanupOldBackups()` to skip cleanup process for paused configs
- Prevents cleanup from running on paused backups

## Usage

### Pause a Database Configuration

```bash
curl -X POST http://localhost:8080/api/v1/databases/{id}/pause \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "id": "uuid...",
  "name": "Production DB",
  "paused": true,
  "enabled": true,
  ...
}
```

### Resume a Paused Database Configuration

```bash
curl -X POST http://localhost:8080/api/v1/databases/{id}/unpause \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "id": "uuid...",
  "name": "Production DB",
  "paused": false,
  "enabled": true,
  ...
}
```

## Behavior

### When a Config is Paused:

1. ✅ No scheduled backups will run
2. ✅ No cleanup/rotation process will run
3. ✅ Manual backups can still be triggered via `/databases/{id}/backup` endpoint
4. ✅ Existing backups remain intact in storage
5. ✅ Config remains enabled and can be queried

### When a Config is Unpaused:

1. ✅ Scheduled backups resume on the next scheduled time
2. ✅ Cleanup process resumes
3. ✅ All operations return to normal

## Migration Instructions

1. **Apply the migration:**

   ```bash
   # The migration file is at: migrations/003_add_paused_field.sql
   # If using automatic migrations in your init code, it will be applied automatically
   ```

2. **Rebuild the application:**

   ```bash
   go build ./cmd/server
   ```

3. **Start the service** - All existing configs will have `paused: false` by default

## Benefits

- ✨ Temporarily stop backups without deleting the configuration
- ✨ Pause cleanup to keep all backups during maintenance windows
- ✨ Resume operations when ready - no reconfiguration needed
- ✨ Perfect for testing, maintenance, or cost control
- ✨ All operations logged for audit trail

## Error Handling

- Invalid config ID returns `400 Bad Request`
- Non-existent config returns `404 Not Found`
- Database errors return `500 Internal Server Error`

All errors are properly logged and include descriptive messages.
