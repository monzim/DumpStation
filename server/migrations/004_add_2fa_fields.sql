-- Migration: Add Two-Factor Authentication (2FA/TOTP) fields to users table
-- This migration adds support for TOTP-based 2FA using authenticator apps (Google Authenticator, Authy, etc.)

-- Add 2FA fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient 2FA enabled user lookups
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled);

-- Add comment for documentation
COMMENT ON COLUMN users.two_factor_secret IS 'Encrypted TOTP secret for authenticator apps';
COMMENT ON COLUMN users.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN users.two_factor_backup_codes IS 'Hashed backup recovery codes for 2FA';
COMMENT ON COLUMN users.two_factor_verified_at IS 'Timestamp when 2FA was last verified during setup';
