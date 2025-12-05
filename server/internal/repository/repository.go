package repository

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/utils"
	"gorm.io/gorm"
)

// Repository handles all database operations using GORM
type Repository struct {
	db *gorm.DB
}

// New creates a new repository instance with GORM
func NewGORM(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// User operations (single-user system)

// GetSystemUser retrieves the single system user (there can only be one user)
func (r *Repository) GetSystemUser() (*models.User, error) {
	var user models.User
	result := r.db.First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get system user: %w", result.Error)
	}

	return &user, nil
}

// SeedSystemUser creates the single system user during application startup
// This bypasses the disabled CreateUser method for initial seeding only
func (r *Repository) SeedSystemUser(username, email string) error {
	user := &models.User{
		ID:              uuid.New(),
		DiscordUserID:   username,
		DiscordUsername: username,
		Email:           email,
	}

	result := r.db.Create(user)
	if result.Error != nil {
		return fmt.Errorf("failed to seed system user: %w", result.Error)
	}

	return nil
}

// GetUserByUsernameOrEmail retrieves a user by username (discord_user_id) or email
func (r *Repository) GetUserByUsernameOrEmail(usernameOrEmail string) (*models.User, error) {
	var user models.User
	result := r.db.Where("discord_user_id = ? OR email = ?", usernameOrEmail, usernameOrEmail).First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get user: %w", result.Error)
	}

	return &user, nil
}

// CreateUser is disabled for single-user system - kept for compatibility but returns error
func (r *Repository) CreateUser(discordUserID, discordUsername string) (*models.User, error) {
	return nil, fmt.Errorf("user creation is disabled: single-user system only supports the pre-configured user")
}

func (r *Repository) GetUserByDiscordID(discordUserID string) (*models.User, error) {
	var user models.User
	result := r.db.Where("discord_user_id = ?", discordUserID).First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get user: %w", result.Error)
	}

	return &user, nil
}

// OTP operations

func (r *Repository) CreateOTP(userID uuid.UUID, otpCode string, expiresAt time.Time) error {
	otp := &models.OTPToken{
		UserID:    userID,
		OTPCode:   otpCode,
		ExpiresAt: expiresAt,
	}

	result := r.db.Create(otp)
	return result.Error
}

func (r *Repository) VerifyOTP(userID uuid.UUID, otpCode string) (bool, error) {
	result := r.db.Model(&models.OTPToken{}).
		Where("user_id = ? AND otp_code = ? AND expires_at > ? AND used = ?",
			userID, otpCode, time.Now(), false).
		Update("used", true)

	if result.Error != nil {
		return false, result.Error
	}

	return result.RowsAffected > 0, nil
}

// Storage operations

func (r *Repository) CreateStorageConfig(input *models.StorageConfigInput) (*models.StorageConfig, error) {
	storage := &models.StorageConfig{
		Name:      input.Name,
		Provider:  input.Provider,
		Bucket:    input.Bucket,
		Region:    input.Region,
		Endpoint:  input.Endpoint,
		AccessKey: input.AccessKey,
		SecretKey: input.SecretKey,
	}

	result := r.db.Create(storage)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create storage config: %w", result.Error)
	}

	return storage, nil
}

func (r *Repository) GetStorageConfig(id uuid.UUID) (*models.StorageConfig, error) {
	var storage models.StorageConfig
	result := r.db.First(&storage, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get storage config: %w", result.Error)
	}

	return &storage, nil
}

func (r *Repository) ListStorageConfigs() ([]*models.StorageConfig, error) {
	var configs []*models.StorageConfig
	result := r.db.Order("created_at DESC").Find(&configs)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list storage configs: %w", result.Error)
	}

	return configs, nil
}

func (r *Repository) UpdateStorageConfig(id uuid.UUID, input *models.StorageConfigInput) (*models.StorageConfig, error) {
	var storage models.StorageConfig

	if err := r.db.First(&storage, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find storage config: %w", err)
	}

	// Update fields
	storage.Name = input.Name
	storage.Provider = input.Provider
	storage.Bucket = input.Bucket
	storage.Region = input.Region
	storage.Endpoint = input.Endpoint
	storage.AccessKey = input.AccessKey
	storage.SecretKey = input.SecretKey

	result := r.db.Save(&storage)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update storage config: %w", result.Error)
	}

	return &storage, nil
}

