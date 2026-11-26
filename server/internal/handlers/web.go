package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
)

// spaHandler serves the built web UI. Unknown paths fall back to index.html
// so client-side routes survive refresh and deep links.
func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	index := filepath.Join(dir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		if strings.HasPrefix(clean, "/api/") || strings.HasPrefix(clean, "/agent/") {
			http.NotFound(w, r)
			return
		}
		p := filepath.Join(dir, filepath.FromSlash(clean))
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if strings.HasPrefix(clean, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			setWebCSP(w)
			fs.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		setWebCSP(w)
		http.ServeFile(w, r, index)
	})
}

func setWebCSP(w http.ResponseWriter) {
	w.Header().Set("Content-Security-Policy", strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' https://challenges.cloudflare.com",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https://avatars.githubusercontent.com",
		"font-src 'self' data:",
		"connect-src 'self'",
		"frame-src https://challenges.cloudflare.com",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	}, "; "))
}

// RuntimeConfigJS serves window.APP_CONFIG for the SPA.
func (h *Handler) RuntimeConfigJS(w http.ResponseWriter, _ *http.Request) {
	cfg := map[string]any{"API_BASE_URL": "/api/v1", "TURNSTILE_SITE_KEY": "", "VERSION": Version}
	if h.cfg != nil && h.cfg.Turnstile.Enabled {
		cfg["TURNSTILE_SITE_KEY"] = h.cfg.Turnstile.SiteKey
	}
	b, _ := json.Marshal(cfg)
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	fmt.Fprintf(w, "window.APP_CONFIG = %s;\n", b)
}

// TestNotificationConfig handles POST /notifications/{id}/test.
func (h *Handler) TestNotificationConfig(w http.ResponseWriter, r *http.Request) {
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
	msg := fmt.Sprintf("✅ DumpStation test notification for channel **%s** (%s).", n.Name, time.Now().UTC().Format(time.RFC1123))
	if err := notification.NotifierFromConfig(n).SendMessage(msg); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	h.logActivity(&c.UserID, models.ActionNotificationUpdated, models.LogLevelInfo, "notification", &n.ID, n.Name,
		fmt.Sprintf("Test notification sent to %q", n.Name), "", c.IP)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "Test message delivered"})
}

// ServerConnectionEditView returns the editable, non-secret fields of an
// explorer connection (the regular response masks host and user).
type ServerConnectionEditView struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"user"`
	SSLMode     string `json:"ssl_mode"`
	HasPassword bool   `json:"has_password"`
}

// GetServerConnectionForEdit handles GET /server-connections/{id}/connection.
func (h *Handler) GetServerConnectionForEdit(w http.ResponseWriter, r *http.Request) {
	c, ok := writer(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	sc, err := h.repo.GetServerConnectionByUser(id, c.UserID, c.IsAdmin)
	if err != nil || sc == nil {
		writeError(w, http.StatusNotFound, "server connection not found")
		return
	}
	writeJSON(w, http.StatusOK, ServerConnectionEditView{Host: sc.Host, Port: sc.Port, Username: sc.Username, SSLMode: sc.SSLMode, HasPassword: sc.Password != ""})
}
