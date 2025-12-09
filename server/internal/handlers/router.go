package handlers

import (
	"github.com/gorilla/mux"
	_ "github.com/monzim/db_proxy/v1/docs" // Import generated swagger docs
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/monzim/db_proxy/v1/internal/middleware"
	httpSwagger "github.com/swaggo/http-swagger"
)

// SetupRoutes configures all HTTP routes
func SetupRoutes(h *Handler, jwtMgr *auth.JWTManager, cfg *config.Config) *mux.Router {
	return SetupRoutesWithTOTP(h, jwtMgr, cfg, nil)
}

// SetupRoutesWithTOTP configures all HTTP routes including 2FA endpoints
func SetupRoutesWithTOTP(h *Handler, jwtMgr *auth.JWTManager, cfg *config.Config, totpMgr *auth.TOTPManager) *mux.Router {
	r := mux.NewRouter()

	// Apply global middleware
	r.Use(middleware.NewCORSMiddleware(&cfg.CORS))
	r.Use(middleware.Logger)

	// API v1 routes
	api := r.PathPrefix("/api/v1").Subrouter()

	// Health check route (no authentication required)
	api.HandleFunc("/health", h.HealthCheck).Methods("GET", "OPTIONS")
	api.HandleFunc("/health", h.HealthCheck).Methods("GET", "GET")

	// Public routes (no authentication required)
	api.HandleFunc("/auth/login", h.Login).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/verify", h.Verify).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/demo-login", h.DemoLogin).Methods("POST", "OPTIONS")

	// 2FA verification route (uses X-2FA-Token header, not regular auth)
	if totpMgr != nil {
		tfaHandler := NewTwoFactorHandler(h, totpMgr)
		api.HandleFunc("/auth/2fa/verify", tfaHandler.Verify2FA).Methods("POST", "OPTIONS")
	}

	// Protected routes (authentication required)
	protected := api.PathPrefix("").Subrouter()
	protected.Use(middleware.AuthMiddleware(jwtMgr))

	// Routes that allow demo read access (no demo restriction middleware)
	// - Storage, Notification, Database listing and details (GET only)
	// - Backups listing and details (GET only)
	// - Stats (GET only)
	// - Activity logs (GET only)

	// Storage routes - GET allowed for demo, POST/PUT/DELETE blocked
	protected.HandleFunc("/storage", h.ListStorageConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/storage/{id}", h.GetStorageConfig).Methods("GET", "OPTIONS")

	// Notification routes - GET allowed for demo
	protected.HandleFunc("/notifications", h.ListNotificationConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/notifications/{id}", h.GetNotificationConfig).Methods("GET", "OPTIONS")

	// Database routes - GET allowed for demo
	protected.HandleFunc("/databases", h.ListDatabaseConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/databases/{id}", h.GetDatabaseConfig).Methods("GET", "OPTIONS")
	protected.HandleFunc("/databases/{id}/backups", h.ListBackupsByDatabase).Methods("GET", "OPTIONS")

	// Backup routes - GET allowed for demo
	protected.HandleFunc("/backups", h.ListBackups).Methods("GET", "OPTIONS")
	protected.HandleFunc("/backups/{id}", h.GetBackup).Methods("GET", "OPTIONS")

	// Stats routes - GET allowed for demo
	protected.HandleFunc("/stats", h.GetStats).Methods("GET", "OPTIONS")

	// Activity Log routes - GET allowed for demo
	protected.HandleFunc("/logs", h.ListActivityLogs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/logs/{id}", h.GetActivityLog).Methods("GET", "OPTIONS")

	// User profile routes - GET allowed for demo
	protected.HandleFunc("/users/me", h.GetUserProfile).Methods("GET", "OPTIONS")
	protected.HandleFunc("/users/me/avatar", h.GetUserAvatar).Methods("GET", "OPTIONS")

	// Label routes - GET allowed for demo
	protected.HandleFunc("/labels", h.ListLabels).Methods("GET", "OPTIONS")
	protected.HandleFunc("/labels/{id}", h.GetLabel).Methods("GET", "OPTIONS")

	// Demo-restricted routes (write operations blocked for demo accounts)
	demoRestricted := api.PathPrefix("").Subrouter()
	demoRestricted.Use(middleware.AuthMiddleware(jwtMgr))
	demoRestricted.Use(middleware.DemoRestrictionMiddleware)

	// Storage write operations - blocked for demo
	demoRestricted.HandleFunc("/storage", h.CreateStorageConfig).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/storage/{id}", h.UpdateStorageConfig).Methods("PUT", "OPTIONS")
	demoRestricted.HandleFunc("/storage/{id}", h.DeleteStorageConfig).Methods("DELETE", "OPTIONS")

	// Notification write operations - blocked for demo
	demoRestricted.HandleFunc("/notifications", h.CreateNotificationConfig).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/notifications/{id}", h.UpdateNotificationConfig).Methods("PUT", "OPTIONS")
	demoRestricted.HandleFunc("/notifications/{id}", h.DeleteNotificationConfig).Methods("DELETE", "OPTIONS")

	// Database write operations - blocked for demo
	demoRestricted.HandleFunc("/databases", h.CreateDatabaseConfig).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}", h.UpdateDatabaseConfig).Methods("PUT", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}", h.DeleteDatabaseConfig).Methods("DELETE", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}/pause", h.PauseDatabaseConfig).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}/unpause", h.UnpauseDatabaseConfig).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}/backup", h.TriggerManualBackup).Methods("POST", "OPTIONS")

	// Backup write operations - blocked for demo
	demoRestricted.HandleFunc("/backups/{id}/restore", h.RestoreBackup).Methods("POST", "OPTIONS")

	// User profile write operations - blocked for demo
	demoRestricted.HandleFunc("/users/me/avatar", h.UploadAvatar).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/users/me/avatar", h.DeleteAvatar).Methods("DELETE", "OPTIONS")
	demoRestricted.HandleFunc("/users/me/avatar/upload", h.UploadAvatarMultipart).Methods("POST", "OPTIONS")

	// Label write operations - blocked for demo
	demoRestricted.HandleFunc("/labels", h.CreateLabel).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/labels/{id}", h.UpdateLabel).Methods("PUT", "OPTIONS")
	demoRestricted.HandleFunc("/labels/{id}", h.DeleteLabel).Methods("DELETE", "OPTIONS")

	// Database label assignment - blocked for demo
	demoRestricted.HandleFunc("/databases/{id}/labels", h.AssignLabelsToDatabase).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/databases/{id}/labels/{labelId}", h.RemoveLabelFromDatabase).Methods("DELETE", "OPTIONS")

	// Storage label assignment - blocked for demo
	demoRestricted.HandleFunc("/storage/{id}/labels", h.AssignLabelsToStorage).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/storage/{id}/labels/{labelId}", h.RemoveLabelFromStorage).Methods("DELETE", "OPTIONS")

	// Notification label assignment - blocked for demo
	demoRestricted.HandleFunc("/notifications/{id}/labels", h.AssignLabelsToNotification).Methods("POST", "OPTIONS")
	demoRestricted.HandleFunc("/notifications/{id}/labels/{labelId}", h.RemoveLabelFromNotification).Methods("DELETE", "OPTIONS")

	// Demo-blocked routes (completely blocked for demo accounts - 2FA management)
	demoBlocked := api.PathPrefix("").Subrouter()
	demoBlocked.Use(middleware.AuthMiddleware(jwtMgr))
	demoBlocked.Use(middleware.DemoBlockMiddleware)

	// 2FA management routes (protected - require full authentication, blocked for demo)
	if totpMgr != nil {
		tfaHandler := NewTwoFactorHandler(h, totpMgr)
		demoBlocked.HandleFunc("/auth/2fa/setup", tfaHandler.Setup2FA).Methods("POST", "OPTIONS")
		demoBlocked.HandleFunc("/auth/2fa/verify-setup", tfaHandler.VerifySetup2FA).Methods("POST", "OPTIONS")
		demoBlocked.HandleFunc("/auth/2fa/disable", tfaHandler.Disable2FA).Methods("POST", "OPTIONS")
		demoBlocked.HandleFunc("/auth/2fa/backup-codes", tfaHandler.RegenerateBackupCodes).Methods("POST", "OPTIONS")
		// 2FA status is read-only, so it goes to protected (allowed for demo to view)
		protected.HandleFunc("/auth/2fa/status", tfaHandler.Get2FAStatus).Methods("GET", "OPTIONS")
	}

	// Swagger documentation (public, no auth required)
	r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	return r
}
