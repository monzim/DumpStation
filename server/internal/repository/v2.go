package repository

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// DB exposes the underlying connection for components that need
// transactions (the job orchestrator).
func (r *Repository) DB() *gorm.DB { return r.db }

func scopeUser(q *gorm.DB, column string, userID uuid.UUID, isAdmin bool) *gorm.DB {
	if isAdmin {
		return q
	}
	return q.Where(column+" = ?", userID)
}

// ---------------------------------------------------------------- agents

// CreateAgent inserts a new agent.
func (r *Repository) CreateAgent(a *models.Agent) error {
	return r.db.Create(a).Error
}

// GetAgent loads an agent by id (no tenant scoping; internal use).
func (r *Repository) GetAgent(id uuid.UUID) (*models.Agent, error) {
	var a models.Agent
	if err := r.db.First(&a, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// GetAgentByUser loads an agent owned by the user (or any, for admins).
func (r *Repository) GetAgentByUser(id, userID uuid.UUID, isAdmin bool) (*models.Agent, error) {
	var a models.Agent
	q := scopeUser(r.db.Where("id = ?", id), "user_id", userID, isAdmin)
	if err := q.First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// ListAgentsByUser lists agents visible to the user.
func (r *Repository) ListAgentsByUser(userID uuid.UUID, isAdmin bool) ([]*models.Agent, error) {
	var out []*models.Agent
	err := scopeUser(r.db.Order("created_at ASC"), "user_id", userID, isAdmin).Find(&out).Error
	return out, err
}

// ListAllAgents lists every agent (maintenance loop).
func (r *Repository) ListAllAgents() ([]*models.Agent, error) {
	var out []*models.Agent
	err := r.db.Find(&out).Error
	return out, err
}

// GetAgentByTokenHash resolves an agent credential.
func (r *Repository) GetAgentByTokenHash(hash string) (*models.Agent, error) {
	if hash == "" {
		return nil, nil
	}
	var a models.Agent
	if err := r.db.Where("token_hash = ?", hash).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// UpdateAgentFields applies a partial update.
func (r *Repository) UpdateAgentFields(id uuid.UUID, fields map[string]any) error {
	return r.db.Model(&models.Agent{}).Where("id = ?", id).Updates(fields).Error
}

// CountDatabasesForAgent counts databases assigned to an agent.
func (r *Repository) CountDatabasesForAgent(agentID uuid.UUID) (int64, error) {
	var n int64
	err := r.db.Model(&models.DatabaseConfig{}).Where("agent_id = ?", agentID).Count(&n).Error
	return n, err
}

// ListDatabasesForAgent lists databases assigned to an agent.
func (r *Repository) ListDatabasesForAgent(agentID uuid.UUID) ([]*models.DatabaseConfig, error) {
	var out []*models.DatabaseConfig
	err := r.db.Where("agent_id = ?", agentID).Order("name").Find(&out).Error
	return out, err
}

// DeleteAgent removes an agent; fails while databases reference it.
func (r *Repository) DeleteAgent(id uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&models.DatabaseConfig{}).Where("agent_id = ?", id).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return fmt.Errorf("agent is assigned to %d database(s)", n)
		}
		return tx.Delete(&models.Agent{}, "id = ?", id).Error
	})
}

// CreateEnrollment stores a hashed enrollment token, invalidating earlier
// unused tokens for the same agent.
func (r *Repository) CreateEnrollment(e *models.AgentEnrollment) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		if err := tx.Model(&models.AgentEnrollment{}).
			Where("agent_id = ? AND used_at IS NULL", e.AgentID).
			Update("expires_at", now).Error; err != nil {
			return err
		}
		return tx.Create(e).Error
	})
}

// ErrEnrollmentInvalid is returned for unknown, used or expired tokens.
var ErrEnrollmentInvalid = errors.New("enrollment token is invalid, expired or already used")

