package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Telegram retry & timing constants mirror Discord's so a flaky upstream
// doesn't pin the goroutine. Telegram's rate limits are generous but its
// API can briefly 502 under load.
const (
	telegramRequestTimeout = 10 * time.Second
	telegramMaxAttempts    = 3
	telegramBaseBackoff    = 500 * time.Millisecond
	telegramMaxBackoff     = 5 * time.Second
	telegramBaseURL        = "https://api.telegram.org"
)

// telegramClient is bounded by an explicit timeout for the same reason as
// the Discord client: a hung TCP connection must not stall a backup
// worker indefinitely.
var telegramClient = &http.Client{Timeout: telegramRequestTimeout}

// TelegramNotifier delivers chat messages to a single Telegram chat via a
// bot token. Both botToken and chatID must be set; empty values make every
// call a silent no-op so partially-configured rows never error.
type TelegramNotifier struct {
	botToken string
	chatID   string
}

// NewTelegramNotifier constructs a notifier. Either parameter being empty
// disables delivery.
func NewTelegramNotifier(botToken, chatID string) *TelegramNotifier {
	return &TelegramNotifier{botToken: botToken, chatID: chatID}
}

type telegramSendMessageRequest struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"`
}

// SendMessage posts text to the configured chat with bounded retry. 429
// responses honour Retry-After; 5xx and network errors are retried with
// exponential backoff; 4xx (other than 429) are treated as permanent.
func (tn *TelegramNotifier) SendMessage(message string) error {
	if tn.botToken == "" || tn.chatID == "" {
		return nil
	}

	payload, err := json.Marshal(telegramSendMessageRequest{
		ChatID:    tn.chatID,
		Text:      message,
		ParseMode: "Markdown",
	})
	if err != nil {
		return fmt.Errorf("failed to marshal Telegram message: %w", err)
	}

	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", telegramBaseURL, tn.botToken)

	var lastErr error
	for attempt := 1; attempt <= telegramMaxAttempts; attempt++ {
		retryAfter, err := tn.postOnce(endpoint, payload)
		if err == nil {
			return nil
		}
		lastErr = err
		if !errIsTransient(err) {
			return err
		}
		if attempt == telegramMaxAttempts {
			break
		}
		wait := telegramBackoff(attempt)
		if retryAfter > 0 && retryAfter < telegramMaxBackoff {
			wait = retryAfter
		}
		log.Printf("Telegram attempt %d/%d failed: %v (retrying in %s)", attempt, telegramMaxAttempts, err, wait)
		time.Sleep(wait)
	}

	return fmt.Errorf("Telegram delivery failed after %d attempts: %w", telegramMaxAttempts, lastErr)
}

func (tn *TelegramNotifier) postOnce(endpoint string, payload []byte) (time.Duration, error) {
	ctx, cancel := context.WithTimeout(context.Background(), telegramRequestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := telegramClient.Do(req)
	if err != nil {
		return 0, transientErrorf("network: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return 0, nil
	case resp.StatusCode == http.StatusTooManyRequests:
		return parseRetryAfter(resp.Header.Get("Retry-After")), transientErrorf("rate limited (429)")
	case resp.StatusCode >= 500:
		return 0, transientErrorf("server error %d", resp.StatusCode)
	default:
		return 0, fmt.Errorf("Telegram API rejected request with status %d", resp.StatusCode)
	}
}

func telegramBackoff(attempt int) time.Duration {
	d := telegramBaseBackoff << (attempt - 1)
	if d > telegramMaxBackoff {
		d = telegramMaxBackoff
	}
	return d
}

// SendOTP delivers a login OTP via Telegram. Mirrors Discord's formatting
// so users see equivalent context regardless of channel.
func (tn *TelegramNotifier) SendOTP(otp string) error {
	message := fmt.Sprintf("🔐 *Login OTP Code*: `%s`\n⏰ Expires in 5 minutes.\n_Requested at:_ `%s`",
		otp, time.Now().UTC().Format(time.RFC3339))
	return tn.SendMessage(message)
}

// SendBackupSuccess mirrors the Discord notifier's format.
func (tn *TelegramNotifier) SendBackupSuccess(dbName string, sizeBytes int64, duration string) error {
	message := fmt.Sprintf("✅ *Backup Completed*\n📊 Database: `%s`\n💾 Size: %s\n⏱️ Duration: %s",
		dbName, formatBytes(sizeBytes), duration)
	return tn.SendMessage(message)
}

func (tn *TelegramNotifier) SendBackupFailure(dbName, errorMsg string) error {
	message := fmt.Sprintf("❌ *Backup Failed*\n📊 Database: `%s`\n⚠️ Error: %s", dbName, errorMsg)
	return tn.SendMessage(message)
}

func (tn *TelegramNotifier) SendRestoreSuccess(dbName, targetDB string) error {
	message := fmt.Sprintf("✅ *Restore Completed*\n📊 Source: `%s`\n🎯 Target: `%s`", dbName, targetDB)
	return tn.SendMessage(message)
}

func (tn *TelegramNotifier) SendRestoreFailure(dbName, errorMsg string) error {
	message := fmt.Sprintf("❌ *Restore Failed*\n📊 Database: `%s`\n⚠️ Error: %s", dbName, errorMsg)
	return tn.SendMessage(message)
}

func (tn *TelegramNotifier) SendDownloadOTP(otp, backupName string) error {
	message := fmt.Sprintf("📥 *Backup Download Code*: `%s`\n📦 Backup: `%s`\n⏰ Expires in 5 minutes.\n_Requested at:_ `%s`",
		otp, backupName, time.Now().UTC().Format(time.RFC3339))
	return tn.SendMessage(message)
}

