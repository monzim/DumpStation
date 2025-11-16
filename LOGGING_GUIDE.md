# Logging Guide

## Overview

The PostgreSQL Backup Service now has comprehensive logging throughout the application to help you track API calls, errors, and operations in real-time.

## Log Categories

All logs are prefixed with a category tag for easy filtering:

### 1. **[REQUEST]** - HTTP Requests
Logged for every incoming HTTP request.

```
[REQUEST] ➡️  POST /api/v1/auth/login from 127.0.0.1:52848
```

### 2. **[RESPONSE]** - HTTP Responses
Logged for every HTTP response with status code, duration, and size.

```
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/login - 45.2ms - 56 bytes
[RESPONSE] ⬅️  ⚠️  GET 404 /api/v1/users/123 - 12.5ms - 42 bytes
[RESPONSE] ⬅️  ❌ POST 500 /api/v1/backup - 89.3ms - 78 bytes
```

Status indicators:
- ✅ - Success (200-299)
- ⚠️ - Client Error (400-499)
- ❌ - Server Error (500+)

### 3. **[AUTH]** - Authentication
All authentication-related logs including token validation.

```
[AUTH] ✅ Token validated - User: user-uuid - GET /api/v1/databases
[AUTH] ❌ Missing authorization header - GET /api/v1/storage
[AUTH] ❌ Invalid or expired token - POST /api/v1/backups/123/restore
```

### 4. **[INFO]** - General Information
Application flow and successful operations.

```
[INFO] ℹ️  Login request received
[INFO] ℹ️  Processing login for username: admin
[INFO] ℹ️  ✅ Existing user found: admin (ID: uuid)
[INFO] ℹ️  ✅ OTP generated for user: admin
[INFO] ℹ️  ✅ OTP stored in database (expires at: 2025-11-16 23:25:00)
[INFO] ℹ️  Sending OTP to Discord webhook...
[INFO] ℹ️  ✅ OTP sent to Discord webhook successfully
[INFO] ℹ️  ✅ Login successful for user: admin
```

### 5. **[ERROR]** - Errors
All application errors with context.

```
[ERROR] ❌ HTTP 500: failed to get user
[ERROR] ❌ Failed to get user: admin: database connection error
[ERROR] ❌ Invalid UUID format: abc-123 - invalid UUID length: 7
[ERROR] ❌ OTP verification error for user: admin: OTP expired
```

### 6. **[WARNING]** - Warnings
Non-critical issues.

```
[WARNING] ⚠️  Discord notifier not configured, OTP not sent: 123456
```

### 7. **[HANDLER]** - Handler Operations
Handler-specific operations and errors.

```
[HANDLER] ❌ Error encoding JSON response: invalid character
```

## Log Format

Each log entry follows this pattern:

```
[CATEGORY] EMOJI MESSAGE - CONTEXT
```

Example:
```
[INFO] ℹ️  Processing login for username: admin
[AUTH] ✅ Token validated - User: user-uuid - GET /api/v1/databases
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/login - 45.2ms - 56 bytes
```

## What Gets Logged

### Authentication Flow

#### Login (`POST /api/v1/auth/login`)
```
[REQUEST] ➡️  POST /api/v1/auth/login from 127.0.0.1:52848
[INFO] ℹ️  Login request received
[INFO] ℹ️  Processing login for username: admin
[INFO] ℹ️  ✅ Existing user found: admin (ID: abc-123)
[INFO] ℹ️  ✅ OTP generated for user: admin
[INFO] ℹ️  ✅ OTP stored in database (expires at: 2025-11-16 23:25:00)
[INFO] ℹ️  Sending OTP to Discord webhook...
[INFO] ℹ️  ✅ OTP sent to Discord webhook successfully
[INFO] ℹ️  ✅ Login successful for user: admin
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/login - 245.3ms - 56 bytes
```

#### OTP Verification (`POST /api/v1/auth/verify`)
```
[REQUEST] ➡️  POST /api/v1/auth/verify from 127.0.0.1:52849
[INFO] ℹ️  OTP verification request received
[INFO] ℹ️  Verifying OTP for username: admin
[INFO] ℹ️  User found: admin (ID: abc-123), verifying OTP...
[INFO] ℹ️  ✅ OTP verified successfully for user: admin
[INFO] ℹ️  ✅ JWT token generated for user: admin (expires: 2025-11-17 23:20:15)
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/verify - 89.7ms - 312 bytes
```