func (r *Repository) DeleteStorageConfig(id uuid.UUID) error {
	result := r.db.Delete(&models.StorageConfig{}, "id = ?", id)

	if result.Error != nil {
		return fmt.Errorf("failed to delete storage config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// Notification operations

func (r *Repository) CreateNotificationConfig(input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	notification := &models.NotificationConfig{
		Name:              input.Name,
		DiscordWebhookURL: input.DiscordWebhookURL,
	}

	result := r.db.Create(notification)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create notification config: %w", result.Error)
	}

	return notification, nil
}

func (r *Repository) GetNotificationConfig(id uuid.UUID) (*models.NotificationConfig, error) {
	var notification models.NotificationConfig
	result := r.db.First(&notification, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get notification config: %w", result.Error)
	}

	return &notification, nil
}

func (r *Repository) ListNotificationConfigs() ([]*models.NotificationConfig, error) {
	var configs []*models.NotificationConfig
	result := r.db.Order("created_at DESC").Find(&configs)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list notification configs: %w", result.Error)
	}

	return configs, nil
}

func (r *Repository) UpdateNotificationConfig(id uuid.UUID, input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	var notification models.NotificationConfig

	if err := r.db.First(&notification, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find notification config: %w", err)
	}

	notification.Name = input.Name
	notification.DiscordWebhookURL = input.DiscordWebhookURL

	result := r.db.Save(&notification)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update notification config: %w", result.Error)
	}

	return &notification, nil
}

func (r *Repository) DeleteNotificationConfig(id uuid.UUID) error {
	result := r.db.Delete(&models.NotificationConfig{}, "id = ?", id)

	if result.Error != nil {
		return fmt.Errorf("failed to delete notification config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// Database config operations

func (r *Repository) CreateDatabaseConfig(input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	dbConfig := &models.DatabaseConfig{
		Name:           input.Name,
		Host:           input.Host,
		Port:           input.Port,
		DBName:         input.DBName,
		Username:       input.Username,
		Password:       input.Password,
		Schedule:       input.Schedule,
		StorageID:      input.StorageID,
		NotificationID: input.NotificationID,
		Enabled:        true,
	}

	// Set rotation policy
	dbConfig.SetRotationPolicy(input.RotationPolicy)

	result := r.db.Create(dbConfig)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create database config: %w", result.Error)
	}

	return dbConfig, nil
}

func (r *Repository) GetDatabaseConfig(id uuid.UUID) (*models.DatabaseConfig, error) {
	var dbConfig models.DatabaseConfig
	result := r.db.Preload("Storage").Preload("Notification").First(&dbConfig, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get database config: %w", result.Error)
	}

	return &dbConfig, nil
}

func (r *Repository) ListDatabaseConfigs() ([]*models.DatabaseConfig, error) {
	var configs []*models.DatabaseConfig
	result := r.db.Preload("Storage").Preload("Notification").
		Order("created_at DESC").Find(&configs)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list database configs: %w", result.Error)
	}

	return configs, nil
}

func (r *Repository) UpdateDatabaseConfig(id uuid.UUID, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	var dbConfig models.DatabaseConfig

	if err := r.db.First(&dbConfig, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find database config: %w", err)
	}

	// Update fields
	dbConfig.Name = input.Name
	dbConfig.Host = input.Host
	dbConfig.Port = input.Port
	dbConfig.DBName = input.DBName
	dbConfig.Username = input.Username
	dbConfig.Password = input.Password
	dbConfig.Schedule = input.Schedule
	dbConfig.StorageID = input.StorageID
	dbConfig.NotificationID = input.NotificationID
	dbConfig.SetRotationPolicy(input.RotationPolicy)

	result := r.db.Save(&dbConfig)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update database config: %w", result.Error)
	}

	return &dbConfig, nil
}

