package backup

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
)

// SSLMode represents the SSL connection mode
type SSLMode string

const (
	SSLModeRequire SSLMode = "require"
	SSLModeDisable SSLMode = "disable"
	SSLModePrefer  SSLMode = "prefer"
)

// SSLConnector handles automatic SSL fallback for database connections
type SSLConnector struct {
	Host     string
	Port     string
	Username string
	DBName   string
	Password string
}

// NewSSLConnector creates a new SSL connector
func NewSSLConnector(host, port, username, dbname, password string) *SSLConnector {
	return &SSLConnector{
		Host:     host,
		Port:     port,
		Username: username,
		DBName:   dbname,
		Password: password,
	}
}

// ExecuteWithSSLFallback executes a command trying with SSL first, then without SSL
// Returns the output, the SSL mode that worked, and any error
func (sc *SSLConnector) ExecuteWithSSLFallback(ctx context.Context, cmdName string, args []string) (string, SSLMode, error) {
	// Try with SSL first
	output, err := sc.executeCommand(ctx, cmdName, args, SSLModeRequire)
	if err == nil {
		log.Printf("Successfully connected with SSL mode: require")
		return output, SSLModeRequire, nil
	}

	// Check if error is SSL-related
	if sc.isSSLError(err.Error()) {
		log.Printf("SSL connection failed: %v. Attempting without SSL...", err)

		// Try without SSL
		output, err := sc.executeCommand(ctx, cmdName, args, SSLModeDisable)
		if err == nil {
			log.Printf("Successfully connected without SSL (SSL mode: disable)")
			return output, SSLModeDisable, nil
		}

		// Both attempts failed, return the SSL error as it's more specific
		return "", SSLModeRequire, fmt.Errorf("connection failed with SSL and without SSL. SSL error was: %v", err)
	}

	// Not an SSL error, just return the original error
	return "", SSLModeRequire, err
}

// executeCommand executes a PostgreSQL command with specified SSL mode.
// Stages credentials in a 0600 PGPASSFILE rather than the PGPASSWORD env
// variable so other processes cannot read the password through procfs.
func (sc *SSLConnector) executeCommand(ctx context.Context, cmdName string, args []string, sslMode SSLMode) (string, error) {
	passfilePath, err := sc.writePassFile()
	if err != nil {
		return "", err
	}
	defer os.Remove(passfilePath)

	cmd := exec.CommandContext(ctx, cmdName, args...)
	cmd.Env = append(os.Environ(),
		"PGPASSFILE="+passfilePath,
		fmt.Sprintf("PGSSLMODE=%s", sslMode),
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w: %s", err, stderr.String())
	}

	return stdout.String(), nil
}

// writePassFile materialises a libpq passfile from the connector's fields.
// Caller must remove the returned path when done.
func (sc *SSLConnector) writePassFile() (string, error) {
	f, err := os.CreateTemp("", "dumpstation-pgpass-*")
	if err != nil {
		return "", fmt.Errorf("create pgpass tempfile: %w", err)
	}
	defer f.Close()

	if err := f.Chmod(0o600); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("chmod pgpass: %w", err)
	}

	escape := func(s string) string {
		s = strings.ReplaceAll(s, `\`, `\\`)
		return strings.ReplaceAll(s, `:`, `\:`)
	}

	line := fmt.Sprintf("%s:%s:%s:%s:%s\n",
		escape(sc.Host),
		sc.Port,
		escape(sc.DBName),
		escape(sc.Username),
		escape(sc.Password),
	)

	if _, err := f.WriteString(line); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("write pgpass: %w", err)
	}

	return f.Name(), nil
}

// isSSLError checks if an error message indicates an SSL-related issue
func (sc *SSLConnector) isSSLError(errMsg string) bool {
	sslErrorPatterns := []string{
		"server does not support SSL",
		"ssl connection",
		"SSL",
		"certificate",
		"sslmode",
		"PGSSLMODE",
		"no password supplied",
		"FATAL",
	}

	lowerMsg := strings.ToLower(errMsg)
	for _, pattern := range sslErrorPatterns {
		if strings.Contains(lowerMsg, strings.ToLower(pattern)) {
			// Make sure it's actually an SSL-related error, not just any connection error
			if strings.Contains(lowerMsg, "ssl") || strings.Contains(lowerMsg, "certificate") || strings.Contains(lowerMsg, "does not support") {
				return true
			}
		}
	}

	return false
}

// GetConnectionString returns the psql connection string with specified SSL mode
func (sc *SSLConnector) GetConnectionString(sslMode SSLMode) string {
	return fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=%s",
		sc.Username, sc.Password, sc.Host, sc.Port, sc.DBName, sslMode)
}

// TestConnection tests the database connection with SSL fallback
// Returns the SSL mode that worked and any error
func (sc *SSLConnector) TestConnection(ctx context.Context) (SSLMode, error) {
	// Use psql to test connection
	args := []string{
		"--host", sc.Host,
		"--port", sc.Port,
		"--username", sc.Username,
		"--dbname", sc.DBName,
		"--no-password",
		"--command", "SELECT 1;",
	}

	_, sslMode, err := sc.ExecuteWithSSLFallback(ctx, "psql", args)
	return sslMode, err
}

// GetPSQLEnv returns environment variables for psql with the determined SSL
// mode. Callers that want to avoid PGPASSWORD entirely should use
// writePassFile + PGPASSFILE instead. This helper is retained for callers
// that build short-lived in-process commands where the env-var route is
// acceptable.
func (sc *SSLConnector) GetPSQLEnv(sslMode SSLMode) []string {
	return append(os.Environ(),
		"PGPASSWORD="+sc.Password,
		fmt.Sprintf("PGSSLMODE=%s", sslMode),
	)
}
