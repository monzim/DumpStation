package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// TwoFactorHandler handles all 2FA related operations
type TwoFactorHandler struct {
	*Handler
	totpMgr *auth.TOTPManager
}

// NewTwoFactorHandler creates a new 2FA handler
func NewTwoFactorHandler(h *Handler, totpMgr *auth.TOTPManager) *TwoFactorHandler {
	return &TwoFactorHandler{
		Handler: h,
		totpMgr: totpMgr,
	}
}

// Setup2FA godoc
// @Summary Initialize 2FA setup
// @Description Generate a TOTP secret and QR code for setting up 2FA with an authenticator app (Google Authenticator, Authy, etc.)
// @Tags Two-Factor Authentication
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.TwoFactorSetupResponse "2FA setup data with QR code"
// @Failure 400 {object} map[string]string "2FA already enabled"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/setup [post]
func (h *TwoFactorHandler) Setup2FA(w http.ResponseWriter, r *http.Request) {
	logInfo("2FA setup request received")

	// Get user from context
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Get user details
	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user for 2FA setup", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Check if 2FA is already enabled
	if user.TwoFactorEnabled {
		writeError(w, http.StatusBadRequest, "2FA is already enabled. Disable it first to set up a new 2FA.")
		return
	}

	// Generate TOTP secret
	accountName := user.DiscordUsername
	if accountName == "" {
		accountName = user.DiscordUserID
	}

	setupResult, err := h.totpMgr.GenerateSecret(accountName)
	if err != nil {
		logError("Failed to generate TOTP secret", err)
		writeError(w, http.StatusInternalServerError, "failed to generate 2FA secret")
		return
	}

	// Store the secret (not enabled yet - will be enabled after verification)
	if err := h.repo.SetUser2FASecret(*userID, setupResult.Secret); err != nil {
		logError("Failed to store 2FA secret", err)
		writeError(w, http.StatusInternalServerError, "failed to save 2FA secret")
		return
	}

	// Log the setup initiation
	h.logActivity(userID, models.Action2FASetupStarted, models.LogLevelInfo,
		"user", userID, user.DiscordUsername,
		fmt.Sprintf("2FA setup initiated for user %s", user.DiscordUsername),
		"", getIPAddress(r))

	logInfo("✅ 2FA setup initiated for user: %s", user.DiscordUsername)

	writeJSON(w, http.StatusOK, models.TwoFactorSetupResponse{
		Secret:        setupResult.Secret,
		QRCodeDataURL: setupResult.QRCodeDataURL,
		Issuer:        setupResult.Issuer,
		AccountName:   setupResult.AccountName,
	})
}

// VerifySetup2FA godoc
// @Summary Verify and enable 2FA
// @Description Verify the TOTP code from authenticator app to complete 2FA setup. Returns backup codes.
// @Tags Two-Factor Authentication
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.TwoFactorVerifySetupRequest true "TOTP code from authenticator app"
// @Success 200 {object} models.TwoFactorBackupCodesResponse "2FA enabled with backup codes"
// @Failure 400 {object} map[string]string "Invalid code or 2FA already enabled"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/verify-setup [post]
func (h *TwoFactorHandler) VerifySetup2FA(w http.ResponseWriter, r *http.Request) {
	logInfo("2FA setup verification request received")

	// Get user from context
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.TwoFactorVerifySetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in 2FA verify setup", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get user details
	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user for 2FA verification", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Check if 2FA is already enabled
	if user.TwoFactorEnabled {
		writeError(w, http.StatusBadRequest, "2FA is already enabled")
		return
	}

	// Check if secret exists (setup was initiated)
	if user.TwoFactorSecret == "" {
		writeError(w, http.StatusBadRequest, "2FA setup not initiated. Please start setup first.")
		return
	}

	// Verify the TOTP code
	valid, err := h.totpMgr.ValidateCodeWithWindow(user.TwoFactorSecret, req.Code)
	if err != nil || !valid {
		log.Printf("[2FA] ❌ Invalid TOTP code for user: %s", user.DiscordUsername)

		// Log failed verification attempt
		h.logActivity(userID, models.Action2FAFailed, models.LogLevelWarning,
			"user", userID, user.DiscordUsername,
			fmt.Sprintf("2FA setup verification failed for user %s - invalid code", user.DiscordUsername),
			"", getIPAddress(r))

		writeError(w, http.StatusBadRequest, "invalid verification code")
		return
	}

	// Generate backup codes
	backupResult, err := h.totpMgr.GenerateBackupCodes(10)
	if err != nil {
		logError("Failed to generate backup codes", err)
		writeError(w, http.StatusInternalServerError, "failed to generate backup codes")
		return
	}

	// Enable 2FA with backup codes
	if err := h.repo.EnableUser2FA(*userID, backupResult.HashedCodes); err != nil {
		logError("Failed to enable 2FA", err)
		writeError(w, http.StatusInternalServerError, "failed to enable 2FA")
		return
	}

	// Log successful 2FA enablement
	h.logActivity(userID, models.Action2FAEnabled, models.LogLevelSuccess,
		"user", userID, user.DiscordUsername,
		fmt.Sprintf("2FA enabled successfully for user %s", user.DiscordUsername),
		"", getIPAddress(r))

	logInfo("✅ 2FA enabled for user: %s", user.DiscordUsername)

	writeJSON(w, http.StatusOK, models.TwoFactorBackupCodesResponse{
		Codes:   backupResult.Codes,
		Message: "Store these backup codes in a safe place. They can only be shown once. Each code can only be used once.",
	})
}

