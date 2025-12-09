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
	"github.com/monzim/db_proxy/v1/internal/middleware"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/scheduler"
	"github.com/monzim/db_proxy/v1/internal/validator"
)

// Handler holds all dependencies for HTTP handlers
type Handler struct {
	repo             *repository.Repository
	jwtMgr           *auth.JWTManager
	backupSvc        *backup.Service
	scheduler        *scheduler.Scheduler
	notifier         *notification.DiscordNotifier
	otpExpiry        time.Duration
	validator        *validator.Validator
	turnstileEnabled bool
	turnstileSecret  string
	turnstileTimeout int
}

// New creates a new handler instance
func New(repo *repository.Repository, jwtMgr *auth.JWTManager, backupSvc *backup.Service,
	scheduler *scheduler.Scheduler, notifier *notification.DiscordNotifier, otpExpiry time.Duration,
	turnstileEnabled bool, turnstileSecret string, turnstileTimeout int) *Handler {
	return &Handler{
		repo:             repo,
		jwtMgr:           jwtMgr,
		backupSvc:        backupSvc,
		scheduler:        scheduler,
		notifier:         notifier,
		otpExpiry:        otpExpiry,
		validator:        validator.New(),
		turnstileEnabled: turnstileEnabled,
		turnstileSecret:  turnstileSecret,
		turnstileTimeout: turnstileTimeout,
	}
}

// Auth handlers

