package notification

import (
	"errors"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// Notifier is the abstraction every chat backend (Discord, Telegram, …)
// satisfies. Methods are intentionally narrow: callers pass plain values and
// the backend formats the message its own way. Implementations MUST return
// nil when no destination is configured so a partially-filled config never
// fails callers.
type Notifier interface {
	SendMessage(message string) error
	SendOTP(otp string) error
	SendBackupSuccess(dbName string, sizeBytes int64, duration string) error
	SendBackupFailure(dbName, errorMsg string) error
	SendRestoreSuccess(dbName, targetDB string) error
	SendRestoreFailure(dbName, errorMsg string) error
	// SendDownloadOTP delivers an OTP for a backup-download request.
	// backupName is included so the recipient can verify the request is theirs.
	SendDownloadOTP(otp, backupName string) error
}

// NotifierFromConfig builds a Notifier from a NotificationConfig row. When
// the row carries both Discord and Telegram credentials the returned
// notifier fans out to both. A nil config or an empty config returns a
// no-op notifier so callers can dispatch unconditionally.
func NotifierFromConfig(cfg *models.NotificationConfig) Notifier {
	if cfg == nil {
		return noopNotifier{}
	}
	var parts []Notifier
	if cfg.HasDiscord() {
		parts = append(parts, NewDiscordNotifier(cfg.DiscordWebhookURL, ""))
	}
	if cfg.HasTelegram() {
		parts = append(parts, NewTelegramNotifier(cfg.TelegramBotToken, cfg.TelegramChatID))
	}
	switch len(parts) {
	case 0:
		return noopNotifier{}
	case 1:
		return parts[0]
	default:
		return MultiNotifier(parts)
	}
}

// noopNotifier silently discards every message. Used when a backup's
// notification config is missing or empty so handlers don't have to
// nil-check at every call site.
type noopNotifier struct{}

func (noopNotifier) SendMessage(string) error                          { return nil }
func (noopNotifier) SendOTP(string) error                              { return nil }
func (noopNotifier) SendBackupSuccess(string, int64, string) error    { return nil }
func (noopNotifier) SendBackupFailure(string, string) error           { return nil }
func (noopNotifier) SendRestoreSuccess(string, string) error          { return nil }
func (noopNotifier) SendRestoreFailure(string, string) error          { return nil }
func (noopNotifier) SendDownloadOTP(string, string) error             { return nil }

// MultiNotifier fans every call out to its children, joining their errors
// so one failing channel never silently masks the others.
type MultiNotifier []Notifier

func (m MultiNotifier) SendMessage(msg string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendMessage(msg); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendOTP(otp string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendOTP(otp); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendBackupSuccess(dbName string, sizeBytes int64, duration string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendBackupSuccess(dbName, sizeBytes, duration); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendBackupFailure(dbName, errorMsg string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendBackupFailure(dbName, errorMsg); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendRestoreSuccess(dbName, targetDB string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendRestoreSuccess(dbName, targetDB); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendRestoreFailure(dbName, errorMsg string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendRestoreFailure(dbName, errorMsg); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m MultiNotifier) SendDownloadOTP(otp, backupName string) error {
	errs := make([]error, 0, len(m))
	for _, n := range m {
		if err := n.SendDownloadOTP(otp, backupName); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// Channels reports the human-readable list of channels this notifier will
// actually attempt to deliver to. Used by the download-OTP request handler
// to tell the user "code sent via Discord, Telegram".
func Channels(n Notifier) []string {
	switch v := n.(type) {
	case MultiNotifier:
		out := make([]string, 0, len(v))
		for _, child := range v {
			out = append(out, Channels(child)...)
		}
		return out
	case *DiscordNotifier:
		return []string{"discord"}
	case *TelegramNotifier:
		return []string{"telegram"}
	default:
		return nil
	}
}
