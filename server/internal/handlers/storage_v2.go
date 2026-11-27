package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/storage"
)

func (h *Handler) storageResponses(c *reqCtx, list []*models.StorageConfig) []models.StorageConfigResponse {
	usage, _ := h.repo.GetStorageUsage(c.UserID, c.IsAdmin)
	out := make([]models.StorageConfigResponse, len(list))
	for i, s := range list {
		resp := *s.ToResponse()
		if u, ok := usage[s.ID]; ok {
			resp.DatabaseCount, resp.BackupCount, resp.UsedBytes = u.DatabaseCount, u.BackupCount, u.UsedBytes
		}
		out[i] = resp
	}
	return out
}

// ListStorageV2 handles GET /storage.
func (h *Handler) ListStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	list, err := h.repo.ListStorageConfigsByUser(c.UserID, c.IsAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list storage")
		return
	}
	writeJSON(w, http.StatusOK, h.storageResponses(c, list))
}

// GetStorageV2 handles GET /storage/{id}.
func (h *Handler) GetStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := caller(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageWithLabels(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	writeJSON(w, http.StatusOK, h.storageResponses(c, []*models.StorageConfig{s})[0])
}

// CreateStorageV2 handles POST /storage.
func (h *Handler) CreateStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	var in models.StorageConfigInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	if in.AccessKey == "" || in.SecretKey == "" {
		writeError(w, http.StatusBadRequest, "access_key and secret_key are required")
		return
	}
	if in.Provider != models.StorageProviderS3 && in.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint is required for this provider")
		return
	}
	s := &models.StorageConfig{UserID: c.UserID, Name: in.Name, Provider: in.Provider, Bucket: in.Bucket,
		Region: in.Region, Endpoint: in.Endpoint, AccessKey: in.AccessKey, SecretKey: in.SecretKey}
	existing, _ := h.repo.ListStorageConfigsByUser(c.UserID, false)
	if len(existing) == 0 {
		in.IsDefault = true
	}
	if err := h.repo.SaveStorage(s); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create storage")
		return
	}
	if in.IsDefault {
		_ = h.repo.SetDefaultStorage(c.UserID, s.ID)
		s.IsDefault = true
	}
	h.logActivity(&c.UserID, models.ActionStorageCreated, models.LogLevelSuccess, "storage", &s.ID, s.Name,
		fmt.Sprintf("Storage %q (%s) created", s.Name, s.Provider), "", c.IP)
	writeJSON(w, http.StatusCreated, h.storageResponses(c, []*models.StorageConfig{s})[0])
}

// UpdateStorageV2 handles PUT /storage/{id}; empty keys keep stored credentials.
func (h *Handler) UpdateStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	var in models.StorageConfigInput
	if !h.decodeBody(w, r, &in, true) {
		return
	}
	s.Name, s.Provider, s.Bucket, s.Region, s.Endpoint = in.Name, in.Provider, in.Bucket, in.Region, in.Endpoint
	if in.AccessKey != "" {
		s.AccessKey = in.AccessKey
	}
	if in.SecretKey != "" {
		s.SecretKey = in.SecretKey
	}
	s.Labels = nil
	if err := h.repo.SaveStorage(s); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update storage")
		return
	}
	if in.IsDefault && !s.IsDefault {
		_ = h.repo.SetDefaultStorage(s.UserID, s.ID)
		s.IsDefault = true
	}
	h.logActivity(&c.UserID, models.ActionStorageUpdated, models.LogLevelInfo, "storage", &s.ID, s.Name,
		fmt.Sprintf("Storage %q updated", s.Name), "", c.IP)
	writeJSON(w, http.StatusOK, h.storageResponses(c, []*models.StorageConfig{s})[0])
}

// DeleteStorageV2 handles DELETE /storage/{id}. Refuses while databases use
// the storage or stored backups still live in it.
func (h *Handler) DeleteStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	usage, _ := h.repo.GetStorageUsage(s.UserID, false)
	if u, ok := usage[id]; ok && u.DatabaseCount > 0 {
		writeError(w, http.StatusConflict, fmt.Sprintf("storage is used by %d database(s); move them to another storage first", u.DatabaseCount))
		return
	}
	if n, _ := h.repo.CountArtifactsInStorage(id); n > 0 {
		writeError(w, http.StatusConflict, fmt.Sprintf("%d stored backup(s) still live in this storage; deleting it would make them unrestorable", n))
		return
	}
	if err := h.repo.DeleteStorageConfigByUser(id, c.UserID, c.IsAdmin); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete storage")
		return
	}
	h.logActivity(&c.UserID, models.ActionStorageDeleted, models.LogLevelWarning, "storage", &id, s.Name,
		fmt.Sprintf("Storage %q deleted", s.Name), "", c.IP)
	w.WriteHeader(http.StatusNoContent)
}