// ConsumeEnrollment atomically marks an enrollment token used and installs
// the agent's new credential hash. Old credentials stop working.
func (r *Repository) ConsumeEnrollment(tokenHash, newCredHash, credPrefix string, meta map[string]any) (*models.Agent, error) {
	var agent models.Agent
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var e models.AgentEnrollment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("token_hash = ?", tokenHash).First(&e).Error; err != nil {
			return ErrEnrollmentInvalid
		}
		now := time.Now()
		if e.UsedAt != nil || now.After(e.ExpiresAt) {
			return ErrEnrollmentInvalid
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&agent, "id = ?", e.AgentID).Error; err != nil {
			return ErrEnrollmentInvalid
		}
		if agent.Status == models.AgentStatusRevoked {
			return ErrEnrollmentInvalid
		}
		if err := tx.Model(&e).Update("used_at", now).Error; err != nil {
			return err
		}
		fields := map[string]any{
			"token_hash":           newCredHash,
			"token_prefix":         credPrefix,
			"credential_issued_at": now,
			"last_seen_at":         now,
		}
		if agent.EnrolledAt == nil {
			fields["enrolled_at"] = now
		}
		if agent.Status == models.AgentStatusPending {
			fields["status"] = models.AgentStatusActive
		}
		for k, v := range meta {
			fields[k] = v
		}
		if err := tx.Model(&agent).Updates(fields).Error; err != nil {
			return err
		}
		return tx.First(&agent, "id = ?", agent.ID).Error
	})
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// ---------------------------------------------------------------- agent jobs

// CreateAgentJob queues a job.
func (r *Repository) CreateAgentJob(j *models.AgentJob) error {
	return r.db.Create(j).Error
}

