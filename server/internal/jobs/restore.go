package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/monzim/db_proxy/v1/internal/storage"
)

// RestorePlanError is a user-facing validation error (HTTP 400).
type RestorePlanError struct{ Msg string }

func (e *RestorePlanError) Error() string { return e.Msg }

func planErr(format string, a ...any) error { return &RestorePlanError{Msg: fmt.Sprintf(format, a...)} }

// resolvedTarget is where a restore will run.
type resolvedTarget struct {
	target     models.RestoreTarget
	targetDB   *models.DatabaseConfig
	executor   models.ExecutionMode
	agent      *models.Agent
	ref        agentproto.ConnRef // for agents
	conn       pgexec.Conn        // for direct
	label      string             // human description
	confirmFor string             // name the user must type, "" if none
}

// StartRestore validates a restore request and dispatches it. Users may only
// restore their own backups into their own databases/agents (checked by the
// caller passing tenant-scoped lookups through getDB/getAgent).
func (o *Orchestrator) StartRestore(
	userID uuid.UUID, b *models.Backup, req *models.RestoreRequest,
	getDB func(uuid.UUID) (*models.DatabaseConfig, error),
	getAgent func(uuid.UUID) (*models.Agent, error),
) (*models.RestoreJob, error) {
	if b.Status != models.BackupStatusSuccess || b.StoragePath == "" {
		return nil, planErr("only completed backups with a stored artifact can be restored")
	}
	if req == nil {
		req = &models.RestoreRequest{}
	}
	t, err := o.resolveRestoreTarget(b, req, getDB, getAgent)
	if err != nil {
		return nil, err
	}
	if req.CleanTarget && t.confirmFor == "" {
		t.confirmFor = t.conn.Database
		if t.ref.Connection != "" {
			t.confirmFor = t.ref.Connection
		} else if t.ref.Conn != nil {
			t.confirmFor = t.ref.Conn.Database
		}
		if t.targetDB != nil {
			t.confirmFor = t.targetDB.Name
		}
		if t.confirmFor == "" {
			t.confirmFor = "restore"
		}
	}
	if t.confirmFor != "" && req.Confirm != t.confirmFor {
		return nil, planErr("this restore may overwrite existing data: type %q to confirm", t.confirmFor)
	}
	dbID := b.DatabaseID
	job := &models.RestoreJob{
		BackupID: b.ID, UserID: &userID, DatabaseID: &dbID, Target: t.target, Executor: t.executor,
		CleanTarget: req.CleanTarget, Status: models.BackupStatusPending, Stage: models.StageQueued, StartedAt: time.Now(),
	}
	if t.targetDB != nil {
		job.TargetDatabaseID = &t.targetDB.ID
	}
	if t.agent != nil {
		job.AgentID = &t.agent.ID
		job.AgentConnection = t.ref.Connection
	}
	if t.target == models.RestoreTargetCustom && t.ref.Connection == "" {
		h, p, d, u := t.conn.Host, t.conn.Port, t.conn.Database, t.conn.User
		job.TargetHost, job.TargetPort, job.TargetDBName, job.TargetUser = &h, &p, &d, &u
		job.TargetPassword = t.conn.Password
	}
	if err := o.repo.InsertRestore(job); err != nil {
		return nil, err
	}
	o.event(models.JobKindRestore, job.ID, "info", models.StageQueued, fmt.Sprintf("Restore of backup %q into %s queued", b.Name, t.label))
	if req.CleanTarget {
		o.event(models.JobKindRestore, job.ID, "warning", models.StageQueued, "Existing objects in the target will be dropped before restoring (--clean)")
	}
	rid := job.ID
	o.logActivity(&userID, models.ActionRestoreTriggered, models.LogLevelWarning, "restore", &rid, b.Database.Name,
		fmt.Sprintf("Restore of %q into %s requested", b.Name, t.label),
		map[string]any{"backup_id": b.ID, "target": t.target, "executor": t.executor, "clean": req.CleanTarget})

	if t.executor == models.ExecutionAgent {
		spec := &agentproto.RestoreSpec{
			RestoreID: job.ID, BackupID: b.ID, Format: string(b.DumpFormat), SHA256: b.ChecksumSHA256,
			Target: t.ref, Clean: req.CleanTarget, TransferModes: []string{agentproto.TransferDirect, agentproto.TransferProxy},
		}
		if b.SizeBytes != nil {
			spec.SizeBytes = *b.SizeBytes
		}
		raw, _ := json.Marshal(payload{Restore: spec})
		now := time.Now()
		aj := &models.AgentJob{
			UserID: userID, AgentID: t.agent.ID, Kind: models.AgentJobRestore, RestoreJobID: &job.ID,
			Payload: string(raw), MaxAttempts: 1, AvailableAt: now, ExpiresAt: now.Add(o.cfg.QueueTTL),
		}
		if err := o.repo.CreateAgentJob(aj); err != nil {
			o.finishRestore(job.ID, pgexec.Errorf(pgexec.CodeUnknown, "queue agent job: %v", err))
			return job, nil
		}
		if !t.agent.IsOnline(now) {
			_ = o.repo.UpdateRestoreFields(job.ID, map[string]any{"stage": models.StageWaitingAgent})
			o.event(models.JobKindRestore, job.ID, "warning", models.StageWaitingAgent, fmt.Sprintf("Agent %q is offline; waiting for it to reconnect", t.agent.Name))
		}
		o.signals.Notify(t.agent.ID)
		return job, nil
	}
	conn := t.conn
	o.wg.Add(1)
	go func() {
		defer o.wg.Done()
		o.runDirectRestore(job.ID, b, conn, req.CleanTarget)
	}()
	return job, nil
}

