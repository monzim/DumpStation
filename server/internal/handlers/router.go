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

	// 2FA verification route (uses X-2FA-Token header, not regular auth)
	if totpMgr != nil {
		tfaHandler := NewTwoFactorHandler(h, totpMgr)
		api.HandleFunc("/auth/2fa/verify", tfaHandler.Verify2FA).Methods("POST", "OPTIONS")
	}

	// Protected routes (authentication required)
	protected := api.PathPrefix("").Subrouter()
	protected.Use(middleware.AuthMiddleware(jwtMgr))

	// 2FA management routes (protected - require full authentication)
	if totpMgr != nil {
		tfaHandler := NewTwoFactorHandler(h, totpMgr)
		protected.HandleFunc("/auth/2fa/setup", tfaHandler.Setup2FA).Methods("POST", "OPTIONS")
		protected.HandleFunc("/auth/2fa/verify-setup", tfaHandler.VerifySetup2FA).Methods("POST", "OPTIONS")
		protected.HandleFunc("/auth/2fa/disable", tfaHandler.Disable2FA).Methods("POST", "OPTIONS")
		protected.HandleFunc("/auth/2fa/status", tfaHandler.Get2FAStatus).Methods("GET", "OPTIONS")
		protected.HandleFunc("/auth/2fa/backup-codes", tfaHandler.RegenerateBackupCodes).Methods("POST", "OPTIONS")
	}

	// Storage routes
	protected.HandleFunc("/storage", h.ListStorageConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/storage", h.CreateStorageConfig).Methods("POST", "OPTIONS")
	protected.HandleFunc("/storage/{id}", h.GetStorageConfig).Methods("GET", "OPTIONS")
	protected.HandleFunc("/storage/{id}", h.UpdateStorageConfig).Methods("PUT", "OPTIONS")
	protected.HandleFunc("/storage/{id}", h.DeleteStorageConfig).Methods("DELETE", "OPTIONS")

	// Notification routes
	protected.HandleFunc("/notifications", h.ListNotificationConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/notifications", h.CreateNotificationConfig).Methods("POST", "OPTIONS")
	protected.HandleFunc("/notifications/{id}", h.GetNotificationConfig).Methods("GET", "OPTIONS")
	protected.HandleFunc("/notifications/{id}", h.UpdateNotificationConfig).Methods("PUT", "OPTIONS")
	protected.HandleFunc("/notifications/{id}", h.DeleteNotificationConfig).Methods("DELETE", "OPTIONS")

	// Database routes
	protected.HandleFunc("/databases", h.ListDatabaseConfigs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/databases", h.CreateDatabaseConfig).Methods("POST", "OPTIONS")
	protected.HandleFunc("/databases/{id}", h.GetDatabaseConfig).Methods("GET", "OPTIONS")
	protected.HandleFunc("/databases/{id}", h.UpdateDatabaseConfig).Methods("PUT", "OPTIONS")
	protected.HandleFunc("/databases/{id}", h.DeleteDatabaseConfig).Methods("DELETE", "OPTIONS")
	protected.HandleFunc("/databases/{id}/pause", h.PauseDatabaseConfig).Methods("POST", "OPTIONS")
	protected.HandleFunc("/databases/{id}/unpause", h.UnpauseDatabaseConfig).Methods("POST", "OPTIONS")
	protected.HandleFunc("/databases/{id}/backup", h.TriggerManualBackup).Methods("POST", "OPTIONS")
	protected.HandleFunc("/databases/{id}/backups", h.ListBackupsByDatabase).Methods("GET", "OPTIONS")

	// Backup routes
	protected.HandleFunc("/backups", h.ListBackups).Methods("GET", "OPTIONS")
	protected.HandleFunc("/backups/{id}", h.GetBackup).Methods("GET", "OPTIONS")
	protected.HandleFunc("/backups/{id}/restore", h.RestoreBackup).Methods("POST", "OPTIONS")

	// Stats routes
	protected.HandleFunc("/stats", h.GetStats).Methods("GET", "OPTIONS")

	// Activity Log routes
	protected.HandleFunc("/logs", h.ListActivityLogs).Methods("GET", "OPTIONS")
	protected.HandleFunc("/logs/{id}", h.GetActivityLog).Methods("GET", "OPTIONS")

	// Swagger documentation (public, no auth required)
	r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	return r
}
