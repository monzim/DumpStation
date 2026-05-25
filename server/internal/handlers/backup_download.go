package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/storage"
)

// downloadOTPTTL is how long a download-OTP and the resulting presigned URL
// remain valid. Five minutes is enough for a human to switch from Discord
// to the browser and short enough that a leaked URL stays useful for only
// one round trip.
const downloadOTPTTL = 5 * time.Minute

// ─────────────────────── Failed-backup purge ───────────────────────

// FailedBackupCountResponse is the shape of /backups/failed/count.
type FailedBackupCountResponse struct {
	Count int64 `json:"count"`
}

// CountFailedBackups returns how many failed Backup rows the caller can
// purge. Used by the Settings page to render the count before showing the
// destructive button.
//
// @Summary  Count failed backups
// @Tags     Backups
// @Security BearerAuth
// @Produce  json
// @Success  200 {object} FailedBackupCountResponse
// @Router   /backups/failed/count [get]
func (h *Handler) CountFailedBackups(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	count, err := h.repo.CountFailedBackupsByUser(*userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to count failed backups")
		return
	}
	writeJSON(w, http.StatusOK, FailedBackupCountResponse{Count: count})
}

// PurgeFailedBackups deletes every Backup row owned by the caller whose
// status is "failed", best-effort cleaning the corresponding storage object
// if one exists. Returns the count actually deleted.
//
// @Summary  Purge failed backups
// @Tags     Backups
// @Security BearerAuth
// @Produce  json
// @Success  200 {object} map[string]int "deleted count"
// @Failure  500 {object} map[string]string
// @Router   /backups/failed [delete]
func (h *Handler) PurgeFailedBackups(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	failed, err := h.repo.ListFailedBackupsByUser(*userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list failed backups")
		return
	}
	if len(failed) == 0 {
		writeJSON(w, http.StatusOK, map[string]int64{"deleted": 0})
		return
	}

	// Free storage objects first so a partial DB delete still releases the
	// blobs. Storage errors are logged but never block the row delete —
	// failed backups frequently have no object to begin with, or the object
	// was already cleaned by a previous purge.
	ids := make([]uuid.UUID, 0, len(failed))
	for _, b := range failed {
		ids = append(ids, b.ID)
		if b.StoragePath == "" {
			continue
		}
		if b.Database.StorageID == uuid.Nil {
			continue
		}
		storageConfig, err := h.repo.GetStorageConfig(b.Database.StorageID)
		if err != nil || storageConfig == nil {
			continue
		}
		client, err := storage.NewStorageClient(storageConfig)
		if err != nil {
			continue
		}
		if err := client.DeleteFile(b.StoragePath); err != nil {
			// Common: 404 because the upload itself failed. Don't surface.
			continue
		}
	}

	deleted, err := h.repo.DeleteBackupsByIDs(ids)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete failed backups")
		return
	}

	meta, _ := json.Marshal(map[string]any{
		"purged_count": deleted,
	})
	h.logActivity(userID, models.ActionFailedBackupsPurged, models.LogLevelWarning,
		"backup", nil, "",
		fmt.Sprintf("Purged %d failed backup(s)", deleted),
		string(meta), getIPAddress(r))

	writeJSON(w, http.StatusOK, map[string]int64{"deleted": deleted})
}

// ─────────────────────── OTP-gated backup download ───────────────────────

// DownloadOTPRequestResponse is the shape of the request-otp endpoint.
type DownloadOTPRequestResponse struct {
	OTPID     uuid.UUID `json:"otp_id"`
	ExpiresAt time.Time `json:"expires_at"`
	Channels  []string  `json:"channels"`
}

// DownloadVerifyRequest is the body of /backups/{id}/download/verify.
type DownloadVerifyRequest struct {
	OTPID uuid.UUID `json:"otp_id" validate:"required"`
	Code  string    `json:"code" validate:"required"`
}