// GetAgentJob loads a job by id.
func (r *Repository) GetAgentJob(id uuid.UUID) (*models.AgentJob, error) {
	var j models.AgentJob
	if err := r.db.First(&j, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &j, nil
}

// GetAgentJobByUser loads a job visible to the user.
func (r *Repository) GetAgentJobByUser(id, userID uuid.UUID, isAdmin bool) (*models.AgentJob, error) {
	var j models.AgentJob
	q := scopeUser(r.db.Where("id = ?", id), "user_id", userID, isAdmin)
	if err := q.First(&j).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &j, nil
}

// FindAgentJobFor returns the newest agent job attached to a backup or restore.
func (r *Repository) FindAgentJobFor(backupID, restoreID *uuid.UUID) (*models.AgentJob, error) {
	var j models.AgentJob
	q := r.db.Order("created_at DESC")
	if backupID != nil {
		q = q.Where("backup_id = ?", *backupID)
	} else if restoreID != nil {
		q = q.Where("restore_job_id = ?", *restoreID)
	} else {
		return nil, nil
	}
	if err := q.First(&j).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &j, nil
}

// ClaimNextAgentJob leases the oldest available queued job for an agent
// using SELECT ... FOR UPDATE SKIP LOCKED, so concurrent polls by the same
// agent never receive the same job.
func (r *Repository) ClaimNextAgentJob(agentID uuid.UUID, kinds []models.AgentJobKind, leaseToken string, leaseTTL time.Duration) (*models.AgentJob, error) {
	var job models.AgentJob
	err := r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		q := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("agent_id = ? AND status = ? AND available_at <= ? AND expires_at > ?",
				agentID, models.AgentJobQueued, now, now)
		if len(kinds) > 0 {
			q = q.Where("kind IN ?", kinds)
		}
		if err := q.Order("available_at ASC, created_at ASC").First(&job).Error; err != nil {
			return err
		}
		exp := now.Add(leaseTTL)
		return tx.Model(&job).Updates(map[string]any{
			"status":           models.AgentJobLeased,
			"lease_token":      leaseToken,
			"lease_expires_at": exp,
			"attempts":         gorm.Expr("attempts + 1"),
		}).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	// Reload so the struct reflects the update (and decrypts the payload).
	return r.GetAgentJob(job.ID)
}

// CountLeasedJobs counts jobs currently leased by an agent.
func (r *Repository) CountLeasedJobs(agentID uuid.UUID) (int64, error) {
	var n int64
	err := r.db.Model(&models.AgentJob{}).Where("agent_id = ? AND status = ?", agentID, models.AgentJobLeased).Count(&n).Error
	return n, err
}

// UpdateAgentJobFields applies a partial update, optionally guarded by the
// current lease token. Returns false when the guard did not match.
func (r *Repository) UpdateAgentJobFields(id uuid.UUID, leaseToken string, fields map[string]any) (bool, error) {
	q := r.db.Model(&models.AgentJob{}).Where("id = ?", id)
	if leaseToken != "" {
		q = q.Where("lease_token = ? AND status = ?", leaseToken, models.AgentJobLeased)
	}
	res := q.Updates(fields)
	return res.RowsAffected > 0, res.Error
}

// ExtendLeases pushes lease expiry for an agent's leased jobs.
func (r *Repository) ExtendLeases(agentID uuid.UUID, jobIDs []uuid.UUID, ttl time.Duration) error {
	if len(jobIDs) == 0 {
		return nil
	}
	return r.db.Model(&models.AgentJob{}).
		Where("agent_id = ? AND status = ? AND id IN ?", agentID, models.AgentJobLeased, jobIDs).
		Update("lease_expires_at", time.Now().Add(ttl)).Error
}

// ListExpiredLeases returns leased jobs whose lease ran out.
func (r *Repository) ListExpiredLeases(now time.Time) ([]*models.AgentJob, error) {
	var out []*models.AgentJob
	err := r.db.Where("status = ? AND lease_expires_at < ?", models.AgentJobLeased, now).Find(&out).Error
	return out, err
}

// ListExpiredQueued returns queued jobs past their expiry.
func (r *Repository) ListExpiredQueued(now time.Time) ([]*models.AgentJob, error) {
	var out []*models.AgentJob
	err := r.db.Where("status = ? AND expires_at < ?", models.AgentJobQueued, now).Find(&out).Error
	return out, err
}

// ---------------------------------------------------------------- job events

// AddJobEvent appends a log line to a job.
func (r *Repository) AddJobEvent(kind models.JobKind, jobID uuid.UUID, level, stage, source, message string) error {
	if len(message) > 4000 {
		message = message[:4000]
	}
	return r.db.Create(&models.JobEvent{JobKind: kind, JobID: jobID, Level: level, Stage: stage, Source: source, Message: message}).Error
}

// ListJobEvents returns a job's log lines in order.
func (r *Repository) ListJobEvents(kind models.JobKind, jobID uuid.UUID) ([]*models.JobEvent, error) {
	var out []*models.JobEvent
	err := r.db.Where("job_kind = ? AND job_id = ?", kind, jobID).Order("created_at ASC").Limit(500).Find(&out).Error
	return out, err
}

// ---------------------------------------------------------------- backups

// InsertBackup inserts a fully populated backup row.
func (r *Repository) InsertBackup(b *models.Backup) error {
	return r.db.Create(b).Error
}

// UpdateBackupFields applies a partial update.
func (r *Repository) UpdateBackupFields(id uuid.UUID, fields map[string]any) error {
	return r.db.Model(&models.Backup{}).Where("id = ?", id).Updates(fields).Error
}

// TransitionBackup updates a backup only if its status is one of from.
func (r *Repository) TransitionBackup(id uuid.UUID, from []models.BackupStatus, fields map[string]any) (bool, error) {
	res := r.db.Model(&models.Backup{}).Where("id = ? AND status IN ?", id, from).Updates(fields)
	return res.RowsAffected > 0, res.Error
}

// GetActiveBackupForDatabase returns the pending/running backup of a database, if any.
func (r *Repository) GetActiveBackupForDatabase(dbID uuid.UUID) (*models.Backup, error) {
	var b models.Backup
	err := r.db.Where("database_id = ? AND status IN ?", dbID,
		[]models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}).
		Order("started_at DESC").First(&b).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &b, err
}

