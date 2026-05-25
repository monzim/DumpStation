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

// UpsertGitHubUser finds or creates the local user row that backs a
// successful GitHub OAuth login. Lookup falls through three keys, in
// order of trust:
//
//  1. github_user_id — numeric, stable, never recycled. The authoritative
//     identity once a row has been GitHub-linked at least once.
//  2. github_login — covers rows created before the id was captured (e.g.
//     hand-imported), and rows linked to the same login via an older
//     deployment.
//  3. email — covers the common upgrade case where a deployment is
//     introducing GitHub OAuth on top of an already-seeded system admin
//     row. Without this fallback the CREATE step would collide with the
//     UNIQUE(email) constraint and the user could never sign in.
//
// On any successful match we refresh the cached identity fields so the
// row keeps up with GitHub-side renames / avatar changes.
//
// A freshly created row is granted admin rights — single-user deployment
// by design, with the allow-list check at the OAuth callback layer.
func (r *Repository) UpsertGitHubUser(githubID int64, login, email, avatarURL string) (*models.User, error) {
	var user models.User
	err := r.db.Where("github_user_id = ?", githubID).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		err = r.db.Where("github_login = ?", login).First(&user).Error
	}
	if err == gorm.ErrRecordNotFound && email != "" {
		err = r.db.Where("email = ?", email).First(&user).Error
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("lookup github user: %w", err)
	}

	if err == gorm.ErrRecordNotFound {
		user = models.User{
			GitHubLogin:  login,
			GitHubUserID: githubID,
			AvatarURL:    avatarURL,
			Email:        email,
			IsAdmin:      true,
		}
		if err := r.db.Create(&user).Error; err != nil {
			return nil, fmt.Errorf("create github user: %w", err)
		}
		return &user, nil
	}

	// Refresh changeable fields. Promote to admin if the row wasn't
	// already privileged — the allow-list already vouched for this login.
	updates := map[string]any{
		"github_login":   login,
		"github_user_id": githubID,
		"is_admin":       true,
	}
	if email != "" && user.Email == "" {
		// Only fill email if blank; never overwrite a user's existing
		// email with a different one without explicit intent.
		updates["email"] = email
	}
	if avatarURL != "" {
		updates["avatar_url"] = avatarURL
	}
	if err := r.db.Model(&user).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("refresh github user: %w", err)
	}

	if err := r.db.First(&user, "id = ?", user.ID).Error; err != nil {
		return nil, fmt.Errorf("reload github user: %w", err)
	}
	return &user, nil
}

// OTP operations

func (r *Repository) CreateOTP(userID uuid.UUID, otpCode string, expiresAt time.Time) error {
	otp := &models.OTPToken{
		UserID:    userID,
		OTPCode:   otpCode,
		ExpiresAt: expiresAt,
		Purpose:   models.OTPPurposeLogin,
	}

	result := r.db.Create(otp)
	return result.Error
}

// CreatePurposeOTP creates a purpose-tagged OTP optionally bound to a single
// entity (e.g. a Backup id for download gating). Returns the created row so
// the caller can hand back its id without exposing the code itself.
func (r *Repository) CreatePurposeOTP(userID uuid.UUID, otpCode string, purpose models.OTPPurpose, entityID *uuid.UUID, expiresAt time.Time) (*models.OTPToken, error) {
	otp := &models.OTPToken{
		UserID:    userID,
		OTPCode:   otpCode,
		Purpose:   purpose,
		EntityID:  entityID,
		ExpiresAt: expiresAt,
	}
	if err := r.db.Create(otp).Error; err != nil {
		return nil, fmt.Errorf("failed to create purpose OTP: %w", err)
	}
	return otp, nil
}

// VerifyPurposeOTP validates an OTP that was issued with CreatePurposeOTP.
// Lookup is keyed by the OTP id (handed back at issue time) so download
// codes from different backups never collide, even within the same user.
func (r *Repository) VerifyPurposeOTP(otpID uuid.UUID, userID uuid.UUID, code string, purpose models.OTPPurpose) (OTPVerifyResult, error) {
	now := time.Now()
	var result OTPVerifyResult

	err := r.db.Transaction(func(tx *gorm.DB) error {
		var token models.OTPToken
		err := tx.Where(
			"id = ? AND user_id = ? AND purpose = ? AND used = ? AND expires_at > ?",
			otpID, userID, purpose, false, now,
		).First(&token).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil
			}
			return fmt.Errorf("load purpose OTP: %w", err)
		}

		if token.LockedUntil != nil && token.LockedUntil.After(now) {
			lockedCopy := *token.LockedUntil
			result.LockedUntil = &lockedCopy
			return nil
		}

		if token.OTPCode == code {
			if err := tx.Model(&models.OTPToken{}).
				Where("id = ?", token.ID).
				Updates(map[string]any{
					"used":            true,
					"failed_attempts": 0,
					"locked_until":    nil,
				}).Error; err != nil {
				return fmt.Errorf("mark used: %w", err)
			}
			result.OK = true
			return nil
		}

		updates := map[string]any{
			"failed_attempts": token.FailedAttempts + 1,
		}
		if token.FailedAttempts+1 >= models.OTPMaxFailedAttempts {
			lockTime := now.Add(models.OTPLockoutDuration)
			updates["locked_until"] = lockTime
			result.LockedUntil = &lockTime
		}
		return tx.Model(&models.OTPToken{}).Where("id = ?", token.ID).Updates(updates).Error
	})

	return result, err
}