func (r *Repository) DeleteDatabaseConfig(id uuid.UUID) error {
	result := r.db.Delete(&models.DatabaseConfig{}, "id = ?", id)

	if result.Error != nil {
		return fmt.Errorf("failed to delete database config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// PauseDatabaseConfig pauses backup operations for a specific database config
func (r *Repository) PauseDatabaseConfig(id uuid.UUID) error {
	result := r.db.Model(&models.DatabaseConfig{}).Where("id = ?", id).Update("paused", true)

	if result.Error != nil {
		return fmt.Errorf("failed to pause database config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// UnpauseDatabaseConfig resumes backup operations for a specific database config
func (r *Repository) UnpauseDatabaseConfig(id uuid.UUID) error {
	result := r.db.Model(&models.DatabaseConfig{}).Where("id = ?", id).Update("paused", false)

	if result.Error != nil {
		return fmt.Errorf("failed to unpause database config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// Backup operations

func (r *Repository) CreateBackup(databaseID uuid.UUID, status models.BackupStatus) (*models.Backup, error) {
	backup := &models.Backup{
		Name:       utils.GenerateBackupName(),
		DatabaseID: databaseID,
		Status:     status,
		StartedAt:  time.Now(),
	}

	result := r.db.Create(backup)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create backup: %w", result.Error)
	}

	return backup, nil
}

func (r *Repository) UpdateBackupStatus(id uuid.UUID, status models.BackupStatus, sizeBytes *int64, storagePath string, errorMsg *string) error {
	now := time.Now()
	updates := map[string]interface{}{
		"status":        status,
		"size_bytes":    sizeBytes,
		"storage_path":  storagePath,
		"error_message": errorMsg,
		"completed_at":  now,
	}

	result := r.db.Model(&models.Backup{}).Where("id = ?", id).Updates(updates)
	return result.Error
}

func (r *Repository) GetBackup(id uuid.UUID) (*models.Backup, error) {
	var backup models.Backup
	result := r.db.Preload("Database").First(&backup, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get backup: %w", result.Error)
	}

	return &backup, nil
}

func (r *Repository) ListBackupsByDatabase(databaseID uuid.UUID) ([]*models.Backup, error) {
	var backups []*models.Backup
	result := r.db.Where("database_id = ?", databaseID).
		Order("started_at DESC").Find(&backups)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list backups: %w", result.Error)
	}

	return backups, nil
}

func (r *Repository) ListAllBackups() ([]*models.Backup, error) {
	var backups []*models.Backup
	result := r.db.Preload("Database").
		Order("started_at DESC").Find(&backups)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list all backups: %w", result.Error)
	}

	return backups, nil
}

// Stats operations

func (r *Repository) GetSystemStats() (*models.SystemStats, error) {
	stats := &models.SystemStats{}

	// Total databases
	var totalDatabases int64
	r.db.Model(&models.DatabaseConfig{}).Where("enabled = ?", true).Count(&totalDatabases)
	stats.TotalDatabases = int(totalDatabases)

	// Backups in last 24 hours
	yesterday := time.Now().Add(-24 * time.Hour)
	var totalBackups24h int64
	r.db.Model(&models.Backup{}).Where("created_at > ?", yesterday).Count(&totalBackups24h)
	stats.TotalBackups24h = int(totalBackups24h)

	// Success and failure counts
	var successCount int64
	var failureCount int64

	r.db.Model(&models.Backup{}).
		Where("status = ? AND created_at > ?", models.BackupStatusSuccess, yesterday).
		Count(&successCount)

	r.db.Model(&models.Backup{}).
		Where("status = ? AND created_at > ?", models.BackupStatusFailed, yesterday).
		Count(&failureCount)

	if stats.TotalBackups24h > 0 {
		stats.SuccessRate24h = float64(successCount) / float64(stats.TotalBackups24h) * 100
		stats.FailureRate24h = float64(failureCount) / float64(stats.TotalBackups24h) * 100
	}

	// Total storage used
	type SumResult struct {
		Total int64
	}
	var sumResult SumResult
	r.db.Model(&models.Backup{}).
		Where("status = ?", models.BackupStatusSuccess).
		Select("COALESCE(SUM(size_bytes), 0) as total").
		Scan(&sumResult)

	stats.TotalStorageUsedBytes = sumResult.Total

	return stats, nil
}

// CreateRestoreJob creates a new restore job
func (r *Repository) CreateRestoreJob(backupID uuid.UUID, req *models.RestoreRequest) (*models.RestoreJob, error) {
	job := &models.RestoreJob{
		BackupID:  backupID,
		Status:    models.BackupStatusPending,
		StartedAt: time.Now(),
	}

	if req != nil {
		if req.TargetHost != "" {
			job.TargetHost = &req.TargetHost
		}
		if req.TargetPort != 0 {
			job.TargetPort = &req.TargetPort
		}
		if req.TargetDBName != "" {
			job.TargetDBName = &req.TargetDBName
		}
		if req.TargetUser != "" {
			job.TargetUser = &req.TargetUser
		}
		if req.TargetPassword != "" {
			job.TargetPassword = &req.TargetPassword
		}
	}

	result := r.db.Create(job)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create restore job: %w", result.Error)
	}

	return job, nil
}

// Activity Log operations

// CreateActivityLog creates a new activity log entry
func (r *Repository) CreateActivityLog(log *models.ActivityLog) error {
	result := r.db.Create(log)
	if result.Error != nil {
		return fmt.Errorf("failed to create activity log: %w", result.Error)
	}
	return nil
}

// LogActivity is a helper function to quickly log an activity
func (r *Repository) LogActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, entityName, description, metadata, ipAddress string) error {

	// If metadata is empty, set it to null or empty JSON object
	if metadata == "" {
		metadata = "{}"
	}

	log := &models.ActivityLog{
		UserID:      userID,
		Action:      action,
		Level:       level,
		EntityType:  entityType,
		EntityID:    entityID,
		EntityName:  entityName,
		Description: description,
		Metadata:    metadata,
		IPAddress:   ipAddress,
	}

	return r.CreateActivityLog(log)
}

// GetActivityLog retrieves a single activity log by ID
func (r *Repository) GetActivityLog(id uuid.UUID) (*models.ActivityLog, error) {
	var log models.ActivityLog
	result := r.db.Preload("User").First(&log, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get activity log: %w", result.Error)
	}

	return &log, nil
}

// ListActivityLogs retrieves activity logs with optional filtering and pagination
func (r *Repository) ListActivityLogs(params *models.ActivityLogListParams) ([]*models.ActivityLog, int64, error) {
	var logs []*models.ActivityLog
	var total int64

	query := r.db.Model(&models.ActivityLog{}).Preload("User")

	// Apply filters
	if params.UserID != nil {
		query = query.Where("user_id = ?", params.UserID)
	}
	if params.Action != nil {
		query = query.Where("action = ?", params.Action)
	}
	if params.Level != nil {
		query = query.Where("level = ?", params.Level)
	}
	if params.EntityType != nil {
		query = query.Where("entity_type = ?", params.EntityType)
	}
	if params.EntityID != nil {
		query = query.Where("entity_id = ?", params.EntityID)
	}
	if params.StartDate != nil {
		query = query.Where("created_at >= ?", params.StartDate)
	}
	if params.EndDate != nil {
		query = query.Where("created_at <= ?", params.EndDate)
	}

	// Count total records
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count activity logs: %w", err)
	}

	// Apply pagination
	limit := params.Limit
	if limit <= 0 {
		limit = 50 // Default limit
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}

	// Retrieve logs
	result := query.Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&logs)

	if result.Error != nil {
		return nil, 0, fmt.Errorf("failed to list activity logs: %w", result.Error)
	}

	return logs, total, nil
}

// DeleteOldActivityLogs deletes activity logs older than the specified duration
func (r *Repository) DeleteOldActivityLogs(olderThan time.Time) (int64, error) {
	result := r.db.Where("created_at < ?", olderThan).Delete(&models.ActivityLog{})

	if result.Error != nil {
		return 0, fmt.Errorf("failed to delete old activity logs: %w", result.Error)
	}

	return result.RowsAffected, nil
}

// ========================================
// Two-Factor Authentication Operations
// ========================================

// GetUserByID retrieves a user by their ID
func (r *Repository) GetUserByID(id uuid.UUID) (*models.User, error) {
	var user models.User
	result := r.db.First(&user, "id = ?", id)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get user by ID: %w", result.Error)
	}

	return &user, nil
}

// SetUser2FASecret stores the encrypted 2FA secret for a user (during setup, before verification)
func (r *Repository) SetUser2FASecret(userID uuid.UUID, secret string) error {
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Update("two_factor_secret", secret)

	if result.Error != nil {
		return fmt.Errorf("failed to set 2FA secret: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// EnableUser2FA enables 2FA for a user after successful verification
func (r *Repository) EnableUser2FA(userID uuid.UUID, backupCodes []string) error {
	now := time.Now()

	// Use pq.Array() to properly handle PostgreSQL text[] array type
	result := r.db.Exec(`
		UPDATE users 
		SET two_factor_enabled = true, 
		    two_factor_verified_at = $1, 
		    two_factor_backup_codes = $2,
		    updated_at = $3
		WHERE id = $4`,
		now, pq.Array(backupCodes), now, userID)

	if result.Error != nil {
		return fmt.Errorf("failed to enable 2FA: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// DisableUser2FA disables 2FA for a user
func (r *Repository) DisableUser2FA(userID uuid.UUID) error {
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"two_factor_enabled":      false,
			"two_factor_secret":       nil,
			"two_factor_backup_codes": nil,
			"two_factor_verified_at":  nil,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to disable 2FA: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// UpdateUser2FABackupCodes updates the backup codes for a user (after one is used or regenerated)
func (r *Repository) UpdateUser2FABackupCodes(userID uuid.UUID, backupCodes []string) error {
	// Use pq.Array() to properly handle PostgreSQL text[] array type
	result := r.db.Exec(`
		UPDATE users 
		SET two_factor_backup_codes = $1,
		    updated_at = $2
		WHERE id = $3`,
		pq.Array(backupCodes), time.Now(), userID)

	if result.Error != nil {
		return fmt.Errorf("failed to update 2FA backup codes: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// GetUser2FAStatus retrieves the 2FA status for a user
func (r *Repository) GetUser2FAStatus(userID uuid.UUID) (enabled bool, backupCodesCount int, verifiedAt *time.Time, err error) {
	var user models.User
	result := r.db.Select("two_factor_enabled", "two_factor_backup_codes", "two_factor_verified_at").
		First(&user, "id = ?", userID)

	if result.Error == gorm.ErrRecordNotFound {
		return false, 0, nil, gorm.ErrRecordNotFound
	}
	if result.Error != nil {
		return false, 0, nil, fmt.Errorf("failed to get 2FA status: %w", result.Error)
	}

	return user.TwoFactorEnabled, len(user.TwoFactorBackupCodes), user.TwoFactorVerifiedAt, nil
}
