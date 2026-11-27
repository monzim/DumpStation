package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/monzim/db_proxy/v1/internal/crypto"
	"github.com/monzim/db_proxy/v1/internal/jobs"
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
	orch             *jobs.Orchestrator
	scheduler        *scheduler.Scheduler
	notifier         *notification.DiscordNotifier
	otpExpiry        time.Duration
	validator        *validator.Validator
	turnstileEnabled bool
	turnstileSecret  string
	turnstileTimeout int
	cipher           *crypto.Cipher
	cfg              *config.Config
}

// New creates a new handler instance
func New(repo *repository.Repository, jwtMgr *auth.JWTManager, orch *jobs.Orchestrator,
	scheduler *scheduler.Scheduler, notifier *notification.DiscordNotifier, otpExpiry time.Duration,
	turnstileEnabled bool, turnstileSecret string, turnstileTimeout int,
	cipher *crypto.Cipher, cfg *config.Config) *Handler {
	return &Handler{
		repo:             repo,
		jwtMgr:           jwtMgr,
		orch:             orch,
		scheduler:        scheduler,
		notifier:         notifier,
		otpExpiry:        otpExpiry,
		validator:        validator.New(),
		turnstileEnabled: turnstileEnabled,
		turnstileSecret:  turnstileSecret,
		turnstileTimeout: turnstileTimeout,
		cipher:           cipher,
		cfg:              cfg,
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

	// Verify OTP. The repository tracks failed attempts per token and locks
	// after the threshold; surface a 429 with Retry-After when locked so
	// clients (and any front-of-house WAF) can back off.
	verifyResult, err := h.repo.VerifyOTP(user.ID, req.OTP)
	if err != nil {
		logError(fmt.Sprintf("OTP verification error for user: %s", user.DiscordUsername), err)
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}
	if verifyResult.LockedUntil != nil {
		retryAfter := int(time.Until(*verifyResult.LockedUntil).Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		writeError(w, http.StatusTooManyRequests, "too many failed OTP attempts; please request a new code later")
		return
	}
	if !verifyResult.OK {
		log.Printf("[AUTH] ❌ Invalid or expired OTP for user: %s", user.DiscordUsername)
		// Audit failed OTP attempts so the activity log surfaces brute-force
		// attempts even when the per-token failure counter hasn't locked yet.
		h.logActivity(&user.ID, models.ActionLogin, models.LogLevelWarning,
			"user", &user.ID, user.DiscordUsername,
			fmt.Sprintf("Failed OTP attempt for %q", user.DiscordUsername),
			"", getIPAddress(r))
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

	// Demo-user activity is intentionally NOT logged: the demo account is a
	// public preview and its actions would just create audit-log noise. The
	// repository's LogActivity already drops demo writes, but skipping the
	// call here avoids the extra DB round trip.

	writeJSON(w, http.StatusOK, models.DemoAuthResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		IsDemo:    true,
		Message:   "Welcome to DumpStation demo! This is a read-only account for exploring the system.",
	})
}

// Refresh godoc
// @Summary  Refresh JWT session
// @Description Issues a new JWT with a fresh expiration while preserving the original session start.
// @Description Refuses if the absolute session lifetime (SessionAbsoluteMax) has been exceeded.
// @Tags     Authentication
// @Security BearerAuth
// @Produce  json
// @Success  200 {object} map[string]any
// @Failure  401 {object} map[string]string "Session expired or token invalid"
// @Router   /auth/refresh [post]
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	raw := r.Context().Value(middleware.UserContextKey)
	claims, ok := raw.(*auth.Claims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "missing auth claims")
		return
	}

	token, expiresAt, sessionExpiresAt, err := h.jwtMgr.RefreshToken(claims)
	if err != nil {
		if err == auth.ErrSessionExpired {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Audit refresh quietly — useful for spotting odd refresh patterns but
	// not interesting enough to ping the user.
	_ = h.repo.LogActivity(&claims.UserID, models.ActionSessionRefreshed, models.LogLevelInfo,
		"user", &claims.UserID, "",
		"Session refreshed",
		"", getIPAddress(r))

	writeJSON(w, http.StatusOK, map[string]any{
		"token":              token,
		"expires_at":         expiresAt,
		"session_expires_at": sessionExpiresAt,
	})
}

// Logout godoc
// @Summary  Log out the current session
// @Description Best-effort logout: emits an audit-log entry. JWTs are stateless,
// @Description so the actual sign-out is the frontend dropping the token.
// @Tags     Authentication
// @Security BearerAuth
// @Success  204 "No Content"
// @Router   /auth/logout [post]
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	raw := r.Context().Value(middleware.UserContextKey)
	if claims, ok := raw.(*auth.Claims); ok && claims != nil {
		_ = h.repo.LogActivity(&claims.UserID, models.ActionLogout, models.LogLevelInfo,
			"user", &claims.UserID, "",
			"User logged out",
			"", getIPAddress(r))
	}
	w.WriteHeader(http.StatusNoContent)
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

	// SSRF guard: confirm the webhook URL points at a real Discord domain
	// that resolves to a public IP, not a private/loopback/metadata target.
	// Skip when no Discord webhook was provided (Telegram-only config).
	if input.DiscordWebhookURL != "" {
		if err := notification.ValidateDiscordWebhookURL(input.DiscordWebhookURL); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	// At least one channel must be present so the row isn't useless. The
	// BeforeSave hook enforces this in the DB too — checking here gives a
	// clean 400 instead of a 500 from the GORM error.
	if input.DiscordWebhookURL == "" && (input.TelegramBotToken == "" || input.TelegramChatID == "") {
		writeError(w, http.StatusBadRequest,
			"provide a Discord webhook URL, a Telegram bot_token+chat_id, or both")
		return
	}

	config, err := h.repo.CreateNotificationConfig(*userID, &input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create notification config")
		return
	}

	h.logActivity(userID, models.ActionNotificationCreated, models.LogLevelSuccess,
		"notification", &config.ID, config.Name,
		fmt.Sprintf("Notification config %q created", config.Name),
		"", getIPAddress(r))

	// Return response DTO with masked credentials
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

	// Capture the name *before* delete so the audit log carries it.
	existing, _ := h.repo.GetNotificationConfigByUser(id, *userID, isAdmin)

	if err := h.repo.DeleteNotificationConfigByUser(id, *userID, isAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete notification config")
		return
	}

	name := ""
	if existing != nil {
		name = existing.Name
	}
	h.logActivity(userID, models.ActionNotificationDeleted, models.LogLevelWarning,
		"notification", &id, name,
		fmt.Sprintf("Notification config %q deleted", name),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// Database handlers

// Backup handlers

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

// getIPAddress extracts the client IP using the shared auth helper, which
// honors TRUST_PROXY_HEADERS and validates header values to block spoofing
// and log injection. Wrapped here so existing call sites compile unchanged.
func getIPAddress(r *http.Request) string {
	return auth.GetIPAddress(r)
}

// logActivity is a helper to log activity and handle errors
func (h *Handler) logActivity(userID *uuid.UUID, action models.ActivityLogAction, level models.ActivityLogLevel,
	entityType string, entityID *uuid.UUID, entityName, description, metadata, ipAddress string) {
	if err := h.repo.LogActivity(userID, action, level, entityType, entityID, entityName, description, metadata, ipAddress); err != nil {
		log.Printf("[ACTIVITY_LOG] ❌ Failed to log activity [%s]: %v", action, err)
	}
}

// ========================================
// Label Handlers
// ========================================

// ListLabels godoc
// @Summary List all labels
// @Description Retrieves all labels for the authenticated user with usage statistics
// @Tags Labels
// @Produce json
// @Success 200 {array} models.LabelResponse
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /labels [get]
func (h *Handler) ListLabels(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	labels, err := h.repo.ListLabelsByUser(*userID, isAdmin)
	if err != nil {
		logError("Failed to list labels", err)
		writeError(w, http.StatusInternalServerError, "failed to list labels")
		return
	}

	responses := models.LabelsToResponse(labels)
	writeJSON(w, http.StatusOK, responses)
}

// CreateLabel godoc
// @Summary Create a new label
// @Description Creates a new label with custom name, color, and description
// @Tags Labels
// @Accept json
// @Produce json
// @Param body body models.LabelInput true "Label details"
// @Success 201 {object} models.LabelResponse
// @Failure 400 {object} map[string]string "Bad request or validation error"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /labels [post]
func (h *Handler) CreateLabel(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot create labels")
		return
	}

	var input models.LabelInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil {
		writeValidationError(w, validationErr)
		return
	} else if err != nil {
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation failed")
		return
	}

	label, err := h.repo.CreateLabel(*userID, &input)
	if err != nil {
		logError("Failed to create label", err)
		if err.Error() == "label limit reached: maximum 50 labels per user" {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create label")
		return
	}

	// Log activity
	h.logActivity(userID, models.ActionLabelCreated, models.LogLevelSuccess, "label", &label.ID, label.Name,
		fmt.Sprintf("Created label '%s'", label.Name), "", getIPAddress(r))

	// Convert to response with usage stats
	labelWithUsage := &models.LabelWithUsage{
		Label: *label,
	}
	writeJSON(w, http.StatusCreated, labelWithUsage.ToResponse())
}

// GetLabel godoc
// @Summary Get a label by ID
// @Description Retrieves a specific label with usage statistics
// @Tags Labels
// @Produce json
// @Param id path string true "Label ID"
// @Success 200 {object} models.LabelResponse
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 404 {object} map[string]string "Label not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /labels/{id} [get]
func (h *Handler) GetLabel(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	label, err := h.repo.GetLabel(id, *userID, isAdmin)
	if err != nil {
		logError("Failed to get label", err)
		writeError(w, http.StatusInternalServerError, "failed to get label")
		return
	}
	if label == nil {
		writeError(w, http.StatusNotFound, "label not found")
		return
	}

	// Get usage statistics
	labels, err := h.repo.ListLabelsByUser(*userID, isAdmin)
	if err != nil {
		logError("Failed to get label usage", err)
		writeError(w, http.StatusInternalServerError, "failed to get label")
		return
	}

	// Find the matching label with usage
	for _, l := range labels {
		if l.ID == id {
			writeJSON(w, http.StatusOK, l.ToResponse())
			return
		}
	}

	writeError(w, http.StatusNotFound, "label not found")
}

// UpdateLabel godoc
// @Summary Update a label
// @Description Updates an existing label's name, color, or description
// @Tags Labels
// @Accept json
// @Produce json
// @Param id path string true "Label ID"
// @Param body body models.LabelInput true "Updated label details"
// @Success 200 {object} models.LabelResponse
// @Failure 400 {object} map[string]string "Invalid ID or validation error"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Label not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /labels/{id} [put]
func (h *Handler) UpdateLabel(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot update labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	var input models.LabelInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil {
		writeValidationError(w, validationErr)
		return
	} else if err != nil {
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation failed")
		return
	}

	label, err := h.repo.UpdateLabel(id, *userID, isAdmin, &input)
	if err != nil {
		logError("Failed to update label", err)
		if err == fmt.Errorf("record not found") {
			writeError(w, http.StatusNotFound, "label not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update label")
		return
	}

	// Log activity
	h.logActivity(userID, models.ActionLabelUpdated, models.LogLevelSuccess, "label", &label.ID, label.Name,
		fmt.Sprintf("Updated label '%s'", label.Name), "", getIPAddress(r))

	// Get usage statistics for response
	labels, _ := h.repo.ListLabelsByUser(*userID, isAdmin)
	for _, l := range labels {
		if l.ID == id {
			writeJSON(w, http.StatusOK, l.ToResponse())
			return
		}
	}

	labelWithUsage := &models.LabelWithUsage{
		Label: *label,
	}
	writeJSON(w, http.StatusOK, labelWithUsage.ToResponse())
}

// DeleteLabel godoc
// @Summary Delete a label
// @Description Deletes a label and removes all its associations
// @Tags Labels
// @Param id path string true "Label ID"
// @Success 204 "No content"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Label not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /labels/{id} [delete]
func (h *Handler) DeleteLabel(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot delete labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	// Get label name before deleting for logging
	label, _ := h.repo.GetLabel(id, *userID, isAdmin)
	var labelName string
	if label != nil {
		labelName = label.Name
	}

	err = h.repo.DeleteLabel(id, *userID, isAdmin)
	if err != nil {
		logError("Failed to delete label", err)
		if err == fmt.Errorf("record not found") {
			writeError(w, http.StatusNotFound, "label not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete label")
		return
	}

	// Log activity
	h.logActivity(userID, models.ActionLabelDeleted, models.LogLevelSuccess, "label", &id, labelName,
		fmt.Sprintf("Deleted label '%s'", labelName), "", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// ========================================
// Database Label Assignment Handlers
// ========================================

// AssignLabelsToDatabase godoc
// @Summary Assign labels to a database
// @Description Assigns multiple labels to a database configuration
// @Tags Databases
// @Accept json
// @Produce json
// @Param id path string true "Database ID"
// @Param body body models.AssignLabelsInput true "Label IDs to assign"
// @Success 200 {object} models.DatabaseConfigResponse
// @Failure 400 {object} map[string]string "Invalid ID or validation error"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Database not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /databases/{id}/labels [post]
func (h *Handler) AssignLabelsToDatabase(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot assign labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	dbID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid database ID")
		return
	}

	var input models.AssignLabelsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil {
		writeValidationError(w, validationErr)
		return
	} else if err != nil {
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation failed")
		return
	}

	err = h.repo.AssignLabelsToDatabase(dbID, *userID, isAdmin, input.LabelIDs)
	if err != nil {
		logError("Failed to assign labels to database", err)
		if err.Error() == "label limit exceeded: maximum 10 labels per database" {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to assign labels")
		return
	}

	// Get updated database with labels
	db, err := h.repo.GetDatabaseWithLabels(dbID, *userID, isAdmin)
	if err != nil || db == nil {
		logError("Failed to get database after label assignment", err)
		writeError(w, http.StatusInternalServerError, "failed to get updated database")
		return
	}

	// Log activity
	h.logActivity(userID, "database_updated", models.LogLevelSuccess, "database", &db.ID, db.Name,
		fmt.Sprintf("Assigned labels to database '%s'", db.Name), "", getIPAddress(r))

	writeJSON(w, http.StatusOK, db.ToResponse())
}

// RemoveLabelFromDatabase godoc
// @Summary Remove a label from a database
// @Description Removes a specific label from a database configuration
// @Tags Databases
// @Param id path string true "Database ID"
// @Param labelId path string true "Label ID"
// @Success 204 "No content"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /databases/{id}/labels/{labelId} [delete]
func (h *Handler) RemoveLabelFromDatabase(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot remove labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	dbID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid database ID")
		return
	}
	labelID, err := uuid.Parse(vars["labelId"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	err = h.repo.RemoveLabelFromDatabase(dbID, labelID, *userID, isAdmin)
	if err != nil {
		logError("Failed to remove label from database", err)
		writeError(w, http.StatusInternalServerError, "failed to remove label")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ========================================
// Storage Label Assignment Handlers
// ========================================

// AssignLabelsToStorage godoc
// @Summary Assign labels to a storage config
// @Description Assigns multiple labels to a storage configuration
// @Tags Storage
// @Accept json
// @Produce json
// @Param id path string true "Storage ID"
// @Param body body models.AssignLabelsInput true "Label IDs to assign"
// @Success 200 {object} models.StorageConfigResponse
// @Failure 400 {object} map[string]string "Invalid ID or validation error"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Storage not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /storage/{id}/labels [post]
func (h *Handler) AssignLabelsToStorage(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot assign labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	storageID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid storage ID")
		return
	}

	var input models.AssignLabelsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil {
		writeValidationError(w, validationErr)
		return
	} else if err != nil {
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation failed")
		return
	}

	err = h.repo.AssignLabelsToStorage(storageID, *userID, isAdmin, input.LabelIDs)
	if err != nil {
		logError("Failed to assign labels to storage", err)
		if err.Error() == "label limit exceeded: maximum 10 labels per storage" {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to assign labels")
		return
	}

	// Get updated storage with labels
	storage, err := h.repo.GetStorageWithLabels(storageID, *userID, isAdmin)
	if err != nil || storage == nil {
		logError("Failed to get storage after label assignment", err)
		writeError(w, http.StatusInternalServerError, "failed to get updated storage")
		return
	}

	// Log activity
	h.logActivity(userID, models.ActionStorageUpdated, models.LogLevelSuccess, "storage", &storage.ID, storage.Name,
		fmt.Sprintf("Assigned labels to storage '%s'", storage.Name), "", getIPAddress(r))

	writeJSON(w, http.StatusOK, storage.ToResponse())
}

// RemoveLabelFromStorage godoc
// @Summary Remove a label from a storage config
// @Description Removes a specific label from a storage configuration
// @Tags Storage
// @Param id path string true "Storage ID"
// @Param labelId path string true "Label ID"
// @Success 204 "No content"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /storage/{id}/labels/{labelId} [delete]
func (h *Handler) RemoveLabelFromStorage(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot remove labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	storageID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid storage ID")
		return
	}
	labelID, err := uuid.Parse(vars["labelId"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	err = h.repo.RemoveLabelFromStorage(storageID, labelID, *userID, isAdmin)
	if err != nil {
		logError("Failed to remove label from storage", err)
		writeError(w, http.StatusInternalServerError, "failed to remove label")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ========================================
// Notification Label Assignment Handlers
// ========================================

// AssignLabelsToNotification godoc
// @Summary Assign labels to a notification config
// @Description Assigns multiple labels to a notification configuration
// @Tags Notifications
// @Accept json
// @Produce json
// @Param id path string true "Notification ID"
// @Param body body models.AssignLabelsInput true "Label IDs to assign"
// @Success 200 {object} models.NotificationConfigResponse
// @Failure 400 {object} map[string]string "Invalid ID or validation error"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Notification not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /notifications/{id}/labels [post]
func (h *Handler) AssignLabelsToNotification(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot assign labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	notifID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid notification ID")
		return
	}

	var input models.AssignLabelsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate input
	if validationErr, err := h.validator.Validate(&input); validationErr != nil {
		writeValidationError(w, validationErr)
		return
	} else if err != nil {
		logError("Validation error", err)
		writeError(w, http.StatusInternalServerError, "validation failed")
		return
	}

	err = h.repo.AssignLabelsToNotification(notifID, *userID, isAdmin, input.LabelIDs)
	if err != nil {
		logError("Failed to assign labels to notification", err)
		if err.Error() == "label limit exceeded: maximum 10 labels per notification" {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to assign labels")
		return
	}

	// Get updated notification with labels
	notif, err := h.repo.GetNotificationWithLabels(notifID, *userID, isAdmin)
	if err != nil || notif == nil {
		logError("Failed to get notification after label assignment", err)
		writeError(w, http.StatusInternalServerError, "failed to get updated notification")
		return
	}

	// Log activity
	h.logActivity(userID, models.ActionNotificationUpdated, models.LogLevelSuccess, "notification", &notif.ID, notif.Name,
		fmt.Sprintf("Assigned labels to notification '%s'", notif.Name), "", getIPAddress(r))

	writeJSON(w, http.StatusOK, notif.ToResponse())
}

// RemoveLabelFromNotification godoc
// @Summary Remove a label from a notification config
// @Description Removes a specific label from a notification configuration
// @Tags Notifications
// @Param id path string true "Notification ID"
// @Param labelId path string true "Label ID"
// @Success 204 "No content"
// @Failure 400 {object} map[string]string "Invalid ID"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden (demo user)"
// @Failure 404 {object} map[string]string "Not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Security BearerAuth
// @Router /notifications/{id}/labels/{labelId} [delete]
func (h *Handler) RemoveLabelFromNotification(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot remove labels")
		return
	}

	isAdmin := getIsAdminFromContext(r)
	vars := mux.Vars(r)
	notifID, err := uuid.Parse(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid notification ID")
		return
	}
	labelID, err := uuid.Parse(vars["labelId"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label ID")
		return
	}

	err = h.repo.RemoveLabelFromNotification(notifID, labelID, *userID, isAdmin)
	if err != nil {
		logError("Failed to remove label from notification", err)
		writeError(w, http.StatusInternalServerError, "failed to remove label")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
