// Package jobs is DumpStation's control plane for backup and restore work.
//
// Every backup, regardless of where it runs, follows one lifecycle:
//
//	pending(queued | waiting_for_agent) -> running(preparing -> dumping ->
//	uploading -> verifying) -> success | failed | cancelled
//
// Direct jobs execute inside this process through pgexec. Agent jobs are
// queued as durable AgentJob rows that an agent leases over HTTPS. Both
// paths converge on the same finalize/fail code, so history, retention,
// notifications and activity logging are identical.
package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/storage"
	"github.com/monzim/db_proxy/v1/internal/utils"
)

// Config tunes the orchestrator.
type Config struct {
	// DirectConcurrency caps simultaneous direct backups/restores.
	DirectConcurrency int
	// JobTimeout bounds a single backup or restore.
	JobTimeout time.Duration
	// QueueTTL is how long an agent job may wait for its agent.
	QueueTTL time.Duration
	// LeaseTTL is how long an agent holds a job without reporting.
	LeaseTTL time.Duration
	// MaxAttempts bounds agent backup retries after lost leases.
	MaxAttempts int
	// TempDir holds dumps for direct execution.
	TempDir string
	// MinFreeBytes is the minimum free temp space before a dump starts.
	MinFreeBytes uint64
}

func (c *Config) defaults() {
	if c.DirectConcurrency <= 0 {
		c.DirectConcurrency = 2
	}
	if c.JobTimeout <= 0 {
		c.JobTimeout = 6 * time.Hour
	}
	if c.QueueTTL <= 0 {
		c.QueueTTL = 6 * time.Hour
	}
	if c.LeaseTTL <= 0 {
		c.LeaseTTL = 2 * time.Minute
	}
	if c.MaxAttempts <= 0 {
		c.MaxAttempts = 3
	}
}

// Orchestrator creates, dispatches and finalizes jobs.
type Orchestrator struct {
	cfg    Config
	repo   *repository.Repository
	runner *pgexec.Runner

	sem     chan struct{}
	mu      sync.Mutex
	cancels map[uuid.UUID]context.CancelFunc // direct jobs in flight
	wg      sync.WaitGroup

	signals *Signals

	ctx    context.Context
	stop   context.CancelFunc
	missed map[uuid.UUID]time.Time
}

// ErrBackupInProgress is returned when a database already has an active backup.
var ErrBackupInProgress = errors.New("a backup for this database is already queued or running")

// New creates an orchestrator. Call Start to run background maintenance.
func New(repo *repository.Repository, runner *pgexec.Runner, cfg Config) *Orchestrator {
	cfg.defaults()
	ctx, stop := context.WithCancel(context.Background())
	return &Orchestrator{
		cfg:     cfg,
		repo:    repo,
		runner:  runner,
		sem:     make(chan struct{}, cfg.DirectConcurrency),
		cancels: map[uuid.UUID]context.CancelFunc{},
		signals: NewSignals(),
		ctx:     ctx,
		stop:    stop,
		missed:  map[uuid.UUID]time.Time{},
	}
}

// Runner exposes the local pgexec runner (connection tests).
func (o *Orchestrator) Runner() *pgexec.Runner { return o.runner }

// Signals exposes agent wake-up signals for the long-poll endpoint.
func (o *Orchestrator) Signals() *Signals { return o.signals }

// Config returns the effective configuration.
func (o *Orchestrator) Config() Config { return o.cfg }

// Start reconciles state left by a previous process and starts maintenance.
func (o *Orchestrator) Start() {
	o.reconcile()
	o.wg.Add(1)
	go func() {
		defer o.wg.Done()
		o.maintenanceLoop()
	}()
}

// Stop cancels in-flight direct jobs and waits for goroutines to exit.
func (o *Orchestrator) Stop(timeout time.Duration) {
	o.stop()
	o.mu.Lock()
	for _, c := range o.cancels {
		c()
	}
	o.mu.Unlock()
	done := make(chan struct{})
	go func() { o.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(timeout):
		log.Printf("[jobs] shutdown timed out with jobs still running")
	}
}

