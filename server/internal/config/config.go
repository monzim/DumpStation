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
	CORS      CORSConfig
	Turnstile TurnstileConfig
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
			Expiration: getEnvAsInt("JWT_EXPIRATION_MINUTES", 10),
		},
		Discord: DiscordConfig{
			WebhookURL:    getEnv("DISCORD_WEBHOOK_URL", ""),
			OTPExpiration: getEnvAsInt("OTP_EXPIRATION_MINUTES", 5),
		},
		CORS: CORSConfig{
			AllowedOrigins:   getEnvAsSlice("CORS_ALLOWED_ORIGINS", []string{"*"}),
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
			Timeout:   getEnvAsInt("TURNSTILE_TIMEOUT", 10),
		},
	}

	// Validate required fields
	if cfg.JWT.Secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	if cfg.Database.Password == "" {
		return nil, fmt.Errorf("DB_PASSWORD is required")
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
