package database

import (
	"log"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
)

const (
	DemoUsername = "demo"
	DemoEmail    = "demo@dumpstation.monzim.com"
)

// SeedDemoData seeds demo data for the demo account
func SeedDemoData(repo *repository.Repository) error {
	log.Println("[DEMO] 🔧 Seeding demo data...")

	// Create or get demo user
	demoUser, err := repo.SeedDemoUser(DemoUsername, DemoEmail)
	if err != nil {
		return err
	}

	log.Printf("[DEMO] ✅ Demo user ready: %s (%s)", demoUser.DiscordUsername, demoUser.Email)

	// Check if demo data already exists (by checking storage configs)
	storageConfigs, err := repo.ListStorageConfigsByUser(demoUser.ID, false)
	if err != nil {
		return err
	}

	// If demo storage configs already exist, skip seeding
	for _, sc := range storageConfigs {
		if sc.Name == "Demo S3 Bucket" || sc.Name == "Demo R2 Storage" {
			log.Println("[DEMO] ✅ Demo data already exists, skipping seed")
			return nil
		}
	}

	// Seed storage configurations
	storages, err := seedDemoStorages(repo, demoUser.ID)
	if err != nil {
		log.Printf("[DEMO] ⚠️  Failed to seed storage configs: %v", err)
	} else {
		log.Printf("[DEMO] ✅ Created %d demo storage configurations", len(storages))
	}

	// Seed notification configurations
	notifications, err := seedDemoNotifications(repo, demoUser.ID)
	if err != nil {
		log.Printf("[DEMO] ⚠️  Failed to seed notification configs: %v", err)
	} else {
		log.Printf("[DEMO] ✅ Created %d demo notification configurations", len(notifications))
	}

	// Seed database configurations (need storage IDs)
	if len(storages) > 0 {
		var notificationID *uuid.UUID
		if len(notifications) > 0 {
			notificationID = &notifications[0].ID
		}

		databases, err := seedDemoDatabases(repo, demoUser.ID, storages[0].ID, notificationID)
		if err != nil {
			log.Printf("[DEMO] ⚠️  Failed to seed database configs: %v", err)
		} else {
			log.Printf("[DEMO] ✅ Created %d demo database configurations", len(databases))

			// Seed backup history for each database
			for _, db := range databases {
				err := seedDemoBackups(repo, db.ID)
				if err != nil {
					log.Printf("[DEMO] ⚠️  Failed to seed backups for %s: %v", db.Name, err)
				}
			}
			log.Println("[DEMO] ✅ Created demo backup history")
		}
	}

	// Seed activity logs
	err = seedDemoActivityLogs(repo, demoUser.ID)
	if err != nil {
		log.Printf("[DEMO] ⚠️  Failed to seed activity logs: %v", err)
	} else {
		log.Println("[DEMO] ✅ Created demo activity logs")
	}

	log.Println("[DEMO] ✅ Demo data seeding completed")
	return nil
}

func seedDemoStorages(repo *repository.Repository, userID uuid.UUID) ([]*models.StorageConfig, error) {
	storages := []*models.StorageConfigInput{
		{
			Name:      "Demo S3 Bucket",
			Provider:  models.StorageProviderS3,
			Bucket:    "demo-backup-bucket",
			Region:    "us-east-1",
			Endpoint:  "https://s3.us-east-1.amazonaws.com",
			AccessKey: "DEMO_ACCESS_KEY_12345",
			SecretKey: "demo_secret_key_placeholder",
		},
		{
			Name:      "Demo R2 Storage",
			Provider:  models.StorageProviderR2,
			Bucket:    "demo-r2-backups",
			Region:    "auto",
			Endpoint:  "https://demo-account.r2.cloudflarestorage.com",
			AccessKey: "DEMO_R2_ACCESS_KEY",
			SecretKey: "demo_r2_secret_key_placeholder",
		},
	}

	var created []*models.StorageConfig
	for _, input := range storages {
		config, err := repo.CreateStorageConfig(userID, input)
		if err != nil {
			return created, err
		}
		created = append(created, config)
	}

	return created, nil
}

func seedDemoNotifications(repo *repository.Repository, userID uuid.UUID) ([]*models.NotificationConfig, error) {
	notifications := []*models.NotificationConfigInput{
		{
			Name:              "Demo Discord Alerts",
			DiscordWebhookURL: "https://discord.com/api/webhooks/demo/placeholder",
		},
	}

	var created []*models.NotificationConfig
	for _, input := range notifications {
		config, err := repo.CreateNotificationConfig(userID, input)
		if err != nil {
			return created, err
		}
		created = append(created, config)
	}

	return created, nil
}

