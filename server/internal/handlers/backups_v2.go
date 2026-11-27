package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/jobs"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
)

// BackupView is the API representation of a backup.
type BackupView struct {
	*models.Backup
	DatabaseName  string `json:"database_name"`
	StorageName   string `json:"storage_name,omitempty"`
	AgentName     string `json:"agent_name,omitempty"`
	DurationMS    *int64 `json:"duration_ms,omitempty"`
	Restorable    bool   `json:"restorable"`
	AgentAttempts int    `json:"agent_attempts,omitempty"`
}

type nameCache struct {
	h        *Handler
	storages map[uuid.UUID]string
	agents   map[uuid.UUID]*models.Agent
}

func (h *Handler) newNameCache() *nameCache {
	return &nameCache{h: h, storages: map[uuid.UUID]string{}, agents: map[uuid.UUID]*models.Agent{}}
}

func (n *nameCache) storage(id uuid.UUID) string {
	if v, ok := n.storages[id]; ok {
		return v
	}
	name := ""
	if s, _ := n.h.repo.GetStorageConfig(id); s != nil {
		name = s.Name
	}
	n.storages[id] = name
	return name
}

func (n *nameCache) agent(id uuid.UUID) *models.Agent {
	if v, ok := n.agents[id]; ok {
		return v
	}
	a, _ := n.h.repo.GetAgent(id)
	n.agents[id] = a
	return a
}

func (h *Handler) backupView(b *models.Backup, nc *nameCache) BackupView {
	v := BackupView{Backup: b, DatabaseName: b.Database.Name, Restorable: b.Status == models.BackupStatusSuccess && b.StoragePath != ""}
	sid := b.Database.StorageID
	if b.StorageID != nil {
		sid = *b.StorageID
	}
	if sid != uuid.Nil {
		v.StorageName = nc.storage(sid)
	}
	if b.AgentID != nil {
		if a := nc.agent(*b.AgentID); a != nil {
			v.AgentName = a.Name
			if b.Status == models.BackupStatusPending && !a.IsOnline(time.Now()) {
				b.Stage = models.StageWaitingAgent
			}
		}
	}
	if b.CompletedAt != nil {
		start := b.StartedAt
		if b.RunStartedAt != nil {
			start = *b.RunStartedAt
		}
		ms := b.CompletedAt.Sub(start).Milliseconds()
		v.DurationMS = &ms
	}
	return v
}

// ListBackupsV2 handles GET /backups with filters and pagination:
// database_id, agent_id, status (comma list), executor, trigger, q, from, to,
// sort, limit, offset.
func (h *Handler) ListBackupsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	p := repository.BackupListParams{
		DatabaseID: queryUUID(r, "database_id"),
		AgentID:    queryUUID(r, "agent_id"),
		Executor:   q.Get("executor"),
		Trigger:    q.Get("trigger"),
		Search:     strings.TrimSpace(q.Get("q")),
		Sort:       q.Get("sort"),
		Limit:      queryInt(r, "limit", 50),
		Offset:     queryInt(r, "offset", 0),
	}
	if s := q.Get("status"); s != "" {
		for _, st := range strings.Split(s, ",") {
			p.Statuses = append(p.Statuses, models.BackupStatus(strings.TrimSpace(st)))
		}
	}
	for key, dst := range map[string]**time.Time{"from": &p.From, "to": &p.To} {
		if v := q.Get(key); v != "" {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				*dst = &t
			} else if t, err := time.Parse("2006-01-02", v); err == nil {
				if key == "to" {
					t = t.Add(24*time.Hour - time.Nanosecond)
				}
				*dst = &t
			}
		}
	}
	list, total, err := h.repo.ListBackupsPaged(c.UserID, c.IsAdmin, p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}
	nc := h.newNameCache()
	items := make([]BackupView, len(list))
	for i, b := range list {
		items[i] = h.backupView(b, nc)
	}
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	writeJSON(w, http.StatusOK, Page[BackupView]{Items: items, Total: total, Limit: p.Limit, Offset: p.Offset})
}

// ListDatabaseBackupsV2 handles GET /databases/{id}/backups (legacy shape: array).
func (h *Handler) ListDatabaseBackupsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	list, _, err := h.repo.ListBackupsPaged(c.UserID, c.IsAdmin, repository.BackupListParams{DatabaseID: &id, Limit: queryInt(r, "limit", 100)})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}
	nc := h.newNameCache()
	items := make([]BackupView, len(list))
	for i, b := range list {
		items[i] = h.backupView(b, nc)
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) loadBackup(w http.ResponseWriter, r *http.Request, c *reqCtx) (*models.Backup, bool) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return nil, false
	}
	b, err := h.repo.GetBackupByUser(id, c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load backup")
		return nil, false
	}
	if b == nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return nil, false
	}
	return b, true
}