func (o *Orchestrator) resolveRestoreTarget(
	b *models.Backup, req *models.RestoreRequest,
	getDB func(uuid.UUID) (*models.DatabaseConfig, error),
	getAgent func(uuid.UUID) (*models.Agent, error),
) (*resolvedTarget, error) {
	target := req.Target
	if target == "" {
		if req.TargetHost != "" || req.TargetDBName != "" || req.AgentID != nil {
			target = models.RestoreTargetCustom
		} else {
			target = models.RestoreTargetOriginal
		}
	}
	fromDB := func(db *models.DatabaseConfig, t models.RestoreTarget) (*resolvedTarget, error) {
		rt := &resolvedTarget{target: t, targetDB: db, executor: db.Mode(), label: fmt.Sprintf("database %q", db.Name), confirmFor: db.Name}
		if db.Mode() == models.ExecutionAgent {
			a, err := o.agentFor(db)
			if err != nil {
				return nil, planErr("%s", err.Error())
			}
			if !a.CanRestore() {
				return nil, planErr("agent %q is not permitted to run restores (enable restore on the agent and in its settings)", a.Name)
			}
			rt.agent, rt.ref = a, sourceRef(db)
		} else {
			rt.conn = connFromDB(db)
		}
		return rt, nil
	}
	switch target {
	case models.RestoreTargetOriginal:
		db, err := getDB(b.DatabaseID)
		if err != nil || db == nil {
			return nil, planErr("source database not found")
		}
		return fromDB(db, target)
	case models.RestoreTargetDatabase:
		if req.TargetDatabaseID == nil {
			return nil, planErr("target_database_id is required")
		}
		db, err := getDB(*req.TargetDatabaseID)
		if err != nil || db == nil {
			return nil, planErr("target database not found")
		}
		return fromDB(db, target)
	case models.RestoreTargetCustom:
		rt := &resolvedTarget{target: target, executor: req.ExecutionMode}
		if rt.executor == "" {
			rt.executor = models.ExecutionDirect
			if req.AgentID != nil {
				rt.executor = models.ExecutionAgent
			}
		}
		conn := pgexec.Conn{Host: req.TargetHost, Port: req.TargetPort, Database: req.TargetDBName, User: req.TargetUser, Password: req.TargetPassword}
		if conn.Port == 0 {
			conn.Port = 5432
		}
		if rt.executor == models.ExecutionAgent {
			if req.AgentID == nil {
				return nil, planErr("agent_id is required for agent restores")
			}
			a, err := getAgent(*req.AgentID)
			if err != nil || a == nil {
				return nil, planErr("agent not found")
			}
			if !a.CanReceiveWork() {
				return nil, planErr("agent %q is %s", a.Name, a.Status)
			}
			if !a.CanRestore() {
				return nil, planErr("agent %q is not permitted to run restores", a.Name)
			}
			rt.agent = a
			if req.AgentConnection != "" {
				rt.ref = agentproto.ConnRef{Connection: req.AgentConnection}
				rt.label = fmt.Sprintf("connection %q on agent %q", req.AgentConnection, a.Name)
				return rt, nil
			}
			if err := conn.Validate(); err != nil {
				return nil, planErr("%s", pgexec.AsError(err).Message)
			}
			c := conn
			rt.ref = agentproto.ConnRef{Conn: &c}
			rt.label = fmt.Sprintf("%s via agent %q", conn.Redacted(), a.Name)
			return rt, nil
		}
		if err := conn.Validate(); err != nil {
			return nil, planErr("%s", pgexec.AsError(err).Message)
		}
		rt.conn = conn
		rt.label = conn.Redacted()
		return rt, nil
	}
	return nil, planErr("unknown restore target %q", target)
}

