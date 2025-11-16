package notification

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// DiscordMessage represents a Discord webhook message
type DiscordMessage struct {
	Content  string `json:"content"`
	Username string `json:"username,omitempty"`
}

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

// SendMessage sends a message to Discord webhook
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

	resp, err := http.Post(dn.webhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send Discord notification: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("Discord webhook returned status: %d", resp.StatusCode)
	}

	return nil
}

// SendOTP sends OTP via Discord webhook
func (dn *DiscordNotifier) SendOTP(otp string) error {
	message := fmt.Sprintf("🔐 **Login OTP Code**: `%s`\n⏰ This code expires in 5 minutes.\n\n_Requested at: %s_",
		otp,
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
