package pgexec

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Integration tests run only when TEST_PG_URL points at a disposable server,
// e.g. TEST_PG_URL=postgres://postgres:pw@localhost:5432/postgres?sslmode=disable
func testConn(t *testing.T) (Conn, *Runner) {
	raw := os.Getenv("TEST_PG_URL")
	if raw == "" {
		t.Skip("TEST_PG_URL not set")
	}
	c, err := ParseURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	r := NewRunner(t.TempDir())
	if len(r.Tools.Majors()) == 0 {
		t.Skip("no PostgreSQL client tools installed")
	}
	return c, r
}

func psqlExec(t *testing.T, r *Runner, c Conn, sql string) string {
	t.Helper()
	bin, _, _ := r.Tools.Pick("psql", 0)
	cmd := exec.Command(bin, "-X", "-A", "-t", "-h", c.Host, "-p", strconv.Itoa(c.port()), "-U", c.User, "-d", c.Database, "-c", sql)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+c.Password, "PGSSLMODE=disable")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("psql %q: %v %s", sql, err, out)
	}
	return strings.TrimSpace(string(out))
}

func TestPlainRestoreIgnoresMetaCommands(t *testing.T) {
	c, r := testConn(t)
	ctx := context.Background()
	marker := filepath.Join(t.TempDir(), "pwned")
	dump := "SET statement_timeout = 0;\nSET transaction_timeout = 0;\n\\restrict k\n" +
		"DROP TABLE IF EXISTS ds_plain_t;\nCREATE TABLE ds_plain_t (id int, note text);\n" +
		"COPY public.ds_plain_t (id, note) FROM stdin;\n1\thello; world\n2\t\\N\n\\.\n" +
		"\\! touch " + marker + "\n" +
		"CREATE OR REPLACE FUNCTION ds_plain_f() RETURNS int AS $$ SELECT 1; $$ LANGUAGE sql;\n" +
		"INSERT INTO ds_plain_t VALUES (3, E'it\\'s; fine');\n\\unrestrict k\n"
	path := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(path, []byte(dump), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := r.Restore(ctx, c, path, RestoreOptions{Format: "plain"}); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("meta-command was executed")
	}
	if got := psqlExec(t, r, c, "SELECT count(*) FROM ds_plain_t"); got != "3" {
		t.Fatalf("rows = %s", got)
	}
}

func TestDumpAndCustomRestore(t *testing.T) {
	c, r := testConn(t)
	ctx := context.Background()
	psqlExec(t, r, c, "DROP TABLE IF EXISTS ds_dump_t; CREATE TABLE ds_dump_t AS SELECT g FROM generate_series(1,100) g")
	res, err := r.Dump(ctx, c, DumpOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(res.Path)
	psqlExec(t, r, c, "DROP TABLE ds_dump_t")
	if err := r.Restore(ctx, c, res.Path, RestoreOptions{Format: "custom", Clean: true}); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if got := psqlExec(t, r, c, "SELECT count(*) FROM ds_dump_t"); got != "100" {
		t.Fatalf("rows = %s", got)
	}
}
