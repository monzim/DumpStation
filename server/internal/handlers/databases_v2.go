package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/jobs"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
)

// Database health values shown in the UI.
const (
	HealthHealthy = "healthy"
	HealthRunning = "running"
	HealthFailing = "failing"
	HealthStale   = "stale"
	HealthNever   = "never_backed_up"
	HealthPaused  = "paused"
)

func (h *Handler) enrichDatabases(list []*models.DatabaseConfig) []models.DatabaseConfigResponse {
	ids := make([]uuid.UUID, len(list))
	for i, d := range list {
		ids[i] = d.ID
	}
	latest, success, _ := h.repo.LatestBackupPerDatabase(ids)
	now := time.Now()
	out := make([]models.DatabaseConfigResponse, len(list))
	for i, d := range list {
		resp := *d.ToResponse()
		resp.NextRunAt = h.scheduler.NextRun(d.ID)
		if b, ok := latest[d.ID]; ok {
			resp.LastBackup = b.Summary()
			if !b.Status.IsTerminal() {
				resp.ActiveBackup = b.Summary()
			}
		}
		if t, ok := success[d.ID]; ok {
			tt := t
			resp.LastSuccessAt = &tt
		}
		resp.Health = databaseHealth(d, &resp, now)
		out[i] = resp
	}
	return out
}

func databaseHealth(d *models.DatabaseConfig, r *models.DatabaseConfigResponse, now time.Time) string {
	switch {
	case d.Paused:
		return HealthPaused
	case r.ActiveBackup != nil:
		return HealthRunning
	case r.LastBackup != nil && r.LastBackup.Status == models.BackupStatusFailed:
		return HealthFailing
	case r.LastSuccessAt == nil:
		return HealthNever
	}
	// Stale when the last success is older than two schedule intervals.
	if sched, err := jobs.ParseSchedule(d.Schedule, d.Timezone); err == nil {
		n1 := sched.Next(now)
		interval := sched.Next(n1).Sub(n1)
		if interval > 0 && now.Sub(*r.LastSuccessAt) > 2*interval+time.Hour {
			return HealthStale
		}
	}
	return HealthHealthy
}

// ListDatabasesV2 handles GET /databases.
func (h *Handler) ListDatabasesV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	list, err := h.repo.ListDatabaseConfigsByUser(c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list databases")
		return
	}
	writeJSON(w, http.StatusOK, h.enrichDatabases(list))
}

// GetDatabaseV2 handles GET /databases/{id}.
func (h *Handler) GetDatabaseV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load database")
		return
	}
	if d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	writeJSON(w, http.StatusOK, h.enrichDatabases([]*models.DatabaseConfig{d})[0])
}

// validateRefs checks that referenced storage, notification and agent
// belong to the owner of the database.
func (h *Handler) validateRefs(owner uuid.UUID, isAdmin bool, in *models.DatabaseConfigInput) error {
	st, err := h.repo.GetStorageConfigByUser(in.StorageID, owner, isAdmin)
	if err != nil || st == nil {
		return errors.New("storage configuration not found")
	}
	if in.NotificationID != nil {
		n, err := h.repo.GetNotificationConfigByUser(*in.NotificationID, owner, isAdmin)
		if err != nil || n == nil {
			return errors.New("notification configuration not found")
		}
	}
	if in.ExecutionMode == models.ExecutionAgent && in.AgentID != nil {
		a, err := h.repo.GetAgentByUser(*in.AgentID, owner, isAdmin)
		if err != nil || a == nil {
			return errors.New("agent not found")
		}
		if a.Status == models.AgentStatusRevoked {
			return errors.New("agent has been revoked")
		}
	}
	if _, err := jobs.ParseSchedule(in.Schedule, in.Timezone); err != nil {
		return fmt.Errorf("invalid schedule: %v", err)
	}
	if err := in.RotationPolicy.Validate(); err != nil {
		return err
	}
	return nil
}

func applyDatabaseInput(d *models.DatabaseConfig, in *models.DatabaseConfigInput) {
	mode := in.ExecutionMode
	if mode == "" {
		mode = models.ExecutionDirect
	}
	d.Name = in.Name
	d.ExecutionMode = mode
	d.Schedule = in.Schedule
	d.Timezone = in.Timezone
	d.StorageID = in.StorageID
	d.NotificationID = in.NotificationID
	if in.PostgresVersion != "" {
		d.PostgresVersion = in.PostgresVersion
	}
	d.SetRotationPolicy(in.RotationPolicy)
	if mode == models.ExecutionAgent {
		d.AgentID = in.AgentID
		d.AgentConnection = in.AgentConnection
	} else {
		d.AgentID = nil
		d.AgentConnection = ""
	}
	if mode == models.ExecutionAgent && in.AgentConnection != "" {
		// Credentials live on the agent: keep none on the server.
		d.Host, d.Port, d.DBName, d.Username, d.Password = "", 5432, "", "", ""
		return
	}
	d.Host, d.Port, d.DBName, d.Username = in.Host, in.Port, in.DBName, in.Username
	if in.Password != "" {
		d.Password = in.Password
	}
}