// event records a job log line, also mirrored to the process log.
func (o *Orchestrator) event(kind models.JobKind, id uuid.UUID, level, stage, msg string) {
	if err := o.repo.AddJobEvent(kind, id, level, stage, "server", msg); err != nil {
		log.Printf("[jobs] add event: %v", err)
	}
}

func (o *Orchestrator) notifierFor(db *models.DatabaseConfig) notification.Notifier {
	if db == nil || db.NotificationID == nil {
		return nil
	}
	cfg, err := o.repo.GetNotificationConfig(*db.NotificationID)
	if err != nil || cfg == nil {
		return nil
	}
	return notification.NotifierFromConfig(cfg)
}

func (o *Orchestrator) logActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, name, desc string, meta map[string]any) {
	m := ""
	if meta != nil {
		b, _ := json.Marshal(meta)
		m = string(b)
	}
	if err := o.repo.LogActivity(userID, action, level, entityType, entityID, name, desc, m, ""); err != nil {
		log.Printf("[jobs] activity log: %v", err)
	}
}

// --------------------------------------------------------------- enqueue

// EnqueueBackup creates a backup for db and dispatches it to the database's
// executor. Only one backup per database may be active at a time.
func (o *Orchestrator) EnqueueBackup(db *models.DatabaseConfig, trigger models.BackupTrigger, actor *uuid.UUID) (*models.Backup, error) {
	if active, err := o.repo.GetActiveBackupForDatabase(db.ID); err != nil {
		return nil, err
	} else if active != nil {
		return active, ErrBackupInProgress
	}
	storageID := db.StorageID
	b := &models.Backup{
		Name:       utils.GenerateBackupName(),
		DatabaseID: db.ID,
		Status:     models.BackupStatusPending,
		Stage:      models.StageQueued,
		Trigger:    trigger,
		Executor:   db.Mode(),
		AgentID:    db.AgentID,
		StorageID:  &storageID,
		DumpFormat: models.DumpFormatCustom,
		StartedAt:  time.Now(),
	}
	if err := o.repo.InsertBackup(b); err != nil {
		return nil, fmt.Errorf("create backup: %w", err)
	}
	bid := b.ID
	who := "Scheduled"
	if trigger == models.TriggerManual {
		who = "Manual"
	}
	o.event(models.JobKindBackup, b.ID, "info", models.StageQueued, fmt.Sprintf("%s backup queued for %q", who, db.Name))

	switch db.Mode() {
	case models.ExecutionAgent:
		if err := o.queueAgentBackup(db, b); err != nil {
			o.failBackup(b.ID, db, pgexec.AsError(err))
			return b, nil
		}
		o.logActivity(&db.UserID, models.ActionBackupJobAssigned, models.LogLevelInfo, "backup", &bid, db.Name,
			fmt.Sprintf("Backup of %q assigned to agent", db.Name), map[string]any{"agent_id": db.AgentID, "trigger": trigger})
	default:
		o.wg.Add(1)
		go func() {
			defer o.wg.Done()
			o.runDirectBackup(b.ID, db.ID)
		}()
	}
	return b, nil
}

// --------------------------------------------------------------- direct

func (o *Orchestrator) withRecover(name string, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[jobs] PANIC in %s: %v\n%s", name, r, debug.Stack())
		}
	}()
	fn()
}

func connFromDB(db *models.DatabaseConfig) pgexec.Conn {
	return pgexec.Conn{Host: db.Host, Port: db.Port, Database: db.DBName, User: db.Username, Password: db.Password}
}

