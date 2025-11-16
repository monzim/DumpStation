package handlers

import (
	"encoding/json"
	"fmt"
	"log"
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
	"github.com/monzim/db_proxy/v1/internal/validator"
)

// Handler holds all dependencies for HTTP handlers
type Handler struct {
	repo      *repository.Repository
	jwtMgr    *auth.JWTManager
	backupSvc *backup.Service
	scheduler *scheduler.Scheduler
	notifier  *notification.DiscordNotifier
	otpExpiry time.Duration
	validator *validator.Validator
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
		validator: validator.New(),
	}
}

// Auth handlers

// Login godoc
// @Summary Request OTP for authentication
// @Description Sends a one-time password to the configured Discord webhook for authentication. For single-user mode, username defaults to "admin".
// @Tags Authentication
// @Accept json
// @Produce json
// @Param body body models.LoginRequest false "Login request (optional in single-user mode)"
// @Success 200 {object} map[string]string "OTP sent successfully"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	logInfo("Login request received")

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Allow empty body for single-user mode
		req.Username = "admin"
		logInfo("Empty request body, defaulting to username: admin")
	}

	// Default to admin for single-user
	if req.Username == "" {
		req.Username = "admin"
	}

	logInfo("Processing login for username: %s", req.Username)

	// Get or create user
	user, err := h.repo.GetUserByDiscordID(req.Username)
	if err != nil {
		logError(fmt.Sprintf("Failed to get user: %s", req.Username), err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	if user == nil {
		logInfo("User not found, creating new user: %s", req.Username)
		user, err = h.repo.CreateUser(req.Username, req.Username)
		if err != nil {
			logError(fmt.Sprintf("Failed to create user: %s", req.Username), err)
			writeError(w, http.StatusInternalServerError, "failed to create user")
			return
		}
		logInfo("✅ New user created: %s (ID: %s)", req.Username, user.ID)
	} else {
		logInfo("✅ Existing user found: %s (ID: %s)", req.Username, user.ID)
	}

	// Generate OTP
	otp, err := auth.GenerateOTP()
	if err != nil {
		logError("Failed to generate OTP", err)
		writeError(w, http.StatusInternalServerError, "failed to generate OTP")
		return
	}

	logInfo("✅ OTP generated for user: %s", req.Username)

	// Store OTP
	expiresAt := time.Now().Add(h.otpExpiry)
	if err := h.repo.CreateOTP(user.ID, otp, expiresAt); err != nil {
		logError(fmt.Sprintf("Failed to store OTP for user: %s", req.Username), err)
		writeError(w, http.StatusInternalServerError, "failed to store OTP")
		return
	}

	logInfo("✅ OTP stored in database (expires at: %v)", expiresAt)

	// Send OTP via Discord webhook
	if h.notifier != nil {
		logInfo("Sending OTP to Discord webhook...")
		if err := h.notifier.SendOTP(otp); err != nil {
			logError("Failed to send OTP to Discord", err)
			writeError(w, http.StatusInternalServerError, "failed to send OTP")
			return
		}
		logInfo("✅ OTP sent to Discord webhook successfully")
	} else {
		log.Printf("[WARNING] ⚠️  Discord notifier not configured, OTP not sent: %s", otp)
	}

	logInfo("✅ Login successful for user: %s", req.Username)
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "OTP sent to Discord webhook",
	})
}

