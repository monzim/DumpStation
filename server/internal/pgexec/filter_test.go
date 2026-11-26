package pgexec

import (
	"bytes"
	"strings"
	"testing"
)

func TestFilterSQLDropsUnknownSettingsOnOldTargets(t *testing.T) {
	in := "SET statement_timeout = 0;\nSET transaction_timeout = 0;\nCOPY public.t (a) FROM stdin;\nSET transaction_timeout = 0;\n\\.\nSELECT 1;\n"
	var out bytes.Buffer
	if err := filterSQL(strings.NewReader(in), &out, 16); err != nil {
		t.Fatal(err)
	}
	got := out.String()
	if strings.Count(got, "SET transaction_timeout") != 1 {
		t.Fatalf("expected only the COPY-data line to survive, got:\n%s", got)
	}
	out.Reset()
	_ = filterSQL(strings.NewReader(in), &out, 17)
	if out.String() != in {
		t.Fatalf("PG17+ targets must receive the stream unchanged")
	}
}

func TestFilterSQLLongLines(t *testing.T) {
	long := strings.Repeat("x", 1<<20)
	in := "COPY t (a) FROM stdin;\n" + long + "\n\\.\n"
	var out bytes.Buffer
	if err := filterSQL(strings.NewReader(in), &out, 16); err != nil {
		t.Fatal(err)
	}
	if out.String() != in {
		t.Fatal("long lines must pass through unchanged")
	}
}

func TestClassify(t *testing.T) {
	e := Classify(`pg_dump: error: connection to server at "x" failed: FATAL:  password authentication failed for user "u"`, CodeDumpFailed, "x")
	if e.Code != CodeAuthFailed {
		t.Fatalf("got %s", e.Code)
	}
	e = Classify(`FATAL:  database "nope" does not exist`, CodeDumpFailed, "x")
	if e.Code != CodeDatabaseNotFound {
		t.Fatalf("got %s", e.Code)
	}
	if s := Sanitize("postgres://user:secret@host/db password=hunter2"); strings.Contains(s, "secret") || strings.Contains(s, "hunter2") {
		t.Fatalf("credentials leaked: %s", s)
	}
}

func TestParseURL(t *testing.T) {
	c, err := ParseURL("postgres://bk:p%40ss@db.internal:6543/orders?sslmode=require")
	if err != nil || c.Host != "db.internal" || c.Port != 6543 || c.Password != "p@ss" || c.SSLMode != "require" || c.Database != "orders" {
		t.Fatalf("%+v %v", c, err)
	}
	if _, err := ParseURL("postgres://-oProxyCommand@h/db"); err == nil {
		t.Fatal("option-like values must be rejected")
	}
}