// ListActiveBackups returns every pending/running backup.
func (r *Repository) ListActiveBackups() ([]*models.Backup, error) {
	var out []*models.Backup
	err := r.db.Where("status IN ?", []models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}).Find(&out).Error
	return out, err
}

// BackupListParams filters the global backup history.
type BackupListParams struct {
	DatabaseID *uuid.UUID
	AgentID    *uuid.UUID
	Statuses   []models.BackupStatus
	Executor   string
	Trigger    string
	Search     string
	From, To   *time.Time
	Sort       string // started_at|size|duration, prefix '-' for desc
	Limit      int
	Offset     int
}

// ListBackupsPaged returns filtered backups and the total count.
func (r *Repository) ListBackupsPaged(userID uuid.UUID, isAdmin bool, p BackupListParams) ([]*models.Backup, int64, error) {
	q := r.db.Model(&models.Backup{}).
		Joins("JOIN database_configs ON backups.database_id = database_configs.id")
	q = scopeUser(q, "database_configs.user_id", userID, isAdmin)
	if p.DatabaseID != nil {
		q = q.Where("backups.database_id = ?", *p.DatabaseID)
	}
	if p.AgentID != nil {
		q = q.Where("backups.agent_id = ?", *p.AgentID)
	}
	if len(p.Statuses) > 0 {
		q = q.Where("backups.status IN ?", p.Statuses)
	}
	if p.Executor != "" {
		q = q.Where("backups.executor = ?", p.Executor)
	}
	if p.Trigger != "" {
		q = q.Where("backups.trigger = ?", p.Trigger)
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("(backups.name ILIKE ? OR database_configs.name ILIKE ? OR CAST(backups.id AS text) ILIKE ?)", like, like, like)
	}
	if p.From != nil {
		q = q.Where("backups.started_at >= ?", *p.From)
	}
	if p.To != nil {
		q = q.Where("backups.started_at <= ?", *p.To)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	order := "backups.started_at DESC"
	switch p.Sort {
	case "started_at":
		order = "backups.started_at ASC"
	case "size":
		order = "backups.size_bytes ASC NULLS FIRST"
	case "-size":
		order = "backups.size_bytes DESC NULLS LAST"
	case "duration":
		order = "(backups.completed_at - backups.started_at) ASC NULLS FIRST"
	case "-duration":
		order = "(backups.completed_at - backups.started_at) DESC NULLS LAST"
	}
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	var out []*models.Backup
	err := q.Preload("Database").Order(order).Limit(p.Limit).Offset(p.Offset).Find(&out).Error
	return out, total, err
}

// LatestBackupPerDatabase returns the newest backup and newest successful
// backup start time for each database id given.
func (r *Repository) LatestBackupPerDatabase(dbIDs []uuid.UUID) (map[uuid.UUID]*models.Backup, map[uuid.UUID]time.Time, error) {
	latest := map[uuid.UUID]*models.Backup{}
	success := map[uuid.UUID]time.Time{}
	if len(dbIDs) == 0 {
		return latest, success, nil
	}
	var rows []*models.Backup
	if err := r.db.Raw(`SELECT DISTINCT ON (database_id) * FROM backups
		WHERE database_id IN ? AND status <> 'deleted' ORDER BY database_id, started_at DESC`, dbIDs).
		Scan(&rows).Error; err != nil {
		return nil, nil, err
	}
	for _, b := range rows {
		latest[b.DatabaseID] = b
	}
	type succ struct {
		DatabaseID uuid.UUID
		At         time.Time
	}
	var srows []succ
	if err := r.db.Raw(`SELECT database_id, MAX(COALESCE(completed_at, started_at)) AS at FROM backups
		WHERE database_id IN ? AND status = 'success' GROUP BY database_id`, dbIDs).Scan(&srows).Error; err != nil {
		return nil, nil, err
	}
	for _, s := range srows {
		success[s.DatabaseID] = s.At
	}
	return latest, success, nil
}

// ListSuccessfulBackups lists restorable backups for a database, newest first.
func (r *Repository) ListSuccessfulBackups(dbID uuid.UUID) ([]*models.Backup, error) {
	var out []*models.Backup
	err := r.db.Where("database_id = ? AND status = ?", dbID, models.BackupStatusSuccess).
		Order("started_at DESC").Find(&out).Error
	return out, err
}

// ListArtifactsForDatabase returns backups that still have a stored artifact.
func (r *Repository) ListArtifactsForDatabase(dbID uuid.UUID) ([]*models.Backup, error) {
	var out []*models.Backup
	err := r.db.Where("database_id = ? AND storage_path <> ''", dbID).Find(&out).Error
	return out, err
}

// ---------------------------------------------------------------- restores

// InsertRestore inserts a restore job.
func (r *Repository) InsertRestore(j *models.RestoreJob) error { return r.db.Create(j).Error }

// UpdateRestoreFields applies a partial update.
func (r *Repository) UpdateRestoreFields(id uuid.UUID, fields map[string]any) error {
	return r.db.Model(&models.RestoreJob{}).Where("id = ?", id).Updates(fields).Error
}

// GetRestore loads a restore job.
func (r *Repository) GetRestore(id uuid.UUID) (*models.RestoreJob, error) {
	var j models.RestoreJob
	if err := r.db.First(&j, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &j, nil
}

// GetRestoreByUser loads a restore job visible to the user.
func (r *Repository) GetRestoreByUser(id, userID uuid.UUID, isAdmin bool) (*models.RestoreJob, error) {
	var j models.RestoreJob
	q := r.db.Where("restore_jobs.id = ?", id)
	if !isAdmin {
		q = q.Joins("JOIN backups ON backups.id = restore_jobs.backup_id").
			Joins("JOIN database_configs ON database_configs.id = backups.database_id").
			Where("database_configs.user_id = ?", userID)
	}
	if err := q.First(&j).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &j, nil
}

// ListRestoresByUser lists restore jobs, optionally for one backup or database.
func (r *Repository) ListRestoresByUser(userID uuid.UUID, isAdmin bool, backupID, databaseID *uuid.UUID, limit int) ([]*models.RestoreJob, error) {
	q := r.db.Model(&models.RestoreJob{}).
		Joins("JOIN backups ON backups.id = restore_jobs.backup_id").
		Joins("JOIN database_configs ON database_configs.id = backups.database_id")
	q = scopeUser(q, "database_configs.user_id", userID, isAdmin)
	if backupID != nil {
		q = q.Where("restore_jobs.backup_id = ?", *backupID)
	}
	if databaseID != nil {
		q = q.Where("backups.database_id = ?", *databaseID)
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []*models.RestoreJob
	err := q.Order("restore_jobs.started_at DESC").Limit(limit).Find(&out).Error
	return out, err
}

// ListActiveRestores returns pending/running restore jobs.
func (r *Repository) ListActiveRestores() ([]*models.RestoreJob, error) {
	var out []*models.RestoreJob
	err := r.db.Where("status IN ?", []models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}).Find(&out).Error
	return out, err
}

// ---------------------------------------------------------------- storage

// StorageUsage aggregates per-storage usage.
type StorageUsage struct {
	StorageID     uuid.UUID
	DatabaseCount int
	BackupCount   int64
	UsedBytes     int64
}

// GetStorageUsage computes usage for all storage configs visible to the user.
func (r *Repository) GetStorageUsage(userID uuid.UUID, isAdmin bool) (map[uuid.UUID]*StorageUsage, error) {
	out := map[uuid.UUID]*StorageUsage{}
	get := func(id uuid.UUID) *StorageUsage {
		if u, ok := out[id]; ok {
			return u
		}
		u := &StorageUsage{StorageID: id}
		out[id] = u
		return u
	}
	type dbc struct {
		StorageID uuid.UUID
		N         int
	}
	var dbRows []dbc
	q := scopeUser(r.db.Model(&models.DatabaseConfig{}).Select("storage_id, COUNT(*) AS n").Group("storage_id"), "user_id", userID, isAdmin)
	if err := q.Scan(&dbRows).Error; err != nil {
		return nil, err
	}
	for _, row := range dbRows {
		get(row.StorageID).DatabaseCount = row.N
	}
	type bc struct {
		StorageID uuid.UUID
		N         int64
		Bytes     int64
	}
	var bRows []bc
	bq := r.db.Table("backups").
		Select("COALESCE(backups.storage_id, database_configs.storage_id) AS storage_id, COUNT(*) AS n, COALESCE(SUM(backups.size_bytes),0) AS bytes").
		Joins("JOIN database_configs ON database_configs.id = backups.database_id").
		Where("backups.status = ?", models.BackupStatusSuccess).
		Group("COALESCE(backups.storage_id, database_configs.storage_id)")
	bq = scopeUser(bq, "database_configs.user_id", userID, isAdmin)
	if err := bq.Scan(&bRows).Error; err != nil {
		return nil, err
	}
	for _, row := range bRows {
		u := get(row.StorageID)
		u.BackupCount, u.UsedBytes = row.N, row.Bytes
	}
	return out, nil
}

// CountArtifactsInStorage counts stored artifacts that live in a storage config.
func (r *Repository) CountArtifactsInStorage(storageID uuid.UUID) (int64, error) {
	var n int64
	err := r.db.Table("backups").
		Joins("JOIN database_configs ON database_configs.id = backups.database_id").
		Where("backups.storage_path <> '' AND COALESCE(backups.storage_id, database_configs.storage_id) = ?", storageID).
		Count(&n).Error
	return n, err
}

// SetDefaultStorage marks one storage config as the user's default.
func (r *Repository) SetDefaultStorage(userID, storageID uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.StorageConfig{}).Where("user_id = ?", userID).Update("is_default", false).Error; err != nil {
			return err
		}
		return tx.Model(&models.StorageConfig{}).Where("id = ? AND user_id = ?", storageID, userID).Update("is_default", true).Error
	})
}

