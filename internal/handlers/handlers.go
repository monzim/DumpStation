package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/backup"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/scheduler"
)

// Handler holds all dependencies for HTTP handlers
type Handler struct {
	repo      *repository.Repository
	jwtMgr    *auth.JWTManager
	backupSvc *backup.Service
	scheduler *scheduler.Scheduler
	notifier  *notification.DiscordNotifier
	otpExpiry time.Duration
}

// New creates a new handler instance
func New(repo *repository.Repository, jwtMgr *auth.JWTManager, backupSvc *backup.Service,
	scheduler *scheduler.Scheduler, notifier *notification.DiscordNotifier, otpExpiry time.Duration) *Handler {
	return &Handler{
		repo:      repo,
		jwtMgr:    jwtMgr,
		backupSvc: backupSvc,
		scheduler: scheduler,
		notifier:  notifier,
		otpExpiry: otpExpiry,
	}
}

// Auth handlers

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Allow empty body for single-user mode
		req.Username = "admin"
	}

	// Default to admin for single-user
	if req.Username == "" {
		req.Username = "admin"
	}

	// Get or create user
	user, err := h.repo.GetUserByDiscordID(req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	if user == nil {
		user, err = h.repo.CreateUser(req.Username, req.Username)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create user")
			return
		}
	}

	// Generate OTP
	otp, err := auth.GenerateOTP()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate OTP")
		return
	}

	// Store OTP
	expiresAt := time.Now().Add(h.otpExpiry)
	if err := h.repo.CreateOTP(user.ID, otp, expiresAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store OTP")
		return
	}

	// Send OTP via Discord webhook
	if h.notifier != nil {
		if err := h.notifier.SendOTP(otp); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to send OTP")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "OTP sent to Discord webhook",
	})
}

func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Default to admin for single-user
	if req.Username == "" {
		req.Username = "admin"
	}

	// Get user
	user, err := h.repo.GetUserByDiscordID(req.Username)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Verify OTP
	valid, err := h.repo.VerifyOTP(user.ID, req.OTP)
	if err != nil || !valid {
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}

	// Generate JWT
	token, expiresAt, err := h.jwtMgr.GenerateToken(user.ID, user.DiscordUserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.AuthResponse{
		Token:     token,
		ExpiresAt: expiresAt,
	})
}

// Storage handlers

func (h *Handler) ListStorageConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListStorageConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list storage configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

func (h *Handler) CreateStorageConfig(w http.ResponseWriter, r *http.Request) {
	var input models.StorageConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.CreateStorageConfig(&input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create storage config")
		return
	}

	writeJSON(w, http.StatusCreated, config)
}

func (h *Handler) GetStorageConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetStorageConfig(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get storage config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "storage config not found")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) UpdateStorageConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.StorageConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.UpdateStorageConfig(id, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update storage config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "storage config not found")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) DeleteStorageConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	if err := h.repo.DeleteStorageConfig(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete storage config")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Notification handlers

func (h *Handler) ListNotificationConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListNotificationConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list notification configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

func (h *Handler) CreateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	var input models.NotificationConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.CreateNotificationConfig(&input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create notification config")
		return
	}

	writeJSON(w, http.StatusCreated, config)
}

func (h *Handler) GetNotificationConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetNotificationConfig(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get notification config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "notification config not found")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) UpdateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.NotificationConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.UpdateNotificationConfig(id, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update notification config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "notification config not found")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) DeleteNotificationConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	if err := h.repo.DeleteNotificationConfig(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete notification config")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Database handlers

func (h *Handler) ListDatabaseConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListDatabaseConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list database configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

func (h *Handler) CreateDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	var input models.DatabaseConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.CreateDatabaseConfig(&input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create database config")
		return
	}

	// Add to scheduler
	if err := h.scheduler.AddJob(config); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to schedule backup job")
		return
	}

	writeJSON(w, http.StatusCreated, config)
}

func (h *Handler) GetDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetDatabaseConfig(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) UpdateDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.DatabaseConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	config, err := h.repo.UpdateDatabaseConfig(id, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Update scheduler
	if err := h.scheduler.UpdateJob(config); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update backup job")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) DeleteDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Remove from scheduler
	h.scheduler.RemoveJob(id)

	if err := h.repo.DeleteDatabaseConfig(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete database config")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) TriggerManualBackup(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetDatabaseConfig(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Create backup record
	backup, err := h.repo.CreateBackup(config.ID, models.BackupStatusPending)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create backup")
		return
	}

	// Execute backup asynchronously
	go func() {
		if err := h.backupSvc.ExecuteBackup(config); err != nil {
			// Error is already logged in ExecuteBackup
		}
	}()

	writeJSON(w, http.StatusAccepted, backup)
}

// Backup handlers

func (h *Handler) ListBackupsByDatabase(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	backups, err := h.repo.ListBackupsByDatabase(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}

	writeJSON(w, http.StatusOK, backups)
}

func (h *Handler) GetBackup(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	backup, err := h.repo.GetBackup(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get backup")
		return
	}
	if backup == nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}

	writeJSON(w, http.StatusOK, backup)
}

func (h *Handler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var req models.RestoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Execute restore asynchronously
	go func() {
		if err := h.backupSvc.ExecuteRestore(id, &req); err != nil {
			// Error is already logged
		}
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{
		"message": "restore job accepted",
	})
}

// Stats handler

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.repo.GetSystemStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get stats")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

// Helper functions

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.APIError{
		Code:    http.StatusText(status),
		Message: message,
	})
}

func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}
