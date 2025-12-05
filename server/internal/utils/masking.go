package utils

import (
	"strings"
)

// MaskHostname masks a hostname for safe display in API responses.
// Examples:
//   - "db.example.com" → "***.example.com"
//   - "192.168.1.100" → "***.***.***.100"
//   - "localhost" → "***"
//   - "my-server.internal.company.com" → "***.internal.company.com"
func MaskHostname(host string) string {
	if host == "" {
		return ""
	}

	// Handle IP addresses
	if isIPAddress(host) {
		return maskIPAddress(host)
	}

	// Handle hostnames
	parts := strings.Split(host, ".")
	if len(parts) <= 1 {
		// Single word hostname (e.g., "localhost")
		return "***"
	}

	// Mask the first segment, keep the rest for context
	// e.g., "db.example.com" → "***.example.com"
	parts[0] = "***"
	return strings.Join(parts, ".")
}

// MaskUsername masks a username for safe display in API responses.
// Examples:
//   - "admin" → "adm***"
//   - "backup_user" → "bac***"
//   - "ab" → "***" (too short to partially mask)
func MaskUsername(username string) string {
	if username == "" {
		return ""
	}

	if len(username) <= 3 {
		return "***"
	}

	// Show first 3 characters, mask the rest
	return username[:3] + "***"
}

// MaskDatabaseName masks a database name for safe display.
// Examples:
//   - "production_db" → "pro***"
//   - "my_app" → "my_***"
func MaskDatabaseName(dbname string) string {
	if dbname == "" {
		return ""
	}

	if len(dbname) <= 3 {
		return "***"
	}

	// Show first 3 characters, mask the rest
	return dbname[:3] + "***"
}

// MaskPort returns a masked representation of a port.
// For security, we might want to hide the actual port in some contexts.
func MaskPort(port int) string {
	return "****"
}

// isIPAddress checks if the given string is an IP address (simple check)
func isIPAddress(host string) bool {
	// Check for IPv4 pattern (contains only digits and dots)
	hasOnlyValidChars := true
	dotCount := 0
	for _, c := range host {
		if c == '.' {
			dotCount++
		} else if c < '0' || c > '9' {
			hasOnlyValidChars = false
			break
		}
	}
	if hasOnlyValidChars && dotCount == 3 {
		return true
	}

	// Check for IPv6 pattern (contains colons)
	if strings.Contains(host, ":") {
		return true
	}

	return false
}

// maskIPAddress masks an IP address.
// IPv4: "192.168.1.100" → "***.***.***.100"
// IPv6: "2001:db8::1" → "***:***:***:***"
func maskIPAddress(ip string) string {
	if strings.Contains(ip, ":") {
		// IPv6 - just return masked version
		return "***:***:***:***"
	}

	// IPv4 - mask first three octets, show last for context
	parts := strings.Split(ip, ".")
	if len(parts) == 4 {
		return "***.***.***." + parts[3]
	}

	return "***"
}

// MaskBucketName masks a bucket name for safe display.
// Examples:
//   - "my-backup-bucket" → "my-***"
//   - "prod-storage" → "pro***"
func MaskBucketName(bucket string) string {
	if bucket == "" {
		return ""
	}

	if len(bucket) <= 3 {
		return "***"
	}

	// Show first 3 characters, mask the rest
	return bucket[:3] + "***"
}

// MaskEndpoint masks an S3/R2 endpoint URL for safe display.
// Examples:
//   - "https://account-id.r2.cloudflarestorage.com" → "https://***.r2.cloudflarestorage.com"
//   - "https://s3.us-east-1.amazonaws.com" → "https://s3.***.amazonaws.com"
func MaskEndpoint(endpoint string) string {
	if endpoint == "" {
		return ""
	}

	// Parse the URL to extract and mask sensitive parts
	// Remove protocol prefix for processing
	protocol := ""
	remaining := endpoint
	if strings.HasPrefix(endpoint, "https://") {
		protocol = "https://"
		remaining = strings.TrimPrefix(endpoint, "https://")
	} else if strings.HasPrefix(endpoint, "http://") {
		protocol = "http://"
		remaining = strings.TrimPrefix(endpoint, "http://")
	}

	// Split path from host
	parts := strings.SplitN(remaining, "/", 2)
	host := parts[0]
	path := ""
	if len(parts) > 1 {
		path = "/" + parts[1]
	}

	// Handle host:port format - separate port before masking
	hostPart := host
	portPart := ""
	if colonIdx := strings.LastIndex(host, ":"); colonIdx != -1 {
		// Check if it's a port (all digits after colon)
		potentialPort := host[colonIdx+1:]
		isPort := true
		for _, c := range potentialPort {
			if c < '0' || c > '9' {
				isPort = false
				break
			}
		}
		if isPort && len(potentialPort) > 0 {
			hostPart = host[:colonIdx]
			portPart = ":" + potentialPort
		}
	}

	// Mask the hostname part (keeping port separate)
	maskedHost := maskHostnameOnly(hostPart)

	return protocol + maskedHost + portPart + path
}

// maskHostnameOnly masks just the hostname without port handling
func maskHostnameOnly(host string) string {
	if host == "" {
		return ""
	}

	// Handle IP addresses
	if isIPAddress(host) {
		return maskIPAddress(host)
	}

	// Handle hostnames
	parts := strings.Split(host, ".")
	if len(parts) <= 1 {
		// Single word hostname (e.g., "localhost")
		return "***"
	}

	// Mask the first segment, keep the rest for context
	parts[0] = "***"
	return strings.Join(parts, ".")
}

// MaskWebhookURL masks a Discord webhook URL for safe display.
// Examples:
//   - "https://discord.com/api/webhooks/123456789/abcdefg" → "https://discord.com/api/webhooks/***/***/***"
func MaskWebhookURL(url string) string {
	if url == "" {
		return ""
	}

	// Discord webhook URL format: https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
	if strings.Contains(url, "discord.com/api/webhooks/") {
		// Keep the base URL, mask the webhook ID and token
		return "https://discord.com/api/webhooks/***/***"
	}

	// For other webhook URLs, mask everything after the domain
	if strings.HasPrefix(url, "https://") {
		remaining := strings.TrimPrefix(url, "https://")
		parts := strings.SplitN(remaining, "/", 2)
		if len(parts) > 1 {
			return "https://" + parts[0] + "/***"
		}
		return "https://" + MaskHostname(parts[0])
	}

	if strings.HasPrefix(url, "http://") {
		remaining := strings.TrimPrefix(url, "http://")
		parts := strings.SplitN(remaining, "/", 2)
		if len(parts) > 1 {
			return "http://" + parts[0] + "/***"
		}
		return "http://" + MaskHostname(parts[0])
	}

	return "***"
}

// MaskAccessKey masks an access key ID for safe display.
// Examples:
//   - "AKIAIOSFODNN7EXAMPLE" → "AKI***"
func MaskAccessKey(accessKey string) string {
	if accessKey == "" {
		return ""
	}

	if len(accessKey) <= 3 {
		return "***"
	}

	// Show first 3 characters (usually indicates key type like AKI for AWS)
	return accessKey[:3] + "***"
}
