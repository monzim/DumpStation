// Package dbadmin provides safe, structured administrative operations against
// a remote PostgreSQL server: list/create/drop databases, list/create/drop
// roles, grant preset permissions, and inspect tables.
//
// The package uses database/sql + lib/pq rather than shelling out to psql so
// query results return as typed rows rather than text that has to be parsed.
// Every identifier (database / role names) is quoted with pq.QuoteIdentifier
// and every literal (passwords) with pq.QuoteLiteral — no SQL string
// concatenation of caller-supplied input anywhere.
package dbadmin

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/lib/pq" // postgres driver
)

// MaintenanceDB is the standard maintenance database we connect to when the
// caller hasn't asked for a specific target database.
const MaintenanceDB = "postgres"

// Options describes a connection target. Password is plaintext at this layer;
// the caller is responsible for decrypting it just-in-time.
type Options struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string // optional; defaults to MaintenanceDB
	SSLMode  string // empty → "prefer"; valid values per libpq
}

// Client wraps a pooled *sql.DB for a single (server, database) pair.
type Client struct {
	opts Options
	db   *sql.DB
}

// New opens a small connection pool to the given target and pings it. Callers
// must Close the client to release the pool.
func New(opts Options) (*Client, error) {
	if opts.DBName == "" {
		opts.DBName = MaintenanceDB
	}
	if opts.SSLMode == "" {
		opts.SSLMode = "prefer"
	}

	db, err := sql.Open("postgres", buildDSN(opts))
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}

	return &Client{opts: opts, db: db}, nil
}

// Close releases the underlying connection pool.
func (c *Client) Close() error {
	if c.db == nil {
		return nil
	}
	return c.db.Close()
}

// WithDatabase opens a separate Client for the same server but a different
// database. The caller owns the returned client and must Close it.
func (c *Client) WithDatabase(dbname string) (*Client, error) {
	opts := c.opts
	opts.DBName = dbname
	return New(opts)
}

// TestResult is returned from TryConnect.
type TestResult struct {
	SSLMode string
	Latency time.Duration
}

// TryConnect probes the target with the SSL ladder require → prefer →
// disable, returning the first mode that succeeds along with the round-trip
// latency. The caller's preferred SSLMode (if non-empty) is tried first and
// its outcome short-circuits the ladder.
func TryConnect(ctx context.Context, opts Options) (TestResult, error) {
	if opts.DBName == "" {
		opts.DBName = MaintenanceDB
	}

	ladder := []string{"require", "prefer", "disable"}
	if opts.SSLMode != "" {
		// Put the user's preference at the front of the ladder and
		// deduplicate the rest.
		preferred := opts.SSLMode
		out := []string{preferred}
		for _, m := range ladder {
			if m != preferred {
				out = append(out, m)
			}
		}
		ladder = out
	}

	var lastErr error
	for _, mode := range ladder {
		attempt := opts
		attempt.SSLMode = mode

		start := time.Now()
		db, err := sql.Open("postgres", buildDSN(attempt))
		if err != nil {
			lastErr = err
			continue
		}

		pingCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
		err = db.PingContext(pingCtx)
		cancel()
		_ = db.Close()

		if err == nil {
			return TestResult{SSLMode: mode, Latency: time.Since(start)}, nil
		}
		lastErr = err
	}

	if lastErr == nil {
		lastErr = errors.New("connection failed with no underlying error")
	}
	return TestResult{}, lastErr
}

// buildDSN composes a libpq URI from Options. Using the URI form sidesteps
// keyword-value escaping rules and is the cleanest path for passwords with
// punctuation.
func buildDSN(opts Options) string {
	host := opts.Host
	port := opts.Port
	if port == 0 {
		port = 5432
	}

	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(opts.User, opts.Password),
		Host:   fmt.Sprintf("%s:%d", host, port),
		Path:   "/" + opts.DBName,
	}
	q := u.Query()
	q.Set("sslmode", opts.SSLMode)
	q.Set("connect_timeout", "10")
	q.Set("application_name", "dumpstation-admin")
	u.RawQuery = q.Encode()
	return u.String()
}

// classifyPgError turns a few common pg errors into stable sentinels so the
// HTTP layer can map them to status codes without string-matching.
func classifyPgError(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "already exists"):
		return ErrAlreadyExists
	case strings.Contains(msg, "does not exist"):
		return ErrNotFound
	case strings.Contains(msg, "permission denied"):
		return ErrPermissionDenied
	}
	return err
}

// Sentinel errors. Wrap with %w when returning.
var (
	ErrAlreadyExists    = errors.New("already exists")
	ErrNotFound         = errors.New("not found")
	ErrPermissionDenied = errors.New("permission denied")
)
