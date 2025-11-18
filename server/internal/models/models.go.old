package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a system user
type User struct {
	ID              uuid.UUID `json:"id" db:"id"`
	DiscordUserID   string    `json:"discord_user_id" db:"discord_user_id"`
	DiscordUsername string    `json:"discord_username,omitempty" db:"discord_username"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// OTPToken represents a one-time password token
type OTPToken struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	OTPCode   string    `json:"otp_code" db:"otp_code"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	Used      bool      `json:"used" db:"used"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// StorageProvider represents supported storage providers
type StorageProvider string

const (
	StorageProviderS3 StorageProvider = "s3"
	StorageProviderR2 StorageProvider = "r2"
)

// StorageConfig represents cloud storage configuration
type StorageConfig struct {
	ID        uuid.UUID       `json:"id" db:"id"`
	Name      string          `json:"name" db:"name"`
	Provider  StorageProvider `json:"provider" db:"provider"`
	Bucket    string          `json:"bucket" db:"bucket"`
	Region    string          `json:"region,omitempty" db:"region"`
	Endpoint  string          `json:"endpoint,omitempty" db:"endpoint"`
	AccessKey string          `json:"-" db:"access_key"` // Hidden from JSON
	SecretKey string          `json:"-" db:"secret_key"` // Hidden from JSON
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt time.Time       `json:"updated_at" db:"updated_at"`
}

// StorageConfigInput for API requests
type StorageConfigInput struct {
	Name      string          `json:"name" validate:"required"`
	Provider  StorageProvider `json:"provider" validate:"required,oneof=s3 r2"`
	Bucket    string          `json:"bucket" validate:"required"`
	Region    string          `json:"region"`
	Endpoint  string          `json:"endpoint"`
	AccessKey string          `json:"access_key" validate:"required"`
	SecretKey string          `json:"secret_key" validate:"required"`
}

// NotificationConfig represents Discord notification configuration
type NotificationConfig struct {
	ID                uuid.UUID `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	DiscordWebhookURL string    `json:"-" db:"discord_webhook_url"` // Hidden from JSON
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// NotificationConfigInput for API requests
type NotificationConfigInput struct {
	Name              string `json:"name" validate:"required"`
	DiscordWebhookURL string `json:"discord_webhook_url" validate:"required,url"`
}

// RotationPolicyType represents the type of backup rotation
type RotationPolicyType string

const (
	RotationPolicyCount RotationPolicyType = "count"
	RotationPolicyDays  RotationPolicyType = "days"
)

// RotationPolicy represents backup retention policy
type RotationPolicy struct {
	Type  RotationPolicyType `json:"type" validate:"required,oneof=count days"`
	Value int                `json:"value" validate:"required,min=1"`
}

// DatabaseConfig represents a database backup configuration
type DatabaseConfig struct {
	ID                   uuid.UUID          `json:"id" db:"id"`
	Name                 string             `json:"name" db:"name"`
	Host                 string             `json:"host" db:"host"`
	Port                 int                `json:"port" db:"port"`
	DBName               string             `json:"dbname" db:"dbname"`
	Username             string             `json:"user" db:"username"`
	Password             string             `json:"-" db:"password"` // Hidden from JSON
	Schedule             string             `json:"schedule" db:"schedule"`
	StorageID            uuid.UUID          `json:"storage_id" db:"storage_id"`
	NotificationID       *uuid.UUID         `json:"notification_id,omitempty" db:"notification_id"`
	RotationPolicyType   RotationPolicyType `json:"-" db:"rotation_policy_type"`
	RotationPolicyValue  int                `json:"-" db:"rotation_policy_value"`
	RotationPolicy       RotationPolicy     `json:"rotation_policy" db:"-"`
	Enabled              bool               `json:"enabled" db:"enabled"`
	CreatedAt            time.Time          `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time          `json:"updated_at" db:"updated_at"`
}

// DatabaseConfigInput for API requests
type DatabaseConfigInput struct {
	Name           string         `json:"name" validate:"required"`
	Host           string         `json:"host" validate:"required"`
	Port           int            `json:"port" validate:"required,min=1,max=65535"`
	DBName         string         `json:"dbname" validate:"required"`
	Username       string         `json:"user" validate:"required"`
	Password       string         `json:"password" validate:"required"`
	Schedule       string         `json:"schedule" validate:"required"` // Cron expression
	StorageID      uuid.UUID      `json:"storage_id" validate:"required"`
	NotificationID *uuid.UUID     `json:"notification_id,omitempty"`
	RotationPolicy RotationPolicy `json:"rotation_policy" validate:"required"`
}

// BackupStatus represents the status of a backup
type BackupStatus string

const (
	BackupStatusPending BackupStatus = "pending"
	BackupStatusRunning BackupStatus = "running"
	BackupStatusSuccess BackupStatus = "success"
	BackupStatusFailed  BackupStatus = "failed"
)

// Backup represents a backup record
type Backup struct {
	ID           uuid.UUID    `json:"id" db:"id"`
	DatabaseID   uuid.UUID    `json:"database_id" db:"database_id"`
	Status       BackupStatus `json:"status" db:"status"`
	SizeBytes    *int64       `json:"size_bytes,omitempty" db:"size_bytes"`
	StoragePath  string       `json:"storage_path,omitempty" db:"storage_path"`
	ErrorMessage *string      `json:"error_message,omitempty" db:"error_message"`
	StartedAt    time.Time    `json:"timestamp" db:"started_at"`
	CompletedAt  *time.Time   `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt    time.Time    `json:"-" db:"created_at"`
}

// RestoreRequest represents a restore operation request
type RestoreRequest struct {
	TargetHost     string `json:"target_host,omitempty"`
	TargetPort     int    `json:"target_port,omitempty"`
	TargetDBName   string `json:"target_dbname,omitempty"`
	TargetUser     string `json:"target_user,omitempty"`
	TargetPassword string `json:"target_password,omitempty"`
}

// RestoreJob represents a restore job
type RestoreJob struct {
	ID             uuid.UUID    `json:"id" db:"id"`
	BackupID       uuid.UUID    `json:"backup_id" db:"backup_id"`
	TargetHost     *string      `json:"target_host,omitempty" db:"target_host"`
	TargetPort     *int         `json:"target_port,omitempty" db:"target_port"`
	TargetDBName   *string      `json:"target_dbname,omitempty" db:"target_dbname"`
	TargetUser     *string      `json:"target_user,omitempty" db:"target_user"`
	TargetPassword *string      `json:"-" db:"target_password"`
	Status         BackupStatus `json:"status" db:"status"`
	ErrorMessage   *string      `json:"error_message,omitempty" db:"error_message"`
	StartedAt      time.Time    `json:"started_at" db:"started_at"`
	CompletedAt    *time.Time   `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt      time.Time    `json:"created_at" db:"created_at"`
}

// SystemStats represents system-wide statistics
type SystemStats struct {
	TotalDatabases        int     `json:"total_databases"`
	TotalBackups24h       int     `json:"total_backups_24h"`
	SuccessRate24h        float64 `json:"success_rate_24h"`
	FailureRate24h        float64 `json:"failure_rate_24h"`
	TotalStorageUsedBytes int64   `json:"total_storage_used_bytes"`
}

// LoginRequest for authentication (simplified for single-user)
type LoginRequest struct {
	Username string `json:"username,omitempty"` // Optional, defaults to "admin"
}

// VerifyRequest for OTP verification
type VerifyRequest struct {
	Username string `json:"username,omitempty"` // Optional, defaults to "admin"
	OTP      string `json:"otp" validate:"required,len=6"`
}

// AuthResponse for successful authentication
type AuthResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// APIError represents a standard API error response
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
