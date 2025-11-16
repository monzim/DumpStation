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
	repo *repository.Repository
}

// NewService creates a new backup service
func NewService(repo *repository.Repository) *Service {
	return &Service{
		repo: repo,
	}
}

// ExecuteBackup performs a database backup
func (s *Service) ExecuteBackup(dbConfig *models.DatabaseConfig) error {
	// Create backup record
	backup, err := s.repo.CreateBackup(dbConfig.ID, models.BackupStatusPending)
	if err != nil {
		return fmt.Errorf("failed to create backup record: %w", err)
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

	// Perform backup
	startTime := time.Now()
	timestamp := startTime.Format("20060102_150405")
	backupFilename := fmt.Sprintf("%s_%s.sql", dbConfig.Name, timestamp)
	tempFilePath := filepath.Join(os.TempDir(), backupFilename)

	log.Printf("Starting backup for database: %s", dbConfig.Name)

	// Create pg_dump command
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	args := []string{
		"--host", dbConfig.Host,
		"--port", fmt.Sprintf("%d", dbConfig.Port),
		"--username", dbConfig.Username,
		"--dbname", dbConfig.DBName,
		"--no-password",
		"--verbose",
		"--format=plain",
	}

	cmd := exec.CommandContext(ctx, "pg_dump", args...)
	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+dbConfig.Password,
		"PGSSLMODE=disable",
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
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("pg_dump failed: %v, stderr: %s", err, stderr.String()))
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

	objectKey := storage.GetObjectKey(dbConfig.Name, backupFilename)
	metadata := map[string]string{
		"database":  dbConfig.Name,
		"timestamp": timestamp,
		"backup-by": "postgres-backup-service",
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
	log.Printf("Backup completed for %s in %v. File size: %d bytes", dbConfig.Name, duration, sizeBytes)

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

	return fmt.Errorf(errorMsg)
}

// cleanupOldBackups removes old backups based on retention policy
func (s *Service) cleanupOldBackups(dbConfig *models.DatabaseConfig, storageClient *storage.StorageClient) {
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

	cmd := exec.CommandContext(ctx, "psql",
		"--host", targetHost,
		"--port", fmt.Sprintf("%d", targetPort),
		"--username", targetUser,
		"--dbname", targetDBName,
		"--no-password",
		"--file", tempFilePath,
	)

	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+targetPassword,
		"PGSSLMODE=disable",
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := fmt.Sprintf("psql failed: %v, stderr: %s", err, stderr.String())
		log.Printf("Restore error: %s", errMsg)
		return fmt.Errorf(errMsg)
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
