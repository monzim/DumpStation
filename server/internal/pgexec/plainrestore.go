package pgexec

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// restorePlain replays a plain-format SQL dump over the PostgreSQL wire
// protocol. Unlike psql it never interprets backslash meta-commands: lines
// such as "\restrict" or a tampered "\! cmd" are skipped, not executed.
// COPY ... FROM stdin blocks are streamed with the copy protocol.
func restorePlain(ctx context.Context, c Conn, path string, targetMajor int) error {
	conn, err := connectPgx(ctx, c)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	f, err := openFile(path)
	if err != nil {
		return AsError(err)
	}
	defer f.Close()
	sc := newSQLScanner(bufio.NewReaderSize(f, 1<<20))
	var batch bytes.Buffer
	flush := func() error {
		if batch.Len() == 0 {
			return nil
		}
		_, err := conn.Exec(ctx, batch.String()).ReadAll()
		batch.Reset()
		return err
	}
	for {
		stmt, err := sc.Next()
		if errors.Is(err, io.EOF) {
			if err := flush(); err != nil {
				return pgError(err)
			}
			return nil
		}
		if err != nil {
			return AsError(err)
		}
		trimmed := strings.TrimSpace(stripLeadingComments(stmt))
		if trimmed == "" {
			continue
		}
		if targetMajor > 0 && targetMajor < 17 && strings.HasPrefix(trimmed, "SET transaction_timeout") {
			continue
		}
		if copyFromStdin.MatchString(trimmed) {
			if err := flush(); err != nil {
				return pgError(err)
			}
			if _, err := conn.CopyFrom(ctx, sc.CopyData(), trimmed); err != nil {
				return pgError(err)
			}
			continue
		}
		batch.WriteString(stmt)
		batch.WriteString(";\n")
		if batch.Len() > 1<<20 {
			if err := flush(); err != nil {
				return pgError(err)
			}
		}
	}
}

var copyFromStdin = regexp.MustCompile(`(?is)^COPY\s.+\sFROM\s+stdin\b`)

func pgError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return Classify("ERROR:  "+pgErr.Message, CodeRestoreFailed, "Restore failed: "+pgErr.Message)
	}
	return AsError(err)
}

func connectPgx(ctx context.Context, c Conn) (*pgconn.PgConn, error) {
	q := func(s string) string { return "'" + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `'`, `\'`) + "'" }
	ssl := c.SSLMode
	if ssl == "" {
		ssl = "prefer"
	}
	dsn := fmt.Sprintf("host=%s port=%d dbname=%s user=%s password=%s sslmode=%s connect_timeout=15 application_name=dumpstation",
		q(c.Host), c.port(), q(c.Database), q(c.User), q(c.Password), q(ssl))
	cfg, err := pgconn.ParseConfig(dsn)
	if err != nil {
		return nil, Errorf(CodeConfigError, "invalid connection settings")
	}
	if c.HostAddr != "" {
		pin := func(host *string, tlsName func(string)) {
			*host = c.HostAddr
			tlsName(c.Host)
		}
		pin(&cfg.Host, func(n string) {
			if cfg.TLSConfig != nil {
				cfg.TLSConfig.ServerName = n
			}
		})
		for _, fb := range cfg.Fallbacks {
			fb.Host = c.HostAddr
			if fb.TLSConfig != nil {
				fb.TLSConfig.ServerName = c.Host
			}
		}
	}
	conn, err := pgconn.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, Classify(err.Error(), CodeHostUnreachable, "Could not connect to the database")
	}
	return conn, nil
}

func stripLeadingComments(s string) string {
	for {
		s = strings.TrimLeft(s, " \t\r\n")
		switch {
		case strings.HasPrefix(s, "--"):
			if i := strings.IndexByte(s, '\n'); i >= 0 {
				s = s[i+1:]
				continue
			}
			return ""
		case strings.HasPrefix(s, "/*"):
			if i := strings.Index(s, "*/"); i >= 0 {
				s = s[i+2:]
				continue
			}
			return ""
		}
		return s
	}
}

// sqlScanner splits a SQL script into statements, honouring quoted strings,
// E'' escapes, quoted identifiers, dollar quoting and comments.
type sqlScanner struct {
	r *bufio.Reader
}

func newSQLScanner(r *bufio.Reader) *sqlScanner { return &sqlScanner{r: r} }

