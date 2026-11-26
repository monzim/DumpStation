package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
)

// OverviewResponse powers the dashboard. Every number comes from real data.
type OverviewResponse struct {
	Databases struct {
		Total       int64 `json:"total"`
		Protected   int   `json:"protected"`
		Unprotected int   `json:"unprotected"`
		Paused      int64 `json:"paused"`
		Attention   int   `json:"attention"`
	} `json:"databases"`
	Backups struct {
		Success24h  int64    `json:"success_24h"`
		Failed24h   int64    `json:"failed_24h"`
		Success7d   int64    `json:"success_7d"`
		Failed7d    int64    `json:"failed_7d"`
		SuccessRate *float64 `json:"success_rate_7d"`
		Active      int64    `json:"active"`
	} `json:"backups"`
	Storage struct {
		UsedBytes     int64 `json:"used_bytes"`
		ArtifactCount int64 `json:"artifact_count"`
		Destinations  int   `json:"destinations"`
	} `json:"storage"`
	Agents struct {
		Total    int `json:"total"`
		Online   int `json:"online"`
		Offline  int `json:"offline"`
		Disabled int `json:"disabled"`
		Pending  int `json:"pending"`
	} `json:"agents"`
	LastSuccessAt *time.Time                      `json:"last_success_at,omitempty"`
	Attention     []models.DatabaseConfigResponse `json:"attention"`
	Upcoming      []UpcomingRun                   `json:"upcoming"`
	Active        []BackupView                    `json:"active"`
	RecentFailed  []BackupView                    `json:"recent_failed"`
	Daily         []repository.DailyCount         `json:"daily"`
	Activity      []*models.ActivityLog           `json:"activity"`
}

// UpcomingRun is a scheduled backup in the near future.
type UpcomingRun struct {
	DatabaseID   uuid.UUID            `json:"database_id"`
	DatabaseName string               `json:"database_name"`
	At           time.Time            `json:"at"`
	Executor     models.ExecutionMode `json:"executor"`
}

// GetOverview handles GET /overview.
func (h *Handler) GetOverview(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	var out OverviewResponse
	counts, err := h.repo.GetOverviewCounts(c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to compute overview")
		return
	}
	out.Databases.Total, out.Databases.Paused = counts.Databases, counts.PausedDatabases
	out.Backups.Success24h, out.Backups.Failed24h = counts.Success24h, counts.Failed24h
	out.Backups.Success7d, out.Backups.Failed7d, out.Backups.Active = counts.Success7d, counts.Failed7d, counts.Active
	if tot := counts.Success7d + counts.Failed7d; tot > 0 {
		rate := float64(counts.Success7d) * 100 / float64(tot)
		out.Backups.SuccessRate = &rate
	}
	out.Storage.UsedBytes, out.Storage.ArtifactCount = counts.UsedBytes, counts.ArtifactCount

	dbs, _ := h.repo.ListDatabaseConfigsByUser(c.UserID, c.IsAdmin)
	views := h.enrichDatabases(dbs)
	out.Attention = []models.DatabaseConfigResponse{}
	for _, v := range views {
		if v.LastSuccessAt != nil {
			out.Databases.Protected++
			if out.LastSuccessAt == nil || v.LastSuccessAt.After(*out.LastSuccessAt) {
				t := *v.LastSuccessAt
				out.LastSuccessAt = &t
			}
		} else {
			out.Databases.Unprotected++
		}
		switch v.Health {
		case HealthFailing, HealthStale, HealthNever:
			out.Attention = append(out.Attention, v)
		}
		if v.NextRunAt != nil {
			out.Upcoming = append(out.Upcoming, UpcomingRun{DatabaseID: v.ID, DatabaseName: v.Name, At: *v.NextRunAt, Executor: v.ExecutionMode})
		}
	}
	out.Databases.Attention = len(out.Attention)
	sort.Slice(out.Upcoming, func(i, j int) bool { return out.Upcoming[i].At.Before(out.Upcoming[j].At) })
	if len(out.Upcoming) > 8 {
		out.Upcoming = out.Upcoming[:8]
	}
	if out.Upcoming == nil {
		out.Upcoming = []UpcomingRun{}
	}

	storages, _ := h.repo.ListStorageConfigsByUser(c.UserID, c.IsAdmin)
	out.Storage.Destinations = len(storages)

	agents, _ := h.repo.ListAgentsByUser(c.UserID, c.IsAdmin)
	now := time.Now()
	for _, a := range agents {
		if a.Status == models.AgentStatusRevoked {
			continue
		}
		out.Agents.Total++
		switch {
		case a.Status == models.AgentStatusPending:
			out.Agents.Pending++
		case a.Status == models.AgentStatusDisabled:
			out.Agents.Disabled++
		case a.IsOnline(now):
			out.Agents.Online++
		default:
			out.Agents.Offline++
		}
	}

	nc := h.newNameCache()
	active, _, _ := h.repo.ListBackupsPaged(c.UserID, c.IsAdmin, repository.BackupListParams{
		Statuses: []models.BackupStatus{models.BackupStatusPending, models.BackupStatusRunning}, Limit: 20})
	out.Active = make([]BackupView, len(active))
	for i, b := range active {
		out.Active[i] = h.backupView(b, nc)
	}
	since := now.AddDate(0, 0, -7)
	failed, _, _ := h.repo.ListBackupsPaged(c.UserID, c.IsAdmin, repository.BackupListParams{
		Statuses: []models.BackupStatus{models.BackupStatusFailed}, From: &since, Limit: 8})
	out.RecentFailed = make([]BackupView, len(failed))
	for i, b := range failed {
		out.RecentFailed[i] = h.backupView(b, nc)
	}
	out.Daily, _ = h.repo.GetDailyBackupCounts(c.UserID, c.IsAdmin, 14)
	if out.Daily == nil {
		out.Daily = []repository.DailyCount{}
	}
	logs, _, _ := h.repo.ListActivityLogsByUser(c.UserID, c.IsAdmin, &models.ActivityLogListParams{Limit: 12})
	out.Activity = logs
	if out.Activity == nil {
		out.Activity = []*models.ActivityLog{}
	}
	writeJSON(w, http.StatusOK, out)
}

