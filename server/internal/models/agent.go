package models

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

// ExecutionMode selects where backup and restore work runs.
type ExecutionMode string

const (
	ExecutionDirect ExecutionMode = "direct"
	ExecutionAgent  ExecutionMode = "agent"
)

// Mode returns the database's execution mode, defaulting legacy rows to direct.
func (d *DatabaseConfig) Mode() ExecutionMode {
	if d.ExecutionMode == "" {
		return ExecutionDirect
	}
	return d.ExecutionMode
}

// UsesCentralCredentials reports whether the server stores (and hands out)
// the PostgreSQL credentials for this database. Agent databases that
// reference a locally configured connection keep credentials off the server.
func (d *DatabaseConfig) UsesCentralCredentials() bool {
	return !(d.Mode() == ExecutionAgent && d.AgentConnection != "")
}

// ValidateConnection checks that the connection fields required by the
// selected execution mode are present. requirePassword is true on create.
func (in *DatabaseConfigInput) ValidateConnection(requirePassword bool) error {
	mode := in.ExecutionMode
	if mode == "" {
		mode = ExecutionDirect
	}
	switch mode {
	case ExecutionDirect:
		if in.AgentID != nil || in.AgentConnection != "" {
			return fmt.Errorf("agent_id and agent_connection are only valid with execution_mode=agent")
		}
	case ExecutionAgent:
		if in.AgentID == nil {
			return fmt.Errorf("agent_id is required with execution_mode=agent")
		}
		if in.AgentConnection != "" {
			return nil // credentials resolved by the agent
		}
	default:
		return fmt.Errorf("execution_mode must be 'direct' or 'agent'")
	}
	if in.Host == "" || in.DBName == "" || in.Username == "" || in.Port == 0 {
		return fmt.Errorf("host, port, dbname and user are required")
	}
	if requirePassword && in.Password == "" {
		return fmt.Errorf("password is required")
	}
	return nil
}

// AgentStatus is the administrative state of an agent. Connectivity
// (online/offline) is derived from LastSeenAt and reported separately.
type AgentStatus string

const (
	// AgentStatusPending: created in the UI, waiting for its first enrollment.
	AgentStatusPending AgentStatus = "pending"
	// AgentStatusActive: enrolled and allowed to receive work.
	AgentStatusActive AgentStatus = "active"
	// AgentStatusDisabled: credentials valid, but no new work is assigned.
	AgentStatusDisabled AgentStatus = "disabled"
	// AgentStatusRevoked: credentials invalidated; requests are rejected.
	AgentStatusRevoked AgentStatus = "revoked"
)

// AgentOnlineWindow is how recently an agent must have contacted the server
// to be considered online. Agents long-poll every ~25s, so 90s tolerates a
// missed poll without flapping.
const AgentOnlineWindow = 90 * time.Second

// AgentConnectionInfo describes a connection defined in an agent's local
// configuration. It never carries credentials.
type AgentConnectionInfo struct {
	Name     string `json:"name"`
	Database string `json:"database,omitempty"`
	Host     string `json:"host,omitempty"`
}

