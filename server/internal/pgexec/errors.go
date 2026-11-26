package pgexec

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// Error codes shared by the server, the agent and the UI. They let users see
// a specific cause ("authentication failed") instead of "backup failed".
const (
	CodeAuthFailed       = "auth_failed"
	CodeHostUnreachable  = "host_unreachable"
	CodeDatabaseNotFound = "database_not_found"
	CodePermission       = "permission_denied"
	CodeVersionMismatch  = "version_mismatch"
	CodeSSL              = "ssl_error"
	CodeDiskFull         = "insufficient_disk"
	CodeTimeout          = "timeout"
	CodeCancelled        = "cancelled"
	CodeToolMissing      = "tool_missing"
	CodeUploadFailed     = "upload_failed"
	CodeDownloadFailed   = "download_failed"
	CodeVerifyFailed     = "verification_failed"
	CodeStorageError     = "storage_error"
	CodeAgentUnavailable = "agent_unavailable"
	CodeAgentLost        = "agent_lost"
	CodeConfigError      = "configuration_error"
	CodeRestoreFailed    = "restore_failed"
	CodeDumpFailed       = "dump_failed"
	CodeInterrupted      = "interrupted"
	CodeExpired          = "expired"
	CodeUnknown          = "unknown"
)

// Error is a classified execution failure. Message is safe to show to users
// and never contains credentials; Detail carries a sanitized tool output tail.
type Error struct {
	Code    string
	Message string
	Detail  string
}

func (e *Error) Error() string {
	if e.Detail != "" {
		return e.Message + ": " + e.Detail
	}
	return e.Message
}

// AsError extracts an *Error, classifying unknown errors.
func AsError(err error) *Error {
	if err == nil {
		return nil
	}
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return &Error{Code: CodeTimeout, Message: "Operation exceeded its time limit"}
	case errors.Is(err, context.Canceled):
		return &Error{Code: CodeCancelled, Message: "Operation was cancelled"}
	}
	msg := err.Error()
	if strings.Contains(strings.ToLower(msg), "no space left on device") {
		return &Error{Code: CodeDiskFull, Message: "Insufficient temporary disk space", Detail: Sanitize(msg)}
	}
	return &Error{Code: CodeUnknown, Message: Sanitize(msg)}
}

var classifiers = []struct {
	needle  string
	code    string
	message string
}{
	{"password authentication failed", CodeAuthFailed, "Database authentication failed: check the username and password"},
	{"no password supplied", CodeAuthFailed, "Database authentication failed: no password was supplied"},
	{"no pg_hba.conf entry", CodeAuthFailed, "Connection rejected by pg_hba.conf on the database server"},
	{"role \"", CodeAuthFailed, "Database role does not exist"},
	{"could not translate host name", CodeHostUnreachable, "Database host name could not be resolved"},
	{"connection refused", CodeHostUnreachable, "Connection refused: is PostgreSQL listening on that host and port?"},
	{"no route to host", CodeHostUnreachable, "No network route to the database host"},
	{"timeout expired", CodeHostUnreachable, "Timed out connecting to the database host"},
	{"network is unreachable", CodeHostUnreachable, "Database network is unreachable"},
	{"server version mismatch", CodeVersionMismatch, "Installed pg_dump is older than the PostgreSQL server"},
	{"unsupported version", CodeVersionMismatch, "Backup file was produced by a newer pg_dump than the installed pg_restore"},
	{"permission denied", CodePermission, "The database user lacks permission to read some objects"},
	{"must be owner", CodePermission, "The database user must own the objects being restored"},
	{"no space left on device", CodeDiskFull, "Insufficient temporary disk space"},
	{"ssl", CodeSSL, "SSL negotiation with the database failed"},
	{"certificate", CodeSSL, "SSL certificate verification failed"},
}

// Classify maps tool stderr output to an *Error.
func Classify(stderr string, fallbackCode, fallbackMsg string) *Error {
	lower := strings.ToLower(stderr)
	detail := Sanitize(lastLines(stderr, 12))
	if strings.Contains(lower, "database \"") && strings.Contains(lower, "does not exist") {
		return &Error{Code: CodeDatabaseNotFound, Message: "Database does not exist on the server", Detail: detail}
	}
	for _, c := range classifiers {
		if strings.Contains(lower, c.needle) {
			if c.needle == "role \"" && !strings.Contains(lower, "does not exist") {
				continue
			}
			return &Error{Code: c.code, Message: c.message, Detail: detail}
		}
	}
	return &Error{Code: fallbackCode, Message: fallbackMsg, Detail: detail}
}

func lastLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// Sanitize trims output and strips anything resembling an inline credential
// (URIs with user:password@, password=... pairs).
func Sanitize(s string) string {
	s = strings.TrimSpace(s)
	s = uriCredRe.ReplaceAllString(s, "$1***@")
	s = kvPassRe.ReplaceAllString(s, "${1}***")
	if len(s) > 2000 {
		s = s[len(s)-2000:]
	}
	return s
}

// Errorf builds a classified error.
func Errorf(code, format string, args ...any) *Error {
	return &Error{Code: code, Message: fmt.Sprintf(format, args...)}
}