// Login godoc
// @Summary Request OTP for authentication
// @Description Sends a one-time password to the configured Discord webhook for authentication. Single-user system - user must provide valid username or email.
// @Tags Authentication
// @Accept json
// @Produce json
// @Param body body models.LoginRequest true "Login request with username or email"
// @Success 200 {object} map[string]string "OTP sent successfully"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 401 {object} map[string]string "Invalid credentials"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	logInfo("Login request received")

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in login", err)
		writeError(w, http.StatusBadRequest, "invalid request body: username or email is required")
		return
	}

	// Validate that username is provided
	if req.Username == "" {
		logError("Login attempt without username", nil)
		writeError(w, http.StatusBadRequest, "username or email is required")
		return
	}

	// Verify Turnstile token if enabled
	if h.turnstileEnabled {
		if req.TurnstileToken == "" {
			logError("Login attempt without Turnstile token", nil)
			writeError(w, http.StatusBadRequest, "security verification required")
			return
		}

		logInfo("Verifying Turnstile token for username/email: %s", req.Username)
		clientIP := auth.GetIPAddress(r)
		if err := auth.VerifyTurnstileToken(h.turnstileSecret, req.TurnstileToken, clientIP, h.turnstileTimeout); err != nil {
			logError("Turnstile verification failed", err)
			writeError(w, http.StatusBadRequest, "security verification failed")
			return
		}
		logInfo("✅ Turnstile verification successful")
	}

	logInfo("Processing login for username/email: %s", req.Username)

	// Get the single system user by username or email
	user, err := h.repo.GetUserByUsernameOrEmail(req.Username)
	if err != nil {
		logError(fmt.Sprintf("Failed to get user: %s", req.Username), err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	// Single-user system: user must already exist (no auto-creation)
	if user == nil {
		log.Printf("[AUTH] ❌ Invalid login attempt - user not found: %s", req.Username)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	logInfo("✅ User authenticated: %s (ID: %s)", user.DiscordUsername, user.ID)

	// Generate OTP
	otp, err := auth.GenerateOTP()
	if err != nil {
		logError("Failed to generate OTP", err)
		writeError(w, http.StatusInternalServerError, "failed to generate OTP")
		return
	}

	logInfo("✅ OTP generated for user: %s", user.DiscordUsername)

	// Store OTP
	expiresAt := time.Now().Add(h.otpExpiry)
	if err := h.repo.CreateOTP(user.ID, otp, expiresAt); err != nil {
		logError(fmt.Sprintf("Failed to store OTP for user: %s", user.DiscordUsername), err)
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

	logInfo("✅ Login successful for user: %s", user.DiscordUsername)
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "OTP sent to Discord webhook",
	})
}

// Verify godoc
// @Summary Verify OTP and get JWT token
// @Description Verifies the OTP code received via Discord and returns a JWT token for API authentication. If 2FA is enabled, returns a temporary token that must be verified with a TOTP code.
// @Tags Authentication
// @Accept json
// @Produce json
// @Param body body models.VerifyRequest true "OTP verification request"
// @Success 200 {object} models.AuthResponseWith2FA "JWT token or 2FA required response"
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

	// Validate that username is provided
	if req.Username == "" {
		logError("Verify attempt without username", nil)
		writeError(w, http.StatusBadRequest, "username or email is required")
		return
	}

	logInfo("Verifying OTP for username/email: %s", req.Username)

	// Get user by username or email
	user, err := h.repo.GetUserByUsernameOrEmail(req.Username)
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

	logInfo("User found: %s (ID: %s), verifying OTP...", user.DiscordUsername, user.ID)

	// Verify OTP
	valid, err := h.repo.VerifyOTP(user.ID, req.OTP)
	if err != nil {
		logError(fmt.Sprintf("OTP verification error for user: %s", user.DiscordUsername), err)
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}
	if !valid {
		log.Printf("[AUTH] ❌ Invalid or expired OTP for user: %s", user.DiscordUsername)
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}

	logInfo("✅ OTP verified successfully for user: %s", user.DiscordUsername)

	// Check if 2FA is enabled for this user
	if user.TwoFactorEnabled {
		logInfo("2FA is enabled for user: %s, generating 2FA token...", user.DiscordUsername)

		// Generate a temporary 2FA token
		twoFAToken, expiresAt, err := h.jwtMgr.Generate2FAToken(user.ID, user.DiscordUserID, user.IsAdmin)
		if err != nil {
			logError(fmt.Sprintf("Failed to generate 2FA token for user: %s", user.DiscordUsername), err)
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}

		logInfo("✅ 2FA token generated for user: %s (expires: %v)", user.DiscordUsername, expiresAt)

		// Log that 2FA is required
		h.logActivity(&user.ID, models.ActionLogin, models.LogLevelInfo,
			"user", &user.ID, user.DiscordUsername,
			fmt.Sprintf("User %s authenticated, awaiting 2FA verification", user.DiscordUsername),
			"", getIPAddress(r))

		writeJSON(w, http.StatusOK, models.AuthResponseWith2FA{
			Requires2FA:        true,
			TwoFactorToken:     twoFAToken,
			TwoFactorExpiresAt: expiresAt,
		})
		return
	}

	// No 2FA - generate full access token
	token, expiresAt, err := h.jwtMgr.GenerateToken(user.ID, user.DiscordUserID, user.IsAdmin)
	if err != nil {
		logError(fmt.Sprintf("Failed to generate JWT for user: %s", req.Username), err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	logInfo("✅ JWT token generated for user: %s (expires: %v)", req.Username, expiresAt)

	// Log the successful login
	h.logActivity(&user.ID, models.ActionLogin, models.LogLevelSuccess,
		"user", &user.ID, user.DiscordUsername,
		fmt.Sprintf("User %s logged in successfully", user.DiscordUsername),
		"", getIPAddress(r))

	writeJSON(w, http.StatusOK, models.AuthResponseWith2FA{
		Token:       token,
		ExpiresAt:   expiresAt,
		Requires2FA: false,
	})
}

// DemoLogin godoc
// @Summary Login as demo user
// @Description Instantly login as a demo user to explore the system. Demo accounts have read-only access and cannot create backups or modify settings.
// @Tags Authentication
// @Produce json
// @Success 200 {object} models.DemoAuthResponse "Demo login successful with JWT token"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/demo-login [post]
func (h *Handler) DemoLogin(w http.ResponseWriter, r *http.Request) {
	logInfo("Demo login request received")

	// Get the demo user
	user, err := h.repo.GetDemoUser()
	if err != nil {
		logError("Failed to get demo user", err)
		writeError(w, http.StatusInternalServerError, "demo login unavailable")
		return
	}

	if user == nil {
		logError("Demo user not found", nil)
		writeError(w, http.StatusInternalServerError, "demo account not configured")
		return
	}

	logInfo("✅ Demo user found: %s (ID: %s)", user.DiscordUsername, user.ID)

	// Generate demo token (bypasses OTP and 2FA)
	token, expiresAt, err := h.jwtMgr.GenerateDemoToken(user.ID, user.DiscordUserID)
	if err != nil {
		logError("Failed to generate demo JWT", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	logInfo("✅ Demo JWT token generated (expires: %v)", expiresAt)

	// Log the demo login
	h.logActivity(&user.ID, models.ActionLogin, models.LogLevelInfo,
		"user", &user.ID, user.DiscordUsername,
		"Demo user logged in",
		`{"demo": true}`, getIPAddress(r))

	writeJSON(w, http.StatusOK, models.DemoAuthResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		IsDemo:    true,
		Message:   "Welcome to DumpStation demo! This is a read-only account for exploring the system.",
	})
}

// Health check handler

// HealthCheck godoc
// @Summary Health check endpoint
// @Description Returns the health status of the service
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]string "Service is healthy"
// @Router /health [get]
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// Storage handlers

// ListStorageConfigs godoc
// @Summary List all storage configurations
// @Description Get a list of all configured storage backends (S3/R2). Sensitive details are masked for security.
// @Tags Storage
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.StorageConfigResponse "List of storage configurations with masked sensitive data"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage [get]
func (h *Handler) ListStorageConfigs(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	configs, err := h.repo.ListStorageConfigsByUser(*userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list storage configs")
		return
	}
	// Convert to response DTOs with masked sensitive data
	responses := models.StorageConfigsToResponse(configs)
	writeJSON(w, http.StatusOK, responses)
}

// CreateStorageConfig godoc
// @Summary Create a new storage configuration
// @Description Add a new storage backend configuration (S3 or Cloudflare R2). Response masks sensitive details.
// @Tags Storage
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.StorageConfigInput true "Storage configuration"
// @Success 201 {object} models.StorageConfigResponse "Created storage configuration with masked sensitive data"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage [post]
func (h *Handler) CreateStorageConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot create resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot create storage configurations")
		return
	}

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

	config, err := h.repo.CreateStorageConfig(*userID, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create storage config")
		return
	}

	// Log storage creation
	h.logActivity(userID, models.ActionStorageCreated, models.LogLevelSuccess,
		"storage", &config.ID, config.Name,
		fmt.Sprintf("Storage configuration '%s' (%s) created", config.Name, config.Provider),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusCreated, config.ToResponse())
}

