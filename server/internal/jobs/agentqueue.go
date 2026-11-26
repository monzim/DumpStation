package jobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/monzim/db_proxy/v1/internal/storage"
)

// Signals wakes long-polling agents when work is queued for them.
type Signals struct {
	mu   sync.Mutex
	subs map[uuid.UUID]map[chan struct{}]struct{}
}

// NewSignals creates an empty signal hub.
func NewSignals() *Signals { return &Signals{subs: map[uuid.UUID]map[chan struct{}]struct{}{}} }

// Subscribe returns a channel notified when agentID has new work.
func (s *Signals) Subscribe(agentID uuid.UUID) (chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	s.mu.Lock()
	if s.subs[agentID] == nil {
		s.subs[agentID] = map[chan struct{}]struct{}{}
	}
	s.subs[agentID][ch] = struct{}{}
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		delete(s.subs[agentID], ch)
		if len(s.subs[agentID]) == 0 {
			delete(s.subs, agentID)
		}
		s.mu.Unlock()
	}
}

// Notify wakes every poller of agentID.
func (s *Signals) Notify(agentID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for ch := range s.subs[agentID] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func sourceRef(db *models.DatabaseConfig) agentproto.ConnRef {
	if !db.UsesCentralCredentials() {
		return agentproto.ConnRef{Connection: db.AgentConnection}
	}
	c := connFromDB(db)
	return agentproto.ConnRef{Conn: &c}
}

// payload is the stored form of an agent job specification.
type payload struct {
	Backup  *agentproto.BackupSpec  `json:"backup,omitempty"`
	Restore *agentproto.RestoreSpec `json:"restore,omitempty"`
	Test    *agentproto.TestSpec    `json:"test,omitempty"`
}

func (o *Orchestrator) agentFor(db *models.DatabaseConfig) (*models.Agent, error) {
	if db.AgentID == nil {
		return nil, pgexec.Errorf(pgexec.CodeConfigError, "no agent is assigned to this database")
	}
	a, err := o.repo.GetAgent(*db.AgentID)
	if err != nil || a == nil {
		return nil, pgexec.Errorf(pgexec.CodeConfigError, "assigned agent no longer exists")
	}
	if a.UserID != db.UserID {
		return nil, pgexec.Errorf(pgexec.CodeConfigError, "assigned agent belongs to another user")
	}
	switch a.Status {
	case models.AgentStatusRevoked:
		return nil, pgexec.Errorf(pgexec.CodeAgentUnavailable, "agent %q has been revoked", a.Name)
	case models.AgentStatusDisabled:
		return nil, pgexec.Errorf(pgexec.CodeAgentUnavailable, "agent %q is disabled", a.Name)
	}
	return a, nil
}

func (o *Orchestrator) queueAgentBackup(db *models.DatabaseConfig, b *models.Backup) error {
	a, err := o.agentFor(db)
	if err != nil {
		return err
	}
	p := payload{Backup: &agentproto.BackupSpec{
		BackupID:      b.ID,
		DatabaseName:  db.Name,
		Source:        sourceRef(db),
		Compression:   6,
		TransferModes: []string{agentproto.TransferDirect, agentproto.TransferProxy},
		PartSize:      storage.AgentPartSize,
	}}
	raw, _ := json.Marshal(p)
	now := time.Now()
	job := &models.AgentJob{
		UserID: db.UserID, AgentID: a.ID, Kind: models.AgentJobBackup, BackupID: &b.ID,
		Payload: string(raw), MaxAttempts: o.cfg.MaxAttempts, AvailableAt: now, ExpiresAt: now.Add(o.cfg.QueueTTL),
	}
	if err := o.repo.CreateAgentJob(job); err != nil {
		return fmt.Errorf("queue agent job: %w", err)
	}
	if !a.IsOnline(now) {
		o.setStage(b.ID, models.StageWaitingAgent)
		o.event(models.JobKindBackup, b.ID, "warning", models.StageWaitingAgent,
			fmt.Sprintf("Agent %q is offline; the job will run when it reconnects (expires in %s)", a.Name, o.cfg.QueueTTL))
	} else {
		o.event(models.JobKindBackup, b.ID, "info", models.StageQueued, fmt.Sprintf("Assigned to agent %q", a.Name))
	}
	o.signals.Notify(a.ID)
	return nil
}

// QueueTestConnection queues a connection test on an agent and returns the job.
func (o *Orchestrator) QueueTestConnection(a *models.Agent, ref agentproto.ConnRef) (*models.AgentJob, error) {
	if !a.CanReceiveWork() {
		return nil, fmt.Errorf("agent is %s", a.Status)
	}
	raw, _ := json.Marshal(payload{Test: &agentproto.TestSpec{Target: ref}})
	now := time.Now()
	job := &models.AgentJob{
		UserID: a.UserID, AgentID: a.ID, Kind: models.AgentJobTestConnection, Payload: string(raw),
		MaxAttempts: 1, AvailableAt: now, ExpiresAt: now.Add(2 * time.Minute),
	}
	if err := o.repo.CreateAgentJob(job); err != nil {
		return nil, err
	}
	o.signals.Notify(a.ID)
	return job, nil
}

// LeaseNext claims the next job for an agent and renders it for the wire.
func (o *Orchestrator) LeaseNext(a *models.Agent) (*agentproto.Job, error) {
	if !a.CanReceiveWork() {
		return nil, nil
	}
	if a.MaxConcurrency > 0 {
		n, err := o.repo.CountLeasedJobs(a.ID)
		if err != nil {
			return nil, err
		}
		if int(n) >= a.MaxConcurrency {
			return nil, nil
		}
	}
	kinds := []models.AgentJobKind{models.AgentJobBackup, models.AgentJobTestConnection}
	if a.CanRestore() {
		kinds = append(kinds, models.AgentJobRestore)
	}
	token := randomToken(24)
	job, err := o.repo.ClaimNextAgentJob(a.ID, kinds, token, o.cfg.LeaseTTL)
	if err != nil || job == nil {
		return nil, err
	}
	var p payload
	if err := json.Unmarshal([]byte(job.Payload), &p); err != nil {
		_, _ = o.repo.UpdateAgentJobFields(job.ID, "", map[string]any{"status": models.AgentJobFailed, "error_message": "corrupt payload"})
		return nil, nil
	}
	wire := &agentproto.Job{
		ID: job.ID, Kind: string(job.Kind), LeaseToken: token, Attempt: job.Attempts,
		LeaseTTLSeconds: int(o.cfg.LeaseTTL.Seconds()), TimeoutSeconds: int(o.cfg.JobTimeout.Seconds()),
		Backup: p.Backup, Restore: p.Restore, Test: p.Test,
	}
	switch job.Kind {
	case models.AgentJobBackup:
		if job.BackupID == nil {
			return nil, nil
		}
		ok, _ := o.repo.TransitionBackup(*job.BackupID, []models.BackupStatus{models.BackupStatusPending}, map[string]any{
			"status": models.BackupStatusRunning, "stage": models.StagePreparing, "run_started_at": time.Now(),
		})
		if !ok {
			// Backup was cancelled or finished meanwhile; drop the job.
			_, _ = o.repo.UpdateAgentJobFields(job.ID, "", map[string]any{"status": models.AgentJobCancelled, "completed_at": time.Now()})
			return nil, nil
		}
		o.event(models.JobKindBackup, *job.BackupID, "info", models.StagePreparing,
			fmt.Sprintf("Agent %q picked up the job (attempt %d/%d)", a.Name, job.Attempts, job.MaxAttempts))
		if job.Attempts == 1 {
			if b, _ := o.repo.GetBackup(*job.BackupID); b != nil {
				bid := b.ID
				o.logActivity(&b.Database.UserID, models.ActionBackupStarted, models.LogLevelInfo, "backup", &bid, b.Database.Name,
					fmt.Sprintf("Backup started for database %q on agent %q", b.Database.Name, a.Name), nil)
			}
		}
	case models.AgentJobRestore:
		if job.RestoreJobID == nil {
			return nil, nil
		}
		_ = o.repo.UpdateRestoreFields(*job.RestoreJobID, map[string]any{"status": models.BackupStatusRunning, "stage": models.StagePreparing})
		o.event(models.JobKindRestore, *job.RestoreJobID, "info", models.StagePreparing, fmt.Sprintf("Agent %q picked up the restore", a.Name))
	}
	return wire, nil
}

// ErrLeaseMismatch means the agent's lease is no longer valid (expired,
// re-assigned, or the job finished). The agent must abandon the job.
var ErrLeaseMismatch = errors.New("lease is no longer valid")

// CheckLease loads a job and validates that agent a holds the given lease.
func (o *Orchestrator) CheckLease(a *models.Agent, jobID uuid.UUID, token string) (*models.AgentJob, error) {
	job, err := o.repo.GetAgentJob(jobID)
	if err != nil {
		return nil, err
	}
	if job == nil || job.AgentID != a.ID || job.UserID != a.UserID {
		return nil, ErrLeaseMismatch
	}
	if job.Status != models.AgentJobLeased || token == "" || job.LeaseToken != token {
		return job, ErrLeaseMismatch
	}
	return job, nil
}

// RecordEvent stores an agent-reported stage/log line and extends the lease.
// It returns true when the job has been cancelled.
func (o *Orchestrator) RecordEvent(a *models.Agent, job *models.AgentJob, req agentproto.EventRequest) bool {
	_ = o.repo.ExtendLeases(a.ID, []uuid.UUID{job.ID}, o.cfg.LeaseTTL)
	level := req.Level
	switch level {
	case "info", "warning", "error", "success":
	default:
		level = "info"
	}
	msg := pgexec.Sanitize(req.Message)
	stage := validStage(req.Stage)
	switch job.Kind {
	case models.AgentJobBackup:
		if job.BackupID == nil {
			return false
		}
		if stage != "" {
			o.setStage(*job.BackupID, stage)
		}
		if msg != "" {
			_ = o.repo.AddJobEvent(models.JobKindBackup, *job.BackupID, level, stage, "agent", msg)
		}
		b, _ := o.repo.GetBackup(*job.BackupID)
		return b == nil || b.CancelRequested || b.Status.IsTerminal()
	case models.AgentJobRestore:
		if job.RestoreJobID == nil {
			return false
		}
		if stage != "" {
			_ = o.repo.UpdateRestoreFields(*job.RestoreJobID, map[string]any{"stage": stage})
		}
		if msg != "" {
			_ = o.repo.AddJobEvent(models.JobKindRestore, *job.RestoreJobID, level, stage, "agent", msg)
		}
		r, _ := o.repo.GetRestore(*job.RestoreJobID)
		return r == nil || r.Status.IsTerminal()
	}
	return false
}

func validStage(s string) string {
	switch s {
	case models.StagePreparing, models.StageDumping, models.StageUploading, models.StageVerifying,
		models.StageDownloading, models.StageRestoring:
		return s
	}
	return ""
}

// CancelledJobs returns which of the given running jobs should be aborted.
func (o *Orchestrator) CancelledJobs(a *models.Agent, ids []uuid.UUID) []uuid.UUID {
	var out []uuid.UUID
	for _, id := range ids {
		job, err := o.repo.GetAgentJob(id)
		if err != nil {
			continue
		}
		if job == nil || job.AgentID != a.ID || job.Status != models.AgentJobLeased {
			out = append(out, id)
			continue
		}
		if job.Kind == models.AgentJobBackup && job.BackupID != nil {
			if b, _ := o.repo.GetBackup(*job.BackupID); b == nil || b.CancelRequested || b.Status.IsTerminal() {
				out = append(out, id)
			}
		}
	}
	return out
}

// backupContext loads the backup, database and storage client behind a job.
func (o *Orchestrator) backupContext(job *models.AgentJob) (*models.Backup, *storage.StorageClient, string, error) {
	if job.Kind != models.AgentJobBackup || job.BackupID == nil {
		return nil, nil, "", errors.New("not a backup job")
	}
	b, err := o.repo.GetBackup(*job.BackupID)
	if err != nil || b == nil {
		return nil, nil, "", errors.New("backup not found")
	}
	st, err := o.storageFor(b, &b.Database)
	if err != nil {
		return nil, nil, "", err
	}
	c, err := storage.NewStorageClient(st)
	if err != nil {
		return nil, nil, "", err
	}
	return b, c, ObjectKey(&b.Database, b), nil
}

// PresignPart returns a presigned URL for one part of the job's multipart
// upload, starting the upload on first use. The object key is fixed by the
// server.
func (o *Orchestrator) PresignPart(ctx context.Context, job *models.AgentJob, part int64) (string, time.Time, error) {
	if part < 1 || part > storage.MaxParts {
		return "", time.Time{}, fmt.Errorf("part number out of range")
	}
	b, c, key, err := o.backupContext(job)
	if err != nil {
		return "", time.Time{}, err
	}
	uploadID := job.UploadID
	if uploadID == "" {
		uploadID, err = c.CreateMultipartUpload(ctx, key, objectMetadata(&b.Database, b, "", ""))
		if err != nil {
			return "", time.Time{}, err
		}
		ok, err := o.repo.UpdateAgentJobFields(job.ID, job.LeaseToken, map[string]any{"upload_id": uploadID, "object_key": key})
		if err != nil || !ok {
			_ = c.AbortMultipartUpload(ctx, key, uploadID)
			return "", time.Time{}, ErrLeaseMismatch
		}
		job.UploadID, job.ObjectKey = uploadID, key
	}
	ttl := 30 * time.Minute
	url, err := c.PresignUploadPart(key, uploadID, part, ttl)
	if err != nil {
		return "", time.Time{}, err
	}
	_ = o.repo.ExtendLeases(job.AgentID, []uuid.UUID{job.ID}, o.cfg.LeaseTTL)
	return url, time.Now().Add(ttl), nil
}

// ProxyUpload streams an artifact from the agent to storage (server-mediated
// transfer). The stream is hashed in flight and must match expectedSHA.
func (o *Orchestrator) ProxyUpload(ctx context.Context, job *models.AgentJob, body interface{ Read([]byte) (int, error) }, expectedSHA string) (int64, string, error) {
	b, c, key, err := o.backupContext(job)
	if err != nil {
		return 0, "", err
	}
	hr := newHashingReader(body)
	stop := o.keepLeaseAlive(job)
	defer stop()
	if err := c.UploadReader(ctx, hr, key, objectMetadata(&b.Database, b, "", expectedSHA)); err != nil {
		return 0, "", err
	}
	sum := hr.Sum()
	if expectedSHA != "" && sum != expectedSHA {
		_ = c.DeleteFile(key)
		return 0, "", fmt.Errorf("checksum mismatch: received %s, expected %s", sum, expectedSHA)
	}
	_, _ = o.repo.UpdateAgentJobFields(job.ID, job.LeaseToken, map[string]any{"object_key": key})
	return hr.n, sum, nil
}

// keepLeaseAlive extends a job's lease periodically during long transfers.
func (o *Orchestrator) keepLeaseAlive(job *models.AgentJob) func() {
	done := make(chan struct{})
	go func() {
		t := time.NewTicker(o.cfg.LeaseTTL / 3)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				_ = o.repo.ExtendLeases(job.AgentID, []uuid.UUID{job.ID}, o.cfg.LeaseTTL)
			}
		}
	}()
	return func() { close(done) }
}

