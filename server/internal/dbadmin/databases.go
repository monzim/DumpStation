package dbadmin

import (
	"context"
	"fmt"

	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// ListDatabases returns every non-template database visible to the connecting
// role, ordered by name.
//
// `pg_database_size` can fail for databases the connecting role cannot access;
// we coalesce that to 0 rather than failing the whole list.
func (c *Client) ListDatabases(ctx context.Context) ([]models.ServerDatabaseInfo, error) {
	const q = `
SELECT
    d.datname,
    pg_get_userbyid(d.datdba)         AS owner,
    pg_encoding_to_char(d.encoding)   AS encoding,
    COALESCE(pg_database_size(d.datname), 0) AS size_bytes,
    pg_size_pretty(COALESCE(pg_database_size(d.datname), 0)) AS size_human
FROM pg_database d
WHERE d.datistemplate = false
ORDER BY d.datname;`

	rows, err := c.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}
	defer rows.Close()

	var out []models.ServerDatabaseInfo
	for rows.Next() {
		var d models.ServerDatabaseInfo
		if err := rows.Scan(&d.Name, &d.Owner, &d.Encoding, &d.SizeBytes, &d.SizeHuman); err != nil {
			return nil, fmt.Errorf("scan database row: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// CreateDatabase issues `CREATE DATABASE "<name>" [OWNER "<owner>"]`. Both
// identifiers are passed through pq.QuoteIdentifier so callers cannot inject
// SQL through the name or owner string.
//
// `CREATE DATABASE` cannot run inside a transaction block, so we issue the
// statement directly on the pool.
func (c *Client) CreateDatabase(ctx context.Context, name, owner string) error {
	if name == "" {
		return fmt.Errorf("database name is required")
	}
	stmt := "CREATE DATABASE " + pq.QuoteIdentifier(name)
	if owner != "" {
		stmt += " OWNER " + pq.QuoteIdentifier(owner)
	}
	if _, err := c.db.ExecContext(ctx, stmt); err != nil {
		return classifyPgError(err)
	}
	return nil
}

// DropDatabase issues `DROP DATABASE IF EXISTS "<name>"`. PostgreSQL 13+
// supports the WITH (FORCE) option which terminates active connections; for
// older versions we fall back to the plain form. Callers should already
// confirm intent in the UI before invoking this.
func (c *Client) DropDatabase(ctx context.Context, name string) error {
	if name == "" {
		return fmt.Errorf("database name is required")
	}
	ident := pq.QuoteIdentifier(name)

	// Try the FORCE form first; if the server is old it returns a syntax
	// error, which we then retry without FORCE.
	stmt := "DROP DATABASE IF EXISTS " + ident + " WITH (FORCE)"
	if _, err := c.db.ExecContext(ctx, stmt); err != nil {
		fallback := "DROP DATABASE IF EXISTS " + ident
		if _, fbErr := c.db.ExecContext(ctx, fallback); fbErr != nil {
			return classifyPgError(fbErr)
		}
	}
	return nil
}
