package database

import (
	"fmt"
	"log"

	"github.com/monzim/db_proxy/v1/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB wraps the GORM database connection
type DB struct {
	*gorm.DB
}

// New creates a new GORM database connection
func New(dsn string) (*DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent), // Silent in production, change to logger.Info for debugging
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Get underlying SQL DB for connection pool settings
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying SQL DB: %w", err)
	}

	// Set connection pool settings
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	// Test connection
	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{db}, nil
}

// AutoMigrate runs GORM auto-migration for all models
func (db *DB) AutoMigrate() error {
	log.Println("Running GORM auto-migration...")

	err := db.DB.AutoMigrate(
		&models.User{},
		&models.OTPToken{},
		&models.StorageConfig{},
		&models.NotificationConfig{},
		&models.DatabaseConfig{},
		&models.Backup{},
		&models.RestoreJob{},
		&models.ActivityLog{},
		&models.Label{},
		&models.DatabaseLabel{},
		&models.StorageLabel{},
		&models.NotificationLabel{},
		&models.ServerConnection{},
	)

	if err != nil {
		return fmt.Errorf("failed to run auto-migration: %w", err)
	}

	// GORM AutoMigrate adds columns but never relaxes existing constraints.
	// The legacy schema marked users.discord_user_id as NOT NULL, which
	// prevents GitHub-only signups from succeeding. Drop the constraint
	// idempotently so both auth flows can coexist.
	if err := db.DB.Exec(`ALTER TABLE users ALTER COLUMN discord_user_id DROP NOT NULL`).Error; err != nil {
		log.Printf("warning: could not drop NOT NULL on users.discord_user_id (likely already nullable): %v", err)
	}

	// Some AutoMigrate paths abort silently when a new column would be
	// added together with a UNIQUE constraint on a table whose existing
	// rows would all collide on the column's zero value. Add the columns
	// explicitly and idempotently here so an upgraded deployment with a
	// populated users / notification_configs / otp_tokens table picks up
	// the new fields without operator intervention.
	manualColumns := []struct {
		stmt string
		hint string
	}{
		{`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_login varchar(255)`, "users.github_login"},
		{`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_user_id bigint`, "users.github_user_id"},
		{`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url varchar(500)`, "users.avatar_url"},
		{`ALTER TABLE notification_configs ADD COLUMN IF NOT EXISTS telegram_bot_token text`, "notification_configs.telegram_bot_token"},
		{`ALTER TABLE notification_configs ADD COLUMN IF NOT EXISTS telegram_chat_id varchar(64)`, "notification_configs.telegram_chat_id"},
		{`ALTER TABLE notification_configs ALTER COLUMN discord_webhook_url DROP NOT NULL`, "notification_configs.discord_webhook_url DROP NOT NULL"},
		{`ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS purpose varchar(32) NOT NULL DEFAULT 'login'`, "otp_tokens.purpose"},
		{`ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS entity_id uuid`, "otp_tokens.entity_id"},
	}
	for _, m := range manualColumns {
		if err := db.DB.Exec(m.stmt).Error; err != nil {
			log.Printf("warning: schema patch for %s failed (likely already applied): %v", m.hint, err)
		}
	}

	log.Println("Auto-migration completed successfully")
	return nil
}

// Close closes the database connection
func (db *DB) Close() error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