// CreateDatabaseV2 handles POST /databases.
func (h *Handler) CreateDatabaseV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	var in models.DatabaseConfigInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	if err := in.ValidateConnection(true); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.validateRefs(c.UserID, false, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	d := &models.DatabaseConfig{UserID: c.UserID, Enabled: true, PostgresVersion: "latest"}
	applyDatabaseInput(d, &in)
	if err := h.repo.SaveDatabase(d); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create database")
		return
	}
	if err := h.scheduler.AddJob(d); err != nil {
		logError("schedule database", err)
	}
	h.logActivity(&c.UserID, models.ActionDatabaseCreated, models.LogLevelSuccess, "database", &d.ID, d.Name,
		fmt.Sprintf("Database %q added (%s execution)", d.Name, d.Mode()), "", c.IP)
	writeJSON(w, http.StatusCreated, h.enrichDatabases([]*models.DatabaseConfig{d})[0])
}

// UpdateDatabaseV2 handles PUT /databases/{id}. Empty password keeps the stored one.
func (h *Handler) UpdateDatabaseV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	var in models.DatabaseConfigInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	needPassword := d.Password == "" && in.Password == ""
	if err := in.ValidateConnection(needPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.validateRefs(d.UserID, c.IsAdmin, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	applyDatabaseInput(d, &in)
	d.Labels = nil
	d.Storage = models.StorageConfig{}
	d.Notification = nil
	if err := h.repo.SaveDatabase(d); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update database")
		return
	}
	if err := h.scheduler.UpdateJob(d); err != nil {
		logError("reschedule database", err)
	}
	h.logActivity(&c.UserID, models.ActionDatabaseUpdated, models.LogLevelInfo, "database", &d.ID, d.Name,
		fmt.Sprintf("Database %q updated", d.Name), "", c.IP)
	fresh, _ := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if fresh == nil {
		fresh = d
	}
	writeJSON(w, http.StatusOK, h.enrichDatabases([]*models.DatabaseConfig{fresh})[0])
}

// DeleteDatabaseV2 handles DELETE /databases/{id}?delete_backups=true.
func (h *Handler) DeleteDatabaseV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	if active, _ := h.repo.GetActiveBackupForDatabase(id); active != nil {
		writeError(w, http.StatusConflict, "a backup is in progress; cancel it before deleting the database")
		return
	}
	removed := 0
	if r.URL.Query().Get("delete_backups") == "true" {
		n, err := h.orch.DeleteArtifacts(d)
		removed = n
		if err != nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("deleted %d artifact(s) but some could not be removed from storage: %v; the database was kept", n, err))
			return
		}
	}
	h.scheduler.RemoveJob(id)
	if err := h.repo.DeleteDatabaseConfigByUser(id, c.UserID, c.IsAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete database")
		return
	}
	h.logActivity(&c.UserID, models.ActionDatabaseDeleted, models.LogLevelWarning, "database", &id, d.Name,
		fmt.Sprintf("Database %q removed (%d stored backup(s) deleted)", d.Name, removed), "", c.IP)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setPaused(w http.ResponseWriter, r *http.Request, paused bool) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	if paused {
		err = h.repo.PauseDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
		h.scheduler.RemoveJob(id)
	} else {
		err = h.repo.UnpauseDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update database")
		return
	}
	d.Paused = paused
	action, verb := models.ActionDatabaseUnpaused, "resumed"
	if paused {
		action, verb = models.ActionDatabasePaused, "paused"
	} else if err := h.scheduler.AddJob(d); err != nil {
		logError("schedule database", err)
	}
	h.logActivity(&c.UserID, action, models.LogLevelInfo, "database", &id, d.Name,
		fmt.Sprintf("Scheduled backups for %q %s", d.Name, verb), "", c.IP)
	writeJSON(w, http.StatusOK, h.enrichDatabases([]*models.DatabaseConfig{d})[0])
}

// PauseDatabaseV2 handles POST /databases/{id}/pause.
func (h *Handler) PauseDatabaseV2(w http.ResponseWriter, r *http.Request) { h.setPaused(w, r, true) }

// UnpauseDatabaseV2 handles POST /databases/{id}/unpause.
func (h *Handler) UnpauseDatabaseV2(w http.ResponseWriter, r *http.Request) { h.setPaused(w, r, false) }

// TriggerBackupV2 handles POST /databases/{id}/backup.
func (h *Handler) TriggerBackupV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	b, err := h.orch.EnqueueBackup(d, models.TriggerManual, &c.UserID)
	if errors.Is(err, jobs.ErrBackupInProgress) {
		writeJSON(w, http.StatusConflict, map[string]any{"code": "Conflict", "message": err.Error(), "backup": b})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start backup")
		return
	}
	h.logActivity(&c.UserID, models.ActionBackupTriggered, models.LogLevelInfo, "backup", &b.ID, d.Name,
		fmt.Sprintf("Manual backup of %q requested", d.Name), "", c.IP)
	writeJSON(w, http.StatusAccepted, b)
}