func (o *Orchestrator) runDirectBackup(backupID, dbID uuid.UUID) {
	o.withRecover("direct backup", func() {
		// Wait for a worker slot (stage stays "queued").
		select {
		case o.sem <- struct{}{}:
		case <-o.ctx.Done():
			return
		}
		defer func() { <-o.sem }()

		db, err := o.repo.GetDatabaseConfig(dbID)
		if err != nil || db == nil {
			o.failBackup(backupID, db, pgexec.Errorf(pgexec.CodeConfigError, "database configuration no longer exists"))
			return
		}
		now := time.Now()
		ok, err := o.repo.TransitionBackup(backupID, []models.BackupStatus{models.BackupStatusPending}, map[string]any{
			"status": models.BackupStatusRunning, "stage": models.StagePreparing, "run_started_at": now,
		})
		if err != nil || !ok {
			return // cancelled while queued
		}
		ctx, cancel := context.WithTimeout(o.ctx, o.cfg.JobTimeout)
		o.mu.Lock()
		o.cancels[backupID] = cancel
		o.mu.Unlock()
		defer func() {
			cancel()
			o.mu.Lock()
			delete(o.cancels, backupID)
			o.mu.Unlock()
		}()

		bid := backupID
		o.logActivity(&db.UserID, models.ActionBackupStarted, models.LogLevelInfo, "backup", &bid, db.Name,
			fmt.Sprintf("Backup started for database %q", db.Name), nil)
		o.event(models.JobKindBackup, backupID, "info", models.StagePreparing, "Connecting to PostgreSQL from the DumpStation server")

		o.setStage(backupID, models.StageDumping)
		o.event(models.JobKindBackup, backupID, "info", models.StageDumping, "Running pg_dump (custom format)")
		res, err := o.runner.Dump(ctx, connFromDB(db), pgexec.DumpOptions{MinFreeBytes: o.cfg.MinFreeBytes})
		if err != nil {
			o.failBackup(backupID, db, o.ctxError(ctx, backupID, err))
			return
		}
		defer os.Remove(res.Path)
		o.event(models.JobKindBackup, backupID, "info", models.StageDumping,
			fmt.Sprintf("Dump finished: %s in %s (server %s, pg_dump %d)", utils.HumanBytes(res.Size), res.Duration.Round(time.Second), res.ServerVersion, res.ClientMajor))
		_ = o.repo.UpdateBackupFields(backupID, map[string]any{"postgres_version": res.ServerVersion})

		backup, _ := o.repo.GetBackup(backupID)
		st, err := o.storageFor(backup, db)
		if err != nil {
			o.failBackup(backupID, db, pgexec.AsError(err))
			return
		}
		client, err := storage.NewStorageClient(st)
		if err != nil {
			o.failBackup(backupID, db, pgexec.Errorf(pgexec.CodeStorageError, "storage client: %v", err))
			return
		}
		key := ObjectKey(db, backup)
		o.setStage(backupID, models.StageUploading)
		o.event(models.JobKindBackup, backupID, "info", models.StageUploading, fmt.Sprintf("Uploading to storage %q", st.Name))
		f, err := os.Open(res.Path)
		if err != nil {
			o.failBackup(backupID, db, pgexec.AsError(err))
			return
		}
		err = client.UploadReader(ctx, f, key, objectMetadata(db, backup, res.ServerVersion, res.SHA256))
		f.Close()
		if err != nil {
			if ctx.Err() != nil {
				o.failBackup(backupID, db, o.ctxError(ctx, backupID, ctx.Err()))
				return
			}
			o.failBackup(backupID, db, &pgexec.Error{Code: pgexec.CodeUploadFailed, Message: "Upload to storage failed", Detail: storage.DescribeError(err)})
			return
		}
		o.FinalizeBackup(backupID, Artifact{
			ObjectKey: key, SizeBytes: res.Size, SHA256: res.SHA256, Format: models.DumpFormatCustom, ServerVersion: res.ServerVersion,
		})
	})
}

// ctxError maps a context error to cancelled (user) or timeout.
func (o *Orchestrator) ctxError(ctx context.Context, backupID uuid.UUID, err error) *pgexec.Error {
	if ctx.Err() == context.Canceled {
		if b, _ := o.repo.GetBackup(backupID); b != nil && b.CancelRequested {
			return &pgexec.Error{Code: pgexec.CodeCancelled, Message: "Cancelled by user"}
		}
		return &pgexec.Error{Code: pgexec.CodeInterrupted, Message: "Interrupted by server shutdown"}
	}
	return pgexec.AsError(err)
}

func (o *Orchestrator) setStage(id uuid.UUID, stage string) {
	_ = o.repo.UpdateBackupFields(id, map[string]any{"stage": stage})
}

