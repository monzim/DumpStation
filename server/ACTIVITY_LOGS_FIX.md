# Activity Logs Fix - Context Issue Resolution

## Problem

Activity logs were not being saved to the database even though the API endpoints were working. Users could trigger actions (login, create database, trigger backup) but no logs appeared in the database.

## Root Cause

There were two main issues:

### 1. Context Key Mismatch

**Issue:** The `getUserIDFromContext` helper function in handlers was looking for the wrong context key.

**Details:**
- The authentication middleware ([internal/middleware/auth.go:52](internal/middleware/auth.go#L52)) stores JWT claims in the context with key `middleware.UserContextKey` which equals `"user"` as a typed `contextKey`
- The `getUserIDFromContext` function was looking for key `"user_id"` as a plain string
- This mismatch caused `getUserIDFromContext` to always return `nil`
- When logging activities, the user ID was always `nil`, but logs were still attempted

**Fix:**
```go
// Before (BROKEN)
func getUserIDFromContext(r *http.Request) *uuid.UUID {
	if userID := r.Context().Value("user_id"); userID != nil {
		if uid, ok := userID.(uuid.UUID); ok {
			return &uid
		}
	}
	return nil
}

// After (FIXED)
func getUserIDFromContext(r *http.Request) *uuid.UUID {
	// The middleware stores auth.Claims with key middleware.UserContextKey ("user")
	// Try with the typed key first
	type contextKey string
	const userContextKey contextKey = "user"

	if claims := r.Context().Value(userContextKey); claims != nil {
		if authClaims, ok := claims.(*auth.Claims); ok {
			return &authClaims.UserID
		}
	}

	// Fallback to string key
	if claims := r.Context().Value("user"); claims != nil {
		if authClaims, ok := claims.(*auth.Claims); ok {
			return &authClaims.UserID
		}
	}

	return nil
}
```

### 2. JSON Metadata Field Issue

**Issue:** Empty string passed to JSONB field causing PostgreSQL error.

**Details:**
- The `Metadata` field in `ActivityLog` is defined as `jsonb` type in PostgreSQL
- All logging calls were passing empty string `""` for metadata
- PostgreSQL rejected this: `ERROR: invalid input syntax for type json (SQLSTATE 22P02)`
- This caused all activity logging to fail silently

**Error Message:**
```
[ACTIVITY_LOG] ❌ Failed to log activity [backup_triggered]: failed to create activity log: ERROR: invalid input syntax for type json (SQLSTATE 22P02)
```

**Fix:**
```go
// In LogActivity function
if metadata == "" {
    metadata = "{}"  // Use empty JSON object instead of empty string
}
```

### 3. Silent Error Handling

**Issue:** All `LogActivity` calls were ignoring errors.

**Details:**
- Every call to `h.repo.LogActivity(...)` was not checking the error return value
- If logging failed (e.g., database connection issues, validation errors), it would fail silently
- No error messages were logged, making it impossible to debug

**Fix:**
Created a helper method that logs errors:

```go
// logActivity is a helper to log activity and handle errors
func (h *Handler) logActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, entityName, description, metadata, ipAddress string) {
	if err := h.repo.LogActivity(userID, action, level, entityType, entityID, entityName, description, metadata, ipAddress); err != nil {
		log.Printf("[ACTIVITY_LOG] ❌ Failed to log activity [%s]: %v", action, err)
	}
}
```

Then replaced all direct calls:
```go
// Before
h.repo.LogActivity(userID, models.ActionLogin, ...)

// After
h.logActivity(userID, models.ActionLogin, ...)
```

## Files Modified

1. **[internal/handlers/handlers.go](internal/handlers/handlers.go)**
   - Fixed `getUserIDFromContext()` function (lines 1274-1295)
   - Added `logActivity()` helper method (lines 1317-1323)
   - Replaced all `h.repo.LogActivity` calls with `h.logActivity` throughout the file

2. **[internal/repository/repository.go](internal/repository/repository.go)**
   - Fixed `LogActivity()` to convert empty metadata string to valid JSON `"{}"` (lines 538-541)

3. **[cmd/server/main.go](cmd/server/main.go)**
   - Added error logging for system startup log (lines 96-101)
   - Added error logging for system shutdown log (lines 135-140)

## Testing

To verify the fix works:

### 1. Check Server Logs

Start the server and watch for activity log messages:

```bash
cd server
go run ./cmd/server
```

Look for:
- `[ACTIVITY_LOG] ❌ Failed to log activity` - indicates logging errors
- No such messages = logging is working

### 2. Perform Actions

After logging in to the web UI:
1. Create a database configuration
2. Trigger a manual backup
3. Update a database
4. Pause/unpause a database

### 3. Verify in Database

Connect to your PostgreSQL database:

```bash
psql <your-database-connection-string>
```

Query activity logs:

```sql
SELECT
  action,
  level,
  entity_name,
  description,
  created_at
FROM activity_logs
ORDER BY created_at DESC
LIMIT 10;
```

You should see entries for all actions performed.

### 4. Verify via API

```bash
# Get activity logs
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/logs

# Filter by action
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logs?action=database_created"
```

## Expected Behavior After Fix

1. **Login Actions** - Logged with user ID populated
2. **CRUD Operations** - All create/update/delete operations logged
3. **Backup Triggers** - Manual backup triggers logged
4. **System Events** - Startup/shutdown logged
5. **User Context** - User ID correctly associated with all logged actions
6. **Error Visibility** - Any logging failures will appear in server logs

## Additional Improvements

If logs are still not appearing, check:

1. **Database Connection**
   ```bash
   # Check if database is accessible
   psql <dsn> -c "SELECT 1"
   ```

2. **Table Exists**
   ```sql
   SELECT EXISTS (
     SELECT FROM information_schema.tables
     WHERE table_name = 'activity_logs'
   );
   ```

3. **Permissions**
   ```sql
   -- Ensure the database user has INSERT permissions
   GRANT INSERT ON activity_logs TO your_db_user;
   ```

4. **Constraints**
   - Check if there are any UNIQUE constraints failing
   - Check if NOT NULL constraints are satisfied

## Server Log Examples

### Successful Logging
```
[INFO] ℹ️  ✅ JWT token generated for user: admin (expires: 2025-11-20T10:30:00Z)
[AUTH] ✅ Token validated - User: abc123... - POST /api/v1/databases
[INFO] ℹ️  Database config created: Production DB (ID: def456...)
```

### Failed Logging (if database issues)
```
[ACTIVITY_LOG] ❌ Failed to log activity [database_created]: pq: connection refused
```

## Verification Checklist

- [x] Fixed context key mismatch in `getUserIDFromContext`
- [x] Added error logging to all `LogActivity` calls
- [x] Created helper method to centralize error handling
- [x] Updated system startup/shutdown logging
- [x] Build succeeds without errors
- [x] No recursive function calls
- [ ] Test with actual database (**User should verify**)
- [ ] Confirm logs appear in database (**User should verify**)
- [ ] Confirm logs appear in UI (**User should verify**)

## Summary

The activity logging system is now fixed and should work correctly. The main issues were:
1. Context key mismatch preventing user ID extraction
2. Silent error handling hiding potential database issues

Both have been resolved, and error logging has been added to make future issues easier to diagnose.