// GetStorageConfig godoc
// @Summary Get a storage configuration by ID
// @Description Retrieve details of a specific storage configuration. Sensitive details are masked for security.
// @Tags Storage
// @Produce json
// @Security BearerAuth
// @Param id path string true "Storage Config ID (UUID)"
// @Success 200 {object} models.StorageConfigResponse "Storage configuration with masked sensitive data"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Storage config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage/{id} [get]
func (h *Handler) GetStorageConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetStorageConfigByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get storage config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "storage config not found")
		return
	}

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
}

// UpdateStorageConfig godoc
// @Summary Update a storage configuration
// @Description Update an existing storage configuration. Response masks sensitive details.
// @Tags Storage
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Storage Config ID (UUID)"
// @Param body body models.StorageConfigInput true "Updated storage configuration"
// @Success 200 {object} models.StorageConfigResponse "Updated storage configuration with masked sensitive data"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 404 {object} map[string]string "Storage config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /storage/{id} [put]
func (h *Handler) UpdateStorageConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot update resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot update storage configurations")
		return
	}

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

	config, err := h.repo.UpdateStorageConfigByUser(id, *userID, isAdmin, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update storage config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "storage config not found")
		return
	}

	// Log storage update
	h.logActivity(userID, models.ActionStorageUpdated, models.LogLevelSuccess,
		"storage", &config.ID, config.Name,
		fmt.Sprintf("Storage configuration '%s' updated", config.Name),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot delete resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot delete storage configurations")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Get config before deletion for logging (with user check)
	config, _ := h.repo.GetStorageConfigByUser(id, *userID, isAdmin)
	configName := "Unknown"
	if config != nil {
		configName = config.Name
	} else {
		// Config not found or not authorized
		writeError(w, http.StatusNotFound, "storage config not found")
		return
	}

	if err := h.repo.DeleteStorageConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete storage config")
		return
	}

	// Log storage deletion
	h.logActivity(userID, models.ActionStorageDeleted, models.LogLevelInfo,
		"storage", &id, configName,
		fmt.Sprintf("Storage configuration '%s' deleted", configName),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// Notification handlers

// ListNotificationConfigs godoc
// @Summary List all notification configurations
// @Description Get a list of all configured Discord webhooks for notifications. Webhook URLs are masked for security.
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.NotificationConfigResponse "List of notification configurations with masked webhook URLs"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications [get]
func (h *Handler) ListNotificationConfigs(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	configs, err := h.repo.ListNotificationConfigsByUser(*userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list notification configs")
		return
	}
	// Convert to response DTOs with masked webhook URLs
	responses := models.NotificationConfigsToResponse(configs)
	writeJSON(w, http.StatusOK, responses)
}

// CreateNotificationConfig godoc
// @Summary Create a new notification configuration
// @Description Add a new Discord webhook for backup notifications. Response masks the webhook URL for security.
// @Tags Notifications
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.NotificationConfigInput true "Notification configuration"
// @Success 201 {object} models.NotificationConfigResponse "Created notification configuration with masked webhook URL"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications [post]
func (h *Handler) CreateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot create resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot create notification configurations")
		return
	}

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

	config, err := h.repo.CreateNotificationConfig(*userID, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create notification config")
		return
	}

	// Return response DTO with masked webhook URL
	writeJSON(w, http.StatusCreated, config.ToResponse())
}