// Agent is a remote execution worker enrolled with this server.
type Agent struct {
	ID          uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID   `gorm:"type:uuid;not null;index" json:"user_id"`
	User        User        `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Name        string      `gorm:"type:varchar(100);not null" json:"name"`
	Description string      `gorm:"type:text;not null;default:''" json:"description"`
	Status      AgentStatus `gorm:"type:varchar(16);not null;default:'pending';index" json:"status"`
	// TokenHash is the SHA-256 of the agent's bearer credential. The raw
	// credential is shown to the agent exactly once, at enrollment.
	TokenHash   string `gorm:"type:varchar(64);index" json:"-"`
	TokenPrefix string `gorm:"type:varchar(24);not null;default:''" json:"token_prefix,omitempty"`
	Version     string `gorm:"type:varchar(64);not null;default:''" json:"version,omitempty"`
	Hostname    string `gorm:"type:varchar(255);not null;default:''" json:"hostname,omitempty"`
	Platform    string `gorm:"type:varchar(64);not null;default:''" json:"platform,omitempty"`
	// PgVersions lists the PostgreSQL client major versions installed on the agent.
	PgVersions  pq.StringArray        `gorm:"type:text[]" json:"pg_versions"`
	Connections []AgentConnectionInfo `gorm:"type:jsonb;serializer:json" json:"connections"`
	Labels      pq.StringArray        `gorm:"type:text[]" json:"labels"`
	// AllowRestore must be enabled on the server AND on the agent
	// (DUMPSTATION_ALLOW_RESTORE=true) before restore jobs are dispatched.
	AllowRestore       bool           `gorm:"not null;default:false" json:"allow_restore"`
	AgentAllowRestore  bool           `gorm:"not null;default:false" json:"agent_allow_restore"`
	UploadModes        pq.StringArray `gorm:"type:text[]" json:"upload_modes"`
	MaxConcurrency     int            `gorm:"not null;default:1" json:"max_concurrency"`
	RunningJobs        int            `gorm:"not null;default:0" json:"running_jobs"`
	LastSeenAt         *time.Time     `json:"last_seen_at,omitempty"`
	LastIP             string         `gorm:"type:varchar(64);not null;default:''" json:"last_ip,omitempty"`
	EnrolledAt         *time.Time     `json:"enrolled_at,omitempty"`
	CredentialIssuedAt *time.Time     `json:"credential_issued_at,omitempty"`
	// OnlineNotified tracks the last connectivity state we emitted an event
	// for, so online/offline transitions are logged once.
	OnlineNotified bool      `gorm:"not null;default:false" json:"-"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns an ID.
func (a *Agent) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// IsOnline reports whether the agent contacted the server recently.
func (a *Agent) IsOnline(now time.Time) bool {
	return a.LastSeenAt != nil && now.Sub(*a.LastSeenAt) <= AgentOnlineWindow
}

// Connectivity returns online, offline or never_connected.
func (a *Agent) Connectivity(now time.Time) string {
	switch {
	case a.LastSeenAt == nil:
		return "never_connected"
	case a.IsOnline(now):
		return "online"
	default:
		return "offline"
	}
}

// CanReceiveWork reports whether new jobs may be leased to the agent.
func (a *Agent) CanReceiveWork() bool { return a.Status == AgentStatusActive }

// CanRestore reports whether restore jobs may be dispatched to the agent.
func (a *Agent) CanRestore() bool { return a.AllowRestore && a.AgentAllowRestore }

// AgentEnrollment is a short-lived, single-use credential that lets a newly
// deployed agent obtain its long-lived identity.
type AgentEnrollment struct {
	ID        uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	AgentID   uuid.UUID  `gorm:"type:uuid;not null;index" json:"agent_id"`
	Agent     Agent      `gorm:"foreignKey:AgentID;constraint:OnDelete:CASCADE" json:"-"`
	TokenHash string     `gorm:"type:varchar(64);not null;uniqueIndex" json:"-"`
	ExpiresAt time.Time  `gorm:"not null" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate assigns an ID.
func (e *AgentEnrollment) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// AgentJobKind enumerates the only operations an agent can perform. There is
// deliberately no generic "run command" kind.
type AgentJobKind string

const (
	AgentJobBackup         AgentJobKind = "backup"
	AgentJobRestore        AgentJobKind = "restore"
	AgentJobTestConnection AgentJobKind = "test_connection"
)

// AgentJobStatus is the dispatch state of an agent job.
type AgentJobStatus string

const (
	AgentJobQueued    AgentJobStatus = "queued"
	AgentJobLeased    AgentJobStatus = "leased"
	AgentJobCompleted AgentJobStatus = "completed"
	AgentJobFailed    AgentJobStatus = "failed"
	AgentJobCancelled AgentJobStatus = "cancelled"
	AgentJobExpired   AgentJobStatus = "expired"
)

// AgentJob is a durable unit of work queued for a specific agent. The
// business record (Backup / RestoreJob) carries the lifecycle shown to
// users; AgentJob carries dispatch, leasing and retry state.
type AgentJob struct {
	ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	AgentID      uuid.UUID      `gorm:"type:uuid;not null;index:idx_agent_jobs_dispatch,priority:1" json:"agent_id"`
	Agent        Agent          `gorm:"foreignKey:AgentID;constraint:OnDelete:CASCADE" json:"-"`
	Kind         AgentJobKind   `gorm:"type:varchar(32);not null" json:"kind"`
	Status       AgentJobStatus `gorm:"type:varchar(16);not null;default:'queued';index:idx_agent_jobs_dispatch,priority:2" json:"status"`
	BackupID     *uuid.UUID     `gorm:"type:uuid;index" json:"backup_id,omitempty"`
	RestoreJobID *uuid.UUID     `gorm:"type:uuid;index" json:"restore_job_id,omitempty"`
	// Payload is the JSON job specification. It may contain centrally
	// managed database credentials, so it is encrypted at rest.
	Payload string `gorm:"type:text;not null;default:'';serializer:secret" json:"-"`
	// Result holds a JSON result for jobs without a business record
	// (connection tests).
	Result         string     `gorm:"type:text;not null;default:''" json:"result,omitempty"`
	LeaseToken     string     `gorm:"type:varchar(64);not null;default:''" json:"-"`
	LeaseExpiresAt *time.Time `json:"lease_expires_at,omitempty"`
	Attempts       int        `gorm:"not null;default:0" json:"attempts"`
	MaxAttempts    int        `gorm:"not null;default:3" json:"max_attempts"`
	AvailableAt    time.Time  `gorm:"not null;default:now();index:idx_agent_jobs_dispatch,priority:3" json:"available_at"`
	ExpiresAt      time.Time  `gorm:"not null" json:"expires_at"`
	ErrorMessage   string     `gorm:"type:text;not null;default:''" json:"error_message,omitempty"`
	// Multipart upload state for direct-to-storage transfers.
	UploadID    string     `gorm:"type:text;not null;default:''" json:"-"`
	ObjectKey   string     `gorm:"type:text;not null;default:''" json:"-"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns an ID.
func (j *AgentJob) BeforeCreate(tx *gorm.DB) error {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	return nil
}

// JobKind identifies the business record a JobEvent belongs to.
type JobKind string

const (
	JobKindBackup  JobKind = "backup"
	JobKindRestore JobKind = "restore"
)

// JobEvent is one line of a job's execution log, visible in the UI so users
// can investigate failures without reading agent container logs.
type JobEvent struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	JobKind   JobKind   `gorm:"type:varchar(16);not null;index:idx_job_events_job,priority:1" json:"job_kind"`
	JobID     uuid.UUID `gorm:"type:uuid;not null;index:idx_job_events_job,priority:2" json:"job_id"`
	Level     string    `gorm:"type:varchar(16);not null;default:'info'" json:"level"`
	Stage     string    `gorm:"type:varchar(32);not null;default:''" json:"stage,omitempty"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Source    string    `gorm:"type:varchar(16);not null;default:'server'" json:"source"`
	CreatedAt time.Time `gorm:"autoCreateTime;index:idx_job_events_job,priority:3" json:"created_at"`
}

// BeforeCreate assigns an ID.
func (e *JobEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}
