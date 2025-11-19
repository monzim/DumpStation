package backup

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/storage"
)

// Service handles backup operations
type Service struct {
	repo           *repository.Repository
	versionManager *VersionManager
}

// NewService creates a new backup service
func NewService(repo *repository.Repository) *Service {
	return &Service{
		repo:           repo,
		versionManager: NewVersionManager(),
	}
}

// ExecuteBackup performs a database backup
func (s *Service) ExecuteBackup(dbConfig *models.DatabaseConfig) error {
	return s.ExecuteBackupWithID(dbConfig, uuid.Nil)
}

// ExecuteBackupWithID performs a database backup with an optional existing backup ID
func (s *Service) ExecuteBackupWithID(dbConfig *models.DatabaseConfig, backupID uuid.UUID) error {
	// Check if config is paused
	if dbConfig.Paused {
		log.Printf("Skipping backup for paused database: %s", dbConfig.Name)
		return nil
	}

	var backup *models.Backup
	var err error

	// If backupID is provided (from manual trigger), use it; otherwise create a new one
	if backupID != uuid.Nil {
		backup, err = s.repo.GetBackup(backupID)
		if err != nil || backup == nil {
			return fmt.Errorf("failed to get existing backup record: %w", err)
		}
	} else {
		// Create backup record for scheduled backups
		backup, err = s.repo.CreateBackup(dbConfig.ID, models.BackupStatusPending)
		if err != nil {
			return fmt.Errorf("failed to create backup record: %w", err)
		}
	}

	// Update to running
	err = s.repo.UpdateBackupStatus(backup.ID, models.BackupStatusRunning, nil, "", nil)
	if err != nil {
		log.Printf("Failed to update backup status to running: %v", err)
	}

	// Get storage config
	storageConfig, err := s.repo.GetStorageConfig(dbConfig.StorageID)
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to get storage config: %v", err))
	}

	// Get notification config
	var notifier *notification.DiscordNotifier
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			notifier = notification.NewDiscordNotifier(notifConfig.DiscordWebhookURL, "")
		}
	}

	// Detect PostgreSQL version if not set or needs refresh
	postgresVersion := dbConfig.PostgresVersion
	if postgresVersion == "" || postgresVersion == "latest" || (dbConfig.VersionLastChecked != nil && time.Since(*dbConfig.VersionLastChecked) > 24*time.Hour) {
		detectedVersion, err := s.versionManager.DetectPostgresVersion(dbConfig)
		if err != nil {
			log.Printf("Warning: Failed to detect PostgreSQL version for %s: %v. Using 'latest'", dbConfig.Name, err)
			postgresVersion = "latest"
		} else {
			postgresVersion = detectedVersion
		}
	}

	log.Printf("Using PostgreSQL version: %s for database %s", postgresVersion, dbConfig.Name)

	// Perform backup
	startTime := time.Now()
	timestamp := startTime.Format("20060102_150405")
	backupFilename := fmt.Sprintf("%s_%s.sql", dbConfig.DBName, timestamp)
	tempFilePath := filepath.Join(os.TempDir(), backupFilename)

	log.Printf("Starting backup for database: %s (PostgreSQL %s)", dbConfig.Name, postgresVersion)

	// Create pg_dump command with version-specific settings
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	pgDumpCmd := s.versionManager.GetPgDumpVersion(postgresVersion)

	// Verify pg_dump version compatibility
	pgDumpVersionInfo, err := s.versionManager.GetPgDumpVersionInfo(pgDumpCmd)
	if err != nil {
		log.Printf("Warning: Could not verify pg_dump version: %v", err)
	} else {
		log.Printf("Using pg_dump: %s", pgDumpVersionInfo)
		pgDumpMajor := s.versionManager.ParseMajorVersion(pgDumpVersionInfo)
		if !s.versionManager.IsCompatibleVersion(pgDumpMajor, postgresVersion) {
			log.Printf("Warning: pg_dump version %s may not be compatible with PostgreSQL %s. Attempting anyway.", pgDumpMajor, postgresVersion)
		}
	}

	dumpFormat := s.versionManager.GetDumpFormatForVersion(postgresVersion)
	compressionLevel := s.versionManager.GetDumpCompressionLevel(postgresVersion)

	args := []string{
		"--host", dbConfig.Host,
		"--port", fmt.Sprintf("%d", dbConfig.Port),
		"--username", dbConfig.Username,
		"--dbname", dbConfig.DBName,
		"--no-password",
		"--verbose",
	}

	// Add format-specific arguments
	if dumpFormat == "custom" {
		args = append(args, "-Fc", "-Z", compressionLevel) // Custom format with compression
		backupFilename = fmt.Sprintf("%s_%s.dump", dbConfig.Name, timestamp)
		tempFilePath = filepath.Join(os.TempDir(), backupFilename)
	} else {
		args = append(args, "--format=plain")
	}

	cmd := exec.CommandContext(ctx, pgDumpCmd, args...)
	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+dbConfig.Password,
		"PGSSLMODE=require",
	)

	// Create output file
	outFile, err := os.Create(tempFilePath)
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to create temp file: %v", err))
	}
	defer outFile.Close()
	defer os.Remove(tempFilePath)

	cmd.Stdout = outFile

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	// Execute backup
	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return s.handleBackupError(backup.ID, dbConfig, "pg_dump timed out after 30 minutes")
		}
		errMsg := fmt.Sprintf("pg_dump failed: %v, stderr: %s", err, stderr.String())
		return s.handleBackupError(backup.ID, dbConfig, errMsg)
	}

	// Get file size
	fileInfo, err := outFile.Stat()
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to get file info: %v", err))
	}

	sizeBytes := fileInfo.Size()

	// Upload to storage
	storageClient, err := storage.NewStorageClient(storageConfig)
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to create storage client: %v", err))
	}

	objectKey := storage.GetObjectKey(dbConfig.ID.String(), backupFilename)
	metadata := map[string]string{
		"database":         dbConfig.Name,
		"database-id":      dbConfig.ID.String(),
		"timestamp":        timestamp,
		"backup-by":        "postgres-backup-service",
		"postgres-version": postgresVersion,
		"dump-format":      dumpFormat,
	}

	if err := storageClient.UploadFile(tempFilePath, objectKey, metadata); err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to upload to storage: %v", err))
	}

	// Update backup record as success
	err = s.repo.UpdateBackupStatus(backup.ID, models.BackupStatusSuccess, &sizeBytes, objectKey, nil)
	if err != nil {
		log.Printf("Failed to update backup status to success: %v", err)
	}

	duration := time.Since(startTime)
	log.Printf("Backup completed for %s in %v. File size: %d bytes (format: %s)", dbConfig.Name, duration, sizeBytes, dumpFormat)

	// Send success notification
	if notifier != nil {
		notifier.SendBackupSuccess(dbConfig.Name, sizeBytes, duration.Round(time.Second).String())
	}

	// Cleanup old backups
	go s.cleanupOldBackups(dbConfig, storageClient)

	return nil
}

