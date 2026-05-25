package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// DiscordMessage represents a Discord webhook message
type DiscordMessage struct {
	Content  string `json:"content"`
	Username string `json:"username,omitempty"`
}

const (
	discordRequestTimeout = 10 * time.Second
	discordMaxAttempts    = 3
	discordBaseBackoff    = 500 * time.Millisecond
	discordMaxBackoff     = 5 * time.Second
)

// httpClient is a package-level client with a hard request timeout. We do
// NOT use http.DefaultClient because that has no timeout — a stuck Discord
// API call would block the calling goroutine forever.
var httpClient = &http.Client{Timeout: discordRequestTimeout}

// DiscordNotifier handles Discord notifications
type DiscordNotifier struct {
	webhookURL string
	username   string
}

// NewDiscordNotifier creates a new Discord notifier
func NewDiscordNotifier(webhookURL, username string) *DiscordNotifier {
	if username == "" {
		username = "PostgreSQL Backup Service"
	}
	return &DiscordNotifier{
		webhookURL: webhookURL,
		username:   username,
	}
}

// SendMessage sends a message to Discord webhook with bounded retry. 5xx
// responses and network errors retry with exponential backoff; 429 honors
// the Retry-After header when present. 4xx (other than 429) are permanent
// failures and are not retried.
func (dn *DiscordNotifier) SendMessage(message string) error {
	if dn.webhookURL == "" {
		return nil // Notifications disabled
	}

	payload := DiscordMessage{
		Content:  message,
		Username: dn.username,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Discord message: %w", err)
	}

	var lastErr error
	for attempt := 1; attempt <= discordMaxAttempts; attempt++ {
		retryAfter, err := dn.postOnce(jsonData)
		if err == nil {
			return nil
		}
		lastErr = err

		if !errIsTransient(err) {
			return err
		}

		if attempt == discordMaxAttempts {
			break
		}

		wait := backoffDuration(attempt)
		if retryAfter > 0 && retryAfter < discordMaxBackoff {
			wait = retryAfter
		}
		log.Printf("Discord webhook attempt %d/%d failed: %v (retrying in %s)", attempt, discordMaxAttempts, err, wait)
		time.Sleep(wait)
	}

	return fmt.Errorf("Discord webhook failed after %d attempts: %w", discordMaxAttempts, lastErr)
}

// postOnce performs a single POST. Returns (retryAfter, error). retryAfter
// is non-zero only when Discord asked us to wait (HTTP 429).
func (dn *DiscordNotifier) postOnce(payload []byte) (time.Duration, error) {
	ctx, cancel := context.WithTimeout(context.Background(), discordRequestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dn.webhookURL, bytes.NewReader(payload))
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, transientErrorf("network: %w", err)
	}
	defer resp.Body.Close()

	// Read up to 1 KB of the response body so non-2xx errors can include
	// Discord's reason (e.g. `{"code":50006,"message":"Cannot send an
	// empty message"}`). Without this, every failure looked like a bare
	// "rejected with status 400" and was impossible to diagnose.
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	_, _ = io.Copy(io.Discard, resp.Body)
	body := strings.TrimSpace(string(bodyBytes))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return 0, nil
	case resp.StatusCode == http.StatusTooManyRequests:
		return parseRetryAfter(resp.Header.Get("Retry-After")), transientErrorf("rate limited (429): %s", body)
	case resp.StatusCode >= 500:
		return 0, transientErrorf("server error %d: %s", resp.StatusCode, body)
	default:
		return 0, fmt.Errorf("Discord webhook rejected request with status %d: %s", resp.StatusCode, body)
	}
}

// transientError is wrapped around retryable failures so the retry loop
// can distinguish them from permanent (4xx) errors.
type transientError struct{ err error }

func (e *transientError) Error() string { return e.err.Error() }
func (e *transientError) Unwrap() error { return e.err }

func transientErrorf(format string, args ...any) error {
	return &transientError{err: fmt.Errorf(format, args...)}
}

func errIsTransient(err error) bool {
	var t *transientError
	for e := err; e != nil; {
		if te, ok := e.(*transientError); ok {
			t = te
			break
		}
		// Walk wrapped errors via Unwrap manually.
		type unwrapper interface{ Unwrap() error }
		if u, ok := e.(unwrapper); ok {
			e = u.Unwrap()
			continue
		}
		break
	}
	return t != nil
}

func parseRetryAfter(h string) time.Duration {
	if h == "" {
		return 0
	}
	if secs, err := strconv.ParseFloat(h, 64); err == nil && secs > 0 {
		return time.Duration(secs * float64(time.Second))
	}
	return 0
}

func backoffDuration(attempt int) time.Duration {
	d := discordBaseBackoff << (attempt - 1)
	if d > discordMaxBackoff {
		d = discordMaxBackoff
	}
	return d
}

// SendOTP sends OTP via Discord webhook
func (dn *DiscordNotifier) SendOTP(otp string) error {
	message := fmt.Sprintf("🔐 **Login OTP Code**: `%s`\n⏰ This code expires in 5 minutes.\n\n_Requested at: %s_",
		otp,
		fmt.Sprintf("<t:%d:F>", time.Now().Unix()))
	return dn.SendMessage(message)
}

// SendDownloadOTP sends a backup-download OTP via Discord webhook.
func (dn *DiscordNotifier) SendDownloadOTP(otp, backupName string) error {
	message := fmt.Sprintf("📥 **Backup Download Code**: `%s`\n📦 Backup: `%s`\n⏰ Expires in 5 minutes.\n\n_Requested at: %s_",
		otp, backupName,
		fmt.Sprintf("<t:%d:F>", time.Now().Unix()))
	return dn.SendMessage(message)
}

// SendBackupSuccess sends backup success notification
func (dn *DiscordNotifier) SendBackupSuccess(dbName string, sizeBytes int64, duration string) error {
	message := fmt.Sprintf("✅ **Backup Completed**\n📊 Database: `%s`\n💾 Size: %s\n⏱️ Duration: %s",
		dbName, formatBytes(sizeBytes), duration)
	return dn.SendMessage(message)
}

// SendBackupFailure sends backup failure notification
func (dn *DiscordNotifier) SendBackupFailure(dbName, errorMsg string) error {
	message := fmt.Sprintf("❌ **Backup Failed**\n📊 Database: `%s`\n⚠️ Error: %s", dbName, errorMsg)
	return dn.SendMessage(message)
}

// SendRestoreSuccess sends restore success notification
func (dn *DiscordNotifier) SendRestoreSuccess(dbName, targetDB string) error {
	message := fmt.Sprintf("✅ **Restore Completed**\n📊 Source: `%s`\n🎯 Target: `%s`", dbName, targetDB)
	return dn.SendMessage(message)
}

// SendRestoreFailure sends restore failure notification
func (dn *DiscordNotifier) SendRestoreFailure(dbName, errorMsg string) error {
	message := fmt.Sprintf("❌ **Restore Failed**\n📊 Database: `%s`\n⚠️ Error: %s", dbName, errorMsg)
	return dn.SendMessage(message)
}

// formatBytes formats bytes to human-readable format
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