func (o *Orchestrator) storageFor(b *models.Backup, db *models.DatabaseConfig) (*models.StorageConfig, error) {
	sid := db.StorageID
	if b != nil && b.StorageID != nil {
		sid = *b.StorageID
	}
	st, err := o.repo.GetStorageConfig(sid)
	if err != nil || st == nil {
		return nil, pgexec.Errorf(pgexec.CodeStorageError, "storage configuration not found")
	}
	return st, nil
}

// ObjectKey is the server-assigned storage key for a backup. Agents never
// choose keys, so they cannot overwrite unrelated objects.
func ObjectKey(db *models.DatabaseConfig, b *models.Backup) string {
	safe := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		}
		return '_'
	}, db.Name)
	if len(safe) > 64 {
		safe = safe[:64]
	}
	return storage.GetObjectKey(db.ID.String(),
		fmt.Sprintf("%s_%s_%s.dump", safe, b.StartedAt.UTC().Format("20060102_150405"), b.ID.String()))
}

func objectMetadata(db *models.DatabaseConfig, b *models.Backup, pgVersion, sha string) map[string]string {
	m := map[string]string{
		"database-id": db.ID.String(),
		"backup-id":   b.ID.String(),
		"backup-by":   "dumpstation",
		"dump-format": "custom",
		"executor":    string(b.Executor),
	}
	if pgVersion != "" {
		m["postgres-version"] = pgVersion
	}
	if sha != "" {
		m["sha256"] = sha
	}
	return m
}

// --------------------------------------------------------------- finalize

// Artifact describes an uploaded backup.
type Artifact struct {
	ObjectKey     string
	SizeBytes     int64
	SHA256        string
	Format        models.DumpFormat
	ServerVersion string
}

// FinalizeBackup verifies the uploaded artifact and marks the backup
// successful. A backup is never marked successful before its object exists
// in storage with the expected size.
func (o *Orchestrator) FinalizeBackup(backupID uuid.UUID, a Artifact) {
	b, err := o.repo.GetBackup(backupID)
	if err != nil || b == nil {
		return
	}
	db := &b.Database
	o.setStage(backupID, models.StageVerifying)
	o.event(models.JobKindBackup, backupID, "info", models.StageVerifying, "Verifying the uploaded artifact")
	st, err := o.storageFor(b, db)
	if err != nil {
		o.failBackup(backupID, db, pgexec.AsError(err))
		return
	}
	client, err := storage.NewStorageClient(st)
	if err != nil {
		o.failBackup(backupID, db, pgexec.Errorf(pgexec.CodeStorageError, "storage client: %v", err))
		return
	}
	size, err := client.Head(context.Background(), a.ObjectKey)
	if err != nil {
		o.failBackup(backupID, db, &pgexec.Error{Code: pgexec.CodeVerifyFailed, Message: "Uploaded artifact not found in storage", Detail: storage.DescribeError(err)})
		return
	}
	if size != a.SizeBytes {
		_ = client.DeleteFile(a.ObjectKey)
		o.failBackup(backupID, db, pgexec.Errorf(pgexec.CodeVerifyFailed,
			"Uploaded artifact size %d does not match dump size %d; the partial object was removed", size, a.SizeBytes))
		return
	}
	now := time.Now()
	sizeB := a.SizeBytes
	format := a.Format
	if format == "" {
		format = models.DumpFormatCustom
	}
	ok, err := o.repo.TransitionBackup(backupID, []models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}, map[string]any{
		"status": models.BackupStatusSuccess, "stage": "", "size_bytes": sizeB, "storage_path": a.ObjectKey,
		"checksum_sha256": a.SHA256, "dump_format": format, "postgres_version": a.ServerVersion,
		"completed_at": now, "error_code": "", "error_message": nil,
	})
	if err != nil || !ok {
		// Cancelled or failed concurrently: the object is orphaned, remove it.
		_ = client.DeleteFile(a.ObjectKey)
		return
	}
	dur := now.Sub(b.StartedAt).Round(time.Second)
	if b.RunStartedAt != nil {
		dur = now.Sub(*b.RunStartedAt).Round(time.Second)
	}
	o.event(models.JobKindBackup, backupID, "success", "", fmt.Sprintf("Backup completed: %s, sha256 %s", utils.HumanBytes(sizeB), shortHash(a.SHA256)))
	bid := backupID
	o.logActivity(&db.UserID, models.ActionBackupCompleted, models.LogLevelSuccess, "backup", &bid, db.Name,
		fmt.Sprintf("Backup completed for %q (%s)", db.Name, utils.HumanBytes(sizeB)),
		map[string]any{"size_bytes": sizeB, "duration": dur.String(), "executor": b.Executor})
	if n := o.notifierFor(db); n != nil {
		go func() { _ = n.SendBackupSuccess(db.Name, sizeB, dur.String()) }()
	}
	if err := o.ApplyRetention(db.ID); err != nil {
		log.Printf("[jobs] retention for %s: %v", db.Name, err)
	}
}

