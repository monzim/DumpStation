package pgexec

import (
	"bufio"
	"io"
	"strings"
	"testing"
)

func scanAll(t *testing.T, in string) []string {
	sc := newSQLScanner(bufio.NewReader(strings.NewReader(in)))
	var out []string
	for {
		st, err := sc.Next()
		if err == io.EOF {
			return out
		}
		if err != nil {
			t.Fatal(err)
		}
		if strings.TrimSpace(st) != "" {
			out = append(out, strings.TrimSpace(st))
		}
	}
}

func TestScannerSplitsStatementsSafely(t *testing.T) {
	in := "\\restrict abc\nSET a = 1;\n-- comment; with semicolon\nSELECT 'x;y', E'it\\'s;', \"we;ird\";\n" +
		"CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; $body$ LANGUAGE sql;\n/* nested /* ; */ */ SELECT 2;\n\\! touch /tmp/pwned\nSELECT 3;\n"
	got := scanAll(t, in)
	want := []string{"SET a = 1", "SELECT 'x;y', E'it\\'s;', \"we;ird\"", "CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; $body$ LANGUAGE sql", "SELECT 2", "SELECT 3"}
	if len(got) != len(want) {
		t.Fatalf("got %d statements: %q", len(got), got)
	}
	for i := range want {
		if !strings.HasSuffix(got[i], want[i]) {
			t.Fatalf("statement %d = %q, want suffix %q", i, got[i], want[i])
		}
	}
	for _, g := range got {
		if strings.Contains(g, "pwned") || strings.Contains(g, "restrict") {
			t.Fatalf("meta-command leaked into SQL: %q", g)
		}
	}
}

func TestCopyReaderStopsAtTerminator(t *testing.T) {
	sc := newSQLScanner(bufio.NewReader(strings.NewReader("COPY t (a) FROM stdin;\n1\n2\n\\.\nSELECT 1;\n")))
	st, _ := sc.Next()
	if !copyFromStdin.MatchString(st) {
		t.Fatalf("not detected as COPY: %q", st)
	}
	data, _ := io.ReadAll(sc.CopyData())
	if string(data) != "1\n2\n" {
		t.Fatalf("copy data = %q", data)
	}
	next, _ := sc.Next()
	if strings.TrimSpace(next) != "SELECT 1" {
		t.Fatalf("after COPY got %q", next)
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

func TestConnRejectsConninfoInjection(t *testing.T) {
	for _, c := range []Conn{
		{Host: "h", Database: "host=evil dbname=x", User: "u"},
		{Host: "h", Database: "postgres://evil/x", User: "u"},
		{Host: "/var/run/postgresql", Database: "d", User: "u"},
		{Host: "a,b", Database: "d", User: "u"},
	} {
		if c.Validate() == nil {
			t.Fatalf("expected rejection for %+v", c)
		}
	}
}

func TestBenignRestoreErrors(t *testing.T) {
	ok := "pg_restore: error: could not execute query: ERROR:  unrecognized configuration parameter \"transaction_timeout\"\n"
	if !onlyBenignRestoreErrors(ok, 16) {
		t.Fatal("transaction_timeout on PG16 is benign")
	}
	if onlyBenignRestoreErrors(ok+"pg_restore: error: ERROR:  relation \"x\" already exists\n", 16) {
		t.Fatal("other errors are not benign")
	}
}
