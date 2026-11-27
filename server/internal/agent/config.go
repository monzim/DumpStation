// Package agent implements the DumpStation Agent: a lightweight execution
// worker that runs next to private PostgreSQL databases, polls the
// DumpStation server over outbound HTTPS, and executes only the job kinds
// defined in agentproto (backup, restore, connection test).
package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	yaml "go.yaml.in/yaml/v3"
)

// Config is the agent's runtime configuration (environment driven).
type Config struct {
	ServerURL       string
	EnrollmentToken string
	Credential      string // optional: provide a credential directly
	StateDir        string
	ConnectionsFile string
	AllowRestore    bool
	MaxConcurrency  int
	TransferMode    string // auto | direct | proxy
	TempDir         string
	MinFreeBytes    uint64
	CAFile          string
	InsecureTLS     bool
	ShutdownGrace   time.Duration
}

func env(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}

func envBool(k string, d bool) bool {
	if v := os.Getenv(k); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return d
}

func envInt(k string, d int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return d
}

// secretEnv reads K or the file named by K_FILE (Docker/Kubernetes secrets).
func secretEnv(k string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	if f := os.Getenv(k + "_FILE"); f != "" {
		if b, err := os.ReadFile(f); err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

// LoadConfig reads configuration from the environment.
func LoadConfig() (*Config, error) {
	c := &Config{
		ServerURL:       strings.TrimRight(env("DUMPSTATION_SERVER_URL", ""), "/"),
		EnrollmentToken: secretEnv("DUMPSTATION_ENROLLMENT_TOKEN"),
		Credential:      secretEnv("DUMPSTATION_AGENT_CREDENTIAL"),
		StateDir:        env("DUMPSTATION_STATE_DIR", "/var/lib/dumpstation-agent"),
		ConnectionsFile: env("DUMPSTATION_CONNECTIONS_FILE", "/etc/dumpstation-agent/connections.yaml"),
		AllowRestore:    envBool("DUMPSTATION_ALLOW_RESTORE", false),
		MaxConcurrency:  envInt("DUMPSTATION_MAX_CONCURRENCY", 1),
		TransferMode:    env("DUMPSTATION_TRANSFER_MODE", "auto"),
		TempDir:         env("DUMPSTATION_TEMP_DIR", os.TempDir()),
		MinFreeBytes:    uint64(envInt("DUMPSTATION_MIN_FREE_MB", 0)) << 20,
		CAFile:          env("DUMPSTATION_CA_FILE", ""),
		InsecureTLS:     envBool("DUMPSTATION_INSECURE_SKIP_VERIFY", false),
		ShutdownGrace:   time.Duration(envInt("DUMPSTATION_SHUTDOWN_GRACE_SECONDS", 30)) * time.Second,
	}
	if c.ServerURL == "" {
		return nil, fmt.Errorf("DUMPSTATION_SERVER_URL is required")
	}
	u, err := url.Parse(c.ServerURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil, fmt.Errorf("DUMPSTATION_SERVER_URL must be an http(s) URL")
	}
	if c.MaxConcurrency < 1 {
		c.MaxConcurrency = 1
	}
	if c.MaxConcurrency > 16 {
		c.MaxConcurrency = 16
	}
	switch c.TransferMode {
	case "auto", agentproto.TransferDirect, agentproto.TransferProxy:
	default:
		return nil, fmt.Errorf("DUMPSTATION_TRANSFER_MODE must be auto, direct or proxy")
	}
	return c, nil
}

// connectionSpec is one entry in the connections file.
type connectionSpec struct {
	URL          string `yaml:"url" json:"url"`
	Host         string `yaml:"host" json:"host"`
	Port         int    `yaml:"port" json:"port"`
	Database     string `yaml:"database" json:"database"`
	User         string `yaml:"user" json:"user"`
	Password     string `yaml:"password" json:"password"`
	PasswordFile string `yaml:"password_file" json:"password_file"`
	PasswordEnv  string `yaml:"password_env" json:"password_env"`
	SSLMode      string `yaml:"sslmode" json:"sslmode"`
}

type connectionsFile struct {
	Connections map[string]connectionSpec `yaml:"connections" json:"connections"`
}

// Connections resolves locally defined database connections. Credentials
// stay inside the agent's environment and are never sent to the server.
type Connections struct {
	byName map[string]pgexec.Conn
}

func (s connectionSpec) resolve() (pgexec.Conn, error) {
	var c pgexec.Conn
	var err error
	if s.URL != "" {
		if c, err = pgexec.ParseURL(s.URL); err != nil {
			return c, err
		}
	}
	if s.Host != "" {
		c.Host = s.Host
	}
	if s.Port != 0 {
		c.Port = s.Port
	}
	if s.Database != "" {
		c.Database = s.Database
	}
	if s.User != "" {
		c.User = s.User
	}
	if s.SSLMode != "" {
		c.SSLMode = s.SSLMode
	}
	switch {
	case s.PasswordFile != "":
		b, err := os.ReadFile(s.PasswordFile)
		if err != nil {
			return c, fmt.Errorf("read password_file: %w", err)
		}
		c.Password = strings.TrimRight(string(b), "\r\n")
	case s.PasswordEnv != "":
		c.Password = os.Getenv(s.PasswordEnv)
	case s.Password != "":
		c.Password = s.Password
	}
	return c, c.Validate()
}

var validName = func(n string) bool {
	if n == "" || len(n) > 128 {
		return false
	}
	for _, r := range n {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.') {
			return false
		}
	}
	return true
}

// LoadConnections reads the connections file (YAML or JSON) and
// DUMPSTATION_CONN_<NAME>=postgres://... environment variables. A
// DUMPSTATION_CONN_<NAME>_PASSWORD_FILE overrides the URL's password.
func LoadConnections(path string) (*Connections, []string, error) {
	out := &Connections{byName: map[string]pgexec.Conn{}}
	var warnings []string
	if b, err := os.ReadFile(path); err == nil {
		var f connectionsFile
		if err := yaml.Unmarshal(b, &f); err != nil {
			return nil, nil, fmt.Errorf("parse %s: %w", path, err)
		}
		for name, spec := range f.Connections {
			if !validName(name) {
				warnings = append(warnings, fmt.Sprintf("connection %q: invalid name (use letters, digits, - _ .)", name))
				continue
			}
			c, err := spec.resolve()
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("connection %q: %v", name, err))
				continue
			}
			out.byName[name] = c
		}
	} else if !os.IsNotExist(err) {
		return nil, nil, fmt.Errorf("read %s: %w", path, err)
	}
	// Collect base variable names: DUMPSTATION_CONN_<NAME>, optionally with
	// _FILE (URL read from a file) and _PASSWORD_FILE (password override).
	bases := map[string]bool{}
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if !strings.HasPrefix(k, "DUMPSTATION_CONN_") {
			continue
		}
		switch {
		case strings.HasSuffix(k, "_PASSWORD_FILE"):
			k = strings.TrimSuffix(k, "_PASSWORD_FILE")
		case strings.HasSuffix(k, "_FILE"):
			k = strings.TrimSuffix(k, "_FILE")
		}
		if k != "DUMPSTATION_CONN_" {
			bases[k] = true
		}
	}
	for k := range bases {
		name := strings.ToLower(strings.ReplaceAll(strings.TrimPrefix(k, "DUMPSTATION_CONN_"), "_", "-"))
		v := os.Getenv(k)
		if v == "" {
			if f := os.Getenv(k + "_FILE"); f != "" {
				b, err := os.ReadFile(f)
				if err != nil {
					warnings = append(warnings, fmt.Sprintf("%s_FILE: %v", k, err))
					continue
				}
				v = strings.TrimSpace(string(b))
			}
		}
		if v == "" {
			warnings = append(warnings, fmt.Sprintf("%s: no connection URL (set %s or %s_FILE)", k, k, k))
			continue
		}
		c, err := pgexec.ParseURL(v)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s: %v", k, pgexec.AsError(err).Message))
			continue
		}
		if pf := os.Getenv(k + "_PASSWORD_FILE"); pf != "" {
			b, err := os.ReadFile(pf)
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("%s_PASSWORD_FILE: %v", k, err))
				continue
			}
			c.Password = strings.TrimRight(string(b), "\r\n")
		}
		out.byName[name] = c
	}
	return out, warnings, nil
}