func shortHash(h string) string {
	if len(h) > 12 {
		return h[:12]
	}
	if h == "" {
		return "n/a"
	}
	return h
}

// failBackup marks a backup failed (or cancelled) with a classified cause.
func (o *Orchestrator) failBackup(backupID uuid.UUID, db *models.DatabaseConfig, perr *pgexec.Error) {
	if perr == nil {
		perr = &pgexec.Error{Code: pgexec.CodeUnknown, Message: "Unknown failure"}
	}
	status := models.BackupStatusFailed
	if perr.Code == pgexec.CodeCancelled {
		status = models.BackupStatusCancelled
	}
	msg := perr.Message
	if perr.Detail != "" {
		msg = perr.Message + "\n" + perr.Detail
	}
	now := time.Now()
	ok, err := o.repo.TransitionBackup(backupID, []models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}, map[string]any{
		"status": status, "stage": "", "error_code": perr.Code, "error_message": msg, "completed_at": now,
	})
	if err != nil || !ok {
		return
	}
	level := "error"
	if status == models.BackupStatusCancelled {
		level = "warning"
	}
	o.event(models.JobKindBackup, backupID, level, "", perr.Message)
	if perr.Detail != "" {
		o.event(models.JobKindBackup, backupID, level, "", perr.Detail)
	}
	if db == nil {
		if b, _ := o.repo.GetBackup(backupID); b != nil {
			db = &b.Database
		}
	}
	if db == nil {
		return
	}
	bid := backupID
	if status == models.BackupStatusCancelled {
		o.logActivity(&db.UserID, models.ActionBackupCancelled, models.LogLevelWarning, "backup", &bid, db.Name,
			fmt.Sprintf("Backup of %q cancelled", db.Name), nil)
		return
	}
	o.logActivity(&db.UserID, models.ActionBackupFailed, models.LogLevelError, "backup", &bid, db.Name,
		fmt.Sprintf("Backup failed for %q: %s", db.Name, perr.Message), map[string]any{"error": msg, "code": perr.Code})
	if n := o.notifierFor(db); n != nil {
		go func() { _ = n.SendBackupFailure(db.Name, perr.Message) }()
	}
}

// FailBackup is the exported form used by the agent API.
func (o *Orchestrator) FailBackup(backupID uuid.UUID, perr *pgexec.Error) {
	o.failBackup(backupID, nil, perr)
}

// --------------------------------------------------------------- cancel

// CancelBackup stops a pending or running backup.
func (o *Orchestrator) CancelBackup(b *models.Backup) error {
	if b.Status.IsTerminal() {
		return fmt.Errorf("backup already finished")
	}
	_ = o.repo.UpdateBackupFields(b.ID, map[string]any{"cancel_requested": true})
	o.event(models.JobKindBackup, b.ID, "warning", "", "Cancellation requested")
	if b.Executor == models.ExecutionAgent {
		job, _ := o.repo.FindAgentJobFor(&b.ID, nil)
		if job != nil && job.Status == models.AgentJobQueued {
			_, _ = o.repo.UpdateAgentJobFields(job.ID, "", map[string]any{"status": models.AgentJobCancelled, "completed_at": time.Now()})
			o.failBackup(b.ID, &b.Database, &pgexec.Error{Code: pgexec.CodeCancelled, Message: "Cancelled by user"})
		}
		// Leased jobs: the agent learns about cancellation on its next
		// event/heartbeat, aborts, and reports completion.
		return nil
	}
	o.mu.Lock()
	cancel, running := o.cancels[b.ID]
	o.mu.Unlock()
	if running {
		cancel()
		return nil
	}
	o.failBackup(b.ID, &b.Database, &pgexec.Error{Code: pgexec.CodeCancelled, Message: "Cancelled by user"})
	return nil
}