// SaveStorage persists a storage config (create or update).
func (r *Repository) SaveStorage(s *models.StorageConfig) error { return r.db.Save(s).Error }

// SaveDatabase persists a database config (create or update).
func (r *Repository) SaveDatabase(d *models.DatabaseConfig) error { return r.db.Save(d).Error }

// SaveNotification persists a notification config.
func (r *Repository) SaveNotification(n *models.NotificationConfig) error { return r.db.Save(n).Error }

// ListEnabledDatabases returns databases the scheduler should run.
func (r *Repository) ListEnabledDatabases() ([]*models.DatabaseConfig, error) {
	var out []*models.DatabaseConfig
	err := r.db.Where("enabled = ? AND paused = ?", true, false).Find(&out).Error
	return out, err
}

// HasBackupBetween reports whether any backup row for db started within [from, to].
func (r *Repository) HasBackupBetween(dbID uuid.UUID, from, to time.Time) (bool, error) {
	var n int64
	err := r.db.Model(&models.Backup{}).Where("database_id = ? AND started_at BETWEEN ? AND ?", dbID, from, to).Count(&n).Error
	return n > 0, err
}

// ---------------------------------------------------------------- overview

// OverviewCounts aggregates dashboard numbers.
type OverviewCounts struct {
	Databases       int64
	PausedDatabases int64
	Success24h      int64
	Failed24h       int64
	Success7d       int64
	Failed7d        int64
	Active          int64
	UsedBytes       int64
	ArtifactCount   int64
}

