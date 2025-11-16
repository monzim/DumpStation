package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// Repository handles all database operations
type Repository struct {
	db *sql.DB
}

// New creates a new repository instance
func New(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// User operations

func (r *Repository) CreateUser(discordUserID, discordUsername string) (*models.User, error) {
	user := &models.User{
		ID:              uuid.New(),
		DiscordUserID:   discordUserID,
		DiscordUsername: discordUsername,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	query := `
		INSERT INTO users (id, discord_user_id, discord_username, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (discord_user_id) DO UPDATE SET
			discord_username = EXCLUDED.discord_username,
			updated_at = EXCLUDED.updated_at
		RETURNING id, discord_user_id, discord_username, created_at, updated_at`

	err := r.db.QueryRow(query, user.ID, user.DiscordUserID, user.DiscordUsername, user.CreatedAt, user.UpdatedAt).
		Scan(&user.ID, &user.DiscordUserID, &user.DiscordUsername, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

func (r *Repository) GetUserByDiscordID(discordUserID string) (*models.User, error) {
	user := &models.User{}
	query := `SELECT id, discord_user_id, discord_username, created_at, updated_at FROM users WHERE discord_user_id = $1`

	err := r.db.QueryRow(query, discordUserID).Scan(&user.ID, &user.DiscordUserID, &user.DiscordUsername, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

// OTP operations

func (r *Repository) CreateOTP(userID uuid.UUID, otpCode string, expiresAt time.Time) error {
	query := `INSERT INTO otp_tokens (id, user_id, otp_code, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := r.db.Exec(query, uuid.New(), userID, otpCode, expiresAt, time.Now())
	return err
}

func (r *Repository) VerifyOTP(userID uuid.UUID, otpCode string) (bool, error) {
	var count int
	query := `
		UPDATE otp_tokens SET used = true
		WHERE user_id = $1 AND otp_code = $2 AND expires_at > $3 AND used = false
		RETURNING 1`

	err := r.db.QueryRow(query, userID, otpCode, time.Now()).Scan(&count)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return true, nil
}

// Storage operations

func (r *Repository) CreateStorageConfig(input *models.StorageConfigInput) (*models.StorageConfig, error) {
	storage := &models.StorageConfig{
		ID:        uuid.New(),
		Name:      input.Name,
		Provider:  input.Provider,
		Bucket:    input.Bucket,
		Region:    input.Region,
		Endpoint:  input.Endpoint,
		AccessKey: input.AccessKey,
		SecretKey: input.SecretKey,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	query := `
		INSERT INTO storage_configs (id, name, provider, bucket, region, endpoint, access_key, secret_key, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at`

	err := r.db.QueryRow(query, storage.ID, storage.Name, storage.Provider, storage.Bucket,
		storage.Region, storage.Endpoint, storage.AccessKey, storage.SecretKey, storage.CreatedAt, storage.UpdatedAt).
		Scan(&storage.ID, &storage.CreatedAt, &storage.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create storage config: %w", err)
	}

	return storage, nil
}

func (r *Repository) GetStorageConfig(id uuid.UUID) (*models.StorageConfig, error) {
	storage := &models.StorageConfig{}
	query := `SELECT id, name, provider, bucket, region, endpoint, access_key, secret_key, created_at, updated_at
		FROM storage_configs WHERE id = $1`

	err := r.db.QueryRow(query, id).Scan(&storage.ID, &storage.Name, &storage.Provider, &storage.Bucket,
		&storage.Region, &storage.Endpoint, &storage.AccessKey, &storage.SecretKey, &storage.CreatedAt, &storage.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get storage config: %w", err)
	}

	return storage, nil
}

func (r *Repository) ListStorageConfigs() ([]*models.StorageConfig, error) {
	query := `SELECT id, name, provider, bucket, region, endpoint, access_key, secret_key, created_at, updated_at
		FROM storage_configs ORDER BY created_at DESC`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to list storage configs: %w", err)
	}
	defer rows.Close()

	var configs []*models.StorageConfig
	for rows.Next() {
		storage := &models.StorageConfig{}
		err := rows.Scan(&storage.ID, &storage.Name, &storage.Provider, &storage.Bucket,
			&storage.Region, &storage.Endpoint, &storage.AccessKey, &storage.SecretKey, &storage.CreatedAt, &storage.UpdatedAt)
		if err != nil {
			return nil, err
		}
		configs = append(configs, storage)
	}

	return configs, nil
}

func (r *Repository) UpdateStorageConfig(id uuid.UUID, input *models.StorageConfigInput) (*models.StorageConfig, error) {
	query := `
		UPDATE storage_configs
		SET name = $2, provider = $3, bucket = $4, region = $5, endpoint = $6,
			access_key = $7, secret_key = $8, updated_at = $9
		WHERE id = $1
		RETURNING id, name, provider, bucket, region, endpoint, created_at, updated_at`

	storage := &models.StorageConfig{}
	err := r.db.QueryRow(query, id, input.Name, input.Provider, input.Bucket, input.Region,
		input.Endpoint, input.AccessKey, input.SecretKey, time.Now()).
		Scan(&storage.ID, &storage.Name, &storage.Provider, &storage.Bucket, &storage.Region,
			&storage.Endpoint, &storage.CreatedAt, &storage.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update storage config: %w", err)
	}

	return storage, nil
}

func (r *Repository) DeleteStorageConfig(id uuid.UUID) error {
	query := `DELETE FROM storage_configs WHERE id = $1`
	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete storage config: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// Notification operations

func (r *Repository) CreateNotificationConfig(input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	notification := &models.NotificationConfig{
		ID:                uuid.New(),
		Name:              input.Name,
		DiscordWebhookURL: input.DiscordWebhookURL,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	query := `
		INSERT INTO notification_configs (id, name, discord_webhook_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`

	err := r.db.QueryRow(query, notification.ID, notification.Name, notification.DiscordWebhookURL,
		notification.CreatedAt, notification.UpdatedAt).
		Scan(&notification.ID, &notification.CreatedAt, &notification.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create notification config: %w", err)
	}

	return notification, nil
}

func (r *Repository) GetNotificationConfig(id uuid.UUID) (*models.NotificationConfig, error) {
	notification := &models.NotificationConfig{}
	query := `SELECT id, name, discord_webhook_url, created_at, updated_at
		FROM notification_configs WHERE id = $1`

	err := r.db.QueryRow(query, id).Scan(&notification.ID, &notification.Name,
		&notification.DiscordWebhookURL, &notification.CreatedAt, &notification.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification config: %w", err)
	}

	return notification, nil
}

func (r *Repository) ListNotificationConfigs() ([]*models.NotificationConfig, error) {
	query := `SELECT id, name, discord_webhook_url, created_at, updated_at
		FROM notification_configs ORDER BY created_at DESC`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to list notification configs: %w", err)
	}
	defer rows.Close()

	var configs []*models.NotificationConfig
	for rows.Next() {
		notification := &models.NotificationConfig{}
		err := rows.Scan(&notification.ID, &notification.Name, &notification.DiscordWebhookURL,
			&notification.CreatedAt, &notification.UpdatedAt)
		if err != nil {
			return nil, err
		}
		configs = append(configs, notification)
	}

	return configs, nil
}

func (r *Repository) UpdateNotificationConfig(id uuid.UUID, input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	query := `
		UPDATE notification_configs
		SET name = $2, discord_webhook_url = $3, updated_at = $4
		WHERE id = $1
		RETURNING id, name, created_at, updated_at`

	notification := &models.NotificationConfig{}
	err := r.db.QueryRow(query, id, input.Name, input.DiscordWebhookURL, time.Now()).
		Scan(&notification.ID, &notification.Name, &notification.CreatedAt, &notification.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update notification config: %w", err)
	}

	return notification, nil
}

func (r *Repository) DeleteNotificationConfig(id uuid.UUID) error {
	query := `DELETE FROM notification_configs WHERE id = $1`
	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete notification config: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// Database config operations

func (r *Repository) CreateDatabaseConfig(input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	dbConfig := &models.DatabaseConfig{
		ID:                  uuid.New(),
		Name:                input.Name,
		Host:                input.Host,
		Port:                input.Port,
		DBName:              input.DBName,
		Username:            input.Username,
		Password:            input.Password,
		Schedule:            input.Schedule,
		StorageID:           input.StorageID,
		NotificationID:      input.NotificationID,
		RotationPolicyType:  input.RotationPolicy.Type,
		RotationPolicyValue: input.RotationPolicy.Value,
		Enabled:             true,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	query := `
		INSERT INTO database_configs (id, name, host, port, dbname, username, password, schedule,
			storage_id, notification_id, rotation_policy_type, rotation_policy_value, enabled, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id, created_at, updated_at`

	err := r.db.QueryRow(query, dbConfig.ID, dbConfig.Name, dbConfig.Host, dbConfig.Port, dbConfig.DBName,
		dbConfig.Username, dbConfig.Password, dbConfig.Schedule, dbConfig.StorageID, dbConfig.NotificationID,
		dbConfig.RotationPolicyType, dbConfig.RotationPolicyValue, dbConfig.Enabled, dbConfig.CreatedAt, dbConfig.UpdatedAt).
		Scan(&dbConfig.ID, &dbConfig.CreatedAt, &dbConfig.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create database config: %w", err)
	}

	dbConfig.RotationPolicy = models.RotationPolicy{
		Type:  dbConfig.RotationPolicyType,
		Value: dbConfig.RotationPolicyValue,
	}

	return dbConfig, nil
}

func (r *Repository) GetDatabaseConfig(id uuid.UUID) (*models.DatabaseConfig, error) {
	dbConfig := &models.DatabaseConfig{}
	query := `SELECT id, name, host, port, dbname, username, password, schedule, storage_id, notification_id,
		rotation_policy_type, rotation_policy_value, enabled, created_at, updated_at
		FROM database_configs WHERE id = $1`

	err := r.db.QueryRow(query, id).Scan(&dbConfig.ID, &dbConfig.Name, &dbConfig.Host, &dbConfig.Port,
		&dbConfig.DBName, &dbConfig.Username, &dbConfig.Password, &dbConfig.Schedule, &dbConfig.StorageID,
		&dbConfig.NotificationID, &dbConfig.RotationPolicyType, &dbConfig.RotationPolicyValue,
		&dbConfig.Enabled, &dbConfig.CreatedAt, &dbConfig.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get database config: %w", err)
	}

	dbConfig.RotationPolicy = models.RotationPolicy{
		Type:  dbConfig.RotationPolicyType,
		Value: dbConfig.RotationPolicyValue,
	}

	return dbConfig, nil
}

func (r *Repository) ListDatabaseConfigs() ([]*models.DatabaseConfig, error) {
	query := `SELECT id, name, host, port, dbname, username, password, schedule, storage_id, notification_id,
		rotation_policy_type, rotation_policy_value, enabled, created_at, updated_at
		FROM database_configs ORDER BY created_at DESC`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to list database configs: %w", err)
	}
	defer rows.Close()

	var configs []*models.DatabaseConfig
	for rows.Next() {
		dbConfig := &models.DatabaseConfig{}
		err := rows.Scan(&dbConfig.ID, &dbConfig.Name, &dbConfig.Host, &dbConfig.Port, &dbConfig.DBName,
			&dbConfig.Username, &dbConfig.Password, &dbConfig.Schedule, &dbConfig.StorageID, &dbConfig.NotificationID,
			&dbConfig.RotationPolicyType, &dbConfig.RotationPolicyValue, &dbConfig.Enabled,
			&dbConfig.CreatedAt, &dbConfig.UpdatedAt)
		if err != nil {
			return nil, err
		}

		dbConfig.RotationPolicy = models.RotationPolicy{
			Type:  dbConfig.RotationPolicyType,
			Value: dbConfig.RotationPolicyValue,
		}

		configs = append(configs, dbConfig)
	}

	return configs, nil
}

func (r *Repository) UpdateDatabaseConfig(id uuid.UUID, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	query := `
		UPDATE database_configs
		SET name = $2, host = $3, port = $4, dbname = $5, username = $6, password = $7,
			schedule = $8, storage_id = $9, notification_id = $10, rotation_policy_type = $11,
			rotation_policy_value = $12, updated_at = $13
		WHERE id = $1
		RETURNING id, name, host, port, dbname, username, schedule, storage_id, notification_id,
			rotation_policy_type, rotation_policy_value, enabled, created_at, updated_at`

	dbConfig := &models.DatabaseConfig{}
	err := r.db.QueryRow(query, id, input.Name, input.Host, input.Port, input.DBName, input.Username,
		input.Password, input.Schedule, input.StorageID, input.NotificationID,
		input.RotationPolicy.Type, input.RotationPolicy.Value, time.Now()).
		Scan(&dbConfig.ID, &dbConfig.Name, &dbConfig.Host, &dbConfig.Port, &dbConfig.DBName,
			&dbConfig.Username, &dbConfig.Schedule, &dbConfig.StorageID, &dbConfig.NotificationID,
			&dbConfig.RotationPolicyType, &dbConfig.RotationPolicyValue, &dbConfig.Enabled,
			&dbConfig.CreatedAt, &dbConfig.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update database config: %w", err)
	}

	dbConfig.RotationPolicy = models.RotationPolicy{
		Type:  dbConfig.RotationPolicyType,
		Value: dbConfig.RotationPolicyValue,
	}

	return dbConfig, nil
}

func (r *Repository) DeleteDatabaseConfig(id uuid.UUID) error {
	query := `DELETE FROM database_configs WHERE id = $1`
	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete database config: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// Backup operations

func (r *Repository) CreateBackup(databaseID uuid.UUID, status models.BackupStatus) (*models.Backup, error) {
	backup := &models.Backup{
		ID:         uuid.New(),
		DatabaseID: databaseID,
		Status:     status,
		StartedAt:  time.Now(),
		CreatedAt:  time.Now(),
	}

	query := `
		INSERT INTO backups (id, database_id, status, started_at, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, started_at, created_at`

	err := r.db.QueryRow(query, backup.ID, backup.DatabaseID, backup.Status, backup.StartedAt, backup.CreatedAt).
		Scan(&backup.ID, &backup.StartedAt, &backup.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create backup: %w", err)
	}

	return backup, nil
}

func (r *Repository) UpdateBackupStatus(id uuid.UUID, status models.BackupStatus, sizeBytes *int64, storagePath string, errorMsg *string) error {
	completedAt := time.Now()
	query := `
		UPDATE backups
		SET status = $2, size_bytes = $3, storage_path = $4, error_message = $5, completed_at = $6
		WHERE id = $1`

	_, err := r.db.Exec(query, id, status, sizeBytes, storagePath, errorMsg, completedAt)
	return err
}

func (r *Repository) GetBackup(id uuid.UUID) (*models.Backup, error) {
	backup := &models.Backup{}
	query := `SELECT id, database_id, status, size_bytes, storage_path, error_message, started_at, completed_at, created_at
		FROM backups WHERE id = $1`

	err := r.db.QueryRow(query, id).Scan(&backup.ID, &backup.DatabaseID, &backup.Status, &backup.SizeBytes,
		&backup.StoragePath, &backup.ErrorMessage, &backup.StartedAt, &backup.CompletedAt, &backup.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get backup: %w", err)
	}

	return backup, nil
}

func (r *Repository) ListBackupsByDatabase(databaseID uuid.UUID) ([]*models.Backup, error) {
	query := `SELECT id, database_id, status, size_bytes, storage_path, error_message, started_at, completed_at, created_at
		FROM backups WHERE database_id = $1 ORDER BY started_at DESC`

	rows, err := r.db.Query(query, databaseID)
	if err != nil {
		return nil, fmt.Errorf("failed to list backups: %w", err)
	}
	defer rows.Close()

	var backups []*models.Backup
	for rows.Next() {
		backup := &models.Backup{}
		err := rows.Scan(&backup.ID, &backup.DatabaseID, &backup.Status, &backup.SizeBytes,
			&backup.StoragePath, &backup.ErrorMessage, &backup.StartedAt, &backup.CompletedAt, &backup.CreatedAt)
		if err != nil {
			return nil, err
		}
		backups = append(backups, backup)
	}

	return backups, nil
}

// Stats operations

func (r *Repository) GetSystemStats() (*models.SystemStats, error) {
	stats := &models.SystemStats{}

	// Total databases
	err := r.db.QueryRow(`SELECT COUNT(*) FROM database_configs WHERE enabled = true`).Scan(&stats.TotalDatabases)
	if err != nil {
		return nil, err
	}

	// Backups in last 24 hours
	err = r.db.QueryRow(`SELECT COUNT(*) FROM backups WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&stats.TotalBackups24h)
	if err != nil {
		return nil, err
	}

	// Success and failure rates
	var successCount, failureCount int
	err = r.db.QueryRow(`SELECT COUNT(*) FROM backups WHERE status = 'success' AND created_at > NOW() - INTERVAL '24 hours'`).Scan(&successCount)
	if err != nil {
		return nil, err
	}

	err = r.db.QueryRow(`SELECT COUNT(*) FROM backups WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'`).Scan(&failureCount)
	if err != nil {
		return nil, err
	}

	if stats.TotalBackups24h > 0 {
		stats.SuccessRate24h = float64(successCount) / float64(stats.TotalBackups24h) * 100
		stats.FailureRate24h = float64(failureCount) / float64(stats.TotalBackups24h) * 100
	}

	// Total storage used
	err = r.db.QueryRow(`SELECT COALESCE(SUM(size_bytes), 0) FROM backups WHERE status = 'success'`).Scan(&stats.TotalStorageUsedBytes)
	if err != nil {
		return nil, err
	}

	return stats, nil
}

// CreateRestoreJob creates a new restore job
func (r *Repository) CreateRestoreJob(backupID uuid.UUID, req *models.RestoreRequest) (*models.RestoreJob, error) {
	job := &models.RestoreJob{
		ID:        uuid.New(),
		BackupID:  backupID,
		Status:    models.BackupStatusPending,
		StartedAt: time.Now(),
		CreatedAt: time.Now(),
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

	query := `
		INSERT INTO restore_jobs (id, backup_id, target_host, target_port, target_dbname, target_user, target_password, status, started_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, started_at, created_at`

	err := r.db.QueryRow(query, job.ID, job.BackupID, job.TargetHost, job.TargetPort, job.TargetDBName,
		job.TargetUser, job.TargetPassword, job.Status, job.StartedAt, job.CreatedAt).
		Scan(&job.ID, &job.StartedAt, &job.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create restore job: %w", err)
	}

	return job, nil
}
