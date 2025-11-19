# Migration Guide: Adding Backup Names

## Issue

When adding the `name` column to existing backups table with `NOT NULL` constraint, PostgreSQL fails because existing records don't have names:

```
ERROR: column "name" of relation "backups" contains null values (SQLSTATE 23502)
```

## Solution

The code has been updated to handle this automatically:

1. **Model Update**: The `name` field now has a default value of empty string: `default:''`
2. **BeforeCreate Hook**: Automatically generates names for any backup without a name
3. **Migration Safe**: GORM will add the column with a default, then existing records can be updated

## Migration Steps

### Step 1: Start the Server (First Time After Update)

The server will now successfully add the `name` column with a default value:

```bash
cd server
go run ./cmd/server
```

The column will be added as:
```sql
ALTER TABLE backups ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT '';
```

### Step 2: Update Existing Backups with Names

You have two options:

#### Option A: Simple Update (Recommended)

Run this SQL to generate names for all existing backups:

```sql
-- Connect to your database
psql <your-connection-string>

-- Update all backups without names
UPDATE backups
SET name = CONCAT(
  'legacy-backup-',
  TO_CHAR(started_at, 'YYYYMMDD-HH24MISS')
)
WHERE name IS NULL OR name = '';
```

This will generate names like:
- `legacy-backup-20251119-103015`
- `legacy-backup-20251119-141230`

#### Option B: Advanced Update (More Creative Names)

For more human-readable names, use the migration script:

```bash
psql <your-connection-string> -f server/scripts/migrate_backup_names.sql
```

This will generate names like:
- `swift-falcon-20251119`
- `brave-dragon-20251119-002` (if multiple backups on same day)

### Step 3: Verify Migration

Check that all backups now have names:

```sql
SELECT
  COUNT(*) as total_backups,
  COUNT(CASE WHEN name IS NOT NULL AND name != '' THEN 1 END) as backups_with_names,
  COUNT(CASE WHEN name IS NULL OR name = '' THEN 1 END) as backups_without_names
FROM backups;
```

Expected output:
```
total_backups | backups_with_names | backups_without_names
--------------|-------------------|---------------------
     42       |        42         |          0
```

### Step 4: View Updated Backups

```sql
SELECT id, name, status, started_at
FROM backups
ORDER BY started_at DESC
LIMIT 10;
```

## Future Backups

All new backups created after this update will automatically get human-readable names like:

- `swift-falcon-20251119`
- `brave-dragon-20251119`
- `golden-phoenix-20251120`
- `mystic-tiger-20251120`

No manual intervention needed!

## How It Works

### 1. Model Definition (models.go)

```go
type Backup struct {
    ID           uuid.UUID      `gorm:"type:uuid;primary_key" json:"id"`
    Name         string         `gorm:"type:varchar(255);not null;default:''" json:"name"`
    // ... other fields
}
```

The `default:''` ensures the column allows empty strings initially.

### 2. BeforeCreate Hook (models.go)

```go
func (b *Backup) BeforeCreate(tx *gorm.DB) error {
    if b.ID == uuid.Nil {
        b.ID = uuid.New()
    }
    // Generate name if not set
    if b.Name == "" {
        b.Name = utils.GenerateBackupName()
    }
    return nil
}
```

This hook automatically generates a name before inserting into the database.

### 3. Repository CreateBackup (repository.go)

```go
func (r *Repository) CreateBackup(databaseID uuid.UUID, status models.BackupStatus) (*models.Backup, error) {
    backup := &models.Backup{
        Name:       utils.GenerateBackupName(),  // Explicit generation
        DatabaseID: databaseID,
        Status:     status,
        StartedAt:  time.Now(),
    }
    // Name is also set in BeforeCreate as fallback
    result := r.db.Create(backup)
    return backup, nil
}
```

Double protection: both in repository and BeforeCreate hook.

## Troubleshooting

### Problem: Server still won't start

**Error:**
```
Failed to run auto-migration: ERROR: column "name" of relation "backups" contains null values
```

**Solution:**

1. Drop the name column manually:
   ```sql
   ALTER TABLE backups DROP COLUMN IF EXISTS name;
   ```

2. Restart the server (it will recreate the column with default)

3. Then run the migration SQL from Step 2

### Problem: Some backups still show as "legacy-backup-..."

This is expected for old backups. Only new backups will get the creative names like "swift-falcon". Old backups keep their legacy names for consistency.

If you want to regenerate names for legacy backups, run:

```sql
UPDATE backups
SET name = CONCAT(
  (ARRAY['swift', 'brave', 'golden', 'mystic', 'quantum'])[
    (ABS(HASHTEXT(id::TEXT)) % 5) + 1
  ],
  '-',
  (ARRAY['falcon', 'dragon', 'tiger', 'phoenix', 'comet'])[
    (ABS(HASHTEXT(id::TEXT || 'salt')) % 5) + 1
  ],
  '-',
  TO_CHAR(started_at, 'YYYYMMDD')
)
WHERE name LIKE 'legacy-backup-%';
```

### Problem: Duplicate names

Very unlikely (2,500 combinations per day), but if it happens, the migration script adds a sequence number:

- `swift-falcon-20251119` (first one)
- `swift-falcon-20251119-002` (second one)
- `swift-falcon-20251119-003` (third one)

## Verification Checklist

- [ ] Server starts without migration errors
- [ ] All existing backups have names (no NULL or empty strings)
- [ ] New backups get automatically generated names
- [ ] UI displays backup names correctly
- [ ] Backup detail dialog shows the name
- [ ] Activity logs include backup names

## Summary

The migration is designed to be **safe and automatic**:

1. ✅ `default:''` allows column to be added without errors
2. ✅ BeforeCreate hook ensures all new records have names
3. ✅ Simple SQL script updates old records
4. ✅ No downtime required
5. ✅ Backward compatible - old backups work fine with legacy names

Just start the server, run the migration SQL, and you're done!