// CompleteJob records an agent's final report. Idempotent per lease.
func (o *Orchestrator) CompleteJob(ctx context.Context, a *models.Agent, job *models.AgentJob, req agentproto.CompleteRequest) error {
	now := time.Now()
	status := models.AgentJobCompleted
	if !req.OK {
		status = models.AgentJobFailed
	}
	fields := map[string]any{"status": status, "completed_at": now, "lease_expires_at": nil}
	if !req.OK {
		fields["error_message"] = pgexec.Sanitize(req.ErrorMessage)
	}
	if len(req.Result) > 0 && len(req.Result) < 16<<10 {
		fields["result"] = string(req.Result)
	}
	// Guard on the lease so a duplicate or stale completion cannot apply twice.
	ok, err := o.repo.UpdateAgentJobFields(job.ID, req.LeaseToken, fields)
	if err != nil {
		return err
	}
	if !ok {
		return ErrLeaseMismatch
	}
	perr := &pgexec.Error{Code: req.ErrorCode, Message: pgexec.Sanitize(req.ErrorMessage), Detail: pgexec.Sanitize(req.ErrorDetail)}
	if perr.Code == "" {
		perr.Code = pgexec.CodeUnknown
	}
	if perr.Message == "" {
		perr.Message = "Agent reported a failure"
	}

	switch job.Kind {
	case models.AgentJobBackup:
		if job.BackupID == nil {
			return nil
		}
		if !req.OK {
			o.abortUpload(job)
			o.failBackup(*job.BackupID, nil, perr)
			return nil
		}
		_, c, key, err := o.backupContext(job)
		if err != nil {
			o.failBackup(*job.BackupID, nil, pgexec.Errorf(pgexec.CodeStorageError, "%v", err))
			return nil
		}
		if req.TransferMode != agentproto.TransferProxy {
			if job.UploadID == "" {
				o.failBackup(*job.BackupID, nil, pgexec.Errorf(pgexec.CodeUploadFailed, "agent reported success but no upload was started"))
				return nil
			}
			parts := make([]storage.CompletedPart, len(req.Parts))
			for i, p := range req.Parts {
				parts[i] = storage.CompletedPart{PartNumber: p.PartNumber, ETag: p.ETag}
			}
			if err := c.CompleteMultipartUpload(ctx, key, job.UploadID, parts); err != nil {
				o.abortUpload(job)
				o.failBackup(*job.BackupID, nil, &pgexec.Error{Code: pgexec.CodeUploadFailed, Message: "Could not complete the multipart upload", Detail: storage.DescribeError(err)})
				return nil
			}
		}
		o.FinalizeBackup(*job.BackupID, Artifact{
			ObjectKey: key, SizeBytes: req.SizeBytes, SHA256: req.SHA256, Format: models.DumpFormat(defaultStr(req.Format, "custom")),
			ServerVersion: req.ServerVersion,
		})
	case models.AgentJobRestore:
		if job.RestoreJobID == nil {
			return nil
		}
		if req.OK {
			o.finishRestore(*job.RestoreJobID, nil)
		} else {
			o.finishRestore(*job.RestoreJobID, perr)
		}
	}
	return nil
}

