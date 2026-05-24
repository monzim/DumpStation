package dbadmin

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// requireTestDB skips when no test PostgreSQL is available.
//
// Set TEST_PG_HOST / TEST_PG_PORT / TEST_PG_USER / TEST_PG_PASSWORD in the
// environment to run the integration tests. CI / local quick runs that don't
// have a sandbox PG just get a skip.
func requireTestDB(t *testing.T) Options {
	t.Helper()
	host := os.Getenv("TEST_PG_HOST")
	if host == "" {
		t.Skip("TEST_PG_HOST not set; skipping dbadmin integration tests")
	}
	port := 5432
	if p := os.Getenv("TEST_PG_PORT"); p != "" {
		var v int
		if _, err := fmtScanInt(p, &v); err == nil && v > 0 {
			port = v
		}
	}
	return Options{
		Host:     host,
		Port:     port,
		User:     defaultEnv("TEST_PG_USER", "postgres"),
		Password: os.Getenv("TEST_PG_PASSWORD"),
		SSLMode:  defaultEnv("TEST_PG_SSLMODE", "disable"),
	}
}

func defaultEnv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func fmtScanInt(s string, v *int) (int, error) {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0, &parseErr{}
		}
		n = n*10 + int(ch-'0')
	}
	*v = n
	return 1, nil
}

type parseErr struct{}

func (*parseErr) Error() string { return "parse error" }

func TestTryConnect(t *testing.T) {
	opts := requireTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := TryConnect(ctx, opts)
	if err != nil {
		t.Fatalf("TryConnect: %v", err)
	}
	if result.SSLMode == "" {
		t.Fatal("expected non-empty SSLMode")
	}
	if result.Latency <= 0 {
		t.Fatal("expected positive latency")
	}
}

func TestDatabaseLifecycle(t *testing.T) {
	opts := requireTestDB(t)
	c, err := New(opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	ctx := context.Background()
	name := "dumpstation_test_" + uniqueSuffix()

	if err := c.CreateDatabase(ctx, name, ""); err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	t.Cleanup(func() { _ = c.DropDatabase(context.Background(), name) })

	dbs, err := c.ListDatabases(ctx)
	if err != nil {
		t.Fatalf("ListDatabases: %v", err)
	}
	if !containsDB(dbs, name) {
		t.Fatalf("expected %q in database list", name)
	}

	if err := c.CreateDatabase(ctx, name, ""); err == nil {
		t.Fatal("expected duplicate CREATE DATABASE to fail")
	}

	if err := c.DropDatabase(ctx, name); err != nil {
		t.Fatalf("DropDatabase: %v", err)
	}
}

func TestRoleAndGrantLifecycle(t *testing.T) {
	opts := requireTestDB(t)
	c, err := New(opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	ctx := context.Background()
	suffix := uniqueSuffix()
	dbName := "dumpstation_test_db_" + suffix
	userName := "dumpstation_test_user_" + suffix

	if err := c.CreateDatabase(ctx, dbName, ""); err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	t.Cleanup(func() { _ = c.DropDatabase(context.Background(), dbName) })

	if err := c.CreateUser(ctx, userName, "tmp-pass-123", true); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	t.Cleanup(func() { _ = c.DropUser(context.Background(), userName) })

	roles, err := c.ListRoles(ctx)
	if err != nil {
		t.Fatalf("ListRoles: %v", err)
	}
	if !containsRole(roles, userName) {
		t.Fatalf("expected %q in role list", userName)
	}

	if err := c.GrantPreset(ctx, dbName, userName, models.ServerGrantReadOnly); err != nil {
		t.Fatalf("GrantPreset readonly: %v", err)
	}
	if err := c.GrantPreset(ctx, dbName, userName, models.ServerGrantReadWrite); err != nil {
		t.Fatalf("GrantPreset readwrite: %v", err)
	}
}

func TestListTablesOnFreshDatabase(t *testing.T) {
	opts := requireTestDB(t)
	c, err := New(opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	ctx := context.Background()
	dbName := "dumpstation_tbl_test_" + uniqueSuffix()
	if err := c.CreateDatabase(ctx, dbName, ""); err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	t.Cleanup(func() { _ = c.DropDatabase(context.Background(), dbName) })

	scoped, err := c.WithDatabase(dbName)
	if err != nil {
		t.Fatalf("WithDatabase: %v", err)
	}
	defer scoped.Close()

	tables, err := scoped.ListTables(ctx)
	if err != nil {
		t.Fatalf("ListTables: %v", err)
	}
	if len(tables) != 0 {
		t.Fatalf("expected empty table list on fresh DB, got %d", len(tables))
	}
}

func uniqueSuffix() string {
	return strings.ReplaceAll(time.Now().Format("20060102150405.000"), ".", "_")
}

func containsDB(items []models.ServerDatabaseInfo, name string) bool {
	for _, i := range items {
		if i.Name == name {
			return true
		}
	}
	return false
}

func containsRole(items []models.ServerRoleInfo, name string) bool {
	for _, i := range items {
		if i.Name == name {
			return true
		}
	}
	return false
}
