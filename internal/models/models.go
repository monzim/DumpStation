package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User represents a system user
type User struct {
	ID              uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	DiscordUserID   string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"discord_user_id"`
	DiscordUsername string    `gorm:"type:varchar(255)" json:"discord_username,omitempty"`
	CreatedAt       time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook for User
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// OTPToken represents a one-time password token
type OTPToken struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	OTPCode   string    `gorm:"type:varchar(6);not null" json:"otp_code"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expires_at"`
	Used      bool      `gorm:"default:false" json:"used"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate hook for OTPToken
func (o *OTPToken) BeforeCreate(tx *gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	return nil
}

// StorageProvider represents supported storage providers
type StorageProvider string

const (
	StorageProviderS3 StorageProvider = "s3"
	StorageProviderR2 StorageProvider = "r2"
)

// StorageConfig represents cloud storage configuration
type StorageConfig struct {
	ID        uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name      string          `gorm:"type:varchar(255);not null" json:"name"`
	Provider  StorageProvider `gorm:"type:varchar(50);not null;check:provider IN ('s3','r2')" json:"provider"`
	Bucket    string          `gorm:"type:varchar(255);not null" json:"bucket"`
	Region    string          `gorm:"type:varchar(100)" json:"region,omitempty"`
	Endpoint  string          `gorm:"type:varchar(500)" json:"endpoint,omitempty"`
	AccessKey string          `gorm:"type:text;not null" json:"-"`
	SecretKey string          `gorm:"type:text;not null" json:"-"`
	CreatedAt time.Time       `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook for StorageConfig
func (s *StorageConfig) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// StorageConfigInput for API requests
type StorageConfigInput struct {
	Name      string          `json:"name" validate:"required" example:"My R2 Bucket"`
	Provider  StorageProvider `json:"provider" validate:"required,oneof=s3 r2" example:"r2"`
	Bucket    string          `json:"bucket" validate:"required" example:"my-backup-bucket"`
	Region    string          `json:"region" example:"auto"`
	Endpoint  string          `json:"endpoint" example:"https://account-id.r2.cloudflarestorage.com"`
	AccessKey string          `json:"access_key" validate:"required" example:"your-access-key"`
	SecretKey string          `json:"secret_key" validate:"required" example:"your-secret-key"`
}

// NotificationConfig represents Discord notification configuration
type NotificationConfig struct {
	ID                uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name              string    `gorm:"type:varchar(255);not null" json:"name"`
	DiscordWebhookURL string    `gorm:"type:text;not null" json:"-"`
	CreatedAt         time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook for NotificationConfig
func (n *NotificationConfig) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}

// NotificationConfigInput for API requests
type NotificationConfigInput struct {
	Name              string `json:"name" validate:"required" example:"DevOps Alerts"`
	DiscordWebhookURL string `json:"discord_webhook_url" validate:"required,url" example:"https://discord.com/api/webhooks/..."`
}

// RotationPolicyType represents the type of backup rotation
type RotationPolicyType string

const (
	RotationPolicyCount RotationPolicyType = "count"
	RotationPolicyDays  RotationPolicyType = "days"
)

// RotationPolicy represents backup retention policy
type RotationPolicy struct {
	Type  RotationPolicyType `json:"type" validate:"required,oneof=count days" example:"days"`
	Value int                `json:"value" validate:"required,min=1" example:"30"`
}

// DatabaseConfig represents a database backup configuration
type DatabaseConfig struct {
	ID                  uuid.UUID          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name                string             `gorm:"type:varchar(255);not null" json:"name"`
	Host                string             `gorm:"type:varchar(255);not null" json:"host"`
	Port                int                `gorm:"not null;default:5432" json:"port"`
	DBName              string             `gorm:"column:dbname;type:varchar(255);not null" json:"dbname"`
	Username            string             `gorm:"type:varchar(255);not null" json:"user"`
	Password            string             `gorm:"type:text;not null" json:"-"`
	Schedule            string             `gorm:"type:varchar(100);not null" json:"schedule"`
	StorageID           uuid.UUID          `gorm:"type:uuid;not null;index" json:"storage_id"`
	Storage             StorageConfig      `gorm:"foreignKey:StorageID;constraint:OnDelete:RESTRICT" json:"-"`
	NotificationID      *uuid.UUID         `gorm:"type:uuid;index" json:"notification_id,omitempty"`
	Notification        *NotificationConfig `gorm:"foreignKey:NotificationID;constraint:OnDelete:SET NULL" json:"-"`
	RotationPolicyType  RotationPolicyType `gorm:"type:varchar(20);not null;check:rotation_policy_type IN ('count','days')" json:"-"`
	RotationPolicyValue int                `gorm:"not null" json:"-"`
	Enabled             bool               `gorm:"default:true" json:"enabled"`
	CreatedAt           time.Time          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt           time.Time          `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook for DatabaseConfig
func (d *DatabaseConfig) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// AfterFind hook to populate RotationPolicy
func (d *DatabaseConfig) AfterFind(tx *gorm.DB) error {
	// This will be set manually in repository layer
	return nil
}

// GetRotationPolicy returns the rotation policy
func (d *DatabaseConfig) GetRotationPolicy() RotationPolicy {
	return RotationPolicy{
		Type:  d.RotationPolicyType,
		Value: d.RotationPolicyValue,
	}
}

// SetRotationPolicy sets the rotation policy
func (d *DatabaseConfig) SetRotationPolicy(policy RotationPolicy) {
	d.RotationPolicyType = policy.Type
	d.RotationPolicyValue = policy.Value
}

// MarshalJSON custom JSON marshaling to include rotation_policy
func (d *DatabaseConfig) MarshalJSON() ([]byte, error) {
	type Alias DatabaseConfig
	return json.Marshal(&struct {
		*Alias
		RotationPolicy RotationPolicy `json:"rotation_policy"`
	}{
		Alias:          (*Alias)(d),
		RotationPolicy: d.GetRotationPolicy(),
	})
}

// DatabaseConfigInput for API requests
type DatabaseConfigInput struct {
	Name           string         `json:"name" validate:"required" example:"Production DB"`
	Host           string         `json:"host" validate:"required" example:"db.example.com"`
	Port           int            `json:"port" validate:"required,min=1,max=65535" example:"5432"`
	DBName         string         `json:"dbname" validate:"required" example:"proddb"`
	Username       string         `json:"user" validate:"required" example:"backup_user"`
	Password       string         `json:"password" validate:"required" example:"secure_password"`
	Schedule       string         `json:"schedule" validate:"required" example:"0 2 * * *"`
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
	ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	DatabaseID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"database_id"`
	Database     DatabaseConfig `gorm:"foreignKey:DatabaseID;constraint:OnDelete:CASCADE" json:"-"`
	Status       BackupStatus   `gorm:"type:varchar(20);not null;default:'pending';check:status IN ('pending','running','success','failed');index" json:"status"`
	SizeBytes    *int64         `gorm:"type:bigint" json:"size_bytes,omitempty"`
	StoragePath  string         `gorm:"type:text" json:"storage_path,omitempty"`
	ErrorMessage *string        `gorm:"type:text" json:"error_message,omitempty"`
	StartedAt    time.Time      `gorm:"not null;default:now();index" json:"timestamp"`
	CompletedAt  *time.Time     `json:"completed_at,omitempty"`
	CreatedAt    time.Time      `gorm:"autoCreateTime" json:"-"`
}

// BeforeCreate hook for Backup
func (b *Backup) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// RestoreRequest represents a restore operation request
type RestoreRequest struct {
	TargetHost     string `json:"target_host,omitempty" example:"staging-db.example.com"`
	TargetPort     int    `json:"target_port,omitempty" example:"5432"`
	TargetDBName   string `json:"target_dbname,omitempty" example:"restored_db"`
	TargetUser     string `json:"target_user,omitempty" example:"admin"`
	TargetPassword string `json:"target_password,omitempty" example:"password"`
}

// RestoreJob represents a restore job
type RestoreJob struct {
	ID             uuid.UUID    `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	BackupID       uuid.UUID    `gorm:"type:uuid;not null;index" json:"backup_id"`
	Backup         Backup       `gorm:"foreignKey:BackupID;constraint:OnDelete:CASCADE" json:"-"`
	TargetHost     *string      `gorm:"type:varchar(255)" json:"target_host,omitempty"`
	TargetPort     *int         `json:"target_port,omitempty"`
	TargetDBName   *string      `gorm:"type:varchar(255)" json:"target_dbname,omitempty"`
	TargetUser     *string      `gorm:"type:varchar(255)" json:"target_user,omitempty"`
	TargetPassword *string      `gorm:"type:text" json:"-"`
	Status         BackupStatus `gorm:"type:varchar(20);not null;default:'pending';check:status IN ('pending','running','success','failed');index" json:"status"`
	ErrorMessage   *string      `gorm:"type:text" json:"error_message,omitempty"`
	StartedAt      time.Time    `gorm:"not null;default:now()" json:"started_at"`
	CompletedAt    *time.Time   `json:"completed_at,omitempty"`
	CreatedAt      time.Time    `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate hook for RestoreJob
func (r *RestoreJob) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// SystemStats represents system-wide statistics
type SystemStats struct {
	TotalDatabases        int     `json:"total_databases" example:"5"`
	TotalBackups24h       int     `json:"total_backups_24h" example:"10"`
	SuccessRate24h        float64 `json:"success_rate_24h" example:"95.5"`
	FailureRate24h        float64 `json:"failure_rate_24h" example:"4.5"`
	TotalStorageUsedBytes int64   `json:"total_storage_used_bytes" example:"1073741824"`
}

// LoginRequest for authentication
type LoginRequest struct {
	Username string `json:"username,omitempty" example:"admin"`
}

// VerifyRequest for OTP verification
type VerifyRequest struct {
	Username string `json:"username,omitempty" example:"admin"`
	OTP      string `json:"otp" validate:"required,len=6" example:"123456"`
}

// AuthResponse for successful authentication
type AuthResponse struct {
	Token     string    `json:"token" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	ExpiresAt time.Time `json:"expires_at" example:"2025-11-17T22:00:00Z"`
}

// APIError represents a standard API error response
type APIError struct {
	Code    string `json:"code" example:"Bad Request"`
	Message string `json:"message" example:"Invalid request parameters"`
}
