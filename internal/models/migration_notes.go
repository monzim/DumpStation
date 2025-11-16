package models

// PostgreSQL Version Migration Notes
//
// This file documents the database migration for PostgreSQL version tracking.
//
// Migration File: migrations/002_add_postgres_version_tracking.sql
//
// Changes:
// - Adds postgres_version VARCHAR(20) column to database_configs
// - Adds version_last_checked TIMESTAMP column to database_configs
// - Creates index for efficient version refresh queries
//
// Purpose:
// - Store detected PostgreSQL version for each database configuration
// - Track when version was last detected (for 24h cache refresh)
// - Improve backup process efficiency and compatibility
//
// Usage in Code:
//   // Create DatabaseConfig
//   config := &DatabaseConfig{
//       Name: "production_db",
//       PostgresVersion: "14",        // New field
//       VersionLastChecked: &now,     // New field
//   }
//
//   // GORM auto-migration will apply this automatically
//   db.AutoMigrate(&DatabaseConfig{})
//
// Version Strategy:
// - "latest" (default): System will auto-detect on first backup
// - "12", "13", "14", "15", "16": Specific version
// - Auto-refresh: If version_last_checked is > 24h old, re-detect
//
// Version Detection Triggers:
// 1. First backup: postgres_version is empty
// 2. Auto-refresh: version_last_checked > 24 hours ago
// 3. Manual: Explicitly set postgres_version to empty
//
// Database Schema Before Migration:
// CREATE TABLE database_configs (
//     id uuid PRIMARY KEY,
//     name varchar(255) NOT NULL,
//     host varchar(255) NOT NULL,
//     port int NOT NULL DEFAULT 5432,
//     dbname varchar(255) NOT NULL,
//     username varchar(255) NOT NULL,
//     password text NOT NULL,
//     schedule varchar(100) NOT NULL,
//     storage_id uuid NOT NULL,
//     notification_id uuid,
//     rotation_policy_type varchar(20),
//     rotation_policy_value int,
//     enabled boolean DEFAULT true,
//     created_at timestamp DEFAULT now(),
//     updated_at timestamp DEFAULT now()
// );
//
// Database Schema After Migration:
// CREATE TABLE database_configs (
//     id uuid PRIMARY KEY,
//     name varchar(255) NOT NULL,
//     host varchar(255) NOT NULL,
//     port int NOT NULL DEFAULT 5432,
//     dbname varchar(255) NOT NULL,
//     username varchar(255) NOT NULL,
//     password text NOT NULL,
//     schedule varchar(100) NOT NULL,
//     storage_id uuid NOT NULL,
//     notification_id uuid,
//     rotation_policy_type varchar(20),
//     rotation_policy_value int,
//     postgres_version varchar(20) DEFAULT 'latest',        ← NEW
//     version_last_checked timestamp,                       ← NEW
//     enabled boolean DEFAULT true,
//     created_at timestamp DEFAULT now(),
//     updated_at timestamp DEFAULT now()
// );
//
// Indexes Added:
// - idx_database_configs_version_check (postgres_version, version_last_checked)
//   Purpose: Fast lookup for databases needing version refresh
//
// Backward Compatibility:
// - New columns are nullable/optional
// - Existing backups continue to work
// - Default value "latest" triggers auto-detection
// - Migration is non-destructive (no data loss)
//
// Rollback (if needed):
// ALTER TABLE database_configs DROP COLUMN postgres_version;
// ALTER TABLE database_configs DROP COLUMN version_last_checked;
//
// Performance Notes:
// - Migration is fast (just adds columns, no data transformation)
// - Index helps with queries filtering databases by version
// - No downtime required for migration
// - Existing data remains untouched
