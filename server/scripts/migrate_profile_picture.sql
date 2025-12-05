-- Migration: Add profile_picture_url column to users table
-- Date: 2025-12-05
-- Description: Adds support for user profile pictures
-- Add profile_picture_url column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT DEFAULT '';

-- Add comment for documentation
COMMENT ON COLUMN users.profile_picture_url IS 'URL to the user''s profile picture stored in S3/R2';