-- Migration Script: Add Multi-Tenant User Isolation
-- This script adds user_id columns to all resource tables and assigns existing records to the system user
-- Run this script before deploying the new version of the application
--
-- IMPORTANT NOTES:
-- 1. This script is idempotent - safe to run multiple times
-- 2. Existing records will be assigned to the first non-demo user
-- 3. The first non-demo user will be promoted to admin
-- 4. If no users exist, the script will still complete but you must create a user before using the app

-- Step 1: Add is_admin column to users table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN users.is_admin IS 'Whether this user has admin privileges (can view all data)';
    END IF;
END $$;

-- Step 2: Add user_id column to storage_configs if it doesn't exist
DO $$
DECLARE
    first_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'storage_configs' AND column_name = 'user_id') THEN
        -- Find the first non-demo system user
        SELECT id INTO first_user_id FROM users 
        WHERE is_demo = FALSE 
        ORDER BY created_at ASC 
        LIMIT 1;
        
        -- First add the column as nullable
        ALTER TABLE storage_configs ADD COLUMN user_id UUID;
        
        -- Only backfill if we have a user and have records
        IF first_user_id IS NOT NULL THEN
            UPDATE storage_configs SET user_id = first_user_id WHERE user_id IS NULL;
        END IF;
        
        -- Add foreign key constraint (allow NULL for now, will be made NOT NULL after app migration)
        ALTER TABLE storage_configs ADD CONSTRAINT fk_storage_configs_user 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        
        -- Add index for user_id
        CREATE INDEX IF NOT EXISTS idx_storage_configs_user_id ON storage_configs(user_id);
        
        COMMENT ON COLUMN storage_configs.user_id IS 'Owner of this storage configuration';
    END IF;
END $$;

-- Step 3: Add user_id column to notification_configs if it doesn't exist
DO $$
DECLARE
    first_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notification_configs' AND column_name = 'user_id') THEN
        -- Find the first non-demo system user
        SELECT id INTO first_user_id FROM users 
        WHERE is_demo = FALSE 
        ORDER BY created_at ASC 
        LIMIT 1;
        
        -- First add the column as nullable
        ALTER TABLE notification_configs ADD COLUMN user_id UUID;
        
        -- Only backfill if we have a user and have records
        IF first_user_id IS NOT NULL THEN
            UPDATE notification_configs SET user_id = first_user_id WHERE user_id IS NULL;
        END IF;
        
        -- Add foreign key constraint
        ALTER TABLE notification_configs ADD CONSTRAINT fk_notification_configs_user 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        
        -- Add index for user_id
        CREATE INDEX IF NOT EXISTS idx_notification_configs_user_id ON notification_configs(user_id);
        
        COMMENT ON COLUMN notification_configs.user_id IS 'Owner of this notification configuration';
    END IF;
END $$;

-- Step 4: Add user_id column to database_configs if it doesn't exist
DO $$
DECLARE
    first_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'database_configs' AND column_name = 'user_id') THEN
        -- Find the first non-demo system user
        SELECT id INTO first_user_id FROM users 
        WHERE is_demo = FALSE 
        ORDER BY created_at ASC 
        LIMIT 1;
        
        -- First add the column as nullable
        ALTER TABLE database_configs ADD COLUMN user_id UUID;
        
        -- Only backfill if we have a user and have records
        IF first_user_id IS NOT NULL THEN
            UPDATE database_configs SET user_id = first_user_id WHERE user_id IS NULL;
        END IF;
        
        -- Add foreign key constraint
        ALTER TABLE database_configs ADD CONSTRAINT fk_database_configs_user 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        
        -- Add index for user_id
        CREATE INDEX IF NOT EXISTS idx_database_configs_user_id ON database_configs(user_id);
        
        COMMENT ON COLUMN database_configs.user_id IS 'Owner of this database configuration';
    END IF;
END $$;

-- Step 5: Set the first system user as admin (if not already set)
UPDATE users 
SET is_admin = TRUE 
WHERE id = (
    SELECT id FROM users 
    WHERE is_demo = FALSE 
    ORDER BY created_at ASC 
    LIMIT 1
)
AND is_admin = FALSE;

-- Step 6: Verify the migration
DO $$
DECLARE
    storage_count INT;
    notification_count INT;
    database_count INT;
    null_storage_count INT;
    null_notification_count INT;
    null_database_count INT;
    admin_count INT;
BEGIN
    SELECT COUNT(*) INTO storage_count FROM storage_configs;
    SELECT COUNT(*) INTO notification_count FROM notification_configs;
    SELECT COUNT(*) INTO database_count FROM database_configs;
    
    SELECT COUNT(*) INTO null_storage_count FROM storage_configs WHERE user_id IS NULL;
    SELECT COUNT(*) INTO null_notification_count FROM notification_configs WHERE user_id IS NULL;
    SELECT COUNT(*) INTO null_database_count FROM database_configs WHERE user_id IS NULL;
    
    SELECT COUNT(*) INTO admin_count FROM users WHERE is_admin = TRUE;
    
    -- Warn but don't fail if there are NULL user_ids (might be expected if no users exist)
    IF null_storage_count > 0 OR null_notification_count > 0 OR null_database_count > 0 THEN
        RAISE WARNING 'Some records have NULL user_id. storage: %, notification: %, database: %. This is expected if no non-demo users exist.', 
            null_storage_count, null_notification_count, null_database_count;
    ELSE
        RAISE NOTICE 'All records have been assigned to a user.';
    END IF;
    
    RAISE NOTICE 'Migration completed. Totals: % storage configs, % notification configs, % database configs, % admin users',
        storage_count, notification_count, database_count, admin_count;
END $$;

-- Done!
-- The application's GORM auto-migration will handle any additional schema changes.