// SystemHealth reports the server's own health and capabilities.
type SystemHealth struct {
	Version          string    `json:"version"`
	ServerTime       time.Time `json:"server_time"`
	Timezone         string    `json:"timezone"`
	Uptime           string    `json:"uptime"`
	DatabaseOK       bool      `json:"database_ok"`
	DatabaseLatency  int64     `json:"database_latency_ms"`
	PgClientVersions []string  `json:"pg_client_versions"`
	Scheduler        struct {
		ActiveSchedules int `json:"active_schedules"`
	} `json:"scheduler"`
	Jobs struct {
		DirectConcurrency int    `json:"direct_concurrency"`
		QueueTTL          string `json:"queue_ttl"`
		LeaseTTL          string `json:"lease_ttl"`
		MaxAttempts       int    `json:"max_attempts"`
	} `json:"jobs"`
	Notifications struct {
		DiscordLoginWebhook bool `json:"discord_login_webhook"`
	} `json:"notifications"`
	Auth struct {
		GitHub    bool `json:"github"`
		Discord   bool `json:"discord"`
		Turnstile bool `json:"turnstile"`
		Demo      bool `json:"demo"`
	} `json:"auth"`
	PublicURL string `json:"public_url"`
}

var startedAt = time.Now()

// Version is set at build time (-ldflags "-X .../handlers.Version=v2.0.0").
var Version = "dev"

