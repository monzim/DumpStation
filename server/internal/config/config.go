package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all application configuration
type Config struct {
	Server    ServerConfig
	Database  DatabaseConfig
	JWT       JWTConfig
	Discord   DiscordConfig
	GitHub    GitHubConfig
	CORS      CORSConfig
	Turnstile TurnstileConfig
	Secret    SecretConfig
	WebOrigin string // Frontend origin used for OAuth redirect (e.g. http://localhost:3000)
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Port string
	Host string
}

// DatabaseConfig holds database connection configuration
type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// JWTConfig holds JWT configuration
type JWTConfig struct {
	Secret     string
	Expiration int // in minutes
}

// DiscordConfig holds Discord configuration
type DiscordConfig struct {
	WebhookURL    string // Single webhook for both OTP and notifications
	OTPExpiration int    // OTP expiration in minutes
}

// GitHubConfig holds GitHub OAuth configuration for the single-user login.
// Enabled flips true only when ClientID, ClientSecret, and AllowedLogin are
// all set, so deployments without GitHub OAuth keep using Discord-OTP.
type GitHubConfig struct {
	ClientID     string
	ClientSecret string
	AllowedLogin string // GitHub login (username) allowed to authenticate
	RedirectURL  string // Backend callback URL, e.g. https://api.example.com/api/v1/auth/github/callback
	Enabled      bool   // Derived from non-empty ClientID, ClientSecret, AllowedLogin
}

// SessionAbsoluteMaxHours is the hard ceiling on how long a single login can
// be refreshed for before the user must re-authenticate. Matches AWS-Console
// style sliding session with absolute cap.
const SessionAbsoluteMaxHours = 12

// CORSConfig holds CORS configuration
type CORSConfig struct {
	AllowedOrigins   []string // Comma-separated list of allowed origins
	AllowedMethods   []string // Comma-separated list of allowed HTTP methods
	AllowedHeaders   []string // Comma-separated list of allowed headers
	ExposedHeaders   []string // Comma-separated list of exposed headers
	AllowCredentials bool     // Whether to allow credentials
	MaxAge           int      // Preflight request cache duration in seconds
	Debug            bool     // Enable debug mode for CORS
}

// TurnstileConfig holds Cloudflare Turnstile configuration
type TurnstileConfig struct {
	SiteKey   string // Public key for frontend
	SecretKey string // Secret key for backend verification
	Enabled   bool   // Feature flag to enable/disable Turnstile
	Timeout   int    // Verification timeout in seconds
}

// SecretConfig holds keys for encrypting at-rest secrets such as the
// PostgreSQL server credentials the DB Servers feature stores.
type SecretConfig struct {
	// Key is the base64-encoded 32-byte AES key used by internal/crypto.
	// Generate with `openssl rand -base64 32`.
	Key string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
			Host: getEnv("SERVER_HOST", "0.0.0.0"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvAsInt("DB_PORT", 5432),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "backup_service"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", ""),
			Expiration: getEnvAsInt("JWT_EXPIRATION_MINUTES", 30),
		},
		Discord: DiscordConfig{
			WebhookURL:    getEnv("DISCORD_WEBHOOK_URL", ""),
			OTPExpiration: getEnvAsInt("OTP_EXPIRATION_MINUTES", 5),
		},
		GitHub: GitHubConfig{
			ClientID:     getEnv("GITHUB_CLIENT_ID", ""),
			ClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
			AllowedLogin: getEnv("GITHUB_ALLOWED_LOGIN", ""),
			RedirectURL:  getEnv("GITHUB_REDIRECT_URL", ""),
		},
		WebOrigin: getEnv("WEB_ORIGIN", ""),
		CORS: CORSConfig{
			AllowedOrigins:   getEnvAsSlice("CORS_ALLOWED_ORIGINS", []string{}),
			AllowedMethods:   getEnvAsSlice("CORS_ALLOWED_METHODS", []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"}),
			AllowedHeaders:   getEnvAsSlice("CORS_ALLOWED_HEADERS", []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With", "X-2FA-Token"}),
			ExposedHeaders:   getEnvAsSlice("CORS_EXPOSED_HEADERS", []string{}),
			AllowCredentials: getEnvAsBool("CORS_ALLOW_CREDENTIALS", true),
			MaxAge:           getEnvAsInt("CORS_MAX_AGE", 86400),
			Debug:            getEnvAsBool("CORS_DEBUG", false),
		},
		Turnstile: TurnstileConfig{
			SiteKey:   getEnv("TURNSTILE_SITE_KEY", ""),
			SecretKey: getEnv("TURNSTILE_SECRET_KEY", ""),
			Enabled:   getEnvAsBool("TURNSTILE_ENABLED", false),
			Timeout:   getEnvAsInt("TURNSTILE_TIMEOUT", 5),
		},
		Secret: SecretConfig{
			Key: getEnv("DUMPSTATION_SECRET_KEY", ""),
		},
	}

	// Validate required fields
	if cfg.JWT.Secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	if cfg.Database.Password == "" {
		return nil, fmt.Errorf("DB_PASSWORD is required")
	}

	if cfg.Secret.Key == "" {
		return nil, fmt.Errorf("DUMPSTATION_SECRET_KEY is required (generate with: openssl rand -base64 32)")
	}

	// Enable GitHub OAuth only when fully configured. We allow partial config
	// (e.g. missing redirect URL) to silently disable the feature rather than
	// crash the server, so Discord-OTP deployments keep working untouched.
	if cfg.GitHub.ClientID != "" && cfg.GitHub.ClientSecret != "" && cfg.GitHub.AllowedLogin != "" {
		cfg.GitHub.Enabled = true
		if cfg.GitHub.RedirectURL == "" {
			return nil, fmt.Errorf("GITHUB_REDIRECT_URL is required when GitHub OAuth is configured")
		}
		if cfg.WebOrigin == "" && len(cfg.CORS.AllowedOrigins) > 0 {
			cfg.WebOrigin = cfg.CORS.AllowedOrigins[0]
		}
		if cfg.WebOrigin == "" {
			return nil, fmt.Errorf("WEB_ORIGIN (or CORS_ALLOWED_ORIGINS) is required when GitHub OAuth is configured so the callback can redirect back to the frontend")
		}
	}

	// CORS sanity: a wildcard origin combined with credentials is a browser
	// rejection AND a misconfiguration that advertises an insecure policy.
	// Refuse to start instead of pretending it works.
	if cfg.CORS.AllowCredentials {
		for _, origin := range cfg.CORS.AllowedOrigins {
			if origin == "*" {
				return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS cannot contain \"*\" while CORS_ALLOW_CREDENTIALS=true; list explicit origins or disable credentials")
			}
		}
	}

	return cfg, nil
}

// GetDSN returns the PostgreSQL connection string
func (c *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode)
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvAsInt retrieves an environment variable as int or returns a default value
func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

// getEnvAsBool retrieves an environment variable as bool or returns a default value
func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseBool(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

// getEnvAsSlice retrieves an environment variable as a slice of strings (comma-separated)
func getEnvAsSlice(key string, defaultValue []string) []string {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}

	parts := strings.Split(valueStr, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}

	if len(result) == 0 {
		return defaultValue
	}
	return result
}
