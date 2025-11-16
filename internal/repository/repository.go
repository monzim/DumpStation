package repository

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
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

// User operations

func (r *Repository) CreateUser(discordUserID, discordUsername string) (*models.User, error) {
	user := &models.User{
		DiscordUserID:   discordUserID,
		DiscordUsername: discordUsername,
	}

	// Upsert: Update if exists, insert if not
	result := r.db.Where("discord_user_id = ?", discordUserID).
		Assign(models.User{DiscordUsername: discordUsername}).
		FirstOrCreate(user)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to create user: %w", result.Error)
	}

	return user, nil
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
		Name:       input.Name,
		Host:       input.Host,
		Port:       input.Port,
		DBName:     input.DBName,
		Username:   input.Username,
		Password:   input.Password,
		Schedule:   input.Schedule,
		StorageID:  input.StorageID,
		NotificationID: input.NotificationID,
		Enabled:    true,
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

// Backup operations

func (r *Repository) CreateBackup(databaseID uuid.UUID, status models.BackupStatus) (*models.Backup, error) {
	backup := &models.Backup{
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
		"status":       status,
		"size_bytes":   sizeBytes,
		"storage_path": storagePath,
		"error_message": errorMsg,
		"completed_at": now,
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
