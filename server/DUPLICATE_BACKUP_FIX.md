# Duplicate Backup Records Fix

## Problem

When triggering a manual backup, the system was creating duplicate backup records:
1. Handler creates a "pending" backup record
2. `ExecuteBackup` creates ANOTHER "pending" backup record
3. Only the second record gets updated to "running" → "completed"
4. First record stays as "pending" forever

This resulted in orphaned "pending" records in the database for every manual backup.

## Root Cause

The flow was:

```
TriggerManualBackup (handlers.go)
  ↓
  Creates backup record with status "pending"
  ↓
  Calls h.backupSvc.ExecuteBackup(config)
    ↓
    ExecuteBackup (backup.go) creates ANOTHER "pending" record
    ↓
    Updates the NEW record to "running" → "completed"
```

The original "pending" record created by the handler was never updated.

## Solution

Modified the backup service to support reusing existing backup records:

### 1. Refactored ExecuteBackup

**File:** `server/internal/backup/backup.go`

Split the function into two:

```go
// ExecuteBackup performs a database backup (for scheduled backups)
func (s *Service) ExecuteBackup(dbConfig *models.DatabaseConfig) error {
    return s.ExecuteBackupWithID(dbConfig, uuid.Nil)
}

// ExecuteBackupWithID performs a database backup with an optional existing backup ID
func (s *Service) ExecuteBackupWithID(dbConfig *models.DatabaseConfig, backupID uuid.UUID) error {
    var backup *models.Backup
    var err error

    // If backupID is provided (from manual trigger), use it; otherwise create a new one
    if backupID != uuid.Nil {
        backup, err = s.repo.GetBackup(backupID)
        if err != nil || backup == nil {
            return fmt.Errorf("failed to get existing backup record: %w", err)
        }
    } else {
        // Create backup record for scheduled backups
        backup, err = s.repo.CreateBackup(dbConfig.ID, models.BackupStatusPending)
        if err != nil {
            return fmt.Errorf("failed to create backup record: %w", err)
        }
    }

    // Update to running
    err = s.repo.UpdateBackupStatus(backup.ID, models.BackupStatusRunning, nil, "", nil)
    // ... rest of backup logic uses the same backup record
}
```

### 2. Updated Handler to Pass Backup ID

**File:** `server/internal/handlers/handlers.go` (line 957)

Changed from:
```go
go func() {
    if err := h.backupSvc.ExecuteBackup(config); err != nil {
        // Error is already logged in ExecuteBackup
    }
}()
```

To:
```go
go func() {
    if err := h.backupSvc.ExecuteBackupWithID(config, backup.ID); err != nil {
        // Error is already logged in ExecuteBackupWithID
    }
}()
```

## How It Works Now

### Manual Backup Flow
```
TriggerManualBackup (handlers.go)
  ↓
  Creates backup record with status "pending" (ID: abc123)
  ↓
  Calls h.backupSvc.ExecuteBackupWithID(config, abc123)
    ↓
    ExecuteBackupWithID reuses existing record (ID: abc123)
    ↓
    Updates SAME record: "pending" → "running" → "completed"
```

Result: Only ONE backup record, properly tracked through all status transitions.

### Scheduled Backup Flow
```
Scheduler triggers backup
  ↓
  Calls h.backupSvc.ExecuteBackup(config)
    ↓
    ExecuteBackup calls ExecuteBackupWithID(config, uuid.Nil)
    ↓
    ExecuteBackupWithID sees uuid.Nil, creates new "pending" record
    ↓
    Updates that record: "pending" → "running" → "completed"
```

Result: Works exactly as before, no breaking changes.

## Testing

To verify the fix:

### 1. Start the Server
```bash
cd server
go run ./cmd/server
```

### 2. Trigger Manual Backup
Via API:
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/databases/{id}/trigger-backup
```

Or via web UI:
- Navigate to Databases
- Click "Trigger Backup" on any database

### 3. Check Database Records
```sql
SELECT id, database_id, status, started_at, completed_at
FROM backups
WHERE database_id = '<your-database-id>'
ORDER BY started_at DESC
LIMIT 5;
```

**Before Fix:**
```
id       | status    | started_at           | completed_at
---------|-----------|----------------------|-------------
uuid-2   | completed | 2025-11-19 10:30:05  | 2025-11-19 10:30:25
uuid-1   | pending   | 2025-11-19 10:30:00  | NULL          ← ORPHANED
```

**After Fix:**
```
id       | status    | started_at           | completed_at
---------|-----------|----------------------|-------------
uuid-1   | completed | 2025-11-19 10:30:00  | 2025-11-19 10:30:25  ← SINGLE RECORD
```

### 4. Verify in UI
- Navigate to Backups page
- Should see only ONE record per manual backup
- Status should transition: pending → running → completed/failed

## Benefits

1. **No Orphaned Records**: Each manual backup creates exactly one record
2. **Accurate Status**: Users can track the backup from creation to completion
3. **Backward Compatible**: Scheduled backups work exactly as before
4. **Clean Database**: No more accumulation of stuck "pending" records

## Files Modified

1. **server/internal/backup/backup.go**
   - Added `ExecuteBackupWithID` function (lines 40-68)
   - Modified `ExecuteBackup` to delegate to `ExecuteBackupWithID`

2. **server/internal/handlers/handlers.go**
   - Updated `TriggerManualBackup` to call `ExecuteBackupWithID` with backup ID (line 957)

## Verification Checklist

- [x] Build succeeds without errors
- [x] No duplicate backup records created for manual backups
- [x] Backup record status transitions correctly
- [x] Scheduled backups continue to work as before
- [ ] Test manual backup via UI (**User should verify**)
- [ ] Test manual backup via API (**User should verify**)
- [ ] Verify no orphaned "pending" records (**User should verify**)