// GetNotificationConfig godoc
// @Summary Get a notification configuration by ID
// @Description Retrieve details of a specific notification configuration. Webhook URL is masked for security.
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Param id path string true "Notification Config ID (UUID)"
// @Success 200 {object} models.NotificationConfigResponse "Notification configuration with masked webhook URL"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Notification config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications/{id} [get]
func (h *Handler) GetNotificationConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetNotificationConfigByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get notification config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "notification config not found")
		return
	}

	// Return response DTO with masked webhook URL
	writeJSON(w, http.StatusOK, config.ToResponse())
}

// UpdateNotificationConfig godoc
// @Summary Update a notification configuration
// @Description Update an existing notification configuration. Response masks the webhook URL for security.
// @Tags Notifications
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Notification Config ID (UUID)"
// @Param body body models.NotificationConfigInput true "Updated notification configuration"
// @Success 200 {object} models.NotificationConfigResponse "Updated notification configuration with masked webhook URL"
// @Failure 400 {object} validator.ValidationErrorResponse "Bad request"
// @Failure 404 {object} map[string]string "Notification config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /notifications/{id} [put]
func (h *Handler) UpdateNotificationConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot update resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot update notification configurations")
		return
	}

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

	config, err := h.repo.UpdateNotificationConfigByUser(id, *userID, isAdmin, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update notification config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "notification config not found")
		return
	}

	// Return response DTO with masked webhook URL
	writeJSON(w, http.StatusOK, config.ToResponse())
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot delete resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot delete notification configurations")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	if err := h.repo.DeleteNotificationConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete notification config")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Database handlers

