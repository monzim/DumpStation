package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/utils"
	"gorm.io/gorm"
)

// User represents a system user (multi-tenant system with role-based access)
type User struct {
	ID                     uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	DiscordUserID          string         `gorm:"type:varchar(255);uniqueIndex;not null" json:"discord_user_id"`
	DiscordUsername        string         `gorm:"type:varchar(255)" json:"discord_username,omitempty"`
	Email                  string         `gorm:"type:varchar(255);uniqueIndex" json:"email,omitempty"`
	ProfilePictureData     []byte         `gorm:"type:bytea" json:"-"`                                    // Profile picture stored as binary data
	ProfilePictureMimeType string         `gorm:"type:varchar(50)" json:"-"`                              // MIME type of profile picture (e.g., image/png)
	IsDemo                 bool           `gorm:"default:false" json:"is_demo"`                           // Whether this is a demo account (read-only access)
	IsAdmin                bool           `gorm:"default:false" json:"is_admin"`                          // Whether this user has admin privileges (can view all data)
	TwoFactorSecret        string         `gorm:"type:text" json:"-"`                                     // Encrypted TOTP secret
	TwoFactorEnabled       bool           `gorm:"default:false" json:"two_factor_enabled"`                // Whether 2FA is enabled
	TwoFactorBackupCodes   pq.StringArray `gorm:"type:text[]" json:"-"`                                   // Hashed backup recovery codes
	TwoFactorVerifiedAt    *time.Time     `gorm:"type:timestamp" json:"two_factor_verified_at,omitempty"` // When 2FA was verified during setup
	CreatedAt              time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt              time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

// UserProfileResponse is the response DTO for user profile endpoints
// @Description User profile information for API responses
type UserProfileResponse struct {
	ID                uuid.UUID `json:"id" example:"550e8400-e29b-41d4-a716-446655440000"`
	DiscordUserID     string    `json:"discord_user_id" example:"monzim"`
	DiscordUsername   string    `json:"discord_username" example:"monzim"`
	Email             string    `json:"email" example:"user@example.com"`
	HasProfilePicture bool      `json:"has_profile_picture" example:"true"`
	IsDemo            bool      `json:"is_demo" example:"false"`
	IsAdmin           bool      `json:"is_admin" example:"false"`
	TwoFactorEnabled  bool      `json:"two_factor_enabled" example:"true"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// ToProfileResponse converts a User to a UserProfileResponse
func (u *User) ToProfileResponse() *UserProfileResponse {
	return &UserProfileResponse{
		ID:                u.ID,
		DiscordUserID:     u.DiscordUserID,
		DiscordUsername:   u.DiscordUsername,
		Email:             u.Email,
		HasProfilePicture: len(u.ProfilePictureData) > 0,
		IsDemo:            u.IsDemo,
		IsAdmin:           u.IsAdmin,
		TwoFactorEnabled:  u.TwoFactorEnabled,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}
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
	OTPCode   string    `gorm:"type:varchar(8);not null" json:"-"` // Hidden from API responses for security
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
	UserID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"user_id"` // Owner of this storage config
	User      User            `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Name      string          `gorm:"type:varchar(255);not null" json:"name"`
	Provider  StorageProvider `gorm:"type:varchar(50);not null;check:provider IN ('s3','r2')" json:"provider"`
	Bucket    string          `gorm:"type:varchar(255);not null" json:"bucket"`
	Region    string          `gorm:"type:varchar(100)" json:"region,omitempty"`
	Endpoint  string          `gorm:"type:varchar(500)" json:"endpoint,omitempty"`
	AccessKey string          `gorm:"type:text;not null" json:"-"`
	SecretKey string          `gorm:"type:text;not null" json:"-"`
	Labels    []Label         `gorm:"many2many:storage_labels;foreignKey:ID;joinForeignKey:StorageID;References:ID;joinReferences:LabelID" json:"labels,omitempty"`
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

// StorageConfigResponse is a secure DTO for API responses with masked sensitive storage details
// @Description Storage configuration with masked sensitive fields for API responses
type StorageConfigResponse struct {
	ID        uuid.UUID       `json:"id" example:"550e8400-e29b-41d4-a716-446655440000"`
	Name      string          `json:"name" example:"My R2 Bucket"`
	Provider  StorageProvider `json:"provider" example:"r2"`
	Bucket    string          `json:"bucket" example:"my-***"` // Masked bucket name
	Region    string          `json:"region,omitempty" example:"auto"`
	Endpoint  string          `json:"endpoint,omitempty" example:"https://***.r2.cloudflarestorage.com"` // Masked endpoint
	AccessKey string          `json:"access_key" example:"AKI***"`                                       // Masked access key (shows key type prefix)
	Labels    []Label         `json:"labels,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// ToResponse converts a StorageConfig to a StorageConfigResponse with masked sensitive data
func (s *StorageConfig) ToResponse() *StorageConfigResponse {
	return &StorageConfigResponse{
		ID:        s.ID,
		Name:      s.Name,
		Provider:  s.Provider,
		Bucket:    utils.MaskBucketName(s.Bucket),
		Region:    s.Region,
		Endpoint:  utils.MaskEndpoint(s.Endpoint),
		AccessKey: utils.MaskAccessKey(s.AccessKey),
		Labels:    s.Labels,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
}

// StorageConfigsToResponse converts a slice of StorageConfig to StorageConfigResponse
func StorageConfigsToResponse(configs []*StorageConfig) []StorageConfigResponse {
	responses := make([]StorageConfigResponse, len(configs))
	for i, config := range configs {
		responses[i] = *config.ToResponse()
	}
	return responses
}

// NotificationConfig represents Discord notification configuration
type NotificationConfig struct {
	ID                uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID            uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"` // Owner of this notification config
	User              User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Name              string    `gorm:"type:varchar(255);not null" json:"name"`
	DiscordWebhookURL string    `gorm:"type:text;not null" json:"-"`
	Labels            []Label   `gorm:"many2many:notification_labels;foreignKey:ID;joinForeignKey:NotificationID;References:ID;joinReferences:LabelID" json:"labels,omitempty"`
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

// NotificationConfigResponse is a secure DTO for API responses with masked webhook URL
// @Description Notification configuration with masked webhook URL for API responses
type NotificationConfigResponse struct {
	ID                uuid.UUID `json:"id" example:"550e8400-e29b-41d4-a716-446655440000"`
	Name              string    `json:"name" example:"DevOps Alerts"`
	DiscordWebhookURL string    `json:"discord_webhook_url" example:"https://discord.com/api/webhooks/***/***"` // Masked webhook URL
	Labels            []Label   `json:"labels,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// ToResponse converts a NotificationConfig to a NotificationConfigResponse with masked sensitive data
func (n *NotificationConfig) ToResponse() *NotificationConfigResponse {
	return &NotificationConfigResponse{
		ID:                n.ID,
		Name:              n.Name,
		DiscordWebhookURL: utils.MaskWebhookURL(n.DiscordWebhookURL),
		Labels:            n.Labels,
		CreatedAt:         n.CreatedAt,
		UpdatedAt:         n.UpdatedAt,
	}
}

// NotificationConfigsToResponse converts a slice of NotificationConfig to NotificationConfigResponse
func NotificationConfigsToResponse(configs []*NotificationConfig) []NotificationConfigResponse {
	responses := make([]NotificationConfigResponse, len(configs))
	for i, config := range configs {
		responses[i] = *config.ToResponse()
	}
	return responses
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
	ID                  uuid.UUID           `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID              uuid.UUID           `gorm:"type:uuid;not null;index" json:"user_id"` // Owner of this database config
	User                User                `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Name                string              `gorm:"type:varchar(255);not null" json:"name"`
	Host                string              `gorm:"type:varchar(255);not null" json:"host"`
	Port                int                 `gorm:"not null;default:5432" json:"port"`
	DBName              string              `gorm:"column:dbname;type:varchar(255);not null" json:"dbname"`
	Username            string              `gorm:"type:varchar(255);not null" json:"user"`
	Password            string              `gorm:"type:text;not null" json:"-"`
	Schedule            string              `gorm:"type:varchar(100);not null" json:"schedule"`
	StorageID           uuid.UUID           `gorm:"type:uuid;not null;index" json:"storage_id"`
	Storage             StorageConfig       `gorm:"foreignKey:StorageID;constraint:OnDelete:RESTRICT" json:"-"`
	NotificationID      *uuid.UUID          `gorm:"type:uuid;index" json:"notification_id,omitempty"`
	Notification        *NotificationConfig `gorm:"foreignKey:NotificationID;constraint:OnDelete:SET NULL" json:"-"`
	RotationPolicyType  RotationPolicyType  `gorm:"type:varchar(20);not null;check:rotation_policy_type IN ('count','days')" json:"-"`
	RotationPolicyValue int                 `gorm:"not null" json:"-"`
	PostgresVersion     string              `gorm:"type:varchar(20);default:'latest'" json:"postgres_version"`
	VersionLastChecked  *time.Time          `gorm:"type:timestamp" json:"version_last_checked,omitempty"`
	Enabled             bool                `gorm:"default:true" json:"enabled"`
	Paused              bool                `gorm:"default:false" json:"paused"`
	Labels              []Label             `gorm:"many2many:database_labels;foreignKey:ID;joinForeignKey:DatabaseID;References:ID;joinReferences:LabelID" json:"labels,omitempty"`
	CreatedAt           time.Time           `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt           time.Time           `gorm:"autoUpdateTime" json:"updated_at"`
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
	Name            string         `json:"name" validate:"required" example:"Production DB"`
	Host            string         `json:"host" validate:"required" example:"db.example.com"`
	Port            int            `json:"port" validate:"required,min=1,max=65535" example:"5432"`
	DBName          string         `json:"dbname" validate:"required" example:"proddb"`
	Username        string         `json:"user" validate:"required" example:"backup_user"`
	Password        string         `json:"password" validate:"required" example:"secure_password"`
	Schedule        string         `json:"schedule" validate:"required" example:"0 2 * * *"`
	StorageID       uuid.UUID      `json:"storage_id" validate:"required"`
	NotificationID  *uuid.UUID     `json:"notification_id,omitempty"`
	PostgresVersion string         `json:"postgres_version" example:"14"` // Optional: "latest", "15", "14", "13", etc.
	RotationPolicy  RotationPolicy `json:"rotation_policy" validate:"required"`
}

// DatabaseConfigResponse is a secure DTO for API responses that masks sensitive connection details
// @Description Database configuration with masked sensitive fields for API responses
type DatabaseConfigResponse struct {
	ID                 uuid.UUID      `json:"id" example:"550e8400-e29b-41d4-a716-446655440000"`
	Name               string         `json:"name" example:"Production DB"`
	Host               string         `json:"host" example:"***.example.com"` // Masked hostname
	Port               string         `json:"port" example:"****"`            // Masked port
	DBName             string         `json:"dbname" example:"pro***"`        // Masked database name
	Username           string         `json:"user" example:"bac***"`          // Masked username
	Schedule           string         `json:"schedule" example:"0 2 * * *"`
	StorageID          uuid.UUID      `json:"storage_id"`
	NotificationID     *uuid.UUID     `json:"notification_id,omitempty"`
	PostgresVersion    string         `json:"postgres_version" example:"14"`
	VersionLastChecked *time.Time     `json:"version_last_checked,omitempty"`
	Enabled            bool           `json:"enabled" example:"true"`
	Paused             bool           `json:"paused" example:"false"`
	RotationPolicy     RotationPolicy `json:"rotation_policy"`
	Labels             []Label        `json:"labels,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

// ToResponse converts a DatabaseConfig to a DatabaseConfigResponse with masked sensitive data
func (d *DatabaseConfig) ToResponse() *DatabaseConfigResponse {
	return &DatabaseConfigResponse{
		ID:                 d.ID,
		Name:               d.Name,
		Host:               utils.MaskHostname(d.Host),
		Port:               utils.MaskPort(d.Port),
		DBName:             utils.MaskDatabaseName(d.DBName),
		Username:           utils.MaskUsername(d.Username),
		Schedule:           d.Schedule,
		StorageID:          d.StorageID,
		NotificationID:     d.NotificationID,
		PostgresVersion:    d.PostgresVersion,
		VersionLastChecked: d.VersionLastChecked,
		Enabled:            d.Enabled,
		Paused:             d.Paused,
		RotationPolicy:     d.GetRotationPolicy(),
		Labels:             d.Labels,
		CreatedAt:          d.CreatedAt,
		UpdatedAt:          d.UpdatedAt,
	}
}

// ToResponseList converts a slice of DatabaseConfig to DatabaseConfigResponse
func DatabaseConfigsToResponse(configs []*DatabaseConfig) []DatabaseConfigResponse {
	responses := make([]DatabaseConfigResponse, len(configs))
	for i, config := range configs {
		responses[i] = *config.ToResponse()
	}
	return responses
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
	Name         string         `gorm:"type:varchar(255);not null;default:''" json:"name"`
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
	// Generate name if not set
	if b.Name == "" {
		b.Name = utils.GenerateBackupName()
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
	TargetHost     *string      `gorm:"type:varchar(255)" json:"-"` // Hidden from API responses
	TargetPort     *int         `json:"-"`                          // Hidden from API responses
	TargetDBName   *string      `gorm:"type:varchar(255)" json:"-"` // Hidden from API responses
	TargetUser     *string      `gorm:"type:varchar(255)" json:"-"` // Hidden from API responses
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

// RestoreJobResponse is a secure DTO for API responses with masked target details
// @Description Restore job with masked sensitive target connection details
type RestoreJobResponse struct {
	ID           uuid.UUID    `json:"id"`
	BackupID     uuid.UUID    `json:"backup_id"`
	TargetHost   string       `json:"target_host,omitempty" example:"***.example.com"` // Masked hostname
	TargetPort   string       `json:"target_port,omitempty" example:"****"`            // Masked port
	TargetDBName string       `json:"target_dbname,omitempty" example:"res***"`        // Masked database name
	TargetUser   string       `json:"target_user,omitempty" example:"adm***"`          // Masked username
	Status       BackupStatus `json:"status"`
	ErrorMessage *string      `json:"error_message,omitempty"`
	StartedAt    time.Time    `json:"started_at"`
	CompletedAt  *time.Time   `json:"completed_at,omitempty"`
	CreatedAt    time.Time    `json:"created_at"`
}

// ToResponse converts a RestoreJob to a RestoreJobResponse with masked sensitive data
func (r *RestoreJob) ToResponse() *RestoreJobResponse {
	response := &RestoreJobResponse{
		ID:           r.ID,
		BackupID:     r.BackupID,
		Status:       r.Status,
		ErrorMessage: r.ErrorMessage,
		StartedAt:    r.StartedAt,
		CompletedAt:  r.CompletedAt,
		CreatedAt:    r.CreatedAt,
	}

	if r.TargetHost != nil {
		response.TargetHost = utils.MaskHostname(*r.TargetHost)
	}
	if r.TargetPort != nil {
		response.TargetPort = utils.MaskPort(*r.TargetPort)
	}
	if r.TargetDBName != nil {
		response.TargetDBName = utils.MaskDatabaseName(*r.TargetDBName)
	}
	if r.TargetUser != nil {
		response.TargetUser = utils.MaskUsername(*r.TargetUser)
	}

	return response
}

// SystemStats represents system-wide statistics
type SystemStats struct {
	TotalDatabases        int     `json:"total_databases" example:"5"`
	TotalBackups24h       int     `json:"total_backups_24h" example:"10"`
	SuccessRate24h        float64 `json:"success_rate_24h" example:"95.5"`
	FailureRate24h        float64 `json:"failure_rate_24h" example:"4.5"`
	TotalStorageUsedBytes int64   `json:"total_storage_used_bytes" example:"1073741824"`
}

// LoginRequest for authentication (single-user system)
type LoginRequest struct {
	Username       string `json:"username,omitempty" example:"monzim"`       // Username or email of the single system user
	TurnstileToken string `json:"turnstile_token,omitempty" example:"token"` // Cloudflare Turnstile verification token
}

// VerifyRequest for OTP verification (single-user system)
type VerifyRequest struct {
	Username string `json:"username,omitempty" example:"monzim"` // Username or email of the single system user
	OTP      string `json:"otp" validate:"required,len=6" example:"123456"`
}

// AuthResponse for successful authentication
type AuthResponse struct {
	Token     string    `json:"token" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	ExpiresAt time.Time `json:"expires_at" example:"2025-11-17T22:00:00Z"`
}

// DemoAuthResponse for demo login authentication
type DemoAuthResponse struct {
	Token     string    `json:"token" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	ExpiresAt time.Time `json:"expires_at" example:"2025-11-17T22:00:00Z"`
	IsDemo    bool      `json:"is_demo" example:"true"`
	Message   string    `json:"message" example:"Welcome to DumpStation demo!"`
}

// APIError represents a standard API error response
type APIError struct {
	Code    string `json:"code" example:"Bad Request"`
	Message string `json:"message" example:"Invalid request parameters"`
}

// ActivityLogAction represents the type of action performed
type ActivityLogAction string

const (
	ActionLogin               ActivityLogAction = "login"
	ActionLogout              ActivityLogAction = "logout"
	ActionStorageCreated      ActivityLogAction = "storage_created"
	ActionStorageUpdated      ActivityLogAction = "storage_updated"
	ActionStorageDeleted      ActivityLogAction = "storage_deleted"
	ActionNotificationCreated ActivityLogAction = "notification_created"
	ActionNotificationUpdated ActivityLogAction = "notification_updated"
	ActionNotificationDeleted ActivityLogAction = "notification_deleted"
	ActionDatabaseCreated     ActivityLogAction = "database_created"
	ActionDatabaseUpdated     ActivityLogAction = "database_updated"
	ActionDatabaseDeleted     ActivityLogAction = "database_deleted"
	ActionDatabasePaused      ActivityLogAction = "database_paused"
	ActionDatabaseUnpaused    ActivityLogAction = "database_unpaused"
	ActionBackupTriggered     ActivityLogAction = "backup_triggered"
	ActionBackupStarted       ActivityLogAction = "backup_started"
	ActionBackupCompleted     ActivityLogAction = "backup_completed"
	ActionBackupFailed        ActivityLogAction = "backup_failed"
	ActionRestoreTriggered    ActivityLogAction = "restore_triggered"
	ActionRestoreStarted      ActivityLogAction = "restore_started"
	ActionRestoreCompleted    ActivityLogAction = "restore_completed"
	ActionRestoreFailed       ActivityLogAction = "restore_failed"
	ActionSystemStartup       ActivityLogAction = "system_startup"
	ActionSystemShutdown      ActivityLogAction = "system_shutdown"
	// 2FA related actions
	Action2FASetupStarted   ActivityLogAction = "2fa_setup_started"
	Action2FAEnabled        ActivityLogAction = "2fa_enabled"
	Action2FAVerified       ActivityLogAction = "2fa_verified"
	Action2FADisabled       ActivityLogAction = "2fa_disabled"
	Action2FABackupCodeUsed ActivityLogAction = "2fa_backup_code_used"
	Action2FAFailed         ActivityLogAction = "2fa_verification_failed"
	// Label related actions
	ActionLabelCreated ActivityLogAction = "label_created"
	ActionLabelUpdated ActivityLogAction = "label_updated"
	ActionLabelDeleted ActivityLogAction = "label_deleted"
)

// ActivityLogLevel represents the severity level of the log
type ActivityLogLevel string

const (
	LogLevelInfo    ActivityLogLevel = "info"
	LogLevelWarning ActivityLogLevel = "warning"
	LogLevelError   ActivityLogLevel = "error"
	LogLevelSuccess ActivityLogLevel = "success"
)

// ActivityLog represents a system activity log entry
type ActivityLog struct {
	ID          uuid.UUID         `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      *uuid.UUID        `gorm:"type:uuid;index" json:"user_id,omitempty"`
	User        *User             `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL" json:"user,omitempty"`
	Action      ActivityLogAction `gorm:"type:varchar(100);not null;index" json:"action"`
	Level       ActivityLogLevel  `gorm:"type:varchar(20);not null;default:'info';index" json:"level"`
	EntityType  string            `gorm:"type:varchar(100);index" json:"entity_type,omitempty"`
	EntityID    *uuid.UUID        `gorm:"type:uuid;index" json:"entity_id,omitempty"`
	EntityName  string            `gorm:"type:varchar(255)" json:"entity_name,omitempty"`
	Description string            `gorm:"type:text;not null" json:"description"`
	Metadata    string            `gorm:"type:jsonb" json:"metadata,omitempty"`
	IPAddress   string            `gorm:"type:varchar(45)" json:"ip_address,omitempty"`
	CreatedAt   time.Time         `gorm:"autoCreateTime;index" json:"created_at"`
}

// BeforeCreate hook for ActivityLog
func (a *ActivityLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// ActivityLogListParams for filtering activity logs
type ActivityLogListParams struct {
	UserID     *uuid.UUID         `json:"user_id,omitempty"`
	Action     *ActivityLogAction `json:"action,omitempty"`
	Level      *ActivityLogLevel  `json:"level,omitempty"`
	EntityType *string            `json:"entity_type,omitempty"`
	EntityID   *uuid.UUID         `json:"entity_id,omitempty"`
	StartDate  *time.Time         `json:"start_date,omitempty"`
	EndDate    *time.Time         `json:"end_date,omitempty"`
	Limit      int                `json:"limit,omitempty"`
	Offset     int                `json:"offset,omitempty"`
}

// ========================================
// Label Models (Tagging System)
// ========================================

// Label represents a tag/category that can be applied to multiple entities
type Label struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	User        User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Name        string    `gorm:"type:varchar(100);not null;uniqueIndex:idx_user_label_name" json:"name"`
	Color       string    `gorm:"type:varchar(7);not null;default:'#3b82f6'" json:"color"` // hex color
	Description string    `gorm:"type:varchar(255)" json:"description,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook for Label
func (l *Label) BeforeCreate(tx *gorm.DB) error {
	if l.ID == uuid.Nil {
		l.ID = uuid.New()
	}
	return nil
}

// TableName specifies the table name for Label
func (Label) TableName() string {
	return "labels"
}

// DatabaseLabel represents the many-to-many relationship between databases and labels
type DatabaseLabel struct {
	DatabaseID uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"database_id"`
	LabelID    uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"label_id"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// TableName specifies the table name for DatabaseLabel
func (DatabaseLabel) TableName() string {
	return "database_labels"
}

// StorageLabel represents the many-to-many relationship between storage configs and labels
type StorageLabel struct {
	StorageID uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"storage_id"`
	LabelID   uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"label_id"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// TableName specifies the table name for StorageLabel
func (StorageLabel) TableName() string {
	return "storage_labels"
}

// NotificationLabel represents the many-to-many relationship between notifications and labels
type NotificationLabel struct {
	NotificationID uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"notification_id"`
	LabelID        uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"label_id"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// TableName specifies the table name for NotificationLabel
func (NotificationLabel) TableName() string {
	return "notification_labels"
}

// LabelInput for creating/updating labels
type LabelInput struct {
	Name        string `json:"name" validate:"required,max=100" example:"Production"`
	Color       string `json:"color" validate:"required,hexcolor" example:"#3b82f6"`
	Description string `json:"description" validate:"max=255" example:"Production environment resources"`
}

// AssignLabelsInput for assigning/removing labels from entities
type AssignLabelsInput struct {
	LabelIDs []uuid.UUID `json:"label_ids" validate:"required,dive,uuid" example:"[\"550e8400-e29b-41d4-a716-446655440000\"]"`
}

// LabelWithUsage extends Label with usage statistics
type LabelWithUsage struct {
	Label
	DatabaseCount     int `json:"database_count" example:"5"`
	StorageCount      int `json:"storage_count" example:"3"`
	NotificationCount int `json:"notification_count" example:"2"`
	TotalUsage        int `json:"total_usage" example:"10"`
}

// LabelResponse is the response DTO for label endpoints
// @Description Label information for API responses with usage statistics
type LabelResponse struct {
	ID                uuid.UUID `json:"id" example:"550e8400-e29b-41d4-a716-446655440000"`
	Name              string    `json:"name" example:"Production"`
	Color             string    `json:"color" example:"#3b82f6"`
	Description       string    `json:"description,omitempty" example:"Production environment resources"`
	DatabaseCount     int       `json:"database_count" example:"5"`
	StorageCount      int       `json:"storage_count" example:"3"`
	NotificationCount int       `json:"notification_count" example:"2"`
	TotalUsage        int       `json:"total_usage" example:"10"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// ToResponse converts a LabelWithUsage to a LabelResponse
func (l *LabelWithUsage) ToResponse() *LabelResponse {
	return &LabelResponse{
		ID:                l.ID,
		Name:              l.Name,
		Color:             l.Color,
		Description:       l.Description,
		DatabaseCount:     l.DatabaseCount,
		StorageCount:      l.StorageCount,
		NotificationCount: l.NotificationCount,
		TotalUsage:        l.TotalUsage,
		CreatedAt:         l.CreatedAt,
		UpdatedAt:         l.UpdatedAt,
	}
}

// LabelsToResponse converts a slice of LabelWithUsage to LabelResponse
func LabelsToResponse(labels []*LabelWithUsage) []LabelResponse {
	responses := make([]LabelResponse, len(labels))
	for i, label := range labels {
		responses[i] = *label.ToResponse()
	}
	return responses
}

// ========================================
// Two-Factor Authentication (2FA) Models
// ========================================

// TwoFactorSetupRequest for initiating 2FA setup
type TwoFactorSetupRequest struct {
	// No fields needed - uses authenticated user from JWT
}

// TwoFactorSetupResponse contains data for setting up 2FA
type TwoFactorSetupResponse struct {
	Secret        string `json:"secret" example:"JBSWY3DPEHPK3PXP"` // Base32-encoded secret for manual entry
	QRCodeDataURL string `json:"qr_code_data_url"`                  // Data URL for QR code image
	Issuer        string `json:"issuer" example:"DumpStation"`      // Issuer name shown in authenticator
	AccountName   string `json:"account_name" example:"admin"`      // Account name shown in authenticator
}

// TwoFactorVerifySetupRequest for verifying 2FA setup with initial code
type TwoFactorVerifySetupRequest struct {
	Code string `json:"code" validate:"required,len=8" example:"12345678"` // 8-digit TOTP code from authenticator
}

// TwoFactorVerifyRequest for verifying 2FA during login
type TwoFactorVerifyRequest struct {
	Code string `json:"code" validate:"required,min=6,max=14" example:"123456"` // TOTP code or backup code
}

// TwoFactorDisableRequest for disabling 2FA
type TwoFactorDisableRequest struct {
	Code string `json:"code" validate:"required,len=8" example:"12345678"` // Current 8-digit TOTP code to confirm
}

// TwoFactorStatusResponse contains 2FA status for a user
type TwoFactorStatusResponse struct {
	Enabled          bool       `json:"enabled" example:"true"`
	VerifiedAt       *time.Time `json:"verified_at,omitempty" example:"2025-12-05T10:30:00Z"`
	BackupCodesCount int        `json:"backup_codes_count" example:"10"`
}

// TwoFactorBackupCodesResponse contains newly generated backup codes
type TwoFactorBackupCodesResponse struct {
	Codes   []string `json:"codes" example:"ABCD-EFGH-IJKL,MNOP-QRST-UVWX"`
	Message string   `json:"message" example:"Store these backup codes in a safe place. They can only be shown once."`
}

// AuthResponseWith2FA extends AuthResponse for 2FA flow
type AuthResponseWith2FA struct {
	Token              string    `json:"token,omitempty" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	ExpiresAt          time.Time `json:"expires_at,omitempty" example:"2025-11-17T22:00:00Z"`
	Requires2FA        bool      `json:"requires_2fa" example:"true"`
	TwoFactorToken     string    `json:"two_factor_token,omitempty" example:"temp_token_for_2fa_verification"`
	TwoFactorExpiresAt time.Time `json:"two_factor_expires_at,omitempty" example:"2025-11-17T22:05:00Z"`
}