// Resolve returns the named connection.
func (c *Connections) Resolve(name string) (pgexec.Conn, bool) {
	conn, ok := c.byName[name]
	return conn, ok
}

// List describes connections without credentials (reported to the server).
func (c *Connections) List() []agentproto.Connection {
	out := make([]agentproto.Connection, 0, len(c.byName))
	for name, conn := range c.byName {
		out = append(out, agentproto.Connection{Name: name, Database: conn.Database, Host: conn.Host})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// state is persisted in StateDir/credentials.json (mode 0600).
type state struct {
	ServerURL    string    `json:"server_url"`
	AgentID      string    `json:"agent_id"`
	AgentName    string    `json:"agent_name"`
	Credential   string    `json:"credential"`
	EnrolledWith string    `json:"enrolled_with"` // sha256 of the enrollment token used
	EnrolledAt   time.Time `json:"enrolled_at"`
}

func statePath(dir string) string { return filepath.Join(dir, "credentials.json") }

func loadState(dir string) (*state, error) {
	b, err := os.ReadFile(statePath(dir))
	if err != nil {
		return nil, err
	}
	var s state
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func saveState(dir string, s *state) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := statePath(dir) + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, statePath(dir))
}

func tokenHash(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// heartbeatFile records the last successful server contact (healthcheck).
func heartbeatFile(dir string) string { return filepath.Join(dir, "last-contact") }