// OTPVerifyResult tells the caller whether the OTP was accepted and, if not,
// whether the failure was due to a temporary lockout. The handler maps
// LockedUntil to a 429 response with Retry-After.
type OTPVerifyResult struct {
	OK          bool
	LockedUntil *time.Time
}

// VerifyOTP atomically validates the OTP for the user. On success the latest
// matching token is marked used. On failure we increment FailedAttempts on
// the most recent unused, unexpired token; once it crosses
// OTPMaxFailedAttempts the token is locked for OTPLockoutDuration. The
// previous version had no rate limiting at all, so a 6-digit code (1M
// states) could be brute forced inside the OTP TTL window.
func (r *Repository) VerifyOTP(userID uuid.UUID, otpCode string) (OTPVerifyResult, error) {
	now := time.Now()
	var result OTPVerifyResult

	err := r.db.Transaction(func(tx *gorm.DB) error {
		var token models.OTPToken
		// Most recent active login token for this user. Filtering by purpose
		// keeps backup-download OTPs from being accepted at the login step.
		err := tx.Where(
			"user_id = ? AND used = ? AND expires_at > ? AND purpose = ?",
			userID, false, now, models.OTPPurposeLogin,
		).
			Order("created_at DESC").
			First(&token).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				// Nothing to verify; treat as plain wrong code (no lockout
				// to leak existence of pending OTPs).
				return nil
			}
			return fmt.Errorf("load OTP: %w", err)
		}

		// Honor existing lockout window.
		if token.LockedUntil != nil && token.LockedUntil.After(now) {
			lockedCopy := *token.LockedUntil
			result.LockedUntil = &lockedCopy
			return nil
		}

		if token.OTPCode == otpCode {
			if err := tx.Model(&models.OTPToken{}).
				Where("id = ?", token.ID).
				Updates(map[string]any{
					"used":            true,
					"failed_attempts": 0,
					"locked_until":    nil,
				}).Error; err != nil {
				return fmt.Errorf("mark used: %w", err)
			}
			result.OK = true
			return nil
		}

		// Wrong code — bump counter and possibly lock.
		updates := map[string]any{
			"failed_attempts": token.FailedAttempts + 1,
		}
		if token.FailedAttempts+1 >= models.OTPMaxFailedAttempts {
			lockTime := now.Add(models.OTPLockoutDuration)
			updates["locked_until"] = lockTime
			result.LockedUntil = &lockTime
		}
		return tx.Model(&models.OTPToken{}).Where("id = ?", token.ID).Updates(updates).Error
	})

	return result, err
}

// Storage operations

