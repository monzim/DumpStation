-- Add PostgreSQL version tracking to database_configs table
ALTER TABLE database_configs
ADD COLUMN IF NOT EXISTS postgres_version VARCHAR(20) DEFAULT 'latest',
ADD COLUMN IF NOT EXISTS version_last_checked TIMESTAMP;

-- Create index for version checking
CREATE INDEX IF NOT EXISTS idx_database_configs_version_check ON database_configs (postgres_version, version_last_checked);

-- Add comment to document the purpose
COMMENT ON COLUMN database_configs.postgres_version IS 'PostgreSQL major version detected for this database (e.g., "14", "15"). Set to "latest" for version-agnostic dumps.';

COMMENT ON COLUMN database_configs.version_last_checked IS 'Timestamp when PostgreSQL version was last detected. Used to refresh version info after 24 hours.';