func defaultStr(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

func (o *Orchestrator) abortUpload(job *models.AgentJob) {
	if job.UploadID == "" {
		return
	}
	_, c, key, err := o.backupContext(job)
	if err != nil {
		return
	}
	_ = c.AbortMultipartUpload(context.Background(), key, job.UploadID)
}

// RestoreArtifactURL presigns a download URL for a restore job's backup.
func (o *Orchestrator) RestoreArtifactURL(job *models.AgentJob) (string, time.Time, error) {
	b, c, err := o.restoreSource(job)
	if err != nil {
		return "", time.Time{}, err
	}
	ttl := time.Hour
	url, err := c.PresignDownload(b.StoragePath, "", ttl)
	return url, time.Now().Add(ttl), err
}

// OpenRestoreArtifact streams a restore job's backup (proxy download).
func (o *Orchestrator) OpenRestoreArtifact(ctx context.Context, job *models.AgentJob) (interface {
	Read([]byte) (int, error)
	Close() error
}, int64, error) {
	b, c, err := o.restoreSource(job)
	if err != nil {
		return nil, 0, err
	}
	return c.OpenReader(ctx, b.StoragePath)
}

func (o *Orchestrator) restoreSource(job *models.AgentJob) (*models.Backup, *storage.StorageClient, error) {
	if job.Kind != models.AgentJobRestore || job.RestoreJobID == nil {
		return nil, nil, errors.New("not a restore job")
	}
	r, err := o.repo.GetRestore(*job.RestoreJobID)
	if err != nil || r == nil {
		return nil, nil, errors.New("restore not found")
	}
	b, err := o.repo.GetBackup(r.BackupID)
	if err != nil || b == nil || b.StoragePath == "" {
		return nil, nil, errors.New("backup artifact not available")
	}
	st, err := o.storageFor(b, &b.Database)
	if err != nil {
		return nil, nil, err
	}
	c, err := storage.NewStorageClient(st)
	return b, c, err
}