// Verify godoc
// @Summary Verify OTP and get JWT token
// @Description Verifies the OTP code received via Discord and returns a JWT token for API authentication
// @Tags Authentication
// @Accept json
// @Produce json
// @Param body body models.VerifyRequest true "OTP verification request"
// @Success 200 {object} models.AuthResponse "JWT token and expiration"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 401 {object} map[string]string "Invalid or expired OTP"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/verify [post]
func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	logInfo("OTP verification request received")

	var req models.VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in verify", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Default to admin for single-user
	if req.Username == "" {
		req.Username = "admin"
	}

	logInfo("Verifying OTP for username: %s", req.Username)

	// Get user
	user, err := h.repo.GetUserByDiscordID(req.Username)
	if err != nil {
		logError(fmt.Sprintf("Failed to get user during verify: %s", req.Username), err)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if user == nil {
		log.Printf("[AUTH] ❌ User not found: %s", req.Username)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	logInfo("User found: %s (ID: %s), verifying OTP...", req.Username, user.ID)

	// Verify OTP
	valid, err := h.repo.VerifyOTP(user.ID, req.OTP)
	if err != nil {
		logError(fmt.Sprintf("OTP verification error for user: %s", req.Username), err)
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}
	if !valid {
		log.Printf("[AUTH] ❌ Invalid or expired OTP for user: %s", req.Username)
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}

	logInfo("✅ OTP verified successfully for user: %s", req.Username)

	// Generate JWT
	token, expiresAt, err := h.jwtMgr.GenerateToken(user.ID, user.DiscordUserID)
	if err != nil {
		logError(fmt.Sprintf("Failed to generate JWT for user: %s", req.Username), err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	logInfo("✅ JWT token generated for user: %s (expires: %v)", req.Username, expiresAt)

	writeJSON(w, http.StatusOK, models.AuthResponse{
		Token:     token,
		ExpiresAt: expiresAt,
	})
}

// Storage handlers

// ListStorageConfigs godoc
// @Summary List all storage configurations
// @Description Get a list of all configured storage backends (S3/R2)
// @Tags Storage
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.StorageConfig "List of storage configurations"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage [get]
func (h *Handler) ListStorageConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListStorageConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list storage configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

// CreateStorageConfig godoc
// @Summary Create a new storage configuration
// @Description Add a new storage backend configuration (S3 or Cloudflare R2)
// @Tags Storage
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.StorageConfigInput true "Storage configuration"
// @Success 201 {object} models.StorageConfig "Created storage configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage [post]
func (h *Handler) CreateStorageConfig(w http.ResponseWriter, r *http.Request) {
	var input models.StorageConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in storage config request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}

	config, err := h.repo.CreateStorageConfig(&input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create storage config")
		return
	}

	writeJSON(w, http.StatusCreated, config)
}

// GetStorageConfig godoc
// @Summary Get a storage configuration by ID
// @Description Retrieve details of a specific storage configuration
// @Tags Storage
// @Produce json
// @Security BearerAuth
// @Param id path string true "Storage Config ID (UUID)"
// @Success 200 {object} models.StorageConfig "Storage configuration"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Storage config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage/{id} [get]
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

// UpdateStorageConfig godoc
// @Summary Update a storage configuration
// @Description Update an existing storage configuration
// @Tags Storage
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Storage Config ID (UUID)"
// @Param body body models.StorageConfigInput true "Updated storage configuration"
// @Success 200 {object} models.StorageConfig "Updated storage configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 404 {object} map[string]string "Storage config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage/{id} [put]
func (h *Handler) UpdateStorageConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.StorageConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in storage config update request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
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

// DeleteStorageConfig godoc
// @Summary Delete a storage configuration
// @Description Delete an existing storage configuration by ID
// @Tags Storage
// @Produce json
// @Security BearerAuth
// @Param id path string true "Storage Config ID (UUID)"
// @Success 204 "Storage configuration deleted successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Storage config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage/{id} [delete]
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

// ListNotificationConfigs godoc
// @Summary List all notification configurations
// @Description Get a list of all configured Discord webhooks for notifications
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.NotificationConfig "List of notification configurations"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications [get]
func (h *Handler) ListNotificationConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListNotificationConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list notification configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

// CreateNotificationConfig godoc
// @Summary Create a new notification configuration
// @Description Add a new Discord webhook for backup notifications
// @Tags Notifications
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.NotificationConfigInput true "Notification configuration"
// @Success 201 {object} models.NotificationConfig "Created notification configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications [post]
func (h *Handler) CreateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	var input models.NotificationConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in notification config request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}

	config, err := h.repo.CreateNotificationConfig(&input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create notification config")
		return
	}

	writeJSON(w, http.StatusCreated, config)
}

// GetNotificationConfig godoc
// @Summary Get a notification configuration by ID
// @Description Retrieve details of a specific notification configuration
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Param id path string true "Notification Config ID (UUID)"
// @Success 200 {object} models.NotificationConfig "Notification configuration"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Notification config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications/{id} [get]
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

// UpdateNotificationConfig godoc
// @Summary Update a notification configuration
// @Description Update an existing notification configuration
// @Tags Notifications
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Notification Config ID (UUID)"
// @Param body body models.NotificationConfigInput true "Updated notification configuration"
// @Success 200 {object} models.NotificationConfig "Updated notification configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 404 {object} map[string]string "Notification config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications/{id} [put]
func (h *Handler) UpdateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.NotificationConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in notification config update request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
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