func (r *Repository) CreateStorageConfig(userID uuid.UUID, input *models.StorageConfigInput) (*models.StorageConfig, error) {
	storage := &models.StorageConfig{
		UserID:    userID,
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

// GetStorageConfigByUser retrieves a storage config by ID only if it belongs to the user (or user is admin)
func (r *Repository) GetStorageConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) (*models.StorageConfig, error) {
	var storage models.StorageConfig
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.First(&storage)

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

// ListStorageConfigsByUser lists storage configs for a specific user (or all if admin)
func (r *Repository) ListStorageConfigsByUser(userID uuid.UUID, isAdmin bool) ([]*models.StorageConfig, error) {
	var configs []*models.StorageConfig
	query := r.db.Preload("Labels").Order("created_at DESC")
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Find(&configs)

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

// UpdateStorageConfigByUser updates a storage config only if it belongs to the user (or user is admin)
func (r *Repository) UpdateStorageConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool, input *models.StorageConfigInput) (*models.StorageConfig, error) {
	var storage models.StorageConfig

	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&storage).Error; err != nil {
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

// DeleteStorageConfigByUser deletes a storage config only if it belongs to the user (or user is admin)
func (r *Repository) DeleteStorageConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Delete(&models.StorageConfig{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete storage config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// Notification operations

func (r *Repository) CreateNotificationConfig(userID uuid.UUID, input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	notification := &models.NotificationConfig{
		UserID:            userID,
		Name:              input.Name,
		DiscordWebhookURL: input.DiscordWebhookURL,
		TelegramBotToken:  input.TelegramBotToken,
		TelegramChatID:    input.TelegramChatID,
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

// GetNotificationConfigByUser retrieves a notification config only if it belongs to the user (or user is admin)
func (r *Repository) GetNotificationConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) (*models.NotificationConfig, error) {
	var notification models.NotificationConfig
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.First(&notification)

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

// ListNotificationConfigsByUser lists notification configs for a specific user (or all if admin)
func (r *Repository) ListNotificationConfigsByUser(userID uuid.UUID, isAdmin bool) ([]*models.NotificationConfig, error) {
	var configs []*models.NotificationConfig
	query := r.db.Preload("Labels").Order("created_at DESC")
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Find(&configs)

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
	notification.TelegramBotToken = input.TelegramBotToken
	notification.TelegramChatID = input.TelegramChatID

	result := r.db.Save(&notification)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update notification config: %w", result.Error)
	}

	return &notification, nil
}

// UpdateNotificationConfigByUser updates a notification config only if it belongs to the user (or user is admin)
func (r *Repository) UpdateNotificationConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool, input *models.NotificationConfigInput) (*models.NotificationConfig, error) {
	var notification models.NotificationConfig

	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&notification).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find notification config: %w", err)
	}

	notification.Name = input.Name
	notification.DiscordWebhookURL = input.DiscordWebhookURL
	notification.TelegramBotToken = input.TelegramBotToken
	notification.TelegramChatID = input.TelegramChatID

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

// DeleteNotificationConfigByUser deletes a notification config only if it belongs to the user (or user is admin)
func (r *Repository) DeleteNotificationConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Delete(&models.NotificationConfig{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete notification config: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// Database config operations

func (r *Repository) CreateDatabaseConfig(userID uuid.UUID, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	if err := input.RotationPolicy.Validate(); err != nil {
		return nil, fmt.Errorf("invalid rotation policy: %w", err)
	}

	dbConfig := &models.DatabaseConfig{
		UserID:         userID,
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

// GetDatabaseConfigByUser retrieves a database config only if it belongs to the user (or user is admin)
func (r *Repository) GetDatabaseConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) (*models.DatabaseConfig, error) {
	var dbConfig models.DatabaseConfig
	query := r.db.Preload("Storage").Preload("Notification").Preload("Labels").Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.First(&dbConfig)

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

// ListDatabaseConfigsByUser lists database configs for a specific user (or all if admin)
func (r *Repository) ListDatabaseConfigsByUser(userID uuid.UUID, isAdmin bool) ([]*models.DatabaseConfig, error) {
	var configs []*models.DatabaseConfig
	query := r.db.Preload("Storage").Preload("Notification").Preload("Labels").Order("created_at DESC")
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Find(&configs)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list database configs: %w", result.Error)
	}

	return configs, nil
}

func (r *Repository) UpdateDatabaseConfig(id uuid.UUID, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	if err := input.RotationPolicy.Validate(); err != nil {
		return nil, fmt.Errorf("invalid rotation policy: %w", err)
	}

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

// UpdateDatabaseConfigByUser updates a database config only if it belongs to the user (or user is admin)
func (r *Repository) UpdateDatabaseConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool, input *models.DatabaseConfigInput) (*models.DatabaseConfig, error) {
	if err := input.RotationPolicy.Validate(); err != nil {
		return nil, fmt.Errorf("invalid rotation policy: %w", err)
	}

	var dbConfig models.DatabaseConfig

	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&dbConfig).Error; err != nil {
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

// DeleteDatabaseConfigByUser deletes a database config only if it belongs to the user (or user is admin)
func (r *Repository) DeleteDatabaseConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Delete(&models.DatabaseConfig{})

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

// PauseDatabaseConfigByUser pauses a database config only if it belongs to the user (or user is admin)
func (r *Repository) PauseDatabaseConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Model(&models.DatabaseConfig{}).Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Update("paused", true)

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

// UnpauseDatabaseConfigByUser resumes a database config only if it belongs to the user (or user is admin)
func (r *Repository) UnpauseDatabaseConfigByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Model(&models.DatabaseConfig{}).Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Update("paused", false)

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

// SetBackupDumpFormat records which pg_dump format produced the backup so the
// restore path knows whether to use psql (plain) or pg_restore (custom).
func (r *Repository) SetBackupDumpFormat(id uuid.UUID, format models.DumpFormat) error {
	result := r.db.Model(&models.Backup{}).Where("id = ?", id).Update("dump_format", format)
	return result.Error
}

// MarkBackupDeleted flips the row to the "deleted" status and clears the
// storage path. Used by the rotation cleanup AFTER the storage object has
// been removed, so the DB never advertises a backup whose bytes are gone.
func (r *Repository) MarkBackupDeleted(id uuid.UUID) error {
	result := r.db.Model(&models.Backup{}).Where("id = ?", id).Updates(map[string]any{
		"status":       models.BackupStatusDeleted,
		"storage_path": "",
	})
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

// GetBackupByUser retrieves a backup only if the associated database belongs to the user (or user is admin)
func (r *Repository) GetBackupByUser(id uuid.UUID, userID uuid.UUID, isAdmin bool) (*models.Backup, error) {
	var backup models.Backup
	query := r.db.Preload("Database").
		Joins("JOIN database_configs ON backups.database_id = database_configs.id").
		Where("backups.id = ?", id)
	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}
	result := query.First(&backup)

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

// ListBackupsByDatabaseByUser lists backups for a database only if it belongs to the user (or user is admin)
func (r *Repository) ListBackupsByDatabaseByUser(databaseID uuid.UUID, userID uuid.UUID, isAdmin bool) ([]*models.Backup, error) {
	var backups []*models.Backup
	query := r.db.Joins("JOIN database_configs ON backups.database_id = database_configs.id").
		Where("backups.database_id = ?", databaseID)
	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}
	result := query.Order("backups.started_at DESC").Find(&backups)

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

// ListAllBackupsByUser lists all backups for a specific user (or all if admin)
func (r *Repository) ListAllBackupsByUser(userID uuid.UUID, isAdmin bool) ([]*models.Backup, error) {
	var backups []*models.Backup
	query := r.db.Preload("Database").
		Joins("JOIN database_configs ON backups.database_id = database_configs.id")
	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}
	result := query.Order("backups.started_at DESC").Find(&backups)

	if result.Error != nil {
		return nil, fmt.Errorf("failed to list all backups: %w", result.Error)
	}

	return backups, nil
}

// ListFailedBackupsByUser returns every backup row owned by the user with
// status='failed'. Used by the Settings → Maintenance "Purge failed backups"
// action so the handler can free storage objects before deleting rows.
// Admins see failures for every user; regular users only see their own.
func (r *Repository) ListFailedBackupsByUser(userID uuid.UUID, isAdmin bool) ([]*models.Backup, error) {
	var backups []*models.Backup
	query := r.db.Preload("Database").
		Joins("JOIN database_configs ON backups.database_id = database_configs.id").
		Where("backups.status = ?", models.BackupStatusFailed)
	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}
	if err := query.Order("backups.started_at DESC").Find(&backups).Error; err != nil {
		return nil, fmt.Errorf("failed to list failed backups: %w", err)
	}
	return backups, nil
}

// CountFailedBackupsByUser is a cheap counter used by the Settings UI to
// render "Purge N failed backups" before the user clicks the destructive
// action.
func (r *Repository) CountFailedBackupsByUser(userID uuid.UUID, isAdmin bool) (int64, error) {
	var count int64
	query := r.db.Model(&models.Backup{}).
		Joins("JOIN database_configs ON backups.database_id = database_configs.id").
		Where("backups.status = ?", models.BackupStatusFailed)
	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count failed backups: %w", err)
	}
	return count, nil
}

// DeleteBackupsByIDs bulk-deletes Backup rows by primary key.
func (r *Repository) DeleteBackupsByIDs(ids []uuid.UUID) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	res := r.db.Where("id IN ?", ids).Delete(&models.Backup{})
	if res.Error != nil {
		return 0, fmt.Errorf("failed to delete backups: %w", res.Error)
	}
	return res.RowsAffected, nil
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

// GetSystemStatsByUser returns system stats filtered by user's resources
func (r *Repository) GetSystemStatsByUser(userID uuid.UUID, isAdmin bool) (*models.SystemStats, error) {
	// If admin, return all stats
	if isAdmin {
		return r.GetSystemStats()
	}

	stats := &models.SystemStats{}

	// Total databases for this user
	var totalDatabases int64
	r.db.Model(&models.DatabaseConfig{}).
		Where("enabled = ? AND user_id = ?", true, userID).
		Count(&totalDatabases)
	stats.TotalDatabases = int(totalDatabases)

	// Get user's database IDs for backup filtering
	var dbIDs []uuid.UUID
	r.db.Model(&models.DatabaseConfig{}).
		Where("user_id = ?", userID).
		Pluck("id", &dbIDs)

	// Backups in last 24 hours for user's databases
	yesterday := time.Now().Add(-24 * time.Hour)
	var totalBackups24h int64
	if len(dbIDs) > 0 {
		r.db.Model(&models.Backup{}).
			Where("created_at > ? AND database_id IN ?", yesterday, dbIDs).
			Count(&totalBackups24h)
	}
	stats.TotalBackups24h = int(totalBackups24h)

	// Success and failure counts for user's databases
	var successCount int64
	var failureCount int64

	if len(dbIDs) > 0 {
		r.db.Model(&models.Backup{}).
			Where("status = ? AND created_at > ? AND database_id IN ?", models.BackupStatusSuccess, yesterday, dbIDs).
			Count(&successCount)

		r.db.Model(&models.Backup{}).
			Where("status = ? AND created_at > ? AND database_id IN ?", models.BackupStatusFailed, yesterday, dbIDs).
			Count(&failureCount)
	}

	if stats.TotalBackups24h > 0 {
		stats.SuccessRate24h = float64(successCount) / float64(stats.TotalBackups24h) * 100
		stats.FailureRate24h = float64(failureCount) / float64(stats.TotalBackups24h) * 100
	}

	// Total storage used by user's backups
	type SumResult struct {
		Total int64
	}
	var sumResult SumResult
	if len(dbIDs) > 0 {
		r.db.Model(&models.Backup{}).
			Where("status = ? AND database_id IN ?", models.BackupStatusSuccess, dbIDs).
			Select("COALESCE(SUM(size_bytes), 0) as total").
			Scan(&sumResult)
	}

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

// LogActivity is a helper function to quickly log an activity.
//
// Writes from demo accounts are silently dropped: the demo is a public
// preview and its actions are not audit-worthy. Doing the suppression here
// covers every current and future call site without each handler having to
// remember to skip demo. The lookup is a single indexed scalar read.
func (r *Repository) LogActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, entityName, description, metadata, ipAddress string) error {

	if userID != nil {
		var isDemo bool
		if err := r.db.Model(&models.User{}).
			Select("is_demo").
			Where("id = ?", *userID).
			Scan(&isDemo).Error; err == nil && isDemo {
			return nil
		}
	}

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

// ListActivityLogsByUser retrieves activity logs for a specific user with optional filtering
// If isAdmin is true, returns all logs (or filtered by params.UserID if specified)
func (r *Repository) ListActivityLogsByUser(userID uuid.UUID, isAdmin bool, params *models.ActivityLogListParams) ([]*models.ActivityLog, int64, error) {
	var logs []*models.ActivityLog
	var total int64

	query := r.db.Model(&models.ActivityLog{}).Preload("User")

	// Apply user filter - admins can see all, regular users only their own logs
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	} else if params.UserID != nil {
		// Admin can filter by specific user if they want
		query = query.Where("user_id = ?", params.UserID)
	}

	// Apply other filters
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
		limit = 50
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

// GetActivityLogByUser retrieves a single activity log by ID with user ownership check
// If isAdmin is true, returns the log regardless of owner
func (r *Repository) GetActivityLogByUser(id, userID uuid.UUID, isAdmin bool) (*models.ActivityLog, error) {
	var log models.ActivityLog
	query := r.db.Preload("User").Where("id = ?", id)

	// Non-admins can only see their own logs
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.First(&log)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get activity log: %w", result.Error)
	}

	return &log, nil
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

// SetPendingUser2FASecret stores an unverified TOTP secret in the pending
// column with an expiry. Replaces any prior pending secret for the same
// user (treats Setup2FA as idempotent within the pending window). The
// active TwoFactorSecret is untouched, so an attacker cannot use a repeat
// Setup2FA call to lock an enrolled user out of their existing 2FA.
func (r *Repository) SetPendingUser2FASecret(userID uuid.UUID, secret string, ttl time.Duration) error {
	expires := time.Now().Add(ttl)
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"pending_two_factor_secret":     secret,
			"pending_two_factor_expires_at": expires,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to set pending 2FA secret: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// PromotePendingUser2FASecret moves the pending secret into the active
// TwoFactorSecret column, clears the pending fields, and enables 2FA with
// the provided backup codes. Performed in a single transaction to avoid a
// half-enrolled state.
func (r *Repository) PromotePendingUser2FASecret(userID uuid.UUID, secret string, backupCodes []string) error {
	now := time.Now()
	return r.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Exec(`
			UPDATE users
			SET two_factor_secret = $1,
			    two_factor_enabled = true,
			    two_factor_verified_at = $2,
			    two_factor_backup_codes = $3,
			    pending_two_factor_secret = '',
			    pending_two_factor_expires_at = NULL,
			    updated_at = $4
			WHERE id = $5`,
			secret, now, pq.Array(backupCodes), now, userID)

		if result.Error != nil {
			return fmt.Errorf("failed to promote pending 2FA secret: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

// DisableUser2FA disables 2FA for a user
func (r *Repository) DisableUser2FA(userID uuid.UUID) error {
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"two_factor_enabled":            false,
			"two_factor_secret":             nil,
			"two_factor_backup_codes":       nil,
			"two_factor_verified_at":        nil,
			"pending_two_factor_secret":     "",
			"pending_two_factor_expires_at": nil,
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

// ========================================
// User Profile Operations
// ========================================

// UpdateUserProfilePicture updates the user's profile picture stored as binary data
func (r *Repository) UpdateUserProfilePicture(userID uuid.UUID, imageData []byte, mimeType string) error {
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"profile_picture_data":      imageData,
			"profile_picture_mime_type": mimeType,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to update profile picture: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// DeleteUserProfilePicture removes the user's profile picture
func (r *Repository) DeleteUserProfilePicture(userID uuid.UUID) error {
	result := r.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"profile_picture_data":      nil,
			"profile_picture_mime_type": "",
		})

	if result.Error != nil {
		return fmt.Errorf("failed to delete profile picture: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// ========================================
// Demo Account Operations
// ========================================

// GetDemoUser retrieves the demo user account
func (r *Repository) GetDemoUser() (*models.User, error) {
	var user models.User
	result := r.db.Where("is_demo = ?", true).First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get demo user: %w", result.Error)
	}

	return &user, nil
}

// SeedDemoUser creates the demo user account
func (r *Repository) SeedDemoUser(username, email string) (*models.User, error) {
	// Check if demo user already exists
	existing, err := r.GetDemoUser()
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return existing, nil
	}

	user := &models.User{
		ID:              uuid.New(),
		DiscordUserID:   username,
		DiscordUsername: username,
		Email:           email,
		IsDemo:          true,
	}

	result := r.db.Create(user)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to seed demo user: %w", result.Error)
	}

	return user, nil
}

// ========================================
// Label Operations
// ========================================

// CreateLabel creates a new label for a user
func (r *Repository) CreateLabel(userID uuid.UUID, input *models.LabelInput) (*models.Label, error) {
	// Check label count limit (50 labels per user)
	var count int64
	if err := r.db.Model(&models.Label{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
		return nil, fmt.Errorf("failed to count labels: %w", err)
	}
	if count >= 50 {
		return nil, fmt.Errorf("label limit reached: maximum 50 labels per user")
	}

	label := &models.Label{
		UserID:      userID,
		Name:        input.Name,
		Color:       input.Color,
		Description: input.Description,
	}

	result := r.db.Create(label)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to create label: %w", result.Error)
	}

	return label, nil
}

// GetLabel retrieves a label by ID with user isolation
func (r *Repository) GetLabel(id, userID uuid.UUID, isAdmin bool) (*models.Label, error) {
	var label models.Label
	query := r.db.Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.First(&label)
	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get label: %w", result.Error)
	}

	return &label, nil
}

// ListLabelsByUser retrieves all labels for a user with usage statistics.
// Aggregates the per-label association counts in three GROUP BY queries
// (one per association table) instead of three queries per label, taking
// the cost from O(n) DB roundtrips to O(1) regardless of label count.
func (r *Repository) ListLabelsByUser(userID uuid.UUID, isAdmin bool) ([]*models.LabelWithUsage, error) {
	var labels []*models.Label
	query := r.db.Order("name ASC")

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.Find(&labels)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to list labels: %w", result.Error)
	}

	if len(labels) == 0 {
		return []*models.LabelWithUsage{}, nil
	}

	labelIDs := make([]uuid.UUID, 0, len(labels))
	for _, l := range labels {
		labelIDs = append(labelIDs, l.ID)
	}

	type countRow struct {
		LabelID uuid.UUID
		Count   int64
	}

	loadCounts := func(model any) (map[uuid.UUID]int, error) {
		var rows []countRow
		if err := r.db.Model(model).
			Select("label_id, COUNT(*) AS count").
			Where("label_id IN ?", labelIDs).
			Group("label_id").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		out := make(map[uuid.UUID]int, len(rows))
		for _, row := range rows {
			out[row.LabelID] = int(row.Count)
		}
		return out, nil
	}

	dbCounts, err := loadCounts(&models.DatabaseLabel{})
	if err != nil {
		return nil, fmt.Errorf("count database labels: %w", err)
	}
	storageCounts, err := loadCounts(&models.StorageLabel{})
	if err != nil {
		return nil, fmt.Errorf("count storage labels: %w", err)
	}
	notificationCounts, err := loadCounts(&models.NotificationLabel{})
	if err != nil {
		return nil, fmt.Errorf("count notification labels: %w", err)
	}

	labelsWithUsage := make([]*models.LabelWithUsage, len(labels))
	for i, label := range labels {
		usage := &models.LabelWithUsage{
			Label:             *label,
			DatabaseCount:     dbCounts[label.ID],
			StorageCount:      storageCounts[label.ID],
			NotificationCount: notificationCounts[label.ID],
		}
		usage.TotalUsage = usage.DatabaseCount + usage.StorageCount + usage.NotificationCount
		labelsWithUsage[i] = usage
	}

	return labelsWithUsage, nil
}

// UpdateLabel updates a label with user isolation
func (r *Repository) UpdateLabel(id, userID uuid.UUID, isAdmin bool, input *models.LabelInput) (*models.Label, error) {
	var label models.Label
	query := r.db.Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	if err := query.First(&label).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, fmt.Errorf("failed to find label: %w", err)
	}

	label.Name = input.Name
	label.Color = input.Color
	label.Description = input.Description

	result := r.db.Save(&label)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update label: %w", result.Error)
	}

	return &label, nil
}

// DeleteLabel deletes a label and all its associations
func (r *Repository) DeleteLabel(id, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	// GORM will automatically delete associations due to many2many relationships
	result := query.Delete(&models.Label{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete label: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// ========================================
// Database Label Assignment Operations
// ========================================

// AssignLabelsToDatabase assigns labels to a database config
func (r *Repository) AssignLabelsToDatabase(dbID, userID uuid.UUID, isAdmin bool, labelIDs []uuid.UUID) error {
	// Validate label count limit (10 labels per database)
	if len(labelIDs) > 10 {
		return fmt.Errorf("label limit exceeded: maximum 10 labels per database")
	}

	// Verify database ownership
	var db models.DatabaseConfig
	query := r.db.Where("id = ?", dbID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&db).Error; err != nil {
		return fmt.Errorf("database not found or access denied: %w", err)
	}

	// Verify all labels belong to the user
	var labels []models.Label
	labelQuery := r.db.Where("id IN ?", labelIDs)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.Find(&labels).Error; err != nil {
		return fmt.Errorf("failed to verify labels: %w", err)
	}
	if len(labels) != len(labelIDs) {
		return fmt.Errorf("one or more labels not found or access denied")
	}

	// Use GORM association to replace labels
	if err := r.db.Model(&db).Association("Labels").Replace(&labels); err != nil {
		return fmt.Errorf("failed to assign labels: %w", err)
	}

	return nil
}

// RemoveLabelFromDatabase removes a specific label from a database config
func (r *Repository) RemoveLabelFromDatabase(dbID, labelID, userID uuid.UUID, isAdmin bool) error {
	// Verify database ownership
	var db models.DatabaseConfig
	query := r.db.Where("id = ?", dbID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&db).Error; err != nil {
		return fmt.Errorf("database not found or access denied: %w", err)
	}

	// Verify label ownership
	var label models.Label
	labelQuery := r.db.Where("id = ?", labelID)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.First(&label).Error; err != nil {
		return fmt.Errorf("label not found or access denied: %w", err)
	}

	// Remove the association
	if err := r.db.Model(&db).Association("Labels").Delete(&label); err != nil {
		return fmt.Errorf("failed to remove label: %w", err)
	}

	return nil
}

// GetDatabaseWithLabels retrieves a database config with its labels preloaded
func (r *Repository) GetDatabaseWithLabels(id, userID uuid.UUID, isAdmin bool) (*models.DatabaseConfig, error) {
	var db models.DatabaseConfig
	query := r.db.Preload("Labels").Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.First(&db)
	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get database: %w", result.Error)
	}

	return &db, nil
}

// ========================================
// Storage Label Assignment Operations
// ========================================

// AssignLabelsToStorage assigns labels to a storage config
func (r *Repository) AssignLabelsToStorage(storageID, userID uuid.UUID, isAdmin bool, labelIDs []uuid.UUID) error {
	// Validate label count limit (10 labels per storage)
	if len(labelIDs) > 10 {
		return fmt.Errorf("label limit exceeded: maximum 10 labels per storage")
	}

	// Verify storage ownership
	var storage models.StorageConfig
	query := r.db.Where("id = ?", storageID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&storage).Error; err != nil {
		return fmt.Errorf("storage not found or access denied: %w", err)
	}

	// Verify all labels belong to the user
	var labels []models.Label
	labelQuery := r.db.Where("id IN ?", labelIDs)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.Find(&labels).Error; err != nil {
		return fmt.Errorf("failed to verify labels: %w", err)
	}
	if len(labels) != len(labelIDs) {
		return fmt.Errorf("one or more labels not found or access denied")
	}

	// Use GORM association to replace labels
	if err := r.db.Model(&storage).Association("Labels").Replace(&labels); err != nil {
		return fmt.Errorf("failed to assign labels: %w", err)
	}

	return nil
}

// RemoveLabelFromStorage removes a specific label from a storage config
func (r *Repository) RemoveLabelFromStorage(storageID, labelID, userID uuid.UUID, isAdmin bool) error {
	// Verify storage ownership
	var storage models.StorageConfig
	query := r.db.Where("id = ?", storageID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&storage).Error; err != nil {
		return fmt.Errorf("storage not found or access denied: %w", err)
	}

	// Verify label ownership
	var label models.Label
	labelQuery := r.db.Where("id = ?", labelID)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.First(&label).Error; err != nil {
		return fmt.Errorf("label not found or access denied: %w", err)
	}

	// Remove the association
	if err := r.db.Model(&storage).Association("Labels").Delete(&label); err != nil {
		return fmt.Errorf("failed to remove label: %w", err)
	}

	return nil
}

// GetStorageWithLabels retrieves a storage config with its labels preloaded
func (r *Repository) GetStorageWithLabels(id, userID uuid.UUID, isAdmin bool) (*models.StorageConfig, error) {
	var storage models.StorageConfig
	query := r.db.Preload("Labels").Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.First(&storage)
	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get storage: %w", result.Error)
	}

	return &storage, nil
}

// ========================================
// Notification Label Assignment Operations
// ========================================

// AssignLabelsToNotification assigns labels to a notification config
func (r *Repository) AssignLabelsToNotification(notifID, userID uuid.UUID, isAdmin bool, labelIDs []uuid.UUID) error {
	// Validate label count limit (10 labels per notification)
	if len(labelIDs) > 10 {
		return fmt.Errorf("label limit exceeded: maximum 10 labels per notification")
	}

	// Verify notification ownership
	var notif models.NotificationConfig
	query := r.db.Where("id = ?", notifID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&notif).Error; err != nil {
		return fmt.Errorf("notification not found or access denied: %w", err)
	}

	// Verify all labels belong to the user
	var labels []models.Label
	labelQuery := r.db.Where("id IN ?", labelIDs)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.Find(&labels).Error; err != nil {
		return fmt.Errorf("failed to verify labels: %w", err)
	}
	if len(labels) != len(labelIDs) {
		return fmt.Errorf("one or more labels not found or access denied")
	}

	// Use GORM association to replace labels
	if err := r.db.Model(&notif).Association("Labels").Replace(&labels); err != nil {
		return fmt.Errorf("failed to assign labels: %w", err)
	}

	return nil
}

// RemoveLabelFromNotification removes a specific label from a notification config
func (r *Repository) RemoveLabelFromNotification(notifID, labelID, userID uuid.UUID, isAdmin bool) error {
	// Verify notification ownership
	var notif models.NotificationConfig
	query := r.db.Where("id = ?", notifID)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&notif).Error; err != nil {
		return fmt.Errorf("notification not found or access denied: %w", err)
	}

	// Verify label ownership
	var label models.Label
	labelQuery := r.db.Where("id = ?", labelID)
	if !isAdmin {
		labelQuery = labelQuery.Where("user_id = ?", userID)
	}
	if err := labelQuery.First(&label).Error; err != nil {
		return fmt.Errorf("label not found or access denied: %w", err)
	}

	// Remove the association
	if err := r.db.Model(&notif).Association("Labels").Delete(&label); err != nil {
		return fmt.Errorf("failed to remove label: %w", err)
	}

	return nil
}

// GetNotificationWithLabels retrieves a notification config with its labels preloaded
func (r *Repository) GetNotificationWithLabels(id, userID uuid.UUID, isAdmin bool) (*models.NotificationConfig, error) {
	var notif models.NotificationConfig
	query := r.db.Preload("Labels").Where("id = ?", id)

	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}

	result := query.First(&notif)
	if result.Error == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get notification: %w", result.Error)
	}

	return &notif, nil
}

// ========================================
// Helper: List entities by label
// ========================================

// ListDatabasesByLabel retrieves all databases with a specific label
func (r *Repository) ListDatabasesByLabel(labelID, userID uuid.UUID, isAdmin bool) ([]*models.DatabaseConfig, error) {
	var databases []*models.DatabaseConfig
	query := r.db.Joins("JOIN database_labels ON database_labels.database_id = database_configs.id").
		Where("database_labels.label_id = ?", labelID).
		Preload("Labels")

	if !isAdmin {
		query = query.Where("database_configs.user_id = ?", userID)
	}

	result := query.Find(&databases)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to list databases by label: %w", result.Error)
	}

	return databases, nil
}

// ListStorageByLabel retrieves all storage configs with a specific label
func (r *Repository) ListStorageByLabel(labelID, userID uuid.UUID, isAdmin bool) ([]*models.StorageConfig, error) {
	var storages []*models.StorageConfig
	query := r.db.Joins("JOIN storage_labels ON storage_labels.storage_id = storage_configs.id").
		Where("storage_labels.label_id = ?", labelID).
		Preload("Labels")

	if !isAdmin {
		query = query.Where("storage_configs.user_id = ?", userID)
	}

	result := query.Find(&storages)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to list storage by label: %w", result.Error)
	}

	return storages, nil
}

// ListNotificationsByLabel retrieves all notifications with a specific label
func (r *Repository) ListNotificationsByLabel(labelID, userID uuid.UUID, isAdmin bool) ([]*models.NotificationConfig, error) {
	var notifications []*models.NotificationConfig
	query := r.db.Joins("JOIN notification_labels ON notification_labels.notification_id = notification_configs.id").
		Where("notification_labels.label_id = ?", labelID).
		Preload("Labels")

	if !isAdmin {
		query = query.Where("notification_configs.user_id = ?", userID)
	}

	result := query.Find(&notifications)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to list notifications by label: %w", result.Error)
	}

	return notifications, nil
}

// ============================================================================
// ServerConnection (DB Servers feature) — direct PostgreSQL administration.
// Callers MUST pass the already-encrypted password ciphertext; this layer
// stores opaque bytes and never sees plaintext.
// ============================================================================

// CreateServerConnection persists a new server connection. The password
// parameter must already be the AES-GCM ciphertext (caller responsibility).
func (r *Repository) CreateServerConnection(userID uuid.UUID, input *models.ServerConnectionInput, encryptedPassword string) (*models.ServerConnection, error) {
	sslMode := input.SSLMode
	if sslMode == "" {
		sslMode = "prefer"
	}
	sc := &models.ServerConnection{
		UserID:   userID,
		Name:     input.Name,
		Host:     input.Host,
		Port:     input.Port,
		Username: input.Username,
		Password: encryptedPassword,
		SSLMode:  sslMode,
	}
	if err := r.db.Create(sc).Error; err != nil {
		return nil, fmt.Errorf("failed to create server connection: %w", err)
	}
	return sc, nil
}

// GetServerConnectionByUser fetches a server connection scoped by owner
// (admin bypass). Returns (nil, nil) when not found, matching the convention
// used by the other GetXByUser methods.
func (r *Repository) GetServerConnectionByUser(id, userID uuid.UUID, isAdmin bool) (*models.ServerConnection, error) {
	var sc models.ServerConnection
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&sc).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get server connection: %w", err)
	}
	return &sc, nil
}