func seedDemoDatabases(repo *repository.Repository, userID uuid.UUID, storageID uuid.UUID, notificationID *uuid.UUID) ([]*models.DatabaseConfig, error) {
	databases := []*models.DatabaseConfigInput{
		{
			Name:            "Production Database",
			Host:            "prod-db.example.com",
			Port:            5432,
			DBName:          "production",
			Username:        "backup_user",
			Password:        "demo_password_placeholder",
			Schedule:        "0 2 * * *", // Daily at 2 AM
			StorageID:       storageID,
			NotificationID:  notificationID,
			PostgresVersion: "15",
			RotationPolicy: models.RotationPolicy{
				Type:  models.RotationPolicyDays,
				Value: 30,
			},
		},
		{
			Name:            "Staging Database",
			Host:            "staging-db.example.com",
			Port:            5432,
			DBName:          "staging",
			Username:        "backup_user",
			Password:        "demo_password_placeholder",
			Schedule:        "0 4 * * *", // Daily at 4 AM
			StorageID:       storageID,
			NotificationID:  notificationID,
			PostgresVersion: "15",
			RotationPolicy: models.RotationPolicy{
				Type:  models.RotationPolicyCount,
				Value: 7,
			},
		},
		{
			Name:            "Development Database",
			Host:            "dev-db.example.com",
			Port:            5432,
			DBName:          "development",
			Username:        "dev_backup",
			Password:        "demo_password_placeholder",
			Schedule:        "0 6 * * 1", // Weekly on Monday at 6 AM
			StorageID:       storageID,
			NotificationID:  nil, // No notifications for dev
			PostgresVersion: "14",
			RotationPolicy: models.RotationPolicy{
				Type:  models.RotationPolicyCount,
				Value: 3,
			},
		},
	}

	var created []*models.DatabaseConfig
	for _, input := range databases {
		config, err := repo.CreateDatabaseConfig(userID, input)
		if err != nil {
			return created, err
		}
		created = append(created, config)
	}

	return created, nil
}

func seedDemoBackups(repo *repository.Repository, databaseID uuid.UUID) error {
	// Create a mix of successful and failed backups over the past 14 days
	now := time.Now()

	backups := []struct {
		daysAgo int
		status  models.BackupStatus
		size    int64
	}{
		{0, models.BackupStatusSuccess, 524288000},  // 500MB
		{1, models.BackupStatusSuccess, 523456000},  // ~499MB
		{2, models.BackupStatusSuccess, 525120000},  // ~501MB
		{3, models.BackupStatusFailed, 0},           // Failed
		{4, models.BackupStatusSuccess, 522789000},  // ~498MB
		{5, models.BackupStatusSuccess, 526543000},  // ~502MB
		{6, models.BackupStatusSuccess, 524000000},  // 500MB
		{7, models.BackupStatusSuccess, 521234000},  // ~497MB
		{8, models.BackupStatusFailed, 0},           // Failed
		{9, models.BackupStatusSuccess, 527890000},  // ~503MB
		{10, models.BackupStatusSuccess, 523000000}, // ~499MB
		{11, models.BackupStatusSuccess, 525678000}, // ~501MB
		{12, models.BackupStatusSuccess, 524321000}, // ~500MB
		{13, models.BackupStatusSuccess, 522000000}, // ~498MB
	}

	for _, b := range backups {
		timestamp := now.Add(-time.Duration(b.daysAgo) * 24 * time.Hour)
		timestamp = timestamp.Add(-time.Duration(rand.Intn(4)) * time.Hour) // Add some randomness

		backup, err := repo.CreateBackup(databaseID, models.BackupStatusPending)
		if err != nil {
			return err
		}

		var errMsg *string
		storagePath := ""
		var sizeBytes *int64

		if b.status == models.BackupStatusSuccess {
			storagePath = "backups/" + backup.Name + ".sql.gz"
			sizeBytes = &b.size
		} else {
			msg := "Connection timeout: unable to connect to database server"
			errMsg = &msg
		}

		err = repo.UpdateBackupStatus(backup.ID, b.status, sizeBytes, storagePath, errMsg)
		if err != nil {
			return err
		}
	}

	return nil
}

func seedDemoActivityLogs(repo *repository.Repository, userID uuid.UUID) error {
	now := time.Now()

	logs := []struct {
		hoursAgo    int
		action      models.ActivityLogAction
		level       models.ActivityLogLevel
		description string
	}{
		{1, models.ActionBackupCompleted, models.LogLevelSuccess, "Backup completed for Production Database"},
		{2, models.ActionLogin, models.LogLevelSuccess, "Demo user logged in"},
		{5, models.ActionBackupStarted, models.LogLevelInfo, "Backup started for Production Database"},
		{24, models.ActionBackupCompleted, models.LogLevelSuccess, "Backup completed for Staging Database"},
		{25, models.ActionBackupCompleted, models.LogLevelSuccess, "Backup completed for Production Database"},
		{48, models.ActionBackupFailed, models.LogLevelError, "Backup failed for Development Database: Connection timeout"},
		{72, models.ActionDatabaseCreated, models.LogLevelSuccess, "Database configuration 'Production Database' created"},
		{73, models.ActionStorageCreated, models.LogLevelSuccess, "Storage configuration 'Demo S3 Bucket' created"},
		{96, models.ActionSystemStartup, models.LogLevelInfo, "PostgreSQL Backup Service started successfully"},
	}

	for _, l := range logs {
		timestamp := now.Add(-time.Duration(l.hoursAgo) * time.Hour)

		log := &models.ActivityLog{
			UserID:      &userID,
			Action:      l.action,
			Level:       l.level,
			Description: l.description,
			Metadata:    `{"demo": true}`,
			IPAddress:   "demo",
			CreatedAt:   timestamp,
		}

		err := repo.CreateActivityLog(log)
		if err != nil {
			return err
		}
	}

	return nil
}
