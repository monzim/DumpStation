# Activity Logging System

This document describes the comprehensive activity logging system implemented in the PostgreSQL Backup Service.

## Overview

The activity logging system tracks all important actions performed in the system, stores them in the database, and provides APIs to view and filter logs. A background cleanup process automatically removes logs older than 60 days.

## Features

### 1. Activity Log Model

**Location:** `internal/models/models.go`

The `ActivityLog` model captures:
- **ID**: Unique UUID identifier
- **UserID**: User who performed the action (optional for system actions)
- **Action**: Type of action performed (login, backup_created, database_updated, etc.)
- **Level**: Severity level (info, warning, error, success)
- **EntityType**: Type of entity affected (storage, database, backup, etc.)
- **EntityID**: UUID of the affected entity
- **EntityName**: Human-readable name of the entity
- **Description**: Detailed description of the action
- **Metadata**: Additional JSON data (optional)
- **IPAddress**: IP address of the requester
- **CreatedAt**: Timestamp of the action

### 2. Logged Actions

The system tracks the following actions:

#### Authentication
- `login` - Successful user login
- `logout` - User logout

#### Storage Management
- `storage_created` - Storage configuration created
- `storage_updated` - Storage configuration updated
- `storage_deleted` - Storage configuration deleted

#### Notification Management
- `notification_created` - Notification configuration created
- `notification_updated` - Notification configuration updated
- `notification_deleted` - Notification configuration deleted

#### Database Configuration
- `database_created` - Database configuration created
- `database_updated` - Database configuration updated
- `database_deleted` - Database configuration deleted
- `database_paused` - Database backups paused
- `database_unpaused` - Database backups resumed

#### Backup Operations
- `backup_triggered` - Manual backup triggered
- `backup_started` - Backup process started
- `backup_completed` - Backup completed successfully
- `backup_failed` - Backup failed

#### Restore Operations
- `restore_triggered` - Restore operation triggered
- `restore_started` - Restore process started
- `restore_completed` - Restore completed successfully
- `restore_failed` - Restore failed

#### System Events
- `system_startup` - Service started
- `system_shutdown` - Service shutting down

### 3. API Endpoints

#### List Activity Logs
```
GET /api/v1/logs
```

**Query Parameters:**
- `user_id` (UUID) - Filter by user ID
- `action` (string) - Filter by action type
- `level` (string) - Filter by log level (info, warning, error, success)
- `entity_type` (string) - Filter by entity type
- `entity_id` (UUID) - Filter by entity ID
- `start_date` (RFC3339) - Filter by start date
- `end_date` (RFC3339) - Filter by end date
- `limit` (int) - Number of records to return (default: 50)
- `offset` (int) - Number of records to skip (default: 0)

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user": {
        "id": "uuid",
        "discord_user_id": "admin",
        "discord_username": "admin"
      },
      "action": "database_created",
      "level": "success",
      "entity_type": "database",
      "entity_id": "uuid",
      "entity_name": "Production DB",
      "description": "Database configuration 'Production DB' created with schedule: 0 2 * * *",
      "metadata": "",
      "ip_address": "192.168.1.100",
      "created_at": "2025-11-19T10:30:00Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### Get Activity Log by ID
```
GET /api/v1/logs/{id}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "user": {
    "id": "uuid",
    "discord_user_id": "admin",
    "discord_username": "admin"
  },
  "action": "backup_triggered",
  "level": "info",
  "entity_type": "backup",
  "entity_id": "uuid",
  "entity_name": "Production DB",
  "description": "Manual backup triggered for database 'Production DB'",
  "metadata": "",
  "ip_address": "192.168.1.100",
  "created_at": "2025-11-19T10:30:00Z"
}
```

### 4. Background Cleanup Service

**Location:** `internal/cleanup/cleanup.go`

The cleanup service:
- Runs daily at 2:00 AM
- Deletes activity logs older than 60 days
- Runs initial cleanup on service startup
- Logs the number of deleted records

**Configuration:**
The retention period is set to 60 days by default in `main.go`:
```go
cleanupSvc := cleanup.NewService(repo, 60*24*time.Hour)
```

**Logging:**
```
[CLEANUP] Starting activity log cleanup service...
[CLEANUP] Retention period: 60 days
[CLEANUP] Next cleanup scheduled at: 2025-11-20T02:00:00Z
[CLEANUP] ✅ Activity log cleanup service started
[CLEANUP] Running activity log cleanup...
[CLEANUP] Deleting logs older than: 2025-09-20T02:00:00Z
[CLEANUP] ✅ Successfully deleted 125 old activity log(s)
```

### 5. Integration Points

The logging system is integrated throughout the application:

#### Handlers (`internal/handlers/handlers.go`)
- Login handler logs successful authentication
- All CRUD operations log their actions
- Helper functions extract user ID and IP address from requests

#### Main Application (`cmd/server/main.go`)
- Logs system startup
- Logs system shutdown
- Initializes cleanup service

#### Repository (`internal/repository/repository.go`)
- `LogActivity()` - Quick helper for logging actions
- `CreateActivityLog()` - Create log entry
- `GetActivityLog()` - Retrieve single log
- `ListActivityLogs()` - List with filtering and pagination
- `DeleteOldActivityLogs()` - Cleanup old logs

## Usage Examples

### View Recent Logs
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?limit=20"
```

### Filter by Action Type
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?action=backup_completed"
```

### Filter by Date Range
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?start_date=2025-11-01T00:00:00Z&end_date=2025-11-19T23:59:59Z"
```

### Filter by Entity
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?entity_type=database&entity_id=YOUR_DB_UUID"
```

### Filter by Log Level
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?level=error"
```

## Database Schema

The activity logs are stored in the `activity_logs` table with the following indexes:
- Primary key on `id`
- Index on `user_id`
- Index on `action`
- Index on `level`
- Index on `entity_type`
- Index on `entity_id`
- Index on `created_at`

These indexes ensure fast filtering and querying of logs.

## Benefits

1. **Audit Trail**: Complete history of all system actions
2. **Debugging**: Easy to trace issues and understand system behavior
3. **Compliance**: Meets audit requirements for production systems
4. **Monitoring**: Monitor system activity from the UI
5. **Troubleshooting**: Quickly identify when and why actions occurred
6. **Automatic Cleanup**: Prevents database bloat with automatic log rotation

## Future Enhancements

Potential improvements:
- Export logs to external logging services (e.g., Elasticsearch, Splunk)
- Add log statistics dashboard
- Email/webhook alerts for critical actions
- Configurable retention periods per log level
- Log archiving to S3/R2 before deletion
