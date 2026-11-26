package handlers

import (
	"fmt"
	"os"

	"github.com/lib/pq"
	"net/http"
	"strings"
	"time"

	"github.com/monzim/db_proxy/v1/internal/agentapi"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/monzim/db_proxy/v1/internal/repository"
)

// AgentView is the API representation of an agent.
type AgentView struct {
	*models.Agent
	Connectivity   string          `json:"connectivity"`
	DatabaseCount  int64           `json:"database_count"`
	RecentFailures int64           `json:"recent_failures"`
	LastFailure    *BackupView     `json:"last_failure,omitempty"`
	Databases      []AgentDatabase `json:"databases,omitempty"`
}

// AgentDatabase is a database assigned to an agent.
type AgentDatabase struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Connection string `json:"agent_connection,omitempty"`
	Paused     bool   `json:"paused"`
}

func (h *Handler) agentView(c *reqCtx, a *models.Agent, detail bool) AgentView {
	v := AgentView{Agent: a, Connectivity: a.Connectivity(time.Now())}
	v.DatabaseCount, _ = h.repo.CountDatabasesForAgent(a.ID)
	since := time.Now().AddDate(0, 0, -7)
	failed, total, _ := h.repo.ListBackupsPaged(c.UserID, c.IsAdmin, repository.BackupListParams{
		AgentID: &a.ID, Statuses: []models.BackupStatus{models.BackupStatusFailed}, From: &since, Limit: 1,
	})
	v.RecentFailures = total
	if len(failed) > 0 {
		bv := h.backupView(failed[0], h.newNameCache())
		v.LastFailure = &bv
	}
	if detail {
		dbs, _ := h.repo.ListDatabasesForAgent(a.ID)
		for _, d := range dbs {
			v.Databases = append(v.Databases, AgentDatabase{ID: d.ID.String(), Name: d.Name, Connection: d.AgentConnection, Paused: d.Paused})
		}
	}
	if v.PgVersions == nil {
		v.PgVersions = []string{}
	}
	if v.Connections == nil {
		v.Connections = []models.AgentConnectionInfo{}
	}
	if v.Labels == nil {
		v.Labels = []string{}
	}
	return v
}

// ListAgentsV2 handles GET /agents.
func (h *Handler) ListAgentsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	list, err := h.repo.ListAgentsByUser(c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agents")
		return
	}
	out := make([]AgentView, len(list))
	for i, a := range list {
		out[i] = h.agentView(c, a, false)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) loadAgent(w http.ResponseWriter, r *http.Request, c *reqCtx) (*models.Agent, bool) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return nil, false
	}
	a, err := h.repo.GetAgentByUser(id, c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load agent")
		return nil, false
	}
	if a == nil {
		writeError(w, http.StatusNotFound, "agent not found")
		return nil, false
	}
	return a, true
}

// GetAgentV2 handles GET /agents/{id}.
func (h *Handler) GetAgentV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, h.agentView(c, a, true))
}

// AgentInput creates or updates an agent.
type AgentInput struct {
	Name         string   `json:"name" validate:"required,max=100"`
	Description  string   `json:"description" validate:"max=1000"`
	Labels       []string `json:"labels" validate:"max=20,dive,max=40"`
	AllowRestore *bool    `json:"allow_restore,omitempty"`
}

// EnrollmentResponse returns a one-time enrollment token.
type EnrollmentResponse struct {
	Agent     AgentView `json:"agent"`
	Token     string    `json:"enrollment_token"`
	ExpiresAt time.Time `json:"expires_at"`
	ServerURL string    `json:"server_url"`
}

func (h *Handler) publicURL(r *http.Request) string {
	if h.cfg != nil && h.cfg.PublicURL != "" {
		return strings.TrimRight(h.cfg.PublicURL, "/")
	}
	// Forwarded headers are client-controlled unless a trusted proxy sets
	// them, so honour them only when TRUST_PROXY_HEADERS=true. Set
	// PUBLIC_URL in production to avoid relying on request headers at all.
	trust := os.Getenv("TRUST_PROXY_HEADERS") == "true"
	scheme := "http"
	if r.TLS != nil || (trust && strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")) {
		scheme = "https"
	}
	host := r.Host
	if fh := r.Header.Get("X-Forwarded-Host"); trust && fh != "" {
		host = fh
	}
	return scheme + "://" + host
}