// TestStorageV2 handles POST /storage/{id}/test.
func (h *Handler) TestStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	res := h.testStorage(r.Context(), s)
	if !res.OK {
		h.logActivity(&c.UserID, models.ActionStorageTestFailed, models.LogLevelError, "storage", &s.ID, s.Name,
			fmt.Sprintf("Storage %q connectivity check failed: %s", s.Name, res.Message), "", c.IP)
	}
	writeJSON(w, http.StatusOK, res)
}

// TestStorageInput handles POST /storage/test (before saving). When id is
// given and keys are empty, the stored keys are used.
func (h *Handler) TestStorageInput(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	var in struct {
		models.StorageConfigInput
		ID string `json:"id,omitempty"`
	}
	if !h.decodeBody(w, r, &in, false) {
		return
	}
	s := &models.StorageConfig{Name: in.Name, Provider: in.Provider, Bucket: in.Bucket, Region: in.Region,
		Endpoint: in.Endpoint, AccessKey: in.AccessKey, SecretKey: in.SecretKey}
	if in.ID != "" && (s.AccessKey == "" || s.SecretKey == "") {
		if id, err := parseUUID(in.ID); err == nil {
			if old, _ := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin); old != nil {
				if s.AccessKey == "" {
					s.AccessKey = old.AccessKey
				}
				if s.SecretKey == "" {
					s.SecretKey = old.SecretKey
				}
			}
		}
	}
	if s.Bucket == "" || s.AccessKey == "" || s.SecretKey == "" {
		writeError(w, http.StatusBadRequest, "bucket, access_key and secret_key are required")
		return
	}
	writeJSON(w, http.StatusOK, h.testStorage(r.Context(), s))
}

func (h *Handler) testStorage(ctx context.Context, s *models.StorageConfig) storage.TestResult {
	client, err := storage.NewStorageClient(s)
	if err != nil {
		return storage.TestResult{Message: err.Error()}
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	return client.Test(ctx)
}

// SetDefaultStorageV2 handles POST /storage/{id}/default.
func (h *Handler) SetDefaultStorageV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	if err := h.repo.SetDefaultStorage(s.UserID, id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to set default")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateNotificationV2 handles PUT /notifications/{id}. Empty secrets keep
// stored values; the Discord URL is only validated when it changes.
func (h *Handler) UpdateNotificationV2(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	n, err := h.repo.GetNotificationConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || n == nil {
		writeError(w, http.StatusNotFound, "notification config not found")
		return
	}
	var in struct {
		models.NotificationConfigInput
		ClearDiscord  bool `json:"clear_discord,omitempty"`
		ClearTelegram bool `json:"clear_telegram,omitempty"`
	}
	if !h.decodeBody(w, r, &in, false) {
		return
	}
	if in.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	n.Name = in.Name
	if in.DiscordWebhookURL != "" {
		if err := notification.ValidateDiscordWebhookURL(in.DiscordWebhookURL); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		n.DiscordWebhookURL = in.DiscordWebhookURL
	} else if in.ClearDiscord {
		n.DiscordWebhookURL = ""
	}
	if in.TelegramBotToken != "" {
		n.TelegramBotToken = in.TelegramBotToken
	}
	if in.TelegramChatID != "" {
		n.TelegramChatID = in.TelegramChatID
	}
	if in.ClearTelegram {
		n.TelegramBotToken, n.TelegramChatID = "", ""
	}
	n.Labels = nil
	if err := h.repo.SaveNotification(n); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.logActivity(&c.UserID, models.ActionNotificationUpdated, models.LogLevelInfo, "notification", &n.ID, n.Name,
		fmt.Sprintf("Notification channel %q updated", n.Name), "", c.IP)
	writeJSON(w, http.StatusOK, n.ToResponse())
}

// StorageSettingsView returns editable, non-secret storage fields.
type StorageSettingsView struct {
	Bucket   string `json:"bucket"`
	Region   string `json:"region"`
	Endpoint string `json:"endpoint"`
}

// GetStorageSettings handles GET /storage/{id}/settings (edit forms).
func (h *Handler) GetStorageSettings(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.repo.GetStorageConfigByUser(id, c.UserID, c.IsAdmin)
	if err != nil || s == nil {
		writeError(w, http.StatusNotFound, "storage not found")
		return
	}
	writeJSON(w, http.StatusOK, StorageSettingsView{Bucket: s.Bucket, Region: s.Region, Endpoint: s.Endpoint})
}
