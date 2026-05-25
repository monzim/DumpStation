package backup

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

// truncateAndRewind clears any bytes already written to f and resets the
// file offset so subsequent writes start from byte zero. Used between
// fallback attempts that share the same destination file.
func truncateAndRewind(f *os.File) error {
	if err := f.Truncate(0); err != nil {
		return fmt.Errorf("truncate: %w", err)
	}
	if _, err := f.Seek(0, 0); err != nil {
		return fmt.Errorf("seek: %w", err)
	}
	return nil
}

// writePgPassFile writes a libpq passfile containing the credentials for the
// given DatabaseConfig and returns the path. The caller MUST defer cleanup
// to remove the file after the backup/restore command exits. We prefer this
// over PGPASSWORD because environment variables are visible system-wide via
// /proc/<pid>/environ and `ps -E` on some platforms.
//
// passfile format: hostname:port:database:username:password (one entry per
// line). The file MUST be mode 0600 or libpq refuses to use it.
func writePgPassFile(dbConfig *models.DatabaseConfig) (string, error) {
	f, err := os.CreateTemp("", "dumpstation-pgpass-*")
	if err != nil {
		return "", fmt.Errorf("create pgpass tempfile: %w", err)
	}
	defer f.Close()

	if err := f.Chmod(0o600); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("chmod pgpass: %w", err)
	}

	// libpq treats ':' and '\\' as field delimiters and requires escaping.
	escape := func(s string) string {
		s = strings.ReplaceAll(s, `\`, `\\`)
		return strings.ReplaceAll(s, `:`, `\:`)
	}

	line := fmt.Sprintf("%s:%d:%s:%s:%s\n",
		escape(dbConfig.Host),
		dbConfig.Port,
		escape(dbConfig.DBName),
		escape(dbConfig.Username),
		escape(dbConfig.Password),
	)

	if _, err := f.WriteString(line); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("write pgpass: %w", err)
	}

	return f.Name(), nil
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

	// Audit: backup started. Demo accounts are suppressed at the repo
	// layer, so it's safe to log unconditionally.
	bid := backup.ID
	_ = s.repo.LogActivity(
		&dbConfig.UserID,
		models.ActionBackupStarted,
		models.LogLevelInfo,
		"backup",
		&bid,
		dbConfig.Name,
		fmt.Sprintf("Backup started for database %q", dbConfig.Name),
		"",
		"",
	)

	// Get storage config
	storageConfig, err := s.repo.GetStorageConfig(dbConfig.StorageID)
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to get storage config: %v", err))
	}

	// Get notification config — may fan out to Discord, Telegram, or both
	// depending on which credentials the user has filled in.
	var notifier notification.Notifier
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			notifier = notification.NotifierFromConfig(notifConfig)
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

	// Add format-specific arguments. Storage object name embeds backup.ID
	// (UUID) so concurrent backups of the same database within the same
	// second cannot collide on the destination key.
	var backupFilename string
	if dumpFormat == "custom" {
		args = append(args, "-Fc", "-Z", compressionLevel)
		backupFilename = fmt.Sprintf("%s_%s_%s.dump", dbConfig.Name, timestamp, backup.ID.String())
	} else {
		args = append(args, "--format=plain")
		backupFilename = fmt.Sprintf("%s_%s_%s.sql", dbConfig.DBName, timestamp, backup.ID.String())
	}

	// Create local temp file via os.CreateTemp so concurrent backups never
	// share a path. Pattern reserves the filename for this process.
	outFile, err := os.CreateTemp("", "dumpstation-*.bak")
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("failed to create temp file: %v", err))
	}
	tempFilePath := outFile.Name()
	defer outFile.Close()
	defer os.Remove(tempFilePath)

	// Execute backup with SSL fallback
	sslMode, err := s.executeBackupWithSSLFallback(ctx, pgDumpCmd, args, dbConfig, outFile)
	if err != nil {
		return s.handleBackupError(backup.ID, dbConfig, fmt.Sprintf("pg_dump failed: %v", err))
	}

	log.Printf("Backup executed successfully with SSL mode: %s", sslMode)

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

	// Persist the dump format so the restore path can pick the right tool
	// (pg_restore for custom, psql for plain).
	if err := s.repo.SetBackupDumpFormat(backup.ID, models.DumpFormat(dumpFormat)); err != nil {
		log.Printf("Failed to persist dump format: %v", err)
	}

	duration := time.Since(startTime)
	log.Printf("Backup completed for %s in %v. File size: %d bytes (format: %s)", dbConfig.Name, duration, sizeBytes, dumpFormat)

	// Send success notification
	if notifier != nil {
		notifier.SendBackupSuccess(dbConfig.Name, sizeBytes, duration.Round(time.Second).String())
	}

	// Audit: backup completed.
	bidDone := backup.ID
	completedMeta := fmt.Sprintf(`{"size_bytes":%d,"duration":"%s"}`, sizeBytes, duration.Round(time.Second))
	_ = s.repo.LogActivity(
		&dbConfig.UserID,
		models.ActionBackupCompleted,
		models.LogLevelSuccess,
		"backup",
		&bidDone,
		dbConfig.Name,
		fmt.Sprintf("Backup completed for %q (%d bytes)", dbConfig.Name, sizeBytes),
		completedMeta,
		"",
	)

	// Cleanup old backups synchronously so failures are visible (logged) and
	// not swallowed by a background goroutine. A failed cleanup does NOT
	// fail the backup itself — the new backup is already uploaded and the
	// retention policy will catch up on the next run.
	if err := s.cleanupOldBackups(dbConfig, storageClient); err != nil {
		log.Printf("Cleanup failed for %s (backup itself succeeded): %v", dbConfig.Name, err)
	}

	return nil
}

// handleBackupError handles backup errors
func (s *Service) handleBackupError(backupID uuid.UUID, dbConfig *models.DatabaseConfig, errorMsg string) error {
	log.Printf("Backup error for %s: %s", dbConfig.Name, errorMsg)

	err := s.repo.UpdateBackupStatus(backupID, models.BackupStatusFailed, nil, "", &errorMsg)
	if err != nil {
		log.Printf("Failed to update backup status to failed: %v", err)
	}

	// Audit: backup failed. JSON-encode the error message so embedded quotes
	// don't break the JSONB column.
	bid := backupID
	metaBytes, _ := json.Marshal(map[string]string{"error": errorMsg})
	_ = s.repo.LogActivity(
		&dbConfig.UserID,
		models.ActionBackupFailed,
		models.LogLevelError,
		"backup",
		&bid,
		dbConfig.Name,
		fmt.Sprintf("Backup failed for %q", dbConfig.Name),
		string(metaBytes),
		"",
	)

	// Send failure notification across every configured channel.
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			notification.NotifierFromConfig(notifConfig).SendBackupFailure(dbConfig.Name, errorMsg)
		}
	}

	return fmt.Errorf("%s", errorMsg)
}

// executeBackupWithSSLFallback executes pg_dump with automatic SSL fallback
// Tries with SSL first, then without SSL if the first attempt fails with SSL-related errors
func (s *Service) executeBackupWithSSLFallback(ctx context.Context, pgDumpCmd string, args []string, dbConfig *models.DatabaseConfig, outFile *os.File) (SSLMode, error) {
	// Stage credentials in a 0600 passfile instead of PGPASSWORD env var so
	// other processes on the box cannot read the password through procfs.
	passfilePath, err := writePgPassFile(dbConfig)
	if err != nil {
		return SSLModeRequire, fmt.Errorf("prepare pgpass: %w", err)
	}
	defer os.Remove(passfilePath)

	// Try with SSL first
	sslMode := SSLModeRequire
	cmd := exec.CommandContext(ctx, pgDumpCmd, args...)
	cmd.Env = append(os.Environ(),
		"PGPASSFILE="+passfilePath,
		fmt.Sprintf("PGSSLMODE=%s", sslMode),
	)

	cmd.Stdout = outFile

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err == nil {
		// Success with SSL
		return sslMode, nil
	}

	stderrMsg := stderr.String()

	// Check if error is SSL-related
	isSSLError := false
	sslErrorPatterns := []string{
		"server does not support SSL",
		"SSL",
		"certificate",
		"sslmode",
	}

	lowerStderr := strings.ToLower(stderrMsg)
	for _, pattern := range sslErrorPatterns {
		if strings.Contains(lowerStderr, strings.ToLower(pattern)) {
			isSSLError = true
			break
		}
	}

	// If SSL error, try without SSL
	if isSSLError {
		log.Printf("SSL connection failed for %s, attempting without SSL: %s", dbConfig.Name, stderrMsg)

		// Wipe partial bytes left by the failed first attempt; otherwise the
		// second attempt would append, producing a corrupted dump.
		if err := truncateAndRewind(outFile); err != nil {
			return sslMode, fmt.Errorf("failed to reset backup file before retry: %w", err)
		}

		// Reset the stderr buffer for the second attempt
		var stderr2 bytes.Buffer

		// Try without SSL (reuse the same passfile)
		sslMode = SSLModeDisable
		cmd2 := exec.CommandContext(ctx, pgDumpCmd, args...)
		cmd2.Env = append(os.Environ(),
			"PGPASSFILE="+passfilePath,
			fmt.Sprintf("PGSSLMODE=%s", sslMode),
		)

		cmd2.Stdout = outFile
		cmd2.Stderr = &stderr2

		err2 := cmd2.Run()
		if err2 == nil {
			// Success without SSL - update cache
			log.Printf("Backup succeeded without SSL for database: %s", dbConfig.Name)
			s.versionManager.SetSSLMode(dbConfig.Host, dbConfig.Port, SSLModeDisable)
			return sslMode, nil
		}

		// Both attempts failed
		return sslMode, fmt.Errorf("pg_dump failed with both SSL and non-SSL modes. SSL error: %s, Non-SSL error: %s", stderrMsg, stderr2.String())
	}

	// Not an SSL error, just return the original error
	return sslMode, fmt.Errorf("pg_dump failed: %v, stderr: %s", err, stderrMsg)
}

// executeRestoreWithSSLFallback executes psql restore with automatic SSL fallback
func (s *Service) executeRestoreWithSSLFallback(ctx context.Context, psqlCmd string, args []string, targetDBConfig *models.DatabaseConfig) (SSLMode, error) {
	passfilePath, err := writePgPassFile(targetDBConfig)
	if err != nil {
		return SSLModeRequire, fmt.Errorf("prepare pgpass: %w", err)
	}
	defer os.Remove(passfilePath)

	// Try with SSL first
	sslMode := SSLModeRequire
	cmd := exec.CommandContext(ctx, psqlCmd, args...)
	cmd.Env = append(os.Environ(),
		"PGPASSFILE="+passfilePath,
		fmt.Sprintf("PGSSLMODE=%s", sslMode),
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err == nil {
		// Success with SSL
		return sslMode, nil
	}

	stderrMsg := stderr.String()

	// Check if error is SSL-related
	isSSLError := false
	sslErrorPatterns := []string{
		"server does not support SSL",
		"SSL",
		"certificate",
		"sslmode",
	}

	lowerStderr := strings.ToLower(stderrMsg)
	for _, pattern := range sslErrorPatterns {
		if strings.Contains(lowerStderr, strings.ToLower(pattern)) {
			isSSLError = true
			break
		}
	}

	// If SSL error, try without SSL
	if isSSLError {
		log.Printf("SSL connection failed for restore, attempting without SSL: %s", stderrMsg)

		// Reset the stderr buffer for the second attempt
		var stderr2 bytes.Buffer

		// Try without SSL (reuse the same passfile)
		sslMode = SSLModeDisable
		cmd2 := exec.CommandContext(ctx, psqlCmd, args...)
		cmd2.Env = append(os.Environ(),
			"PGPASSFILE="+passfilePath,
			fmt.Sprintf("PGSSLMODE=%s", sslMode),
		)

		cmd2.Stderr = &stderr2

		err2 := cmd2.Run()
		if err2 == nil {
			// Success without SSL - update cache
			log.Printf("Restore succeeded without SSL for database: %s", targetDBConfig.Name)
			s.versionManager.SetSSLMode(targetDBConfig.Host, targetDBConfig.Port, SSLModeDisable)
			return sslMode, nil
		}

		// Both attempts failed
		return sslMode, fmt.Errorf("psql failed with both SSL and non-SSL modes. SSL error: %s, Non-SSL error: %s", stderrMsg, stderr2.String())
	}

	// Not an SSL error, just return the original error
	return sslMode, fmt.Errorf("psql failed: %v, stderr: %s", err, stderrMsg)
}

// cleanupOldBackups removes old backups based on the retention policy.
// Returns an error summarising any failures so callers can log/alert; partial
// progress is preserved (successfully deleted backups stay deleted in the DB
// row even if a later one fails).
func (s *Service) cleanupOldBackups(dbConfig *models.DatabaseConfig, storageClient *storage.StorageClient) error {
	// Skip cleanup if paused
	if dbConfig.Paused {
		log.Printf("Skipping cleanup for paused database: %s", dbConfig.Name)
		return nil
	}

	log.Printf("Starting cleanup for database: %s", dbConfig.Name)

	// Get all backups for this database
	backups, err := s.repo.ListBackupsByDatabase(dbConfig.ID)
	if err != nil {
		return fmt.Errorf("list backups: %w", err)
	}

	// Filter successful backups only
	var successBackups []*models.Backup
	for _, b := range backups {
		if b.Status == models.BackupStatusSuccess {
			successBackups = append(successBackups, b)
		}
	}

	var toDelete []*models.Backup

	switch dbConfig.RotationPolicyType {
	case models.RotationPolicyDays:
		cutoffTime := time.Now().AddDate(0, 0, -dbConfig.RotationPolicyValue)
		for _, b := range successBackups {
			if b.StartedAt.Before(cutoffTime) {
				toDelete = append(toDelete, b)
			}
		}
	case models.RotationPolicyCount:
		if len(successBackups) > dbConfig.RotationPolicyValue {
			toDelete = successBackups[dbConfig.RotationPolicyValue:]
		}
	}

	var (
		deleted    int
		storageErr int
		dbErr      int
	)
	for _, b := range toDelete {
		if b.StoragePath == "" {
			continue
		}
		if err := storageClient.DeleteFile(b.StoragePath); err != nil {
			log.Printf("Failed to delete backup from storage %s: %v", b.StoragePath, err)
			storageErr++
			// Leave DB row intact so the next cleanup pass can retry.
			continue
		}
		// Storage delete succeeded: mark DB row so the UI stops listing it
		// as a restorable backup. Otherwise restore would try to download a
		// missing object and fail at the worst possible moment.
		if err := s.repo.MarkBackupDeleted(b.ID); err != nil {
			log.Printf("Failed to mark backup %s as deleted in DB: %v", b.ID, err)
			dbErr++
			continue
		}
		log.Printf("Deleted old backup: %s", b.StoragePath)
		deleted++
	}

	if len(toDelete) > 0 {
		log.Printf("Cleanup for %s: deleted=%d storage_failed=%d db_failed=%d", dbConfig.Name, deleted, storageErr, dbErr)
	}
	if storageErr > 0 || dbErr > 0 {
		return fmt.Errorf("partial cleanup failures: storage=%d db=%d", storageErr, dbErr)
	}
	return nil
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

	// Audit: restore started.
	bidRestore := backupID
	_ = s.repo.LogActivity(
		&dbConfig.UserID,
		models.ActionRestoreStarted,
		models.LogLevelInfo,
		"backup",
		&bidRestore,
		dbConfig.Name,
		fmt.Sprintf("Restore started for backup %q", dbConfig.Name),
		"",
		"",
	)

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

	// Use version-specific tooling for restore
	postgresVersion := dbConfig.PostgresVersion
	if postgresVersion == "" {
		postgresVersion = "latest"
	}

	// Pick the right tool based on the dump format we recorded at backup time.
	// pg_dump custom format (-Fc) is binary and CANNOT be read by psql; only
	// pg_restore understands it. Plain-text dumps go through psql --file.
	var (
		restoreCmd  string
		restoreArgs []string
	)
	switch backup.DumpFormat {
	case models.DumpFormatCustom:
		restoreCmd = s.versionManager.GetPgRestoreVersion(postgresVersion)
		restoreArgs = []string{
			"--host", targetHost,
			"--port", fmt.Sprintf("%d", targetPort),
			"--username", targetUser,
			"--dbname", targetDBName,
			"--no-password",
			"--no-owner",
			"--no-privileges",
			tempFilePath,
		}
	default:
		// "plain" or unset (legacy backups predating DumpFormat persistence).
		restoreCmd = s.versionManager.GetPsqlVersion(postgresVersion)
		restoreArgs = []string{
			"--host", targetHost,
			"--port", fmt.Sprintf("%d", targetPort),
			"--username", targetUser,
			"--dbname", targetDBName,
			"--no-password",
			"--file", tempFilePath,
		}
	}

	// Execute restore with SSL fallback
	targetDBConfig := &models.DatabaseConfig{
		Host:     targetHost,
		Port:     targetPort,
		Username: targetUser,
		DBName:   targetDBName,
		Password: targetPassword,
		Name:     "restore_target",
	}

	_, err = s.executeRestoreWithSSLFallback(ctx, restoreCmd, restoreArgs, targetDBConfig)
	if err != nil {
		log.Printf("Restore error: %s", err)

		// Audit + notify on failure.
		bidFail := backupID
		metaBytes, _ := json.Marshal(map[string]string{"error": err.Error()})
		_ = s.repo.LogActivity(
			&dbConfig.UserID,
			models.ActionRestoreFailed,
			models.LogLevelError,
			"backup",
			&bidFail,
			dbConfig.Name,
			fmt.Sprintf("Restore failed for backup %q", dbConfig.Name),
			string(metaBytes),
			"",
		)
		if dbConfig.NotificationID != nil {
			notifConfig, nErr := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
			if nErr == nil && notifConfig != nil {
				notification.NotifierFromConfig(notifConfig).SendRestoreFailure(dbConfig.Name, err.Error())
			}
		}

		return fmt.Errorf("%s", err)
	}

	log.Printf("Restore completed successfully for backup %s", backupID)

	// Audit: restore completed.
	bidDone := backupID
	completedMeta := fmt.Sprintf(`{"target":"%s@%s/%s"}`, targetUser, targetHost, targetDBName)
	_ = s.repo.LogActivity(
		&dbConfig.UserID,
		models.ActionRestoreCompleted,
		models.LogLevelSuccess,
		"backup",
		&bidDone,
		dbConfig.Name,
		fmt.Sprintf("Restore completed for %q", dbConfig.Name),
		completedMeta,
		"",
	)

	// Send success notification across every configured channel.
	if dbConfig.NotificationID != nil {
		notifConfig, err := s.repo.GetNotificationConfig(*dbConfig.NotificationID)
		if err == nil && notifConfig != nil {
			targetDesc := fmt.Sprintf("%s@%s/%s", targetUser, targetHost, targetDBName)
			notification.NotifierFromConfig(notifConfig).SendRestoreSuccess(dbConfig.Name, targetDesc)
		}
	}

	_ = job
	return nil
}