func (h *Handler) issueEnrollment(w http.ResponseWriter, r *http.Request, c *reqCtx, a *models.Agent, ttl time.Duration) {
	tok := agentapi.NewToken(agentapi.EnrollmentPrefix)
	e := &models.AgentEnrollment{UserID: a.UserID, AgentID: a.ID, TokenHash: agentapi.HashToken(tok), ExpiresAt: time.Now().Add(ttl)}
	if err := h.repo.CreateEnrollment(e); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create enrollment token")
		return
	}
	h.logActivity(&c.UserID, models.ActionAgentEnrollmentIssued, models.LogLevelInfo, "agent", &a.ID, a.Name,
		fmt.Sprintf("Enrollment token issued for agent %q (valid %s)", a.Name, ttl), "", c.IP)
	writeJSON(w, http.StatusCreated, EnrollmentResponse{Agent: h.agentView(c, a, false), Token: tok, ExpiresAt: e.ExpiresAt, ServerURL: h.publicURL(r)})
}

func enrollmentTTL(r *http.Request) time.Duration {
	m := queryInt(r, "ttl_minutes", 60)
	if m < 10 {
		m = 10
	}
	if m > 24*60 {
		m = 24 * 60
	}
	return time.Duration(m) * time.Minute
}

// CreateAgentV2 handles POST /agents and returns a one-time enrollment token.
func (h *Handler) CreateAgentV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	var in AgentInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	a := &models.Agent{UserID: c.UserID, Name: strings.TrimSpace(in.Name), Description: in.Description, Labels: in.Labels,
		Status: models.AgentStatusPending, MaxConcurrency: 1}
	if in.AllowRestore != nil {
		a.AllowRestore = *in.AllowRestore
	}
	if err := h.repo.CreateAgent(a); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create agent")
		return
	}
	h.logActivity(&c.UserID, models.ActionAgentCreated, models.LogLevelSuccess, "agent", &a.ID, a.Name,
		fmt.Sprintf("Agent %q created", a.Name), "", c.IP)
	h.issueEnrollment(w, r, c, a, enrollmentTTL(r))
}

// UpdateAgentV2 handles PUT /agents/{id}.
func (h *Handler) UpdateAgentV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	var in AgentInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	labels := pq.StringArray(in.Labels)
	if labels == nil {
		labels = pq.StringArray{}
	}
	fields := map[string]any{"name": strings.TrimSpace(in.Name), "description": in.Description, "labels": labels}
	if in.AllowRestore != nil {
		fields["allow_restore"] = *in.AllowRestore
	}
	if err := h.repo.UpdateAgentFields(a.ID, fields); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update agent")
		return
	}
	h.logActivity(&c.UserID, models.ActionAgentUpdated, models.LogLevelInfo, "agent", &a.ID, in.Name,
		fmt.Sprintf("Agent %q updated", in.Name), "", c.IP)
	a, _ = h.repo.GetAgent(a.ID)
	writeJSON(w, http.StatusOK, h.agentView(c, a, true))
}

func (h *Handler) setAgentStatus(w http.ResponseWriter, r *http.Request, to models.AgentStatus) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	if a.Status == models.AgentStatusRevoked && to != models.AgentStatusRevoked {
		writeError(w, http.StatusConflict, "revoked agents must be re-enrolled with a new enrollment token")
		return
	}
	if a.Status == models.AgentStatusPending && to == models.AgentStatusActive {
		writeError(w, http.StatusConflict, "agent has not enrolled yet")
		return
	}
	fields := map[string]any{"status": to}
	action, desc := models.ActionAgentEnabled, "enabled"
	switch to {
	case models.AgentStatusDisabled:
		action, desc = models.ActionAgentDisabled, "disabled"
	case models.AgentStatusRevoked:
		action, desc = models.ActionAgentRevoked, "revoked; its credential no longer works"
		fields["token_hash"] = ""
	}
	if err := h.repo.UpdateAgentFields(a.ID, fields); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update agent")
		return
	}
	level := models.LogLevelInfo
	if to == models.AgentStatusRevoked {
		level = models.LogLevelWarning
	}
	h.logActivity(&c.UserID, action, level, "agent", &a.ID, a.Name, fmt.Sprintf("Agent %q %s", a.Name, desc), "", c.IP)
	h.orch.Signals().Notify(a.ID)
	a, _ = h.repo.GetAgent(a.ID)
	writeJSON(w, http.StatusOK, h.agentView(c, a, true))
}

