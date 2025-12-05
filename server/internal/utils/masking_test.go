package utils

import (
	"testing"
)

func TestMaskHostname(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"localhost", "localhost", "***"},
		{"simple domain", "db.example.com", "***.example.com"},
		{"subdomain", "my-server.internal.company.com", "***.internal.company.com"},
		{"IPv4 address", "192.168.1.100", "***.***.***.100"},
		{"IPv6 address", "2001:db8::1", "***:***:***:***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskHostname(tt.input)
			if result != tt.expected {
				t.Errorf("MaskHostname(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskUsername(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"short username", "ab", "***"},
		{"three char username", "adm", "***"},
		{"normal username", "admin", "adm***"},
		{"long username", "backup_user", "bac***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskUsername(tt.input)
			if result != tt.expected {
				t.Errorf("MaskUsername(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskDatabaseName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"short name", "db", "***"},
		{"three char name", "app", "***"},
		{"normal name", "production_db", "pro***"},
		{"long name", "my_application_database", "my_***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskDatabaseName(tt.input)
			if result != tt.expected {
				t.Errorf("MaskDatabaseName(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskPort(t *testing.T) {
	tests := []struct {
		name     string
		input    int
		expected string
	}{
		{"standard postgres port", 5432, "****"},
		{"custom port", 15432, "****"},
		{"mysql port", 3306, "****"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskPort(tt.input)
			if result != tt.expected {
				t.Errorf("MaskPort(%d) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskBucketName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"short bucket", "my", "***"},
		{"three char bucket", "app", "***"},
		{"normal bucket", "my-backup-bucket", "my-***"},
		{"long bucket", "production-backups-2024", "pro***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskBucketName(tt.input)
			if result != tt.expected {
				t.Errorf("MaskBucketName(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"R2 endpoint", "https://account-id.r2.cloudflarestorage.com", "https://***.r2.cloudflarestorage.com"},
		{"S3 endpoint", "https://s3.us-east-1.amazonaws.com", "https://***.us-east-1.amazonaws.com"},
		{"custom endpoint with path", "https://minio.example.com/path", "https://***.example.com/path"},
		{"http endpoint with port", "http://localhost:9000", "http://***:9000"},
		{"minio with port", "http://minio.local:9000", "http://***.local:9000"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskEndpoint(tt.input)
			if result != tt.expected {
				t.Errorf("MaskEndpoint(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskWebhookURL(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"discord webhook", "https://discord.com/api/webhooks/123456789/abcdefghijk", "https://discord.com/api/webhooks/***/***"},
		{"slack webhook", "https://hooks.slack.com/services/T00/B00/XXXX", "https://hooks.slack.com/***"},
		{"custom webhook", "https://webhook.example.com/notify", "https://webhook.example.com/***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskWebhookURL(tt.input)
			if result != tt.expected {
				t.Errorf("MaskWebhookURL(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestMaskAccessKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", "", ""},
		{"short key", "AK", "***"},
		{"three char key", "AKI", "***"},
		{"AWS access key", "AKIAIOSFODNN7EXAMPLE", "AKI***"},
		{"R2 access key", "abc123def456", "abc***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskAccessKey(tt.input)
			if result != tt.expected {
				t.Errorf("MaskAccessKey(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