// ConnectionTestRequest tests connectivity before (or after) saving.
type ConnectionTestRequest struct {
	ExecutionMode   models.ExecutionMode `json:"execution_mode"`
	AgentID         *uuid.UUID           `json:"agent_id,omitempty"`
	AgentConnection string               `json:"agent_connection,omitempty"`
	Host            string               `json:"host"`
	Port            int                  `json:"port"`
	DBName          string               `json:"dbname"`
	Username        string               `json:"user"`
	Password        string               `json:"password"`
	// DatabaseID reuses the stored password of an existing database when
	// Password is empty (testing an edit without retyping the secret).
	DatabaseID *uuid.UUID `json:"database_id,omitempty"`
}

// ConnectionTestResponse is either an immediate result (direct) or a queued
// agent job to poll at GET /agent-jobs/{job_id}.
type ConnectionTestResponse struct {
	Result *pgexec.TestResult `json:"result,omitempty"`
	JobID  *uuid.UUID         `json:"job_id,omitempty"`
}

func (h *Handler) runConnectionTest(w http.ResponseWriter, r *http.Request, c *reqCtx, req ConnectionTestRequest) {
	if req.DatabaseID != nil && req.Password == "" {
		if d, _ := h.repo.GetDatabaseConfigByUser(*req.DatabaseID, c.UserID, c.IsAdmin); d != nil {
			req.Password = d.Password
		}
	}
	conn := pgexec.Conn{Host: req.Host, Port: req.Port, Database: req.DBName, User: req.Username, Password: req.Password}
	if conn.Port == 0 {
		conn.Port = 5432
	}
	if req.ExecutionMode == models.ExecutionAgent {
		if req.AgentID == nil {
			writeError(w, http.StatusBadRequest, "agent_id is required")
			return
		}
		a, err := h.repo.GetAgentByUser(*req.AgentID, c.UserID, c.IsAdmin)
		if err != nil || a == nil {
			writeError(w, http.StatusNotFound, "agent not found")
			return
		}
		ref := agentproto.ConnRef{Connection: req.AgentConnection}
		if req.AgentConnection == "" {
			if err := conn.Validate(); err != nil {
				writeError(w, http.StatusBadRequest, pgexec.AsError(err).Message)
				return
			}
			ref.Conn = &conn
		}
		job, err := h.orch.QueueTestConnection(a, ref)
		if err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeJSON(w, http.StatusAccepted, ConnectionTestResponse{JobID: &job.ID})
		return
	}
	if err := conn.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, pgexec.AsError(err).Message)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	res := h.orch.Runner().TestConnection(ctx, conn)
	writeJSON(w, http.StatusOK, ConnectionTestResponse{Result: &res})
}

// TestDatabaseConnection handles POST /databases/test.
func (h *Handler) TestDatabaseConnection(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	var req ConnectionTestRequest
	if !h.decodeBody(w, r, &req, false) {
		return
	}
	h.runConnectionTest(w, r, c, req)
}

// TestExistingDatabase handles POST /databases/{id}/test.
func (h *Handler) TestExistingDatabase(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	h.runConnectionTest(w, r, c, ConnectionTestRequest{
		ExecutionMode: d.Mode(), AgentID: d.AgentID, AgentConnection: d.AgentConnection,
		Host: d.Host, Port: d.Port, DBName: d.DBName, Username: d.Username, Password: d.Password,
	})
}

// SchedulePreview describes a cron expression.
type SchedulePreview struct {
	Valid    bool        `json:"valid"`
	Error    string      `json:"error,omitempty"`
	Timezone string      `json:"timezone"`
	Next     []time.Time `json:"next,omitempty"`
}

// PreviewSchedule handles GET /schedules/preview?cron=...&tz=...
func (h *Handler) PreviewSchedule(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(w, r); !ok {
		return
	}
	expr, tz := r.URL.Query().Get("cron"), r.URL.Query().Get("tz")
	resp := SchedulePreview{Timezone: tz}
	if tz == "" {
		resp.Timezone = time.Local.String()
	}
	sched, err := jobs.ParseSchedule(expr, tz)
	if err != nil {
		resp.Error = err.Error()
		writeJSON(w, http.StatusOK, resp)
		return
	}
	resp.Valid = true
	t := time.Now()
	for i := 0; i < 5; i++ {
		t = sched.Next(t)
		if t.IsZero() {
			break
		}
		resp.Next = append(resp.Next, t)
	}
	writeJSON(w, http.StatusOK, resp)
}

// DatabaseConnectionView returns the editable, non-secret connection fields.
type DatabaseConnectionView struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	DBName      string `json:"dbname"`
	Username    string `json:"user"`
	HasPassword bool   `json:"has_password"`
}

// GetDatabaseConnection handles GET /databases/{id}/connection (edit forms).
// Passwords are never returned; demo accounts are refused.
func (h *Handler) GetDatabaseConnection(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.repo.GetDatabaseConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || d == nil {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	writeJSON(w, http.StatusOK, DatabaseConnectionView{Host: d.Host, Port: d.Port, DBName: d.DBName, Username: d.Username, HasPassword: d.Password != ""})
}