// Verify2FA godoc
// @Summary Verify 2FA code during login
// @Description Verify TOTP code or backup code to complete authentication
// @Tags Two-Factor Authentication
// @Accept json
// @Produce json
// @Param body body models.TwoFactorVerifyRequest true "TOTP code or backup code"
// @Param X-2FA-Token header string true "Temporary 2FA token from login"
// @Success 200 {object} models.AuthResponse "Full access JWT token"
// @Failure 400 {object} map[string]string "Invalid code"
// @Failure 401 {object} map[string]string "Unauthorized or invalid token"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/verify [post]
func (h *TwoFactorHandler) Verify2FA(w http.ResponseWriter, r *http.Request) {
	logInfo("2FA verification request received")

	// Get 2FA token from header
	tokenString := r.Header.Get("X-2FA-Token")
	if tokenString == "" {
		writeError(w, http.StatusUnauthorized, "missing 2FA token")
		return
	}

	// Validate the 2FA token
	claims, err := h.jwtMgr.Validate2FAToken(tokenString)
	if err != nil {
		logError("Invalid 2FA token", err)
		writeError(w, http.StatusUnauthorized, "invalid or expired 2FA token")
		return
	}

	var req models.TwoFactorVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in 2FA verify", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get user details
	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		logError("Failed to get user for 2FA verification", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Check if 2FA is enabled
	if !user.TwoFactorEnabled {
		writeError(w, http.StatusBadRequest, "2FA is not enabled for this user")
		return
	}

	// Try TOTP code first
	valid := false
	isBackupCode := false

	// Check if it's a TOTP code (8 digits - configured in TOTPConfig)
	if len(req.Code) == 8 {
		valid, _ = h.totpMgr.ValidateCodeWithWindow(user.TwoFactorSecret, req.Code)
	}

	// If TOTP failed, try backup code
	if !valid {
		index, found := h.totpMgr.ValidateBackupCode(req.Code, user.TwoFactorBackupCodes)
		if found {
			valid = true
			isBackupCode = true

			// Remove the used backup code
			newCodes := auth.RemoveBackupCode(user.TwoFactorBackupCodes, index)
			if err := h.repo.UpdateUser2FABackupCodes(claims.UserID, newCodes); err != nil {
				logError("Failed to update backup codes after use", err)
			}

			// Log backup code usage
			h.logActivity(&claims.UserID, models.Action2FABackupCodeUsed, models.LogLevelWarning,
				"user", &claims.UserID, user.DiscordUsername,
				fmt.Sprintf("Backup code used for 2FA by user %s. %d codes remaining.", user.DiscordUsername, len(newCodes)),
				"", getIPAddress(r))
		}
	}

	if !valid {
		log.Printf("[2FA] ❌ Invalid 2FA code for user: %s", user.DiscordUsername)

		// Log failed verification
		h.logActivity(&claims.UserID, models.Action2FAFailed, models.LogLevelError,
			"user", &claims.UserID, user.DiscordUsername,
			fmt.Sprintf("2FA verification failed for user %s - invalid code", user.DiscordUsername),
			"", getIPAddress(r))

		writeError(w, http.StatusBadRequest, "invalid verification code")
		return
	}

	// Generate full access token
	token, expiresAt, err := h.jwtMgr.GenerateToken(claims.UserID, claims.DiscordUserID)
	if err != nil {
		logError("Failed to generate token after 2FA", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Log successful 2FA verification
	codeType := "TOTP"
	if isBackupCode {
		codeType = "backup code"
	}
	h.logActivity(&claims.UserID, models.Action2FAVerified, models.LogLevelSuccess,
		"user", &claims.UserID, user.DiscordUsername,
		fmt.Sprintf("2FA verified successfully for user %s using %s", user.DiscordUsername, codeType),
		"", getIPAddress(r))

	logInfo("✅ 2FA verified for user: %s (method: %s)", user.DiscordUsername, codeType)

	writeJSON(w, http.StatusOK, models.AuthResponse{
		Token:     token,
		ExpiresAt: expiresAt,
	})
}

// Disable2FA godoc
// @Summary Disable 2FA
// @Description Disable two-factor authentication (requires current TOTP code for verification)
// @Tags Two-Factor Authentication
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.TwoFactorDisableRequest true "Current TOTP code to confirm"
// @Success 200 {object} map[string]string "2FA disabled successfully"
// @Failure 400 {object} map[string]string "Invalid code or 2FA not enabled"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/disable [post]
func (h *TwoFactorHandler) Disable2FA(w http.ResponseWriter, r *http.Request) {
	logInfo("2FA disable request received")

	// Get user from context
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.TwoFactorDisableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in 2FA disable", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get user details
	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user for 2FA disable", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Check if 2FA is enabled
	if !user.TwoFactorEnabled {
		writeError(w, http.StatusBadRequest, "2FA is not enabled")
		return
	}

	// Verify the TOTP code
	valid, err := h.totpMgr.ValidateCodeWithWindow(user.TwoFactorSecret, req.Code)
	if err != nil || !valid {
		log.Printf("[2FA] ❌ Invalid TOTP code for 2FA disable - user: %s", user.DiscordUsername)

		h.logActivity(userID, models.Action2FAFailed, models.LogLevelWarning,
			"user", userID, user.DiscordUsername,
			fmt.Sprintf("Failed 2FA disable attempt for user %s - invalid code", user.DiscordUsername),
			"", getIPAddress(r))

		writeError(w, http.StatusBadRequest, "invalid verification code")
		return
	}

	// Disable 2FA
	if err := h.repo.DisableUser2FA(*userID); err != nil {
		logError("Failed to disable 2FA", err)
		writeError(w, http.StatusInternalServerError, "failed to disable 2FA")
		return
	}

	// Log 2FA disabled
	h.logActivity(userID, models.Action2FADisabled, models.LogLevelInfo,
		"user", userID, user.DiscordUsername,
		fmt.Sprintf("2FA disabled for user %s", user.DiscordUsername),
		"", getIPAddress(r))

	logInfo("✅ 2FA disabled for user: %s", user.DiscordUsername)

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "2FA has been disabled successfully",
	})
}

// Get2FAStatus godoc
// @Summary Get 2FA status
// @Description Get the current 2FA enrollment status for the authenticated user
// @Tags Two-Factor Authentication
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.TwoFactorStatusResponse "2FA status"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/status [get]
func (h *TwoFactorHandler) Get2FAStatus(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	enabled, backupCodesCount, verifiedAt, err := h.repo.GetUser2FAStatus(*userID)
	if err != nil {
		logError("Failed to get 2FA status", err)
		writeError(w, http.StatusInternalServerError, "failed to get 2FA status")
		return
	}

	writeJSON(w, http.StatusOK, models.TwoFactorStatusResponse{
		Enabled:          enabled,
		VerifiedAt:       verifiedAt,
		BackupCodesCount: backupCodesCount,
	})
}

// RegenerateBackupCodes godoc
// @Summary Regenerate backup codes
// @Description Generate new backup codes (invalidates old ones). Requires current TOTP code.
// @Tags Two-Factor Authentication
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.TwoFactorDisableRequest true "Current TOTP code to confirm"
// @Success 200 {object} models.TwoFactorBackupCodesResponse "New backup codes"
// @Failure 400 {object} map[string]string "Invalid code or 2FA not enabled"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /auth/2fa/backup-codes [post]
func (h *TwoFactorHandler) RegenerateBackupCodes(w http.ResponseWriter, r *http.Request) {
	logInfo("Backup codes regeneration request received")

	// Get user from context
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.TwoFactorDisableRequest // Reusing same struct as it has the same fields
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid request body in backup codes regeneration", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get user details
	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user for backup codes regeneration", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Check if 2FA is enabled
	if !user.TwoFactorEnabled {
		writeError(w, http.StatusBadRequest, "2FA is not enabled")
		return
	}

	// Verify the TOTP code
	valid, err := h.totpMgr.ValidateCodeWithWindow(user.TwoFactorSecret, req.Code)
	if err != nil || !valid {
		log.Printf("[2FA] ❌ Invalid TOTP code for backup codes regeneration - user: %s", user.DiscordUsername)
		writeError(w, http.StatusBadRequest, "invalid verification code")
		return
	}

	// Generate new backup codes
	backupResult, err := h.totpMgr.GenerateBackupCodes(10)
	if err != nil {
		logError("Failed to generate new backup codes", err)
		writeError(w, http.StatusInternalServerError, "failed to generate backup codes")
		return
	}

	// Update backup codes
	if err := h.repo.UpdateUser2FABackupCodes(*userID, backupResult.HashedCodes); err != nil {
		logError("Failed to update backup codes", err)
		writeError(w, http.StatusInternalServerError, "failed to save backup codes")
		return
	}

	logInfo("✅ Backup codes regenerated for user: %s", user.DiscordUsername)

	writeJSON(w, http.StatusOK, models.TwoFactorBackupCodesResponse{
		Codes:   backupResult.Codes,
		Message: "New backup codes generated. Your old backup codes have been invalidated. Store these codes in a safe place.",
	})
}