// handleBackupError handles backup errors
func (s *Service) handleBackupError(backupID uuid.UUID, dbConfig *models.DatabaseConfig, errorMsg string) error {
	log.Printf("Backup error for %s: %s", dbConfig.Name, errorMsg)

	err := s.repo.UpdateBackupStatus(backupID, models.BackupStatusFailed, nil, "", &errorMsg)
	if err != nil {
		log.Printf("Failed to update backup status to failed: %v", err)
	}

	// Send failure notification
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			notifier := notification.NewDiscordNotifier(notifConfig.DiscordWebhookURL, "")
			notifier.SendBackupFailure(dbConfig.Name, errorMsg)
		}
	}

	return fmt.Errorf("%s", errorMsg)
}

// cleanupOldBackups removes old backups based on retention policy
func (s *Service) cleanupOldBackups(dbConfig *models.DatabaseConfig, storageClient *storage.StorageClient) {
	// Skip cleanup if paused
	if dbConfig.Paused {
		log.Printf("Skipping cleanup for paused database: %s", dbConfig.Name)
		return
	}

	log.Printf("Starting cleanup for database: %s", dbConfig.Name)

	// Get all backups for this database
	backups, err := s.repo.ListBackupsByDatabase(dbConfig.ID)
	if err != nil {
		log.Printf("Failed to list backups for cleanup: %v", err)
		return
	}

	// Filter successful backups only
	var successBackups []*models.Backup
	for _, b := range backups {
		if b.Status == models.BackupStatusSuccess {
			successBackups = append(successBackups, b)
		}
	}

	var toDelete []*models.Backup

	if dbConfig.RotationPolicyType == models.RotationPolicyDays {
		// Delete backups older than N days
		cutoffTime := time.Now().AddDate(0, 0, -dbConfig.RotationPolicyValue)
		for _, b := range successBackups {
			if b.StartedAt.Before(cutoffTime) {
				toDelete = append(toDelete, b)
			}
		}
	} else if dbConfig.RotationPolicyType == models.RotationPolicyCount {
		// Keep only the last N backups
		if len(successBackups) > dbConfig.RotationPolicyValue {
			toDelete = successBackups[dbConfig.RotationPolicyValue:]
		}
	}

	// Delete old backups
	for _, b := range toDelete {
		if b.StoragePath != "" {
			if err := storageClient.DeleteFile(b.StoragePath); err != nil {
				log.Printf("Failed to delete backup from storage %s: %v", b.StoragePath, err)
			} else {
				log.Printf("Deleted old backup: %s", b.StoragePath)
			}
		}
	}

	if len(toDelete) > 0 {
		log.Printf("Cleanup completed for %s: deleted %d old backups", dbConfig.Name, len(toDelete))
	}
}