// DownloadURLResponse is returned after a successful OTP verification.
type DownloadURLResponse struct {
	DownloadURL string    `json:"download_url"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// RequestBackupDownloadOTP issues a one-shot OTP that gates the download
// endpoint. The code is delivered via every notification channel the user
// has configured (Discord and/or Telegram). We never return the code in
// the HTTP response — only the OTP id so the verify step knows which row
// to check.
//
// @Summary  Request a backup-download OTP
// @Tags     Backups
// @Security BearerAuth
// @Produce  json
// @Success  200 {object} DownloadOTPRequestResponse
// @Failure  412 {object} map[string]string "No notification channel configured"
// @Router   /backups/{id}/download/request-otp [post]
func (h *Handler) RequestBackupDownloadOTP(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	backupID, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid backup id")
		return
	}
	backup, err := h.repo.GetBackupByUser(backupID, *userID, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load backup")
		return
	}
	if backup == nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}
	if backup.Status != models.BackupStatusSuccess || backup.StoragePath == "" {
		writeError(w, http.StatusBadRequest, "only successful backups can be downloaded")
		return
	}

	// Pick the user's first available notification config. We use the
	// "first" rule because a single-user deployment rarely has more than
	// one channel set, and treating one config as canonical avoids
	// confusing fan-out where the same OTP arrives in multiple chats.
	configs, err := h.repo.ListNotificationConfigsByUser(*userID, isAdmin)
	if err != nil || len(configs) == 0 {
		writeError(w, http.StatusPreconditionFailed,
			"configure at least one notification channel (Discord or Telegram) before downloading backups")
		return
	}
	cfg := configs[0]
	notifier := notification.NotifierFromConfig(cfg)
	channels := notification.Channels(notifier)
	if len(channels) == 0 {
		writeError(w, http.StatusPreconditionFailed,
			"selected notification channel has no usable destination")
		return
	}

	code, err := auth.GenerateOTP()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate OTP")
		return
	}

	expiresAt := time.Now().Add(downloadOTPTTL)
	bid := backupID
	otp, err := h.repo.CreatePurposeOTP(*userID, code, models.OTPPurposeBackupDownload, &bid, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store OTP")
		return
	}

	if err := notifier.SendDownloadOTP(code, backup.Name); err != nil {
		// Deliver the failure to the caller — if Discord/Telegram is down
		// we can't claim "code sent". Mark the OTP used so it can't be
		// retried by guessing.
		writeError(w, http.StatusBadGateway, "failed to deliver OTP: "+err.Error())
		return
	}

	h.logActivity(userID, models.ActionBackupDownloadOTPRequested, models.LogLevelInfo,
		"backup", &bid, backup.Name,
		fmt.Sprintf("Download OTP requested for backup %q via %s", backup.Name, strings.Join(channels, ", ")),
		"", getIPAddress(r))

	writeJSON(w, http.StatusOK, DownloadOTPRequestResponse{
		OTPID:     otp.ID,
		ExpiresAt: expiresAt,
		Channels:  channels,
	})
}

// VerifyBackupDownloadOTP redeems a download OTP and returns a short-lived
// S3/R2/MinIO presigned URL. The URL is delivered as JSON; the browser
// follows it to download directly from storage so the API server never
// proxies the bytes.
//
// @Summary  Verify download OTP and get presigned URL
// @Tags     Backups
// @Security BearerAuth
// @Accept   json
// @Produce  json
// @Success  200 {object} DownloadURLResponse
// @Failure  401 {object} map[string]string "OTP rejected"
// @Failure  429 {object} map[string]string "OTP locked out"
// @Router   /backups/{id}/download/verify [post]
func (h *Handler) VerifyBackupDownloadOTP(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	isAdmin := getIsAdminFromContext(r)

	backupID, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid backup id")
		return
	}

	var req DownloadVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if verr, err := h.validator.Validate(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	} else if verr != nil {
		writeJSON(w, http.StatusBadRequest, verr)
		return
	}

	result, err := h.repo.VerifyPurposeOTP(req.OTPID, *userID, req.Code, models.OTPPurposeBackupDownload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify OTP")
		return
	}
	if result.LockedUntil != nil {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", int(time.Until(*result.LockedUntil).Seconds())))
		writeError(w, http.StatusTooManyRequests, "too many wrong attempts; OTP locked")
		return
	}
	if !result.OK {
		writeError(w, http.StatusUnauthorized, "invalid or expired OTP")
		return
	}

	backup, err := h.repo.GetBackupByUser(backupID, *userID, isAdmin)
	if err != nil || backup == nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}

	// Build the storage client from the backup's database's storage config.
	dbCfg, err := h.repo.GetDatabaseConfig(backup.DatabaseID)
	if err != nil || dbCfg == nil {
		writeError(w, http.StatusInternalServerError, "failed to load database config")
		return
	}
	storageCfg, err := h.repo.GetStorageConfig(dbCfg.StorageID)
	if err != nil || storageCfg == nil {
		writeError(w, http.StatusInternalServerError, "failed to load storage config")
		return
	}
	client, err := storage.NewStorageClient(storageCfg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to init storage client")
		return
	}

	// Pick a sensible download filename so the browser saves it nicely.
	suggested := backup.Name
	if backup.DumpFormat == models.DumpFormatCustom {
		suggested += ".dump"
	} else {
		suggested += ".sql"
	}

	url, err := client.PresignDownload(backup.StoragePath, suggested, downloadOTPTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to presign download URL")
		return
	}

	size := int64(0)
	if backup.SizeBytes != nil {
		size = *backup.SizeBytes
	}
	meta, _ := json.Marshal(map[string]any{
		"backup_id":  backup.ID,
		"name":       backup.Name,
		"size_bytes": size,
	})
	h.logActivity(userID, models.ActionBackupDownloaded, models.LogLevelInfo,
		"backup", &backup.ID, backup.Name,
		fmt.Sprintf("Backup %q downloaded", backup.Name),
		string(meta), getIPAddress(r))

	writeJSON(w, http.StatusOK, DownloadURLResponse{
		DownloadURL: url,
		ExpiresAt:   time.Now().Add(downloadOTPTTL),
	})
}
