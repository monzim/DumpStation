package pgexec

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Conn describes a PostgreSQL connection. Password is optional (peer/trust
// auth or a libpq service file may be used instead).
type Conn struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password,omitempty"`
	// SSLMode is a libpq sslmode. Empty means "prefer", which tries SSL
	// first and falls back to plaintext (the v1 behaviour, without running
	// the tool twice).
	SSLMode string `json:"sslmode,omitempty"`
}

// Validate checks required fields and rejects values that could be
// misinterpreted as command-line options.
func (c Conn) Validate() error {
	if c.Host == "" || c.Database == "" || c.User == "" {
		return Errorf(CodeConfigError, "host, database and user are required")
	}
	for _, v := range []string{c.Host, c.Database, c.User} {
		if strings.HasPrefix(v, "-") || strings.ContainsAny(v, "\x00\n\r") {
			return Errorf(CodeConfigError, "connection fields must not start with '-' or contain control characters")
		}
	}
	// libpq treats a dbname containing '=' or a URI scheme as a full
	// connection string, which could redirect the connection.
	if strings.Contains(c.Database, "=") || strings.Contains(c.Database, "://") {
		return Errorf(CodeConfigError, "database name must be a plain name")
	}
	// Host must be a network host, not a Unix socket directory or a list.
	if strings.HasPrefix(c.Host, "/") || strings.HasPrefix(c.Host, "@") || strings.ContainsAny(c.Host, ", ") {
		return Errorf(CodeConfigError, "host must be a single hostname or IP address")
	}
	if c.Port < 0 || c.Port > 65535 {
		return Errorf(CodeConfigError, "port out of range")
	}
	switch c.SSLMode {
	case "", "disable", "allow", "prefer", "require", "verify-ca", "verify-full":
	default:
		return Errorf(CodeConfigError, "invalid sslmode %q", c.SSLMode)
	}
	return nil
}

func (c Conn) port() int {
	if c.Port == 0 {
		return 5432
	}
	return c.Port
}

// Redacted returns a display string without the password.
func (c Conn) Redacted() string {
	return fmt.Sprintf("%s@%s:%d/%s", c.User, c.Host, c.port(), c.Database)
}

// ParseURL parses postgres://user:pass@host:port/db?sslmode=... into a Conn.
func ParseURL(raw string) (Conn, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return Conn{}, Errorf(CodeConfigError, "connection URL must start with postgres://")
	}
	c := Conn{Host: u.Hostname(), Database: strings.TrimPrefix(u.Path, "/")}
	if p := u.Port(); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil {
			return Conn{}, Errorf(CodeConfigError, "invalid port in connection URL")
		}
		c.Port = n
	}
	if u.User != nil {
		c.User = u.User.Username()
		c.Password, _ = u.User.Password()
	}
	c.SSLMode = u.Query().Get("sslmode")
	return c, c.Validate()
}

// Runner executes PostgreSQL client tools.
type Runner struct {
	Tools   *Toolset
	TempDir string
	// HostPolicy, when set, is consulted before every connection. The
	// server uses it to restrict direct connections to allowed networks.
	HostPolicy func(host string) error
}

// NewRunner discovers installed tools. tempDir "" uses os.TempDir().
func NewRunner(tempDir string) *Runner {
	return &Runner{Tools: DiscoverTools(), TempDir: tempDir}
}

func (r *Runner) tempDir() string {
	if r.TempDir != "" {
		return r.TempDir
	}
	return os.TempDir()
}