// GetSystemHealth handles GET /system/health.
func (h *Handler) GetSystemHealth(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(w, r); !ok {
		return
	}
	var out SystemHealth
	out.Version = Version
	out.ServerTime = time.Now()
	out.Timezone = time.Local.String()
	out.Uptime = time.Since(startedAt).Round(time.Second).String()
	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if sqlDB, err := h.repo.DB().DB(); err == nil {
		out.DatabaseOK = sqlDB.PingContext(ctx) == nil
	}
	out.DatabaseLatency = time.Since(start).Milliseconds()
	out.PgClientVersions = h.orch.Runner().Tools.MajorStrings()
	cfg := h.orch.Config()
	out.Jobs.DirectConcurrency, out.Jobs.MaxAttempts = cfg.DirectConcurrency, cfg.MaxAttempts
	out.Jobs.QueueTTL, out.Jobs.LeaseTTL = cfg.QueueTTL.String(), cfg.LeaseTTL.String()
	if h.cfg != nil {
		out.Notifications.DiscordLoginWebhook = h.cfg.Discord.WebhookURL != ""
		out.Auth.GitHub, out.Auth.Discord = h.cfg.GitHub.Enabled, h.cfg.Discord.WebhookURL != ""
		out.Auth.Turnstile, out.Auth.Demo = h.cfg.Turnstile.Enabled, h.cfg.DemoEnabled
	}
	out.PublicURL = h.publicURL(r)
	if dbs, err := h.repo.ListEnabledDatabases(); err == nil {
		for _, d := range dbs {
			if h.scheduler.NextRun(d.ID) != nil {
				out.Scheduler.ActiveSchedules++
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// GetStatsV2 handles the legacy GET /stats endpoint.
func (h *Handler) GetStatsV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	s, err := h.repo.GetSystemStatsByUser(c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// AdminUserView is a user as seen by administrators.
type AdminUserView struct {
	ID               uuid.UUID `json:"id"`
	DisplayName      string    `json:"display_name"`
	Email            string    `json:"email,omitempty"`
	GitHubLogin      string    `json:"github_login,omitempty"`
	DiscordUsername  string    `json:"discord_username,omitempty"`
	IsAdmin          bool      `json:"is_admin"`
	IsDemo           bool      `json:"is_demo"`
	TwoFactorEnabled bool      `json:"two_factor_enabled"`
	CreatedAt        time.Time `json:"created_at"`
}

func requireAdmin(w http.ResponseWriter, r *http.Request) (*reqCtx, bool) {
	c, ok := caller(w, r)
	if !ok {
		return nil, false
	}
	if !c.IsAdmin {
		writeError(w, http.StatusForbidden, "administrator access required")
		return nil, false
	}
	return c, true
}

// ListUsersAdmin handles GET /admin/users.
func (h *Handler) ListUsersAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireAdmin(w, r); !ok {
		return
	}
	users, err := h.repo.ListUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	out := make([]AdminUserView, len(users))
	for i, u := range users {
		name := u.GitHubLogin
		if name == "" {
			name = u.DiscordUsername
		}
		if name == "" {
			name = u.DiscordUserID
		}
		out[i] = AdminUserView{ID: u.ID, DisplayName: name, Email: u.Email, GitHubLogin: u.GitHubLogin, DiscordUsername: u.DiscordUsername,
			IsAdmin: u.IsAdmin, IsDemo: u.IsDemo, TwoFactorEnabled: u.TwoFactorEnabled, CreatedAt: u.CreatedAt}
	}
	writeJSON(w, http.StatusOK, out)
}

// UpdateUserAdmin handles PATCH /admin/users/{id} {is_admin}.
func (h *Handler) UpdateUserAdmin(w http.ResponseWriter, r *http.Request) {
	c, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	if c.IsDemo {
		writeError(w, http.StatusForbidden, "the demo account is read-only")
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		IsAdmin *bool `json:"is_admin"`
	}
	if !h.decodeBody(w, r, &in, false) || in.IsAdmin == nil {
		if in.IsAdmin == nil {
			writeError(w, http.StatusBadRequest, "is_admin is required")
		}
		return
	}
	u, err := h.repo.GetUserByID(id)
	if err != nil || u == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if u.IsDemo && *in.IsAdmin {
		writeError(w, http.StatusBadRequest, "the demo account cannot be an administrator")
		return
	}
	if u.ID == c.UserID && !*in.IsAdmin {
		writeError(w, http.StatusBadRequest, "you cannot remove your own administrator role")
		return
	}
	if err := h.repo.SetUserAdmin(id, *in.IsAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	role := "user"
	if *in.IsAdmin {
		role = "administrator"
	}
	h.logActivity(&c.UserID, models.ActionUserRoleChanged, models.LogLevelWarning, "user", &id, u.Email,
		fmt.Sprintf("Role of user %s changed to %s (takes effect at next sign-in)", u.ID, role), "", c.IP)
	w.WriteHeader(http.StatusNoContent)
}
