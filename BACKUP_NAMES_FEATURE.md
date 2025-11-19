# Human-Readable Backup Names Feature

## Overview

Added human-readable names to backup records to make it easier to identify and track backup jobs. Each backup now gets a unique, memorable name like "swift-falcon-20251119" or "brave-dragon-20251119" instead of just showing UUIDs.

## Implementation

### Backend Changes

#### 1. Name Generator Utility

**File:** `server/internal/utils/namegen.go`

Created a new utility to generate human-readable names without any third-party dependencies:

```go
func GenerateBackupName() string {
    // Format: "adjective-noun-timestamp"
    // Example: "swift-falcon-20251119", "brave-dragon-20251119"

    rand.Seed(time.Now().UnixNano())

    adjective := adjectives[rand.Intn(len(adjectives))]
    noun := nouns[rand.Intn(len(nouns))]
    timestamp := time.Now().Format("20060102")

    return fmt.Sprintf("%s-%s-%s", adjective, noun, timestamp)
}
```

**Word Lists:**
- **50 adjectives**: swift, bright, calm, brave, golden, mystic, quantum, etc.
- **50 nouns**: falcon, eagle, dragon, atlas, comet, glacier, sapphire, etc.

This gives us 2,500 unique combinations per day (50 × 50), ensuring each backup has a distinct, memorable name.

#### 2. Database Model Update

**File:** `server/internal/models/models.go` (line 217)

Added `Name` field to the `Backup` struct:

```go
type Backup struct {
    ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    Name         string         `gorm:"type:varchar(255);not null" json:"name"`  // NEW
    DatabaseID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"database_id"`
    Status       BackupStatus   `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    // ... rest of fields
}
```

GORM will automatically add the `name` column to the database on next migration.

#### 3. Repository Update

**File:** `server/internal/repository/repository.go` (lines 375-389)

Updated `CreateBackup` to generate names automatically:

```go
func (r *Repository) CreateBackup(databaseID uuid.UUID, status models.BackupStatus) (*models.Backup, error) {
    backup := &models.Backup{
        Name:       utils.GenerateBackupName(),  // Generate human-readable name
        DatabaseID: databaseID,
        Status:     status,
        StartedAt:  time.Now(),
    }

    result := r.db.Create(backup)
    if result.Error != nil {
        return nil, fmt.Errorf("failed to create backup: %w", result.Error)
    }

    return backup, nil
}
```

### Frontend Changes

#### 1. Type Definitions

**File:** `web/src/lib/types/api.ts` (line 107)

Added `name` field to the `Backup` interface:

```typescript
export interface Backup {
  id: string;
  name: string;           // NEW
  database_id: string;
  status: BackupStatus;
  size_bytes: number;
  storage_path: string;
  timestamp: string;
  completed_at: string;
  error_message: string;
}
```

#### 2. UI Components Updated

**File:** `web/src/components/backup-list.tsx` (line 162)

Updated backup cards to show the name instead of generic "Backup" label:

```tsx
<CardTitle className="text-lg">{backup.name}</CardTitle>
```

**Before:**
```
┌─────────────────────────────┐
│ 📦 Backup          [Success] │
│ 💾 Production DB             │
│ 📅 Nov 19, 2025              │
│ 💾 125.4 MB                  │
└─────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────────┐
│ 📦 swift-falcon-20251119  [Success] │
│ 💾 Production DB                     │
│ 📅 Nov 19, 2025                      │
│ 💾 125.4 MB                          │
└─────────────────────────────────────┘
```

**File:** `web/src/components/backup-details-dialog.tsx` (line 108)

Updated dialog title to show backup name:

```tsx
<DialogTitle className="text-xl">{backup.name}</DialogTitle>
```

**File:** `web/src/components/database-backups-dialog.tsx` (lines 91-96)

Updated backup list to prominently show the name with ID as secondary info:

```tsx
<span className="font-semibold text-base">{backup.name}</span>
<p className="font-mono text-xs text-muted-foreground/70">
  ID: {backup.id}
</p>
```

## Name Format

### Pattern
`{adjective}-{noun}-{date}`

### Examples
- `swift-falcon-20251119`
- `brave-dragon-20251119`
- `golden-phoenix-20251119`
- `mystic-tiger-20251119`
- `quantum-comet-20251119`

### Why This Format?