### Protected Endpoints

#### With Valid Token
```
[REQUEST] ➡️  GET /api/v1/databases from 127.0.0.1:52850
[AUTH] ✅ Token validated - User: abc-123 - GET /api/v1/databases
[RESPONSE] ⬅️  ✅ GET 200 /api/v1/databases - 23.4ms - 1024 bytes
```

#### With Missing Token
```
[REQUEST] ➡️  GET /api/v1/storage from 127.0.0.1:52851
[AUTH] ❌ Missing authorization header - GET /api/v1/storage
[ERROR] ❌ HTTP 401: missing authorization header
[RESPONSE] ⬅️  ⚠️  GET 401 /api/v1/storage - 1.2ms - 78 bytes
```

#### With Invalid Token
```
[REQUEST] ➡️  POST /api/v1/backups/123/restore from 127.0.0.1:52852
[AUTH] ❌ Invalid or expired token - POST /api/v1/backups/123/restore - Error: token is expired
[ERROR] ❌ HTTP 401: invalid or expired token
[RESPONSE] ⬅️  ⚠️  POST 401 /api/v1/backups/123/restore - 5.6ms - 67 bytes
```

### Error Scenarios

#### Invalid UUID
```
[REQUEST] ➡️  GET /api/v1/databases/invalid-uuid from 127.0.0.1:52853
[AUTH] ✅ Token validated - User: abc-123 - GET /api/v1/databases/invalid-uuid
[ERROR] ❌ Invalid UUID format: invalid-uuid - invalid UUID length: 12
[ERROR] ❌ HTTP 400: invalid ID
[RESPONSE] ⬅️  ⚠️  GET 400 /api/v1/databases/invalid-uuid - 8.3ms - 45 bytes
```

#### Database Connection Error
```
[REQUEST] ➡️  GET /api/v1/storage from 127.0.0.1:52854
[AUTH] ✅ Token validated - User: abc-123 - GET /api/v1/storage
[ERROR] ❌ Failed to list storage configs: pq: connection refused
[ERROR] ❌ HTTP 500: failed to list storage configs
[RESPONSE] ⬅️  ❌ GET 500 /api/v1/storage - 156.8ms - 89 bytes
```

## Filtering Logs

### By Category

```bash
# All authentication logs
make dev 2>&1 | grep "\[AUTH\]"

# All errors
make dev 2>&1 | grep "\[ERROR\]"

# All requests
make dev 2>&1 | grep "\[REQUEST\]"

# All responses
make dev 2>&1 | grep "\[RESPONSE\]"

# All info logs
make dev 2>&1 | grep "\[INFO\]"
```

### By Status

```bash
# All successful operations
make dev 2>&1 | grep "✅"

# All warnings
make dev 2>&1 | grep "⚠️"

# All errors
make dev 2>&1 | grep "❌"
```

### By Endpoint

```bash
# Login-related logs
make dev 2>&1 | grep "/auth/login"

# Database operations
make dev 2>&1 | grep "/databases"

# Backup operations
make dev 2>&1 | grep "/backup"
```

### By User

```bash
# All operations for specific user
make dev 2>&1 | grep "User: abc-123"

# All admin operations
make dev 2>&1 | grep "admin"
```

## Log Output to File

### Redirect to File
```bash
# All logs to file
make dev > logs/app.log 2>&1

# Only errors to file
make dev 2>&1 | grep -E "\[ERROR\]|❌" > logs/errors.log

# Split logs: stdout to one file, stderr to another
make dev >logs/stdout.log 2>logs/stderr.log
```

### Tee to Both Console and File
```bash
# See logs in console AND save to file
make dev 2>&1 | tee logs/app.log

# Only errors to both
make dev 2>&1 | grep -E "\[ERROR\]|❌" | tee logs/errors.log
```

## Log Levels

The application logs at these levels:

1. **INFO** - Normal operations, successful actions
2. **WARNING** - Non-critical issues, degraded functionality
3. **ERROR** - Errors that need attention

## Performance Monitoring

Response time logs help identify slow endpoints:

