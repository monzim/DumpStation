-- Add paused field to database_configs table
ALTER TABLE database_configs
ADD COLUMN paused boolean DEFAULT false NOT NULL;

-- Add index for faster queries on paused status
CREATE INDEX idx_database_configs_paused ON database_configs (paused);