// --------------------------------------------------------------- retention

// ApplyRetention deletes backups outside the database's rotation policy.
// The newest successful backup is never deleted, whatever the policy says.
func (o *Orchestrator) ApplyRetention(dbID uuid.UUID) error {
	db, err := o.repo.GetDatabaseConfig(dbID)
	if err != nil || db == nil {
		return err
	}
	backups, err := o.repo.ListSuccessfulBackups(dbID)
	if err != nil {
		return err
	}
	toDelete := RetentionCandidates(backups, db.GetRotationPolicy(), time.Now())
	if len(toDelete) == 0 {
		return nil
	}
	clients := map[uuid.UUID]*storage.StorageClient{}
	var deleted, failed int
	for _, b := range toDelete {
		st, err := o.storageFor(b, db)
		if err != nil {
			failed++
			continue
		}
		c, ok := clients[st.ID]
		if !ok {
			if c, err = storage.NewStorageClient(st); err != nil {
				failed++
				continue
			}
			clients[st.ID] = c
		}
		if b.StoragePath != "" {
			if err := c.DeleteFile(b.StoragePath); err != nil {
				failed++
				continue // keep the row so the next run retries
			}
		}
		if err := o.repo.MarkBackupDeleted(b.ID); err != nil {
			failed++
			continue
		}
		deleted++
	}
	if deleted > 0 {
		o.logActivity(&db.UserID, models.ActionRetentionApplied, models.LogLevelInfo, "database", &db.ID, db.Name,
			fmt.Sprintf("Retention removed %d backup(s) of %q", deleted, db.Name),
			map[string]any{"deleted": deleted, "failed": failed, "policy": db.GetRotationPolicy()})
	}
	if failed > 0 {
		return fmt.Errorf("retention: %d deletion(s) failed", failed)
	}
	return nil
}

// RetentionCandidates returns the backups (sorted newest first in input)
// that fall outside policy. The newest backup is always kept.
func RetentionCandidates(newestFirst []*models.Backup, p models.RotationPolicy, now time.Time) []*models.Backup {
	if len(newestFirst) <= 1 {
		return nil
	}
	rest := newestFirst[1:] // never delete the newest valid backup
	var out []*models.Backup
	switch p.Type {
	case models.RotationPolicyCount:
		keep := p.Value - 1
		if keep < 0 {
			keep = 0
		}
		if len(rest) > keep {
			out = rest[keep:]
		}
	case models.RotationPolicyDays:
		cutoff := now.AddDate(0, 0, -p.Value)
		for _, b := range rest {
			if b.StartedAt.Before(cutoff) {
				out = append(out, b)
			}
		}
	}
	return out
}

// DeleteArtifacts removes every stored artifact of a database (used when a
// database is deleted with the "also delete backups" option).
func (o *Orchestrator) DeleteArtifacts(db *models.DatabaseConfig) (int, error) {
	backups, err := o.repo.ListArtifactsForDatabase(db.ID)
	if err != nil {
		return 0, err
	}
	clients := map[uuid.UUID]*storage.StorageClient{}
	n := 0
	var lastErr error
	for _, b := range backups {
		st, err := o.storageFor(b, db)
		if err != nil {
			lastErr = err
			continue
		}
		c, ok := clients[st.ID]
		if !ok {
			if c, err = storage.NewStorageClient(st); err != nil {
				lastErr = err
				continue
			}
			clients[st.ID] = c
		}
		if err := c.DeleteFile(b.StoragePath); err != nil {
			lastErr = err
			continue
		}
		n++
	}
	return n, lastErr
}

// Notify sends a free-form message to a database's notification channels.
func (o *Orchestrator) notifyText(db *models.DatabaseConfig, msg string) {
	if n := o.notifierFor(db); n != nil {
		go func() { _ = n.SendMessage(msg) }()
	}
}

var _ = agentproto.Version
