package backup

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// VersionManager handles PostgreSQL version detection and management
type VersionManager struct {
	versionCache map[string]string // Cache detected versions
}

// NewVersionManager creates a new version manager
func NewVersionManager() *VersionManager {
	return &VersionManager{
		versionCache: make(map[string]string),
	}
}

// DetectPostgresVersion detects the PostgreSQL version of a database
func (vm *VersionManager) DetectPostgresVersion(dbConfig *models.DatabaseConfig) (string, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("%s:%d", dbConfig.Host, dbConfig.Port)
	if cached, exists := vm.versionCache[cacheKey]; exists {
		log.Printf("Using cached PostgreSQL version for %s: %s", dbConfig.Name, cached)
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Query PostgreSQL version
	cmd := exec.CommandContext(ctx, "psql",
		"--host", dbConfig.Host,
		"--port", fmt.Sprintf("%d", dbConfig.Port),
		"--username", dbConfig.Username,
		"--dbname", dbConfig.DBName,
		"--no-password",
		"--tuples-only",
		"--command", "SELECT version();",
	)

	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+dbConfig.Password,
		"PGSSLMODE=disable",
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to detect PostgreSQL version: %w, stderr: %s", err, stderr.String())
	}

	versionOutput := stdout.String()
	majorVersion := vm.ParseMajorVersion(versionOutput)

	// Cache the result
	vm.versionCache[cacheKey] = majorVersion

	log.Printf("Detected PostgreSQL version for %s: %s (full: %s)", dbConfig.Name, majorVersion, versionOutput)
	return majorVersion, nil
}

// ParseMajorVersion extracts the major version from PostgreSQL version string
// e.g., "PostgreSQL 14.5 on x86_64-pc-linux-gnu..." -> "14"
// or "15.2 (Ubuntu 15.2-1.pgdg20.04+1)" -> "15"
func (vm *VersionManager) ParseMajorVersion(versionOutput string) string {
	// Try different patterns
	patterns := []string{
		`PostgreSQL\s+(\d+)\.(\d+)`, // PostgreSQL 14.5
		`^[\s]*(\d+)\.(\d+)`,        // 14.5
		`(\d+)\.(\d+)`,              // Generic match
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(versionOutput)
		if len(matches) >= 2 {
			return matches[1] // Return major version only
		}
	}

	return "latest" // Fallback
}

// GetPgDumpVersion returns the pg_dump command with version-specific path if available
func (vm *VersionManager) GetPgDumpVersion(postgresVersion string) string {
	// Try to find version-specific pg_dump
	// Common installation paths for PostgreSQL versions:
	// /usr/lib/postgresql/14/bin/pg_dump
	// /usr/local/pgsql/14/bin/pg_dump
	// /opt/postgresql/14/bin/pg_dump
	// etc.

	// For "latest" or unknown, use the default pg_dump in PATH
	if postgresVersion == "latest" || postgresVersion == "" {
		return "pg_dump"
	}

	// Common paths to check (including Homebrew paths for macOS)
	commonPaths := []string{
		// Homebrew macOS paths
		fmt.Sprintf("/opt/homebrew/opt/postgresql@%s/bin/pg_dump", postgresVersion),
		fmt.Sprintf("/usr/local/opt/postgresql@%s/bin/pg_dump", postgresVersion),
		// Linux paths
		fmt.Sprintf("/usr/lib/postgresql/%s/bin/pg_dump", postgresVersion),
		fmt.Sprintf("/usr/local/pgsql/%s/bin/pg_dump", postgresVersion),
		fmt.Sprintf("/opt/postgresql/%s/bin/pg_dump", postgresVersion),
		// macOS direct installation
		fmt.Sprintf("/Library/PostgreSQL/%s/bin/pg_dump", postgresVersion),
		// Windows
		fmt.Sprintf("C:\\Program Files\\PostgreSQL\\%s\\bin\\pg_dump.exe", postgresVersion),
	}

	// Try each path
	for _, path := range commonPaths {
		if _, err := os.Stat(path); err == nil {
			log.Printf("Found pg_dump at: %s", path)
			return path
		}
	}

	// Fallback to PATH default
	log.Printf("Could not find version-specific pg_dump for version %s, using default", postgresVersion)
	return "pg_dump"
}