// GetBackupV2 handles GET /backups/{id}.
func (h *Handler) GetBackupV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	b, ok := h.loadBackup(w, r, c)
	if !ok {
		return
	}
	v := h.backupView(b, h.newNameCache())
	if b.Executor == models.ExecutionAgent {
		if j, _ := h.repo.FindAgentJobFor(&b.ID, nil); j != nil {
			v.AgentAttempts = j.Attempts
		}
	}
	writeJSON(w, http.StatusOK, v)
}

// BackupEventsV2 handles GET /backups/{id}/events.
func (h *Handler) BackupEventsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	b, ok := h.loadBackup(w, r, c)
	if !ok {
		return
	}
	ev, err := h.repo.ListJobEvents(models.JobKindBackup, b.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load events")
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// CancelBackupV2 handles POST /backups/{id}/cancel.
func (h *Handler) CancelBackupV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	b, ok := h.loadBackup(w, r, c)
	if !ok {
		return
	}
	if err := h.orch.CancelBackup(b); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// RestoreBackupV2 handles POST /backups/{id}/restore.
func (h *Handler) RestoreBackupV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	b, ok := h.loadBackup(w, r, c)
	if !ok {
		return
	}
	var req models.RestoreRequest
	if !h.decodeBody(w, r, &req, false) {
		return
	}
	job, err := h.orch.StartRestore(c.UserID, b, &req,
		func(id uuid.UUID) (*models.DatabaseConfig, error) {
			return h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
		},
		func(id uuid.UUID) (*models.Agent, error) { return h.repo.GetAgentByUser(id, c.UserID, c.IsAdmin) },
	)
	var pe *jobs.RestorePlanError
	if errors.As(err, &pe) {
		writeError(w, http.StatusBadRequest, pe.Msg)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start restore")
		return
	}
	writeJSON(w, http.StatusAccepted, job.ToResponse())
}

// RestoreView adds names to a restore job.
type RestoreView struct {
	*models.RestoreJobResponse
	BackupName   string `json:"backup_name"`
	DatabaseName string `json:"database_name"`
	TargetName   string `json:"target_name,omitempty"`
	AgentName    string `json:"agent_name,omitempty"`
}

func (h *Handler) restoreView(j *models.RestoreJob, nc *nameCache) RestoreView {
	v := RestoreView{RestoreJobResponse: j.ToResponse()}
	if b, _ := h.repo.GetBackup(j.BackupID); b != nil {
		v.BackupName, v.DatabaseName = b.Name, b.Database.Name
	}
	if j.TargetDatabaseID != nil {
		if d, _ := h.repo.GetDatabaseConfig(*j.TargetDatabaseID); d != nil {
			v.TargetName = d.Name
		}
	}
	if j.AgentID != nil {
		if a := nc.agent(*j.AgentID); a != nil {
			v.AgentName = a.Name
		}
	}
	return v
}

// ListRestoresV2 handles GET /restores?backup_id=&database_id=.
func (h *Handler) ListRestoresV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	list, err := h.repo.ListRestoresByUser(c.UserID, c.IsAdmin, queryUUID(r, "backup_id"), queryUUID(r, "database_id"), queryInt(r, "limit", 50))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list restores")
		return
	}
	nc := h.newNameCache()
	out := make([]RestoreView, len(list))
	for i, j := range list {
		out[i] = h.restoreView(j, nc)
	}
	writeJSON(w, http.StatusOK, out)
}

// GetRestoreV2 handles GET /restores/{id}.
func (h *Handler) GetRestoreV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	j, err := h.repo.GetRestoreByUser(id, c.UserID, c.IsAdmin)
	if err != nil || j == nil {
		writeError(w, http.StatusNotFound, "restore not found")
		return
	}
	writeJSON(w, http.StatusOK, h.restoreView(j, h.newNameCache()))
}

// RestoreEventsV2 handles GET /restores/{id}/events.
func (h *Handler) RestoreEventsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	j, err := h.repo.GetRestoreByUser(id, c.UserID, c.IsAdmin)
	if err != nil || j == nil {
		writeError(w, http.StatusNotFound, "restore not found")
		return
	}
	ev, err := h.repo.ListJobEvents(models.JobKindRestore, j.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load events")
		return
	}
	writeJSON(w, http.StatusOK, ev)
}