// ListDatabaseConfigs godoc
// @Summary List all database configurations
// @Description Get a list of all configured PostgreSQL databases for backup. Connection details are masked for security.
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.DatabaseConfigResponse "List of database configurations with masked sensitive data"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases [get]
func (h *Handler) ListDatabaseConfigs(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	configs, err := h.repo.ListDatabaseConfigsByUser(*userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list database configs")
		return
	}
	// Convert to response DTOs with masked sensitive data
	responses := models.DatabaseConfigsToResponse(configs)
	writeJSON(w, http.StatusOK, responses)
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot create resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot create database configurations")
		return
	}

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

	config, err := h.repo.CreateDatabaseConfig(*userID, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create database config")
		return
	}

	// Add to scheduler
	if err := h.scheduler.AddJob(config); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to schedule backup job")
		return
	}

	// Log database creation
	h.logActivity(userID, models.ActionDatabaseCreated, models.LogLevelSuccess,
		"database", &config.ID, config.Name,
		fmt.Sprintf("Database configuration '%s' created with schedule: %s", config.Name, config.Schedule),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusCreated, config.ToResponse())
}

// GetDatabaseConfig godoc
// @Summary Get a database configuration by ID
// @Description Retrieve details of a specific database configuration. Connection details are masked for security.
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 200 {object} models.DatabaseConfigResponse "Database configuration with masked sensitive data"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id} [get]
func (h *Handler) GetDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot update resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot update database configurations")
		return
	}

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

	config, err := h.repo.UpdateDatabaseConfigByUser(id, *userID, isAdmin, &input)
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

	// Log database update
	h.logActivity(userID, models.ActionDatabaseUpdated, models.LogLevelSuccess,
		"database", &config.ID, config.Name,
		fmt.Sprintf("Database configuration '%s' updated", config.Name),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot delete resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot delete database configurations")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Get config before deletion for logging (with user check)
	config, _ := h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)
	configName := "Unknown"
	if config != nil {
		configName = config.Name
	} else {
		// Config not found or not authorized
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Remove from scheduler
	h.scheduler.RemoveJob(id)

	if err := h.repo.DeleteDatabaseConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete database config")
		return
	}

	// Log database deletion
	h.logActivity(userID, models.ActionDatabaseDeleted, models.LogLevelInfo,
		"database", &id, configName,
		fmt.Sprintf("Database configuration '%s' deleted", configName),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// PauseDatabaseConfig godoc
// @Summary Pause a database configuration
// @Description Pause backup operations for a specific database configuration. Cleanup process will also be paused.
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 200 {object} models.DatabaseConfig "Database configuration paused successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id}/pause [post]
func (h *Handler) PauseDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot pause resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot pause database configurations")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Check if config exists (with user check)
	config, err := h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Pause the config
	if err := h.repo.PauseDatabaseConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to pause database config")
		return
	}

	// Remove job from scheduler
	h.scheduler.RemoveJob(id)

	// Reload config to get updated state
	config, _ = h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)

	logInfo("Database config paused: %s (ID: %s)", config.Name, config.ID)

	// Log database pause
	h.logActivity(userID, models.ActionDatabasePaused, models.LogLevelInfo,
		"database", &config.ID, config.Name,
		fmt.Sprintf("Database configuration '%s' paused", config.Name),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
}

