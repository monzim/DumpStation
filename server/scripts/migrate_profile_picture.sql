-- Migration: Add profile picture columns to users table
-- Date: 2025-12-05
-- Description: Adds support for user profile pictures stored as binary data in PostgreSQL
-- Drop the old profile_picture_url column if it exists
ALTER TABLE users
DROP COLUMN IF EXISTS profile_picture_url;

-- Add profile_picture_data column to store image as bytea
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture_data BYTEA;

-- Add profile_picture_mime_type column to store the MIME type
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture_mime_type VARCHAR(50) DEFAULT '';

-- Add comments for documentation
COMMENT ON COLUMN users.profile_picture_data IS 'Profile picture stored as binary data (bytea)';

COMMENT ON COLUMN users.profile_picture_mime_type IS 'MIME type of the profile picture (e.g., image/png, image/jpeg)';