// Package pgexec runs PostgreSQL client tools (pg_dump, pg_restore, psql)
// safely. It is shared by the DumpStation server (direct execution) and the
// DumpStation Agent so both executors behave identically.
//
// Commands are always started with exec.CommandContext and an explicit
// argument vector; no shell is involved and no caller-supplied string is
// ever interpreted as a command. Passwords are passed through a 0600
// passfile, never through argv or the environment.
package pgexec

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Toolset knows which PostgreSQL client versions are installed.
type Toolset struct {
	mu    sync.RWMutex
	dirs  map[int]string // major -> bin dir
	extra string         // fallback dir from PATH
}

var versionRe = regexp.MustCompile(`(\d+)(?:\.(\d+))?`)

// DiscoverTools scans the standard install locations of PostgreSQL client
// packages: Debian/Ubuntu (/usr/lib/postgresql/N/bin), Alpine
// (/usr/libexec/postgresqlN), RHEL (/usr/pgsql-N/bin), Homebrew and PATH.
// Extra directories can be given as PG_BIN_DIRS (colon separated).
func DiscoverTools() *Toolset {
	t := &Toolset{dirs: map[int]string{}}
	var candidates []string
	for _, pattern := range []string{
		"/usr/lib/postgresql/*/bin",
		"/usr/libexec/postgresql*",
		"/usr/pgsql-*/bin",
		"/opt/homebrew/opt/postgresql@*/bin",
		"/usr/local/opt/postgresql@*/bin",
	} {
		m, _ := filepath.Glob(pattern)
		candidates = append(candidates, m...)
	}
	if extra := os.Getenv("PG_BIN_DIRS"); extra != "" {
		candidates = append(candidates, strings.Split(extra, ":")...)
	}
	for _, dir := range candidates {
		bin := filepath.Join(dir, "pg_dump")
		if major, ok := toolMajor(bin); ok {
			if _, exists := t.dirs[major]; !exists {
				t.dirs[major] = dir
			}
		}
	}
	if p, err := exec.LookPath("pg_dump"); err == nil {
		if major, ok := toolMajor(p); ok {
			if _, exists := t.dirs[major]; !exists {
				t.dirs[major] = filepath.Dir(p)
			}
			t.extra = filepath.Dir(p)
		}
	}
	return t
}

func toolMajor(bin string) (int, bool) {
	st, err := os.Stat(bin)
	if err != nil || st.IsDir() {
		return 0, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, "--version").Output()
	if err != nil {
		return 0, false
	}
	// "pg_dump (PostgreSQL) 16.4 (Debian 16.4-1.pgdg120+1)"
	s := string(out)
	if i := strings.Index(s, ")"); i >= 0 {
		s = s[i+1:]
	}
	m := versionRe.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	major, _ := strconv.Atoi(m[1])
	return major, major > 0
}

// Majors returns the installed client major versions, ascending.
func (t *Toolset) Majors() []int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := make([]int, 0, len(t.dirs))
	for m := range t.dirs {
		out = append(out, m)
	}
	sort.Ints(out)
	return out
}

// MajorStrings returns Majors formatted as strings.
func (t *Toolset) MajorStrings() []string {
	ms := t.Majors()
	out := make([]string, len(ms))
	for i, m := range ms {
		out[i] = strconv.Itoa(m)
	}
	return out
}

// Pick returns the path of tool for a server of the given major version.
// pg_dump must be at least as new as the server, so the smallest installed
// version >= serverMajor is chosen. serverMajor <= 0 selects the newest.
func (t *Toolset) Pick(tool string, serverMajor int) (string, int, error) {
	majors := t.Majors()
	if len(majors) == 0 {
		return "", 0, &Error{Code: CodeToolMissing, Message: "No PostgreSQL client tools are installed"}
	}
	chosen := majors[len(majors)-1]
	if serverMajor > 0 {
		chosen = 0
		for _, m := range majors {
			if m >= serverMajor {
				chosen = m
				break
			}
		}
		if chosen == 0 {
			return "", 0, &Error{Code: CodeVersionMismatch, Message: fmt.Sprintf(
				"PostgreSQL %d requires client tools version %d or newer; installed: %v", serverMajor, serverMajor, majors)}
		}
	}
	t.mu.RLock()
	dir := t.dirs[chosen]
	t.mu.RUnlock()
	return filepath.Join(dir, tool), chosen, nil
}

// ringBuffer keeps the last n bytes written to it (stderr tails).
type ringBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
	max int
}

func newRing(max int) *ringBuffer { return &ringBuffer{max: max} }

func (r *ringBuffer) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf.Write(p)
	if over := r.buf.Len() - r.max; over > 0 {
		b := r.buf.Bytes()[over:]
		nb := make([]byte, len(b))
		copy(nb, b)
		r.buf.Reset()
		r.buf.Write(nb)
	}
	return len(p), nil
}

func (r *ringBuffer) String() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.buf.String()
}