// Next returns the next statement without its terminating semicolon.
func (s *sqlScanner) Next() (string, error) {
	var b strings.Builder
	atLineStart := true
	for {
		ch, err := s.r.ReadByte()
		if err == io.EOF {
			if strings.TrimSpace(b.String()) == "" {
				return "", io.EOF
			}
			return b.String(), nil
		}
		if err != nil {
			return "", err
		}
		// psql meta-command lines between statements: skip, never execute.
		if ch == '\\' && atLineStart && strings.TrimSpace(b.String()) == "" {
			if _, err := s.r.ReadString('\n'); err != nil && err != io.EOF {
				return "", err
			}
			continue
		}
		atLineStart = ch == '\n'
		switch {
		case ch == ';':
			return b.String(), nil
		case ch == '\'':
			escape := isEPrefix(b.String())
			b.WriteByte(ch)
			if err := s.quoted(&b, '\'', escape); err != nil {
				return "", err
			}
		case ch == '"':
			b.WriteByte(ch)
			if err := s.quoted(&b, '"', false); err != nil {
				return "", err
			}
		case ch == '-':
			b.WriteByte(ch)
			if next, _ := s.r.Peek(1); len(next) == 1 && next[0] == '-' {
				line, err := s.r.ReadString('\n')
				b.WriteString(line)
				atLineStart = true
				if err != nil && err != io.EOF {
					return "", err
				}
			}
		case ch == '/':
			b.WriteByte(ch)
			if next, _ := s.r.Peek(1); len(next) == 1 && next[0] == '*' {
				if err := s.blockComment(&b); err != nil {
					return "", err
				}
			}
		case ch == '$':
			b.WriteByte(ch)
			if tag, ok := s.dollarTag(); ok {
				b.WriteString(tag)
				if err := s.dollarBody(&b, "$"+tag); err != nil {
					return "", err
				}
			}
		default:
			b.WriteByte(ch)
		}
	}
}

func isEPrefix(prev string) bool {
	if prev == "" {
		return false
	}
	last := prev[len(prev)-1]
	if last != 'E' && last != 'e' {
		return false
	}
	if len(prev) == 1 {
		return true
	}
	p := prev[len(prev)-2]
	return !(p == '_' || p >= '0' && p <= '9' || p >= 'a' && p <= 'z' || p >= 'A' && p <= 'Z')
}

func (s *sqlScanner) quoted(b *strings.Builder, q byte, backslashEscapes bool) error {
	for {
		ch, err := s.r.ReadByte()
		if err != nil {
			return fmt.Errorf("unterminated quoted string")
		}
		b.WriteByte(ch)
		if backslashEscapes && ch == '\\' {
			nx, err := s.r.ReadByte()
			if err != nil {
				return fmt.Errorf("unterminated quoted string")
			}
			b.WriteByte(nx)
			continue
		}
		if ch == q {
			if next, _ := s.r.Peek(1); len(next) == 1 && next[0] == q {
				nx, _ := s.r.ReadByte()
				b.WriteByte(nx)
				continue
			}
			return nil
		}
	}
}

func (s *sqlScanner) blockComment(b *strings.Builder) error {
	star, _ := s.r.ReadByte() // '*'
	b.WriteByte(star)
	depth := 1
	var prev byte
	for depth > 0 {
		ch, err := s.r.ReadByte()
		if err != nil {
			return fmt.Errorf("unterminated comment")
		}
		b.WriteByte(ch)
		switch {
		case prev == '/' && ch == '*':
			depth++
			ch = 0
		case prev == '*' && ch == '/':
			depth--
			ch = 0
		}
		prev = ch
	}
	return nil
}

// dollarTag reads "tag$" after a '$' if it forms a dollar-quote opener.
func (s *sqlScanner) dollarTag() (string, bool) {
	for n := 1; n <= 64; n++ {
		peek, err := s.r.Peek(n)
		if err != nil {
			return "", false
		}
		ch := peek[n-1]
		if ch == '$' {
			tag := string(peek[:n])
			if n > 1 && peek[0] >= '0' && peek[0] <= '9' {
				return "", false // $1 parameter, not a quote
			}
			_, _ = s.r.Discard(n)
			return tag, true
		}
		if !(ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch >= 0x80) {
			return "", false
		}
	}
	return "", false
}

func (s *sqlScanner) dollarBody(b *strings.Builder, closing string) error {
	var window []byte
	for {
		ch, err := s.r.ReadByte()
		if err != nil {
			return fmt.Errorf("unterminated dollar-quoted string")
		}
		b.WriteByte(ch)
		window = append(window, ch)
		if len(window) > len(closing) {
			window = window[1:]
		}
		if string(window) == closing {
			return nil
		}
	}
}

// CopyData returns a reader yielding COPY data lines up to (not including)
// the terminating "\." line.
func (s *sqlScanner) CopyData() io.Reader {
	// The statement ended at ';' — discard the rest of that line first.
	_, _ = s.r.ReadString('\n')
	return &copyReader{r: s.r}
}

type copyReader struct {
	r    *bufio.Reader
	buf  []byte
	done bool
}

func (c *copyReader) Read(p []byte) (int, error) {
	for len(c.buf) == 0 {
		if c.done {
			return 0, io.EOF
		}
		line, err := c.r.ReadBytes('\n')
		if bytes.Equal(bytes.TrimRight(line, "\r\n"), []byte(`\.`)) {
			c.done = true
			return 0, io.EOF
		}
		if err == io.EOF {
			c.done = true
			if len(line) == 0 {
				return 0, io.EOF
			}
		} else if err != nil {
			return 0, err
		}
		c.buf = line
	}
	n := copy(p, c.buf)
	c.buf = c.buf[n:]
	return n, nil
}

var _ = strconv.Itoa