// UnpauseDatabaseConfig godoc
// @Summary Unpause a database configuration
// @Description Resume backup operations for a specific database configuration. Future backups and cleanup will resume on schedule.
// @Tags Databases
// @Produce json
// @Security BearerAuth
// @Param id path string true "Database Config ID (UUID)"
// @Success 200 {object} models.DatabaseConfig "Database configuration resumed successfully"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Database config not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /databases/{id}/unpause [post]
func (h *Handler) UnpauseDatabaseConfig(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot unpause resources
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot unpause database configurations")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Check if config exists (with user check)
	config, err := h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get database config")
		return
	}
	if config == nil {
		writeError(w, http.StatusNotFound, "database config not found")
		return
	}

	// Unpause the config
	if err := h.repo.UnpauseDatabaseConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unpause database config")
		return
	}

	// Reload config to get updated state
	config, _ = h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)

	// Re-add job to scheduler
	if config.Enabled {
		if err := h.scheduler.AddJob(config); err != nil {
			logInfo("Warning: Failed to re-add job to scheduler: %v", err)
		}
	}

	logInfo("Database config resumed: %s (ID: %s)", config.Name, config.ID)

	// Log database unpause
	h.logActivity(userID, models.ActionDatabaseUnpaused, models.LogLevelInfo,
		"database", &config.ID, config.Name,
		fmt.Sprintf("Database configuration '%s' resumed", config.Name),
		"", getIPAddress(r))

	// Return response DTO with masked sensitive data
	writeJSON(w, http.StatusOK, config.ToResponse())
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot trigger backups
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot trigger backups")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	config, err := h.repo.GetDatabaseConfigByUser(id, *userID, isAdmin)
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

	// Log backup trigger
	h.logActivity(userID, models.ActionBackupTriggered, models.LogLevelInfo,
		"backup", &backup.ID, config.Name,
		fmt.Sprintf("Manual backup triggered for database '%s'", config.Name),
		"", getIPAddress(r))

	// Execute backup asynchronously, passing the backup ID to reuse the record
	go func() {
		if err := h.backupSvc.ExecuteBackupWithID(config, backup.ID); err != nil {
			// Error is already logged in ExecuteBackupWithID
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	backups, err := h.repo.ListBackupsByDatabaseByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}

	writeJSON(w, http.StatusOK, backups)
}

// ListBackups godoc
// @Summary List all backups
// @Description Retrieve a list of all backups across all databases
// @Tags Backups
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.Backup "List of all backups"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /backups [get]
func (h *Handler) ListBackups(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	backups, err := h.repo.ListAllBackupsByUser(*userID, isAdmin)
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	backup, err := h.repo.GetBackupByUser(id, *userID, isAdmin)
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	// Demo users cannot restore backups
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot restore backups")
		return
	}

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	// Verify backup belongs to user
	backup, err := h.repo.GetBackupByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get backup")
		return
	}
	if backup == nil {
		writeError(w, http.StatusNotFound, "backup not found")
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

// Activity Log handlers

// ListActivityLogs godoc
// @Summary List activity logs
// @Description Retrieve system activity logs with optional filtering and pagination
// @Tags Activity Logs
// @Produce json
// @Security BearerAuth
// @Param user_id query string false "Filter by user ID (UUID)"
// @Param action query string false "Filter by action type"
// @Param level query string false "Filter by log level (info, warning, error, success)"
// @Param entity_type query string false "Filter by entity type (storage, database, backup, etc.)"
// @Param entity_id query string false "Filter by entity ID (UUID)"
// @Param start_date query string false "Filter by start date (RFC3339 format)"
// @Param end_date query string false "Filter by end date (RFC3339 format)"
// @Param limit query int false "Number of records to return (default: 50)"
// @Param offset query int false "Number of records to skip (default: 0)"
// @Success 200 {object} map[string]interface{} "Activity logs with pagination info"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /logs [get]
func (h *Handler) ListActivityLogs(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	params := &models.ActivityLogListParams{}

	// Parse query parameters
	query := r.URL.Query()

	// Only admins can filter by user_id (to see other users' logs)
	if userIDStr := query.Get("user_id"); userIDStr != "" && isAdmin {
		if parsedUserID, err := uuid.Parse(userIDStr); err == nil {
			params.UserID = &parsedUserID
		}
	}

	if actionStr := query.Get("action"); actionStr != "" {
		action := models.ActivityLogAction(actionStr)
		params.Action = &action
	}

	if levelStr := query.Get("level"); levelStr != "" {
		level := models.ActivityLogLevel(levelStr)
		params.Level = &level
	}

	if entityType := query.Get("entity_type"); entityType != "" {
		params.EntityType = &entityType
	}

	if entityIDStr := query.Get("entity_id"); entityIDStr != "" {
		if entityID, err := uuid.Parse(entityIDStr); err == nil {
			params.EntityID = &entityID
		}
	}

	if startDateStr := query.Get("start_date"); startDateStr != "" {
		if startDate, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			params.StartDate = &startDate
		}
	}

	if endDateStr := query.Get("end_date"); endDateStr != "" {
		if endDate, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			params.EndDate = &endDate
		}
	}

	if limitStr := query.Get("limit"); limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &params.Limit)
	}

	if offsetStr := query.Get("offset"); offsetStr != "" {
		fmt.Sscanf(offsetStr, "%d", &params.Offset)
	}

	// Retrieve logs filtered by user
	logs, total, err := h.repo.ListActivityLogsByUser(*userID, isAdmin, params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list activity logs")
		return
	}

	// Return logs with pagination info
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"logs":   logs,
		"total":  total,
		"limit":  params.Limit,
		"offset": params.Offset,
	})
}