func (o *Orchestrator) runDirectRestore(id uuid.UUID, b *models.Backup, conn pgexec.Conn, clean bool) {
	o.withRecover("direct restore", func() {
		select {
		case o.sem <- struct{}{}:
		case <-o.ctx.Done():
			return
		}
		defer func() { <-o.sem }()
		ctx, cancel := context.WithTimeout(o.ctx, o.cfg.JobTimeout)
		defer cancel()
		_ = o.repo.UpdateRestoreFields(id, map[string]any{"status": models.BackupStatusRunning, "stage": models.StageDownloading})
		rid := id
		o.logActivity(nil, models.ActionRestoreStarted, models.LogLevelInfo, "restore", &rid, b.Database.Name,
			fmt.Sprintf("Restore of %q started", b.Name), nil)
		o.event(models.JobKindRestore, id, "info", models.StageDownloading, "Downloading backup artifact")
		st, err := o.storageFor(b, &b.Database)
		if err != nil {
			o.finishRestore(id, pgexec.AsError(err))
			return
		}
		c, err := storage.NewStorageClient(st)
		if err != nil {
			o.finishRestore(id, pgexec.Errorf(pgexec.CodeStorageError, "%v", err))
			return
		}
		f, err := os.CreateTemp(o.runner.TempDir, "dumpstation-restore-*")
		if err != nil {
			o.finishRestore(id, pgexec.AsError(err))
			return
		}
		path := f.Name()
		f.Close()
		defer os.Remove(path)
		if err := c.DownloadFile(b.StoragePath, path); err != nil {
			o.finishRestore(id, &pgexec.Error{Code: pgexec.CodeDownloadFailed, Message: "Could not download the backup artifact", Detail: storage.DescribeError(err)})
			return
		}
		if b.ChecksumSHA256 != "" {
			sum, _, err := pgexec.HashFile(path)
			if err != nil || sum != b.ChecksumSHA256 {
				o.finishRestore(id, pgexec.Errorf(pgexec.CodeVerifyFailed, "Downloaded artifact does not match its recorded SHA-256 checksum"))
				return
			}
			o.event(models.JobKindRestore, id, "info", models.StageDownloading, "Checksum verified")
		}
		format := pgexec.DetectFormat(path)
		_ = o.repo.UpdateRestoreFields(id, map[string]any{"stage": models.StageRestoring})
		o.event(models.JobKindRestore, id, "info", models.StageRestoring, fmt.Sprintf("Restoring into %s (%s format)", conn.Redacted(), format))
		if err := o.runner.Restore(ctx, conn, path, pgexec.RestoreOptions{Format: format, Clean: clean}); err != nil {
			o.finishRestore(id, pgexec.AsError(err))
			return
		}
		o.finishRestore(id, nil)
	})
}

// finishRestore records a restore's outcome. perr nil means success.
func (o *Orchestrator) finishRestore(id uuid.UUID, perr *pgexec.Error) {
	r, err := o.repo.GetRestore(id)
	if err != nil || r == nil || r.Status.IsTerminal() {
		return
	}
	now := time.Now()
	b, _ := o.repo.GetBackup(r.BackupID)
	var db *models.DatabaseConfig
	name := "backup"
	if b != nil {
		db = &b.Database
		name = b.Database.Name
	}
	rid := id
	if perr == nil {
		_ = o.repo.UpdateRestoreFields(id, map[string]any{"status": models.BackupStatusSuccess, "stage": "", "completed_at": now})
		o.event(models.JobKindRestore, id, "success", "", "Restore completed")
		o.logActivity(r.UserID, models.ActionRestoreCompleted, models.LogLevelSuccess, "restore", &rid, name,
			fmt.Sprintf("Restore of %q completed", name), nil)
		if n := o.notifierFor(db); n != nil {
			go func() { _ = n.SendRestoreSuccess(name, string(r.Target)) }()
		}
		return
	}
	msg := perr.Message
	if perr.Detail != "" {
		msg += "\n" + perr.Detail
	}
	_ = o.repo.UpdateRestoreFields(id, map[string]any{"status": models.BackupStatusFailed, "stage": "", "completed_at": now,
		"error_code": perr.Code, "error_message": msg})
	o.event(models.JobKindRestore, id, "error", "", perr.Message)
	if perr.Detail != "" {
		o.event(models.JobKindRestore, id, "error", "", perr.Detail)
	}
	o.logActivity(r.UserID, models.ActionRestoreFailed, models.LogLevelError, "restore", &rid, name,
		fmt.Sprintf("Restore of %q failed: %s", name, perr.Message), map[string]any{"code": perr.Code})
	if n := o.notifierFor(db); n != nil {
		go func() { _ = n.SendRestoreFailure(name, perr.Message) }()
	}
}