// GetOverviewCounts computes dashboard aggregates for the user.
func (r *Repository) GetOverviewCounts(userID uuid.UUID, isAdmin bool) (*OverviewCounts, error) {
	c := &OverviewCounts{}
	dq := scopeUser(r.db.Model(&models.DatabaseConfig{}), "user_id", userID, isAdmin)
	if err := dq.Count(&c.Databases).Error; err != nil {
		return nil, err
	}
	if err := scopeUser(r.db.Model(&models.DatabaseConfig{}).Where("paused = ?", true), "user_id", userID, isAdmin).Count(&c.PausedDatabases).Error; err != nil {
		return nil, err
	}
	type agg struct {
		S24, F24, S7, F7, Active, Artifacts int64
		Bytes                               int64
	}
	var a agg
	q := r.db.Table("backups").Joins("JOIN database_configs ON database_configs.id = backups.database_id").
		Select(`
		COUNT(*) FILTER (WHERE backups.status='success' AND backups.started_at > now() - interval '24 hours') AS s24,
		COUNT(*) FILTER (WHERE backups.status='failed'  AND backups.started_at > now() - interval '24 hours') AS f24,
		COUNT(*) FILTER (WHERE backups.status IN ('success','deleted') AND backups.started_at > now() - interval '7 days') AS s7,
		COUNT(*) FILTER (WHERE backups.status='failed'  AND backups.started_at > now() - interval '7 days') AS f7,
		COUNT(*) FILTER (WHERE backups.status IN ('pending','running')) AS active,
		COUNT(*) FILTER (WHERE backups.status='success') AS artifacts,
		COALESCE(SUM(backups.size_bytes) FILTER (WHERE backups.status='success'),0) AS bytes`)
	q = scopeUser(q, "database_configs.user_id", userID, isAdmin)
	if err := q.Scan(&a).Error; err != nil {
		return nil, err
	}
	c.Success24h, c.Failed24h, c.Success7d, c.Failed7d, c.Active, c.ArtifactCount, c.UsedBytes = a.S24, a.F24, a.S7, a.F7, a.Active, a.Artifacts, a.Bytes
	return c, nil
}