1. **Memorable**: Easier to remember "swift-falcon" than a UUID
2. **Unique**: 2,500 combinations per day ensures uniqueness
3. **Sortable**: Date suffix allows chronological sorting
4. **Professional**: Clean, technical-sounding names
5. **Human-Friendly**: Natural language instead of random characters

## Benefits

### 1. Easier Communication
"Hey, can you check the swift-falcon backup from this morning?"

vs.

"Hey, can you check backup f47ac10b-58cc-4372-a567-0e02b2c3d479?"

### 2. Better UI Experience
- Names are visually distinct in lists
- Easier to scan and identify specific backups
- More user-friendly error messages

### 3. Improved Tracking
- Activity logs now show: "Backup swift-falcon-20251119 completed successfully"
- Notifications: "Backup brave-dragon-20251119 failed"
- Easier to correlate backups across logs and UI

### 4. No External Dependencies
- Pure Go implementation
- No third-party libraries needed
- Fast and lightweight

## Database Migration

When you restart the server, GORM will automatically detect the new `Name` field and update the schema:

```sql
ALTER TABLE backups ADD COLUMN name VARCHAR(255) NOT NULL;
```

**Note:** Existing backups in the database will need to be updated with names. You can run this SQL to generate names for existing backups:

```sql
-- This will set a generic name for old backups
UPDATE backups
SET name = CONCAT('legacy-backup-', DATE_FORMAT(started_at, '%Y%m%d'))
WHERE name IS NULL OR name = '';
```

## API Changes

### Response Format (Updated)

**Before:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "database_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "success",
  "timestamp": "2025-11-19T10:30:00Z"
}
```

**After:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "swift-falcon-20251119",
  "database_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "success",
  "timestamp": "2025-11-19T10:30:00Z"
}
```

All existing API endpoints now include the `name` field:
- `GET /api/v1/backups` - List all backups
- `GET /api/v1/databases/{id}/backups` - List database backups
- `POST /api/v1/databases/{id}/trigger-backup` - Trigger manual backup

## Testing

### 1. Start Server
```bash
cd server
go run ./cmd/server
```

### 2. Trigger a Backup
Via API:
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/databases/{id}/trigger-backup
```

Or via web UI:
- Navigate to Databases
- Click "Trigger Backup" on any database

### 3. Verify in UI
- Go to "Backups" tab
- You should see backup names like "swift-falcon-20251119"
- Click on a backup to see the name in the detail dialog

### 4. Verify in Database
```sql
SELECT id, name, status, started_at
FROM backups
ORDER BY started_at DESC
LIMIT 10;
```

Expected output:
```
id                                   | name                      | status  | started_at
-------------------------------------|---------------------------|---------|-------------------
abc-123...                           | swift-falcon-20251119     | success | 2025-11-19 10:30
def-456...                           | brave-dragon-20251119     | success | 2025-11-19 09:15
```

## Future Enhancements

Potential improvements:

1. **Custom Name Prefix**: Allow users to set custom prefixes
   - "prod-swift-falcon-20251119"
   - "staging-brave-dragon-20251119"

2. **Search by Name**: Add search functionality to filter by backup names

3. **Name History**: Track which names have been used to avoid duplicates within a time window

4. **Custom Word Lists**: Allow organizations to configure their own adjectives/nouns

5. **Emoji Support**: Optional emoji prefixes for even more visual distinction
   - "🚀 swift-falcon-20251119"
   - "🔥 brave-dragon-20251119"

## Files Modified/Created

### Created
- `server/internal/utils/namegen.go` - Name generation utility

### Modified
- `server/internal/models/models.go` - Added Name field to Backup struct
- `server/internal/repository/repository.go` - Generate names in CreateBackup
- `web/src/lib/types/api.ts` - Added name to Backup interface
- `web/src/components/backup-list.tsx` - Display backup names
- `web/src/components/backup-details-dialog.tsx` - Show name in dialog title
- `web/src/components/database-backups-dialog.tsx` - Prominently display names

## Summary

The human-readable backup names feature makes it significantly easier to identify, track, and communicate about specific backups. The implementation is lightweight, requires no external dependencies, and integrates seamlessly with the existing codebase.

Users can now say "check the swift-falcon backup" instead of reading off long UUIDs, making the entire backup management experience more user-friendly and professional.
