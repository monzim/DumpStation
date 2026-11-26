package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	_ "github.com/monzim/db_proxy/v1/docs" // Import generated swagger docs
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/monzim/db_proxy/v1/internal/middleware"
	httpSwagger "github.com/swaggo/http-swagger"
)

// Mounter registers additional route groups (the agent API).
type Mounter interface{ Register(r *mux.Router) }

// SetupRoutesWithTOTP configures all HTTP routes.
func SetupRoutesWithTOTP(h *Handler, jwtMgr *auth.JWTManager, cfg *config.Config, totpMgr *auth.TOTPManager, extra ...Mounter) *mux.Router {
	r := mux.NewRouter()
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.Logger)

	// Agent API: called by DumpStation Agents, authenticated with agent
	// credentials, not user JWTs. No CORS: agents are not browsers.
	for _, m := range extra {
		m.Register(r)
	}

	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.NewCORSMiddleware(&cfg.CORS))
	api.HandleFunc("/health", h.HealthCheck).Methods("GET", "OPTIONS")

	authLimit := middleware.AuthRateLimit()
	authPublic := api.PathPrefix("").Subrouter()
	authPublic.Use(authLimit)
	authPublic.HandleFunc("/auth/login", h.Login).Methods("POST", "OPTIONS")
	authPublic.HandleFunc("/auth/verify", h.Verify).Methods("POST", "OPTIONS")
	if cfg.DemoEnabled {
		authPublic.HandleFunc("/auth/demo-login", h.DemoLogin).Methods("POST", "OPTIONS")
	}
	api.HandleFunc("/auth/config", h.AuthConfig).Methods("GET", "OPTIONS")
	authPublic.HandleFunc("/auth/github/login", h.GitHubLogin).Methods("GET", "OPTIONS")
	authPublic.HandleFunc("/auth/github/callback", h.GitHubCallback).Methods("GET", "OPTIONS")
	if totpMgr != nil {
		tfa := NewTwoFactorHandler(h, totpMgr)
		authPublic.HandleFunc("/auth/2fa/verify", tfa.Verify2FA).Methods("POST", "OPTIONS")
	}

	// Read routes: any fully authenticated user, including the demo account.
	read := api.PathPrefix("").Subrouter()
	read.Use(middleware.AuthMiddlewareWithLookup(jwtMgr, h.userFlags))
	// Write routes: demo account rejected.
	write := api.PathPrefix("").Subrouter()
	write.Use(middleware.AuthMiddlewareWithLookup(jwtMgr, h.userFlags))
	write.Use(middleware.DemoRestrictionMiddleware)
	// Fully blocked for demo (2FA management).
	blocked := api.PathPrefix("").Subrouter()
	blocked.Use(middleware.AuthMiddlewareWithLookup(jwtMgr, h.userFlags))
	blocked.Use(middleware.DemoBlockMiddleware)

	// Overview & system
	read.HandleFunc("/overview", h.GetOverview).Methods("GET", "OPTIONS")
	read.HandleFunc("/stats", h.GetStatsV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/system/health", h.GetSystemHealth).Methods("GET", "OPTIONS")
	read.HandleFunc("/schedules/preview", h.PreviewSchedule).Methods("GET", "OPTIONS")

	// Databases (literal paths before {id})
	write.HandleFunc("/databases/test", h.TestDatabaseConnection).Methods("POST", "OPTIONS")
	read.HandleFunc("/databases", h.ListDatabasesV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/databases/{id}", h.GetDatabaseV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/databases/{id}/backups", h.ListDatabaseBackupsV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/databases/{id}/connection", h.GetDatabaseConnection).Methods("GET", "OPTIONS")
	write.HandleFunc("/databases", h.CreateDatabaseV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}", h.UpdateDatabaseV2).Methods("PUT", "OPTIONS")
	write.HandleFunc("/databases/{id}", h.DeleteDatabaseV2).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/databases/{id}/pause", h.PauseDatabaseV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}/unpause", h.UnpauseDatabaseV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}/backup", h.TriggerBackupV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}/test", h.TestExistingDatabase).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}/labels", h.AssignLabelsToDatabase).Methods("POST", "OPTIONS")
	write.HandleFunc("/databases/{id}/labels/{labelId}", h.RemoveLabelFromDatabase).Methods("DELETE", "OPTIONS")

	// Backups
	read.HandleFunc("/backups", h.ListBackupsV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/backups/failed/count", h.CountFailedBackups).Methods("GET", "OPTIONS")
	write.HandleFunc("/backups/failed", h.PurgeFailedBackups).Methods("DELETE", "OPTIONS")
	read.HandleFunc("/backups/{id}", h.GetBackupV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/backups/{id}/events", h.BackupEventsV2).Methods("GET", "OPTIONS")
	write.HandleFunc("/backups/{id}/cancel", h.CancelBackupV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/backups/{id}/restore", h.RestoreBackupV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/backups/{id}/download/request-otp", h.RequestBackupDownloadOTP).Methods("POST", "OPTIONS")
	write.HandleFunc("/backups/{id}/download/verify", h.VerifyBackupDownloadOTP).Methods("POST", "OPTIONS")

	// Restores
	read.HandleFunc("/restores", h.ListRestoresV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/restores/{id}", h.GetRestoreV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/restores/{id}/events", h.RestoreEventsV2).Methods("GET", "OPTIONS")

	// Agents
	read.HandleFunc("/agents", h.ListAgentsV2).Methods("GET", "OPTIONS")
	write.HandleFunc("/agents", h.CreateAgentV2).Methods("POST", "OPTIONS")
	read.HandleFunc("/agents/{id}", h.GetAgentV2).Methods("GET", "OPTIONS")
	write.HandleFunc("/agents/{id}", h.UpdateAgentV2).Methods("PUT", "OPTIONS")
	write.HandleFunc("/agents/{id}", h.DeleteAgentV2).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/agents/{id}/enable", h.EnableAgentV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/agents/{id}/disable", h.DisableAgentV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/agents/{id}/revoke", h.RevokeAgentV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/agents/{id}/enrollment", h.EnrollAgentV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/agents/{id}/test-connection", h.AgentTestConnectionV2).Methods("POST", "OPTIONS")
	read.HandleFunc("/agent-jobs/{id}", h.GetAgentJobV2).Methods("GET", "OPTIONS")

	// Storage
	write.HandleFunc("/storage/test", h.TestStorageInput).Methods("POST", "OPTIONS")
	read.HandleFunc("/storage", h.ListStorageV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/storage/{id}", h.GetStorageV2).Methods("GET", "OPTIONS")
	read.HandleFunc("/storage/{id}/settings", h.GetStorageSettings).Methods("GET", "OPTIONS")
	write.HandleFunc("/storage", h.CreateStorageV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/storage/{id}", h.UpdateStorageV2).Methods("PUT", "OPTIONS")
	write.HandleFunc("/storage/{id}", h.DeleteStorageV2).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/storage/{id}/test", h.TestStorageV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/storage/{id}/default", h.SetDefaultStorageV2).Methods("POST", "OPTIONS")
	write.HandleFunc("/storage/{id}/labels", h.AssignLabelsToStorage).Methods("POST", "OPTIONS")
	write.HandleFunc("/storage/{id}/labels/{labelId}", h.RemoveLabelFromStorage).Methods("DELETE", "OPTIONS")

	// Notifications
	read.HandleFunc("/notifications", h.ListNotificationConfigs).Methods("GET", "OPTIONS")
	read.HandleFunc("/notifications/{id}", h.GetNotificationConfig).Methods("GET", "OPTIONS")
	write.HandleFunc("/notifications", h.CreateNotificationConfig).Methods("POST", "OPTIONS")
	write.HandleFunc("/notifications/{id}", h.UpdateNotificationV2).Methods("PUT", "OPTIONS")
	write.HandleFunc("/notifications/{id}", h.DeleteNotificationConfig).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/notifications/{id}/test", h.TestNotificationConfig).Methods("POST", "OPTIONS")
	write.HandleFunc("/notifications/{id}/labels", h.AssignLabelsToNotification).Methods("POST", "OPTIONS")
	write.HandleFunc("/notifications/{id}/labels/{labelId}", h.RemoveLabelFromNotification).Methods("DELETE", "OPTIONS")

	// Activity
	read.HandleFunc("/logs", h.ListActivityLogs).Methods("GET", "OPTIONS")
	read.HandleFunc("/logs/{id}", h.GetActivityLog).Methods("GET", "OPTIONS")

	// Session & profile
	read.HandleFunc("/auth/refresh", h.Refresh).Methods("POST", "OPTIONS")
	read.HandleFunc("/auth/logout", h.Logout).Methods("POST", "OPTIONS")
	read.HandleFunc("/users/me", h.GetUserProfile).Methods("GET", "OPTIONS")
	read.HandleFunc("/users/me/avatar", h.GetUserAvatar).Methods("GET", "OPTIONS")
	write.HandleFunc("/users/me/avatar", h.UploadAvatar).Methods("POST", "OPTIONS")
	write.HandleFunc("/users/me/avatar", h.DeleteAvatar).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/users/me/avatar/upload", h.UploadAvatarMultipart).Methods("POST", "OPTIONS")

	// Administration
	read.HandleFunc("/admin/users", h.ListUsersAdmin).Methods("GET", "OPTIONS")
	write.HandleFunc("/admin/users/{id}", h.UpdateUserAdmin).Methods("PATCH", "OPTIONS")

	// Labels
	read.HandleFunc("/labels", h.ListLabels).Methods("GET", "OPTIONS")
	read.HandleFunc("/labels/{id}", h.GetLabel).Methods("GET", "OPTIONS")
	write.HandleFunc("/labels", h.CreateLabel).Methods("POST", "OPTIONS")
	write.HandleFunc("/labels/{id}", h.UpdateLabel).Methods("PUT", "OPTIONS")
	write.HandleFunc("/labels/{id}", h.DeleteLabel).Methods("DELETE", "OPTIONS")

	// DB Servers explorer
	write.HandleFunc("/server-connections/test", h.TestServerConnectionAdHoc).Methods("POST", "OPTIONS")
	read.HandleFunc("/server-connections", h.ListServerConnections).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}", h.GetServerConnection).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}/databases", h.ListServerDatabases).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}/databases/{dbname}/tables", h.ListServerTables).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}/databases/{dbname}/tables/{schema}/{table}/rows", h.BrowseServerTable).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}/databases/{dbname}/erd", h.GetServerDatabaseERD).Methods("GET", "OPTIONS")
	read.HandleFunc("/server-connections/{id}/users", h.ListServerUsers).Methods("GET", "OPTIONS")
	write.HandleFunc("/server-connections", h.CreateServerConnection).Methods("POST", "OPTIONS")
	write.HandleFunc("/server-connections/{id}", h.UpdateServerConnection).Methods("PUT", "OPTIONS")
	write.HandleFunc("/server-connections/{id}", h.DeleteServerConnection).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/test", h.TestServerConnection).Methods("POST", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/databases", h.CreateServerDatabase).Methods("POST", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/databases/{dbname}", h.DropServerDatabase).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/users", h.CreateServerUser).Methods("POST", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/users/{username}", h.DropServerUser).Methods("DELETE", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/databases/{dbname}/grants", h.GrantServerRole).Methods("POST", "OPTIONS")
	write.HandleFunc("/server-connections/{id}/databases/{dbname}/tables/{schema}/{table}/truncate", h.TruncateServerTable).Methods("POST", "OPTIONS")

	// 2FA management
	if totpMgr != nil {
		tfa := NewTwoFactorHandler(h, totpMgr)
		blocked.HandleFunc("/auth/2fa/setup", tfa.Setup2FA).Methods("POST", "OPTIONS")
		blocked.HandleFunc("/auth/2fa/verify-setup", tfa.VerifySetup2FA).Methods("POST", "OPTIONS")
		blocked.HandleFunc("/auth/2fa/disable", tfa.Disable2FA).Methods("POST", "OPTIONS")
		blocked.HandleFunc("/auth/2fa/backup-codes", tfa.RegenerateBackupCodes).Methods("POST", "OPTIONS")
		read.HandleFunc("/auth/2fa/status", tfa.Get2FAStatus).Methods("GET", "OPTIONS")
	}

	api.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "endpoint not found")
	})

	r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	// Web UI (single-page app) served from WEB_DIR.
	if cfg.WebDir != "" {
		r.HandleFunc("/config.js", h.RuntimeConfigJS).Methods("GET")
		r.PathPrefix("/").Handler(spaHandler(cfg.WebDir))
	}
	return r
}