// GetPgRestoreVersion returns the pg_restore command with version-specific path if available
func (vm *VersionManager) GetPgRestoreVersion(postgresVersion string) string {
	if postgresVersion == "latest" || postgresVersion == "" {
		return "pg_restore"
	}

	// Common paths to check (including Homebrew paths for macOS)
	commonPaths := []string{
		// Homebrew macOS paths
		fmt.Sprintf("/opt/homebrew/opt/postgresql@%s/bin/pg_restore", postgresVersion),
		fmt.Sprintf("/usr/local/opt/postgresql@%s/bin/pg_restore", postgresVersion),
		// Linux paths
		fmt.Sprintf("/usr/lib/postgresql/%s/bin/pg_restore", postgresVersion),
		fmt.Sprintf("/usr/local/pgsql/%s/bin/pg_restore", postgresVersion),
		fmt.Sprintf("/opt/postgresql/%s/bin/pg_restore", postgresVersion),
		// macOS direct installation
		fmt.Sprintf("/Library/PostgreSQL/%s/bin/pg_restore", postgresVersion),
		// Windows
		fmt.Sprintf("C:\\Program Files\\PostgreSQL\\%s\\bin\\pg_restore.exe", postgresVersion),
	}

	for _, path := range commonPaths {
		if _, err := os.Stat(path); err == nil {
			log.Printf("Found pg_restore at: %s", path)
			return path
		}
	}

	log.Printf("Could not find version-specific pg_restore for version %s, using default", postgresVersion)
	return "pg_restore"
}

// GetPsqlVersion returns the psql command with version-specific path if available
func (vm *VersionManager) GetPsqlVersion(postgresVersion string) string {
	if postgresVersion == "latest" || postgresVersion == "" {
		return "psql"
	}

	// Common paths to check (including Homebrew paths for macOS)
	commonPaths := []string{
		// Homebrew macOS paths
		fmt.Sprintf("/opt/homebrew/opt/postgresql@%s/bin/psql", postgresVersion),
		fmt.Sprintf("/usr/local/opt/postgresql@%s/bin/psql", postgresVersion),
		// Linux paths
		fmt.Sprintf("/usr/lib/postgresql/%s/bin/psql", postgresVersion),
		fmt.Sprintf("/usr/local/pgsql/%s/bin/psql", postgresVersion),
		fmt.Sprintf("/opt/postgresql/%s/bin/psql", postgresVersion),
		// macOS direct installation
		fmt.Sprintf("/Library/PostgreSQL/%s/bin/psql", postgresVersion),
		// Windows
		fmt.Sprintf("C:\\Program Files\\PostgreSQL\\%s\\bin\\psql.exe", postgresVersion),
	}

	for _, path := range commonPaths {
		if _, err := os.Stat(path); err == nil {
			log.Printf("Found psql at: %s", path)
			return path
		}
	}

	log.Printf("Could not find version-specific psql for version %s, using default", postgresVersion)
	return "psql"
}

// IsCompatibleVersion checks if the pg_dump version is compatible with the database
func (vm *VersionManager) IsCompatibleVersion(pgDumpVersion string, dbVersion string) bool {
	// Parse major versions
	dumpMajor := vm.ExtractMajorVersion(pgDumpVersion)
	dbMajor := vm.ExtractMajorVersion(dbVersion)

	// PostgreSQL generally supports dumping from older versions
	// and restoring to same or newer versions (with some limitations)
	dumpMajorInt, _ := strconv.Atoi(dumpMajor)
	dbMajorInt, _ := strconv.Atoi(dbMajor)

	// Best practice: pg_dump should be >= database version for safe backups
	// Allow 1 version difference for testing
	return dumpMajorInt >= (dbMajorInt - 1)
}

// ExtractMajorVersion extracts just the major version number
func (vm *VersionManager) ExtractMajorVersion(version string) string {
	re := regexp.MustCompile(`(\d+)`)
	matches := re.FindStringSubmatch(version)
	if len(matches) > 0 {
		return matches[1]
	}
	return "0"
}

// GetPgDumpVersionInfo returns version information about the pg_dump binary
func (vm *VersionManager) GetPgDumpVersionInfo(pgDumpCmd string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, pgDumpCmd, "--version")

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to get pg_dump version: %w", err)
	}

	return stdout.String(), nil
}

// extractMajorVersion extracts just the major version number
func (vm *VersionManager) extractMajorVersion(version string) string {
	re := regexp.MustCompile(`(\d+)`)
	matches := re.FindStringSubmatch(version)
	if len(matches) > 0 {
		return matches[1]
	}
	return "0"
}

// GetDumpFormatForVersion returns the recommended dump format for a PostgreSQL version
func (vm *VersionManager) GetDumpFormatForVersion(postgresVersion string) string {
	// Modern PostgreSQL versions (13+) support custom format more efficiently
	major, _ := strconv.Atoi(vm.ExtractMajorVersion(postgresVersion))

	if major >= 13 {
		return "custom" // -Fc for custom format (compressed, more efficient)
	}

	// Older versions: use plain text for better compatibility
	return "plain"
}

// GetDumpCompressionLevel returns compression level based on version
func (vm *VersionManager) GetDumpCompressionLevel(postgresVersion string) string {
	// Modern versions support better compression
	major, _ := strconv.Atoi(vm.ExtractMajorVersion(postgresVersion))

	if major >= 14 {
		return "9" // Maximum compression
	} else if major >= 12 {
		return "6" // Medium compression
	}

	return "3" // Conservative compression for older versions
}
