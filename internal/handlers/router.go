package handlers

import (
	"github.com/gorilla/mux"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/middleware"
	httpSwagger "github.com/swaggo/http-swagger"
	_ "github.com/monzim/db_proxy/v1/docs" // Import generated swagger docs
)

// SetupRoutes configures all HTTP routes
func SetupRoutes(h *Handler, jwtMgr *auth.JWTManager) *mux.Router {
	r := mux.NewRouter()

	// Apply global middleware
	r.Use(middleware.CORS)
	r.Use(middleware.Logger)

	// API v1 routes
	api := r.PathPrefix("/api/v1").Subrouter()

	// Public routes (no authentication required)
	api.HandleFunc("/auth/login", h.Login).Methods("POST")
	api.HandleFunc("/auth/verify", h.Verify).Methods("POST")

	// Protected routes (authentication required)
	protected := api.PathPrefix("").Subrouter()
	protected.Use(middleware.AuthMiddleware(jwtMgr))

	// Storage routes
	protected.HandleFunc("/storage", h.ListStorageConfigs).Methods("GET")
	protected.HandleFunc("/storage", h.CreateStorageConfig).Methods("POST")
	protected.HandleFunc("/storage/{id}", h.GetStorageConfig).Methods("GET")
	protected.HandleFunc("/storage/{id}", h.UpdateStorageConfig).Methods("PUT")
	protected.HandleFunc("/storage/{id}", h.DeleteStorageConfig).Methods("DELETE")

	// Notification routes
	protected.HandleFunc("/notifications", h.ListNotificationConfigs).Methods("GET")
	protected.HandleFunc("/notifications", h.CreateNotificationConfig).Methods("POST")
	protected.HandleFunc("/notifications/{id}", h.GetNotificationConfig).Methods("GET")
	protected.HandleFunc("/notifications/{id}", h.UpdateNotificationConfig).Methods("PUT")
	protected.HandleFunc("/notifications/{id}", h.DeleteNotificationConfig).Methods("DELETE")

	// Database routes
	protected.HandleFunc("/databases", h.ListDatabaseConfigs).Methods("GET")
	protected.HandleFunc("/databases", h.CreateDatabaseConfig).Methods("POST")
	protected.HandleFunc("/databases/{id}", h.GetDatabaseConfig).Methods("GET")
	protected.HandleFunc("/databases/{id}", h.UpdateDatabaseConfig).Methods("PUT")
	protected.HandleFunc("/databases/{id}", h.DeleteDatabaseConfig).Methods("DELETE")
	protected.HandleFunc("/databases/{id}/backup", h.TriggerManualBackup).Methods("POST")
	protected.HandleFunc("/databases/{id}/backups", h.ListBackupsByDatabase).Methods("GET")

	// Backup routes
	protected.HandleFunc("/backups/{id}", h.GetBackup).Methods("GET")
	protected.HandleFunc("/backups/{id}/restore", h.RestoreBackup).Methods("POST")

	// Stats routes
	protected.HandleFunc("/stats", h.GetStats).Methods("GET")

	// Swagger documentation (public, no auth required)
	r.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	return r
}