// ExecuteRestore performs a database restore
func (s *Service) ExecuteRestore(backupID uuid.UUID, req *models.RestoreRequest) error {
	// Get backup info
	backup, err := s.repo.GetBackup(backupID)
	if err != nil {
		return fmt.Errorf("failed to get backup: %w", err)
	}
	if backup == nil {
		return fmt.Errorf("backup not found")
	}

	// Get database config
	dbConfig, err := s.repo.GetDatabaseConfig(backup.DatabaseID)
	if err != nil {
		return fmt.Errorf("failed to get database config: %w", err)
	}

	// Create restore job
	job, err := s.repo.CreateRestoreJob(backupID, req)
	if err != nil {
		return fmt.Errorf("failed to create restore job: %w", err)
	}

	// Determine target
	targetHost := dbConfig.Host
	targetPort := dbConfig.Port
	targetDBName := dbConfig.DBName
	targetUser := dbConfig.Username
	targetPassword := dbConfig.Password

	if req != nil {
		if req.TargetHost != "" {
			targetHost = req.TargetHost
		}
		if req.TargetPort != 0 {
			targetPort = req.TargetPort
		}
		if req.TargetDBName != "" {
			targetDBName = req.TargetDBName
		}
		if req.TargetUser != "" {
			targetUser = req.TargetUser
		}
		if req.TargetPassword != "" {
			targetPassword = req.TargetPassword
		}
	}

	// Get storage config
	storageConfig, err := s.repo.GetStorageConfig(dbConfig.StorageID)
	if err != nil {
		return fmt.Errorf("failed to get storage config: %w", err)
	}

	// Download backup file
	storageClient, err := storage.NewStorageClient(storageConfig)
	if err != nil {
		return fmt.Errorf("failed to create storage client: %w", err)
	}

	tempFilePath := filepath.Join(os.TempDir(), fmt.Sprintf("restore_%s.sql", job.ID))
	defer os.Remove(tempFilePath)

	log.Printf("Downloading backup file: %s", backup.StoragePath)
	if err := storageClient.DownloadFile(backup.StoragePath, tempFilePath); err != nil {
		return fmt.Errorf("failed to download backup: %w", err)
	}

	// Execute restore
	log.Printf("Restoring to database: %s@%s:%d/%s", targetUser, targetHost, targetPort, targetDBName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	// Use version-specific psql for restore
	postgresVersion := dbConfig.PostgresVersion
	if postgresVersion == "" {
		postgresVersion = "latest"
	}
	psqlCmd := s.versionManager.GetPsqlVersion(postgresVersion)

	cmd := exec.CommandContext(ctx, psqlCmd,
		"--host", targetHost,
		"--port", fmt.Sprintf("%d", targetPort),
		"--username", targetUser,
		"--dbname", targetDBName,
		"--no-password",
		"--file", tempFilePath,
	)

	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+targetPassword,
		"PGSSLMODE=require",
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := fmt.Sprintf("psql failed: %v, stderr: %s", err, stderr.String())
		log.Printf("Restore error: %s", errMsg)
		return fmt.Errorf("%s", errMsg)
	}

	log.Printf("Restore completed successfully for backup %s", backupID)

	// Send success notification
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			notifier := notification.NewDiscordNotifier(notifConfig.DiscordWebhookURL, "")
			targetDesc := fmt.Sprintf("%s@%s/%s", targetUser, targetHost, targetDBName)
			notifier.SendRestoreSuccess(dbConfig.Name, targetDesc)
		}
	}

	return nil
}