// writePassfile writes a libpq passfile (mode 0600) and returns its path.
func (r *Runner) writePassfile(c Conn) (string, error) {
	f, err := os.CreateTemp(r.tempDir(), "dumpstation-pgpass-*")
	if err != nil {
		return "", AsError(fmt.Errorf("create passfile: %w", err))
	}
	defer f.Close()
	if err := f.Chmod(0o600); err != nil {
		_ = os.Remove(f.Name())
		return "", AsError(err)
	}
	esc := func(s string) string {
		s = strings.ReplaceAll(s, `\`, `\\`)
		return strings.ReplaceAll(s, `:`, `\:`)
	}
	// Exact host/port/database entry: the password is only ever offered to
	// the server it belongs to.
	line := fmt.Sprintf("%s:%d:%s:%s:%s\n", esc(c.Host), c.port(), esc(c.Database), esc(c.User), esc(c.Password))
	if _, err := f.WriteString(line); err != nil {
		_ = os.Remove(f.Name())
		return "", AsError(err)
	}
	return f.Name(), nil
}

// command builds an exec.Cmd with a scrubbed libpq environment.
func (r *Runner) command(ctx context.Context, bin string, c Conn, passfile string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, bin, args...)
	env := make([]string, 0, len(os.Environ())+4)
	for _, kv := range os.Environ() {
		// Never inherit libpq settings that could redirect the connection
		// or leak a password from the host environment.
		if strings.HasPrefix(kv, "PG") {
			continue
		}
		env = append(env, kv)
	}
	ssl := c.SSLMode
	if ssl == "" {
		ssl = "prefer"
	}
	env = append(env, "PGSSLMODE="+ssl, "PGCONNECT_TIMEOUT=15", "PGAPPNAME=dumpstation")
	if passfile != "" {
		env = append(env, "PGPASSFILE="+passfile)
	}
	cmd.Env = env
	cmd.WaitDelay = 10 * time.Second
	bindToParent(cmd)
	return cmd
}

func connArgs(c Conn) []string {
	return []string{"--host", c.Host, "--port", strconv.Itoa(c.port()), "--username", c.User, "--no-password"}
}

// ServerVersion returns the server's version number (e.g. 160004) and
// human-readable version string.
func (r *Runner) ServerVersion(ctx context.Context, c Conn) (int, string, error) {
	if err := c.Validate(); err != nil {
		return 0, "", err
	}
	if r.HostPolicy != nil {
		if err := r.HostPolicy(c.Host); err != nil {
			return 0, "", &Error{Code: CodeConfigError, Message: err.Error()}
		}
	}
	psql, _, err := r.Tools.Pick("psql", 0)
	if err != nil {
		return 0, "", err
	}
	pass, err := r.writePassfile(c)
	if err != nil {
		return 0, "", err
	}
	defer os.Remove(pass)
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	args := append(connArgs(c), "--dbname", c.Database, "-X", "-A", "-t", "-c",
		"SELECT current_setting('server_version_num') || '|' || current_setting('server_version')")
	cmd := r.command(ctx, psql, c, pass, args...)
	stderr := newRing(16 << 10)
	cmd.Stderr = stderr
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return 0, "", AsError(ctx.Err())
		}
		return 0, "", Classify(stderr.String(), CodeUnknown, "Could not connect to the database")
	}
	parts := strings.SplitN(strings.TrimSpace(string(out)), "|", 2)
	num, convErr := strconv.Atoi(parts[0])
	if convErr != nil {
		return 0, "", Errorf(CodeUnknown, "unexpected server version output")
	}
	ver := ""
	if len(parts) == 2 {
		ver = parts[1]
	}
	return num, ver, nil
}

// MajorFromNum converts server_version_num to a major version (160004 -> 16,
// 90624 -> 9).
func MajorFromNum(num int) int {
	if num >= 100000 {
		return num / 10000
	}
	return num / 10000
}

// TestResult reports a connection test.
type TestResult struct {
	OK            bool   `json:"ok"`
	ServerVersion string `json:"server_version,omitempty"`
	ServerMajor   int    `json:"server_major,omitempty"`
	ClientMajor   int    `json:"client_major,omitempty"`
	LatencyMS     int64  `json:"latency_ms"`
	Code          string `json:"code,omitempty"`
	Message       string `json:"message"`
}

// TestConnection connects, reads the server version and checks a compatible
// pg_dump is installed.
func (r *Runner) TestConnection(ctx context.Context, c Conn) TestResult {
	start := time.Now()
	num, ver, err := r.ServerVersion(ctx, c)
	res := TestResult{LatencyMS: time.Since(start).Milliseconds()}
	if err != nil {
		e := AsError(err)
		res.Code, res.Message = e.Code, e.Message
		if e.Detail != "" {
			res.Message += " (" + firstLine(e.Detail) + ")"
		}
		return res
	}
	res.ServerVersion = ver
	res.ServerMajor = MajorFromNum(num)
	_, client, perr := r.Tools.Pick("pg_dump", res.ServerMajor)
	if perr != nil {
		e := AsError(perr)
		res.Code, res.Message = e.Code, e.Message
		return res
	}
	res.OK = true
	res.ClientMajor = client
	res.Message = fmt.Sprintf("Connected to PostgreSQL %s", ver)
	return res
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// DumpResult describes a finished dump.
type DumpResult struct {
	Path          string
	Size          int64
	SHA256        string
	Format        string // always "custom" for new backups
	ServerVersion string
	ServerMajor   int
	ClientMajor   int
	Duration      time.Duration
}

// DumpOptions tunes a dump.
type DumpOptions struct {
	// Compression is the pg_dump -Z level (0-9). Default 6.
	Compression int
	// MinFreeBytes aborts before dumping when the temp dir has less free
	// space. 0 disables the check.
	MinFreeBytes uint64
}

// Dump runs pg_dump in custom format into a new temp file and returns its
// path, size and SHA-256. The caller must remove Path. The dump is written
// to disk (not memory), so memory use stays bounded for any database size.
func (r *Runner) Dump(ctx context.Context, c Conn, opts DumpOptions) (*DumpResult, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	start := time.Now()
	num, ver, err := r.ServerVersion(ctx, c)
	if err != nil {
		return nil, err
	}
	major := MajorFromNum(num)
	pgDump, client, err := r.Tools.Pick("pg_dump", major)
	if err != nil {
		return nil, err
	}
	if opts.MinFreeBytes > 0 {
		if free, ok := FreeBytes(r.tempDir()); ok && free < opts.MinFreeBytes {
			return nil, &Error{Code: CodeDiskFull, Message: fmt.Sprintf(
				"Insufficient temporary disk space: %d MiB free, %d MiB required", free>>20, opts.MinFreeBytes>>20)}
		}
	}
	z := opts.Compression
	if z <= 0 || z > 9 {
		z = 6
	}
	pass, err := r.writePassfile(c)
	if err != nil {
		return nil, err
	}
	defer os.Remove(pass)

	out, err := os.CreateTemp(r.tempDir(), "dumpstation-*.dump")
	if err != nil {
		return nil, AsError(fmt.Errorf("create temp file: %w", err))
	}
	path := out.Name()
	ok := false
	defer func() {
		out.Close()
		if !ok {
			_ = os.Remove(path)
		}
	}()

	h := sha256.New()
	cw := &countingWriter{w: io.MultiWriter(out, h)}
	args := append(connArgs(c), "--dbname", c.Database, "--format=custom", "-Z", strconv.Itoa(z))
	cmd := r.command(ctx, pgDump, c, pass, args...)
	stderr := newRing(64 << 10)
	cmd.Stdout = cw
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, AsError(ctx.Err())
		}
		var ee *exec.ExitError
		if !errors.As(err, &ee) {
			return nil, AsError(err)
		}
		return nil, Classify(stderr.String(), CodeDumpFailed, "pg_dump failed")
	}
	if err := out.Sync(); err != nil {
		return nil, AsError(err)
	}
	if cw.n == 0 {
		return nil, Errorf(CodeDumpFailed, "pg_dump produced an empty file")
	}
	ok = true
	return &DumpResult{
		Path: path, Size: cw.n, SHA256: hex.EncodeToString(h.Sum(nil)), Format: "custom",
		ServerVersion: ver, ServerMajor: major, ClientMajor: client, Duration: time.Since(start),
	}, nil
}

type countingWriter struct {
	w io.Writer
	n int64
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.w.Write(p)
	c.n += int64(n)
	return n, err
}

// RestoreOptions tunes a restore.
type RestoreOptions struct {
	// Format is "custom" (pg_restore) or "plain" (psql).
	Format string
	// Clean drops existing objects before recreating them. Destructive.
	Clean bool
}

// Restore applies the dump at path to the target connection.
//
// Custom-format archives are restored with pg_restore --dbname, which sends
// SQL over libpq and never interprets psql meta-commands, so a tampered
// artifact cannot execute programs on the restoring host. Benign errors
// caused by restoring an archive from a newer pg_dump into an older server
// (unknown session settings such as transaction_timeout) are tolerated;
// any other error fails the restore.
//
// Plain-format dumps (legacy v1 backups of PostgreSQL < 13) need psql. They
// are streamed through a filter that rejects every backslash meta-command
// outside COPY data, and psql runs with ON_ERROR_STOP.
func (r *Runner) Restore(ctx context.Context, c Conn, path string, opts RestoreOptions) error {
	if err := c.Validate(); err != nil {
		return err
	}
	num, _, err := r.ServerVersion(ctx, c)
	if err != nil {
		return err
	}
	major := MajorFromNum(num)
	pass, err := r.writePassfile(c)
	if err != nil {
		return err
	}
	defer os.Remove(pass)

	if opts.Format == "custom" {
		bin, _, perr := r.Tools.Pick("pg_restore", 0)
		if perr != nil {
			return perr
		}
		args := append(connArgs(c), "--dbname", c.Database, "--no-owner", "--no-privileges")
		if opts.Clean {
			args = append(args, "--clean", "--if-exists")
		}
		args = append(args, "--", path)
		cmd := r.command(ctx, bin, c, pass, args...)
		stderr := newRing(256 << 10)
		cmd.Stderr = stderr
		cmd.Stdout = io.Discard
		if err := cmd.Run(); err != nil {
			if ctx.Err() != nil {
				return AsError(ctx.Err())
			}
			if onlyBenignRestoreErrors(stderr.String(), major) {
				return nil
			}
			return Classify(stderr.String(), CodeRestoreFailed, "Restore failed")
		}
		return nil
	}

	psqlBin, _, perr := r.Tools.Pick("psql", 0)
	if perr != nil {
		return perr
	}
	psqlArgs := append(connArgs(c), "--dbname", c.Database, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-")
	psql := r.command(ctx, psqlBin, c, pass, psqlArgs...)
	psqlErr := newRing(64 << 10)
	psql.Stderr = psqlErr
	psql.Stdout = io.Discard
	stdin, err := psql.StdinPipe()
	if err != nil {
		return AsError(err)
	}
	src, err := os.Open(path)
	if err != nil {
		return AsError(err)
	}
	defer src.Close()
	if err := psql.Start(); err != nil {
		return AsError(err)
	}
	copyErr := filterSQL(src, stdin, major)
	if copyErr != nil {
		// Abort psql before it executes anything further.
		_ = psql.Process.Kill()
	}
	stdin.Close()
	psqlRunErr := psql.Wait()
	if ctx.Err() != nil {
		return AsError(ctx.Err())
	}
	var unsafe *Error
	if errors.As(copyErr, &unsafe) {
		return unsafe
	}
	if psqlRunErr != nil {
		return Classify(psqlErr.String(), CodeRestoreFailed, "Restore failed")
	}
	if copyErr != nil && !errors.Is(copyErr, io.ErrClosedPipe) {
		return AsError(copyErr)
	}
	return nil
}

// onlyBenignRestoreErrors reports whether every error pg_restore printed is
// an unknown-setting error expected when restoring into an older server.
func onlyBenignRestoreErrors(stderr string, targetMajor int) bool {
	errs := 0
	for _, line := range strings.Split(stderr, "\n") {
		if !strings.Contains(line, "ERROR:") {
			continue
		}
		errs++
		if targetMajor < 17 && strings.Contains(line, `unrecognized configuration parameter "transaction_timeout"`) {
			continue
		}
		return false
	}
	return errs > 0
}

// filterSQL streams SQL from src to dst, dropping session settings that the
// target server version does not support. Lines are copied verbatim
// otherwise (COPY data included).
func filterSQL(src io.Reader, dst io.Writer, targetMajor int) error {
	br := bufio.NewReaderSize(src, 256<<10)
	bw := bufio.NewWriterSize(dst, 256<<10)
	inCopy := false
	for {
		line, err := br.ReadSlice('\n')
		if errors.Is(err, bufio.ErrBufferFull) {
			// Very long line (large COPY row): pass through in chunks.
			if _, werr := bw.Write(line); werr != nil {
				return werr
			}
			for errors.Is(err, bufio.ErrBufferFull) {
				line, err = br.ReadSlice('\n')
				if _, werr := bw.Write(line); werr != nil {
					return werr
				}
			}
		} else if len(line) > 0 {
			drop := false
			if !inCopy && len(line) > 0 && line[0] == '\\' {
				// psql meta-command (\!, \o, \copy, \i, ...). pg_dump only emits
				// \restrict / \unrestrict, which tighten psql; anything else
				// means the artifact was tampered with.
				if !bytes.HasPrefix(line, []byte("\\restrict ")) && !bytes.HasPrefix(line, []byte("\\unrestrict ")) {
					return &Error{Code: CodeVerifyFailed, Message: "Refusing to restore: the dump contains psql meta-commands that pg_dump never produces"}
				}
			}
			if !inCopy {
				if targetMajor > 0 && targetMajor < 17 && bytes.HasPrefix(line, []byte("SET transaction_timeout")) {
					drop = true
				}
				if bytes.HasPrefix(line, []byte("COPY ")) && bytes.Contains(line, []byte("FROM stdin;")) {
					inCopy = true
				}
			} else if bytes.Equal(bytes.TrimRight(line, "\r\n"), []byte("\\.")) {
				inCopy = false
			}
			if !drop {
				if _, werr := bw.Write(line); werr != nil {
					return werr
				}
			}
		}
		if err == io.EOF {
			return bw.Flush()
		}
		if err != nil && !errors.Is(err, bufio.ErrBufferFull) {
			return err
		}
	}
}

// HashFile returns the SHA-256 of a file.
func HashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	var h hash.Hash = sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// DetectFormat inspects a dump file's header: custom archives start with "PGDMP".
func DetectFormat(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return "plain"
	}
	defer f.Close()
	head := make([]byte, 5)
	if n, _ := io.ReadFull(f, head); n == 5 && string(head) == "PGDMP" {
		return "custom"
	}
	return "plain"
}
