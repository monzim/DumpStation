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
	)

	if err != nil {
		return fmt.Errorf("failed to run auto-migration: %w", err)
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