```bash
# Find slow requests (>1 second)
make dev 2>&1 | grep -E "[0-9]+\.[0-9]+s" | grep -v "ms"

# Find specific slow operations
make dev 2>&1 | grep "\[RESPONSE\]" | grep -E "[5-9][0-9][0-9]ms|[0-9]+\.[0-9]+s"
```

## Debugging Tips

### 1. Full Request/Response Cycle
Follow a request from start to finish:
```bash
make dev 2>&1 | grep -A 20 "POST /api/v1/auth/login"
```

### 2. Authentication Issues
```bash
# See all auth-related logs
make dev 2>&1 | grep -E "\[AUTH\]|\[INFO\].*OTP|\[INFO\].*token"
```

### 3. Database Errors
```bash
# All database-related errors
make dev 2>&1 | grep -E "\[ERROR\].*database|\[ERROR\].*failed to"
```

### 4. Track User Session
```bash
# All operations for admin user
make dev 2>&1 | grep "admin"
```

## Example Session

Here's what a complete authentication session looks like:

```
2025/11/16 23:20:15 Starting PostgreSQL Backup Service...
2025/11/16 23:20:15 Database connection established
2025/11/16 23:20:15 Server listening on 0.0.0.0:8080

[REQUEST] ➡️  POST /api/v1/auth/login from 127.0.0.1:52848
[INFO] ℹ️  Login request received
[INFO] ℹ️  Processing login for username: admin
[INFO] ℹ️  ✅ Existing user found: admin (ID: 550e8400-e29b-41d4-a716-446655440000)
[INFO] ℹ️  ✅ OTP generated for user: admin
[INFO] ℹ️  ✅ OTP stored in database (expires at: 2025-11-16 23:25:15)
[INFO] ℹ️  Sending OTP to Discord webhook...
[INFO] ℹ️  ✅ OTP sent to Discord webhook successfully
[INFO] ℹ️  ✅ Login successful for user: admin
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/login - 245.3ms - 56 bytes

[REQUEST] ➡️  POST /api/v1/auth/verify from 127.0.0.1:52849
[INFO] ℹ️  OTP verification request received
[INFO] ℹ️  Verifying OTP for username: admin
[INFO] ℹ️  User found: admin (ID: 550e8400-e29b-41d4-a716-446655440000), verifying OTP...
[INFO] ℹ️  ✅ OTP verified successfully for user: admin
[INFO] ℹ️  ✅ JWT token generated for user: admin (expires: 2025-11-17 23:20:15)
[RESPONSE] ⬅️  ✅ POST 200 /api/v1/auth/verify - 89.7ms - 312 bytes

[REQUEST] ➡️  GET /api/v1/databases from 127.0.0.1:52850
[AUTH] ✅ Token validated - User: 550e8400-e29b-41d4-a716-446655440000 - GET /api/v1/databases
[RESPONSE] ⬅️  ✅ GET 200 /api/v1/databases - 23.4ms - 1024 bytes
```

## Log Rotation

For production, consider using log rotation:

```bash
# Install logrotate (if not installed)
sudo apt-get install logrotate  # Debian/Ubuntu
sudo yum install logrotate      # CentOS/RHEL
brew install logrotate          # macOS

# Create /etc/logrotate.d/backup-service
/path/to/logs/app.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 user group
}
```

## Environment Variables

You can control logging verbosity (future enhancement):

```bash
# Set log level
export LOG_LEVEL=debug   # debug, info, warn, error

# Disable colors
export LOG_NO_COLOR=true

# JSON format (future)
export LOG_FORMAT=json
```

## Best Practices

1. **Monitor the logs** when starting the service
2. **Check [ERROR] logs** regularly for issues
3. **Watch authentication logs** for security
4. **Track response times** for performance
5. **Save logs to file** in production
6. **Use log rotation** to manage disk space
7. **Filter by category** when debugging specific features

## Summary

The logging system provides:
- ✅ Complete request/response tracking
- ✅ Detailed error context
- ✅ Authentication flow visibility
- ✅ Performance metrics (response times)
- ✅ Easy filtering by category
- ✅ Clear emoji indicators for quick scanning
- ✅ User and operation tracking

All logs are written to stdout/stderr and can be redirected to files for long-term storage and analysis.
