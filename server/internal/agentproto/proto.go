// Package agentproto defines the wire protocol between the DumpStation
// server (control plane) and DumpStation Agents (execution plane).
//
// All traffic is initiated by the agent over HTTPS: the agent long-polls for
// work and posts progress and results. The server never connects to the
// agent. The protocol is versioned by URL prefix (/agent/v1).
package agentproto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
)

// Version is the protocol version spoken by this build.
const Version = "v1"

// Job kinds. The agent refuses any other kind.
const (
	KindBackup         = "backup"
	KindRestore        = "restore"
	KindTestConnection = "test_connection"
)

// Upload/download modes.
const (
	// TransferDirect: the agent talks to object storage with presigned,
	// object-scoped URLs issued by the server.
	TransferDirect = "direct"
	// TransferProxy: the agent streams through the server, which relays to
	// storage. For agents that cannot reach the storage endpoint.
	TransferProxy = "proxy"
)

// Connection describes a connection defined in the agent config (no secrets).
type Connection struct {
	Name     string `json:"name"`
	Database string `json:"database,omitempty"`
	Host     string `json:"host,omitempty"`
}

// AgentInfo is reported at enrollment and on every heartbeat.
type AgentInfo struct {
	Version        string       `json:"version"`
	Hostname       string       `json:"hostname"`
	Platform       string       `json:"platform"`
	PgVersions     []string     `json:"pg_versions"`
	Connections    []Connection `json:"connections"`
	TransferModes  []string     `json:"transfer_modes"`
	AllowRestore   bool         `json:"allow_restore"`
	MaxConcurrency int          `json:"max_concurrency"`
}

// EnrollRequest exchanges a one-time enrollment token for a credential.
type EnrollRequest struct {
	Token string    `json:"token"`
	Info  AgentInfo `json:"info"`
}

// EnrollResponse carries the agent's long-lived credential. It is returned
// exactly once; the server stores only its hash.
type EnrollResponse struct {
	AgentID    uuid.UUID `json:"agent_id"`
	AgentName  string    `json:"agent_name"`
	Credential string    `json:"credential"`
}

// HeartbeatRequest reports liveness, metadata and in-flight jobs.
type HeartbeatRequest struct {
	Info        AgentInfo   `json:"info"`
	RunningJobs []uuid.UUID `json:"running_jobs"`
}

// HeartbeatResponse tells the agent which running jobs to abort.
type HeartbeatResponse struct {
	Status     string      `json:"status"`
	CancelJobs []uuid.UUID `json:"cancel_jobs,omitempty"`
	ServerTime time.Time   `json:"server_time"`
}

// ConnRef identifies a database either by the name of a connection in the
// agent's local configuration or by centrally managed credentials.
type ConnRef struct {
	Connection string       `json:"connection,omitempty"`
	Conn       *pgexec.Conn `json:"conn,omitempty"`
}

// BackupSpec describes a backup job.
type BackupSpec struct {
	BackupID      uuid.UUID `json:"backup_id"`
	DatabaseName  string    `json:"database_name"`
	Source        ConnRef   `json:"source"`
	Compression   int       `json:"compression"`
	TransferModes []string  `json:"transfer_modes"`
	PartSize      int64     `json:"part_size"`
}

// RestoreSpec describes a restore job.
type RestoreSpec struct {
	RestoreID     uuid.UUID `json:"restore_id"`
	BackupID      uuid.UUID `json:"backup_id"`
	Format        string    `json:"format"`
	SizeBytes     int64     `json:"size_bytes"`
	SHA256        string    `json:"sha256,omitempty"`
	Target        ConnRef   `json:"target"`
	Clean         bool      `json:"clean"`
	TransferModes []string  `json:"transfer_modes"`
}

// TestSpec describes a connection test job.
type TestSpec struct {
	Target ConnRef `json:"target"`
}

// Job is a leased unit of work.
type Job struct {
	ID              uuid.UUID    `json:"id"`
	Kind            string       `json:"kind"`
	LeaseToken      string       `json:"lease_token"`
	LeaseTTLSeconds int          `json:"lease_ttl_seconds"`
	TimeoutSeconds  int          `json:"timeout_seconds"`
	Attempt         int          `json:"attempt"`
	Backup          *BackupSpec  `json:"backup,omitempty"`
	Restore         *RestoreSpec `json:"restore,omitempty"`
	Test            *TestSpec    `json:"test,omitempty"`
}

// EventRequest reports a stage change or log line for a job.
type EventRequest struct {
	LeaseToken string `json:"lease_token"`
	Stage      string `json:"stage,omitempty"`
	Level      string `json:"level,omitempty"`
	Message    string `json:"message"`
}

// EventResponse tells the agent whether the job was cancelled.
type EventResponse struct {
	Cancel bool `json:"cancel"`
}

// PartURLRequest asks for a presigned URL for one multipart part.
type PartURLRequest struct {
	LeaseToken string `json:"lease_token"`
	PartNumber int64  `json:"part_number"`
}

// URLResponse carries a short-lived presigned URL.
type URLResponse struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expires_at"`
}

// LeaseRequest carries only the lease token.
type LeaseRequest struct {
	LeaseToken string `json:"lease_token"`
}

// Part identifies an uploaded multipart part.
type Part struct {
	PartNumber int64  `json:"part_number"`
	ETag       string `json:"etag"`
}

// CompleteRequest reports a job's final outcome. Completion is idempotent:
// repeating it with the same lease token returns success.
type CompleteRequest struct {
	LeaseToken    string          `json:"lease_token"`
	OK            bool            `json:"ok"`
	ErrorCode     string          `json:"error_code,omitempty"`
	ErrorMessage  string          `json:"error_message,omitempty"`
	ErrorDetail   string          `json:"error_detail,omitempty"`
	SizeBytes     int64           `json:"size_bytes,omitempty"`
	SHA256        string          `json:"sha256,omitempty"`
	Format        string          `json:"format,omitempty"`
	ServerVersion string          `json:"server_version,omitempty"`
	TransferMode  string          `json:"transfer_mode,omitempty"`
	Parts         []Part          `json:"parts,omitempty"`
	Result        json.RawMessage `json:"result,omitempty"`
}

// Header names used by streaming (proxy) transfers.
const (
	HeaderLeaseToken = "X-DumpStation-Lease"
	HeaderSHA256     = "X-DumpStation-SHA256"
)

// ErrorResponse is the JSON error body.
type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