// ListServerConnectionsByUser lists all server connections owned by a user
// (or all when the caller is an admin).
func (r *Repository) ListServerConnectionsByUser(userID uuid.UUID, isAdmin bool) ([]*models.ServerConnection, error) {
	var items []*models.ServerConnection
	query := r.db.Order("created_at DESC")
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.Find(&items).Error; err != nil {
		return nil, fmt.Errorf("failed to list server connections: %w", err)
	}
	return items, nil
}

// UpdateServerConnectionByUser updates a server connection. If
// encryptedPassword is empty, the existing password is preserved.
func (r *Repository) UpdateServerConnectionByUser(id, userID uuid.UUID, isAdmin bool, input *models.ServerConnectionInput, encryptedPassword string) (*models.ServerConnection, error) {
	var sc models.ServerConnection
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.First(&sc).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find server connection: %w", err)
	}

	sc.Name = input.Name
	sc.Host = input.Host
	sc.Port = input.Port
	sc.Username = input.Username
	if input.SSLMode != "" {
		sc.SSLMode = input.SSLMode
	}
	if encryptedPassword != "" {
		sc.Password = encryptedPassword
	}

	if err := r.db.Save(&sc).Error; err != nil {
		return nil, fmt.Errorf("failed to update server connection: %w", err)
	}
	return &sc, nil
}

// DeleteServerConnectionByUser deletes a server connection scoped by owner.
func (r *Repository) DeleteServerConnectionByUser(id, userID uuid.UUID, isAdmin bool) error {
	query := r.db.Where("id = ?", id)
	if !isAdmin {
		query = query.Where("user_id = ?", userID)
	}
	result := query.Delete(&models.ServerConnection{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete server connection: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// UpdateServerConnectionTestResult records the outcome of a connection test.
// Failures are still recorded so the UI can show what went wrong.
func (r *Repository) UpdateServerConnectionTestResult(id uuid.UUID, status, sslMode, errMessage string) error {
	now := time.Now()
	return r.db.Model(&models.ServerConnection{}).Where("id = ?", id).Updates(map[string]any{
		"last_tested_at":     now,
		"last_test_status":   status,
		"last_test_ssl_mode": sslMode,
		"last_test_error":    errMessage,
	}).Error
}