// DeleteNotificationConfig godoc
// @Summary Delete a notification configuration
// @Description Delete an existing notification configuration by ID
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Param id path string true "Notification Config ID (UUID)"
// @Success 204 "Notification configuration deleted successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Notification config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications/{id} [delete]
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

// ListDatabaseConfigs godoc
// @Summary List all database configurations
// @Description Get a list of all configured PostgreSQL databases for backup
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.DatabaseConfig "List of database configurations"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases [get]
func (h *Handler) ListDatabaseConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.repo.ListDatabaseConfigs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list database configs")
		return
	}
	writeJSON(w, http.StatusOK, configs)
}

// CreateDatabaseConfig godoc
// @Summary Create a new database configuration
// @Description Add a new PostgreSQL database for automated backups with scheduling and rotation policy
// @Tags Databases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.DatabaseConfigInput true "Database configuration"
// @Success 201 {object} models.DatabaseConfig "Created database configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases [post]
func (h *Handler) CreateDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	var input models.DatabaseConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in database config request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
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

// GetDatabaseConfig godoc
// @Summary Get a database configuration by ID
// @Description Retrieve details of a specific database configuration including storage and notification settings
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 200 {object} models.DatabaseConfig "Database configuration"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id} [get]
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

// UpdateDatabaseConfig godoc
// @Summary Update a database configuration
// @Description Update an existing database configuration and reschedule backups
// @Tags Databases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Param body body models.DatabaseConfigInput true "Updated database configuration"
// @Success 200 {object} models.DatabaseConfig "Updated database configuration"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id} [put]
func (h *Handler) UpdateDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input models.DatabaseConfigInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		logError("Invalid JSON in database config update request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return
	}

	// Validate the input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation error")
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

// DeleteDatabaseConfig godoc
// @Summary Delete a database configuration
// @Description Delete an existing database configuration and remove it from scheduler
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 204 "Database configuration deleted successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id} [delete]
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

// TriggerManualBackup godoc
// @Summary Trigger a manual backup
// @Description Manually trigger a backup for a specific database configuration
// @Tags Backups
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 202 {object} models.Backup "Backup initiated successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id}/backup [post]
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

// ListBackupsByDatabase godoc
// @Summary List backups for a database
// @Description Get a list of all backup history for a specific database configuration
// @Tags Backups
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 200 {array} models.Backup "List of backups"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id}/backups [get]
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

// GetBackup godoc
// @Summary Get a backup by ID
// @Description Retrieve details of a specific backup including status, size, and storage path
// @Tags Backups
// @Produce json
// @Security BearerAuth
// @Param id path string true "Backup ID (UUID)"
// @Success 200 {object} models.Backup "Backup details"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Backup not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /backups/{id} [get]
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

// RestoreBackup godoc
// @Summary Restore a backup
// @Description Restore a PostgreSQL database from a backup. Can restore to the original database or a different target.
// @Tags Backups
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Backup ID (UUID)"
// @Param body body models.RestoreRequest false "Restore configuration (optional for custom target)"
// @Success 202 {object} models.RestoreJob "Restore job created successfully"
// @Failure 400 {object} map[string]string "Invalid ID or request body"
// @Failure 404 {object} map[string]string "Backup not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /backups/{id}/restore [post]
func (h *Handler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var req models.RestoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid JSON in restore request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
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

// GetStats godoc
// @Summary Get system statistics
// @Description Retrieve overall system statistics including total databases, backups in last 24h, success/failure rates, and storage usage
// @Tags Statistics
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.SystemStats "System statistics"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /stats [get]
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
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("[HANDLER] ❌ Error encoding JSON response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	log.Printf("[ERROR] ❌ HTTP %d: %s", status, message)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(models.APIError{
		Code:    http.StatusText(status),
		Message: message,
	}); err != nil {
		log.Printf("[HANDLER] ❌ Error encoding error response: %v", err)
	}
}

func writeValidationError(w http.ResponseWriter, validationErr *validator.ValidationErrorResponse) {
	log.Printf("[VALIDATION] ❌ %s", validationErr.Message)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	if err := json.NewEncoder(w).Encode(validationErr); err != nil {
		log.Printf("[HANDLER] ❌ Error encoding validation error response: %v", err)
	}
}

func logError(context string, err error) {
	log.Printf("[ERROR] ❌ %s: %v", context, err)
}

func logInfo(format string, args ...interface{}) {
	log.Printf("[INFO] ℹ️  "+format, args...)
}

func parseUUID(s string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		log.Printf("[ERROR] ❌ Invalid UUID format: %s - %v", s, err)
	}
	return id, err
}