// GetActivityLog godoc
// @Summary Get an activity log by ID
// @Description Retrieve details of a specific activity log entry
// @Tags Activity Logs
// @Produce json
// @Security BearerAuth
// @Param id path string true "Activity Log ID (UUID)"
// @Success 200 {object} models.ActivityLog "Activity log details"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 404 {object} map[string]string "Activity log not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /logs/{id} [get]
func (h *Handler) GetActivityLog(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	log, err := h.repo.GetActivityLogByUser(id, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get activity log")
		return
	}
	if log == nil {
		writeError(w, http.StatusNotFound, "activity log not found")
		return
	}

	writeJSON(w, http.StatusOK, log)
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
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	stats, err := h.repo.GetSystemStatsByUser(*userID, isAdmin)
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

// getUserIDFromContext extracts user ID from request context
func getUserIDFromContext(r *http.Request) *uuid.UUID {
	// The middleware stores auth.Claims with key middleware.UserContextKey
	if claims := r.Context().Value(middleware.UserContextKey); claims != nil {
		if authClaims, ok := claims.(*auth.Claims); ok {
			return &authClaims.UserID
		}
	}

	return nil
}

// getIsAdminFromContext extracts admin status from request context
func getIsAdminFromContext(r *http.Request) bool {
	if claims := r.Context().Value(middleware.UserContextKey); claims != nil {
		if authClaims, ok := claims.(*auth.Claims); ok {
			return authClaims.IsAdmin
		}
	}
	return false
}

// isDemoUserFromContext checks if the current user is a demo user
func isDemoUserFromContext(r *http.Request) bool {
	if claims := r.Context().Value(middleware.UserContextKey); claims != nil {
		if authClaims, ok := claims.(*auth.Claims); ok {
			return authClaims.IsDemo
		}
	}
	return false
}

// getIPAddress extracts IP address from request
func getIPAddress(r *http.Request) string {
	// Check X-Forwarded-For header first
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For can contain multiple IPs, take the first one
		for idx := 0; idx < len(xff); idx++ {
			if xff[idx] == ',' {
				return xff[:idx]
			}
		}
		return xff
	}
	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Fall back to RemoteAddr
	return r.RemoteAddr
}

// logActivity is a helper to log activity and handle errors
func (h *Handler) logActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, entityName, description, metadata, ipAddress string) {
	if err := h.repo.LogActivity(userID, action, level, entityType, entityID, entityName, description, metadata, ipAddress); err != nil {
		log.Printf("[ACTIVITY_LOG] ❌ Failed to log activity [%s]: %v", action, err)
	}
}