// DailyBackupCounts returns per-day success/failure counts for the last n days.
type DailyCount struct {
	Day     time.Time `json:"day"`
	Success int64     `json:"success"`
	Failed  int64     `json:"failed"`
}

// GetDailyBackupCounts aggregates backups per day.
func (r *Repository) GetDailyBackupCounts(userID uuid.UUID, isAdmin bool, days int) ([]DailyCount, error) {
	var out []DailyCount
	q := r.db.Table("backups").Joins("JOIN database_configs ON database_configs.id = backups.database_id").
		Select(`date_trunc('day', backups.started_at) AS day,
			COUNT(*) FILTER (WHERE backups.status IN ('success','deleted')) AS success,
			COUNT(*) FILTER (WHERE backups.status='failed') AS failed`).
		Where("backups.started_at > ?", time.Now().AddDate(0, 0, -days)).
		Group("1").Order("1")
	q = scopeUser(q, "database_configs.user_id", userID, isAdmin)
	err := q.Scan(&out).Error
	return out, err
}

// ---------------------------------------------------------------- users

// ListUsers lists all users (admin).
func (r *Repository) ListUsers() ([]*models.User, error) {
	var out []*models.User
	err := r.db.Order("created_at ASC").Find(&out).Error
	return out, err
}

// SetUserAdmin changes a user's admin flag.
func (r *Repository) SetUserAdmin(id uuid.UUID, isAdmin bool) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Update("is_admin", isAdmin).Error
}

// CountAdmins counts admin users.
func (r *Repository) CountAdmins() (int64, error) {
	var n int64
	err := r.db.Model(&models.User{}).Where("is_admin = ?", true).Count(&n).Error
	return n, err
}