// DisableAgentV2 handles POST /agents/{id}/disable.
func (h *Handler) DisableAgentV2(w http.ResponseWriter, r *http.Request) {
	h.setAgentStatus(w, r, models.AgentStatusDisabled)
}

// EnableAgentV2 handles POST /agents/{id}/enable.
func (h *Handler) EnableAgentV2(w http.ResponseWriter, r *http.Request) {
	h.setAgentStatus(w, r, models.AgentStatusActive)
}

// RevokeAgentV2 handles POST /agents/{id}/revoke.
func (h *Handler) RevokeAgentV2(w http.ResponseWriter, r *http.Request) {
	h.setAgentStatus(w, r, models.AgentStatusRevoked)
}

// EnrollAgentV2 handles POST /agents/{id}/enrollment: issues a new one-time
// token, used to (re)deploy an agent or rotate its credential. A revoked
// agent becomes active again once it enrolls with the new token.
func (h *Handler) EnrollAgentV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	if a.Status == models.AgentStatusRevoked {
		if err := h.repo.UpdateAgentFields(a.ID, map[string]any{"status": models.AgentStatusPending}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to reset agent")
			return
		}
		a.Status = models.AgentStatusPending
	}
	h.issueEnrollment(w, r, c, a, enrollmentTTL(r))
}

// DeleteAgentV2 handles DELETE /agents/{id}.
func (h *Handler) DeleteAgentV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	if err := h.repo.DeleteAgent(a.ID); err != nil {
		writeError(w, http.StatusConflict, err.Error()+"; reassign those databases first")
		return
	}
	h.logActivity(&c.UserID, models.ActionAgentDeleted, models.LogLevelWarning, "agent", &a.ID, a.Name,
		fmt.Sprintf("Agent %q removed", a.Name), "", c.IP)
	w.WriteHeader(http.StatusNoContent)
}

// AgentTestConnectionV2 handles POST /agents/{id}/test-connection with a
// body {agent_connection} or {host,port,dbname,user,password}.
func (h *Handler) AgentTestConnectionV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	a, ok := h.loadAgent(w, r, c)
	if !ok {
		return
	}
	var req ConnectionTestRequest
	if !h.decodeBody(w, r, &req, false) {
		return
	}
	req.ExecutionMode = models.ExecutionAgent
	req.AgentID = &a.ID
	h.runConnectionTest(w, r, c, req)
}

// AgentJobView reports a dispatched agent job (used for polling tests).
type AgentJobView struct {
	ID           string             `json:"id"`
	Kind         string             `json:"kind"`
	Status       string             `json:"status"`
	Attempts     int                `json:"attempts"`
	ErrorMessage string             `json:"error_message,omitempty"`
	Result       *pgexec.TestResult `json:"result,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	CompletedAt  *time.Time         `json:"completed_at,omitempty"`
}

// GetAgentJobV2 handles GET /agent-jobs/{id}.
func (h *Handler) GetAgentJobV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	j, err := h.repo.GetAgentJobByUser(id, c.UserID, c.IsAdmin)
	if err != nil || j == nil {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	v := AgentJobView{ID: j.ID.String(), Kind: string(j.Kind), Status: string(j.Status), Attempts: j.Attempts,
		ErrorMessage: j.ErrorMessage, CreatedAt: j.CreatedAt, CompletedAt: j.CompletedAt}
	if j.Result != "" {
		var tr pgexec.TestResult
		if err := jsonUnmarshal(j.Result, &tr); err == nil {
			v.Result = &tr
		}
	}
	if j.Status == models.AgentJobExpired && v.Result == nil {
		v.Result = &pgexec.TestResult{Code: pgexec.CodeAgentUnavailable, Message: "The agent did not respond; is it online?"}
	}
	writeJSON(w, http.StatusOK, v)
}

var _ = agentproto.Version
