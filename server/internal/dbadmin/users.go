package dbadmin

import (
	"context"
	"fmt"

	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// ListRoles returns every user-created role (rolname not prefixed with `pg_`).
func (c *Client) ListRoles(ctx context.Context) ([]models.ServerRoleInfo, error) {
	const q = `
SELECT
    rolname,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname;`

	rows, err := c.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var out []models.ServerRoleInfo
	for rows.Next() {
		var r models.ServerRoleInfo
		if err := rows.Scan(&r.Name, &r.CanLogin, &r.IsSuperuser, &r.CreateDB, &r.CreateRole); err != nil {
			return nil, fmt.Errorf("scan role row: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateUser creates a new role with the given password. The role name is
// quoted with pq.QuoteIdentifier and the password with pq.QuoteLiteral. The
// password literal is necessary because PostgreSQL does not accept positional
// parameters in DDL.
func (c *Client) CreateUser(ctx context.Context, username, password string, canLogin bool) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if password == "" {
		return fmt.Errorf("password is required")
	}

	loginAttr := "NOLOGIN"
	if canLogin {
		loginAttr = "LOGIN"
	}

	stmt := fmt.Sprintf(
		"CREATE ROLE %s WITH %s ENCRYPTED PASSWORD %s",
		pq.QuoteIdentifier(username),
		loginAttr,
		pq.QuoteLiteral(password),
	)
	if _, err := c.db.ExecContext(ctx, stmt); err != nil {
		return classifyPgError(err)
	}
	return nil
}

// DropUser drops the role if present.
func (c *Client) DropUser(ctx context.Context, username string) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	stmt := "DROP ROLE IF EXISTS " + pq.QuoteIdentifier(username)
	if _, err := c.db.ExecContext(ctx, stmt); err != nil {
		return classifyPgError(err)
	}
	return nil
}

// GrantPreset applies one of the named permission presets to a role on a
// specific database. The grants run on a connection bound to the target
// database (because GRANT on schema/tables only makes sense there).
//
// Presets are deliberately narrow:
//   - readonly:   CONNECT on DB; USAGE on public; SELECT on existing and
//                 future tables in public.
//   - readwrite:  readonly + INSERT/UPDATE/DELETE on existing and future
//                 tables and sequences in public.
//   - owner:      ALTER DATABASE OWNER TO role; this implies all rights.
//
// More granular per-table grants are intentionally not exposed.
func (c *Client) GrantPreset(ctx context.Context, dbname, username string, preset models.ServerGrantPreset) error {
	if dbname == "" || username == "" {
		return fmt.Errorf("dbname and username are required")
	}

	// "owner" runs on the maintenance connection — ALTER DATABASE ... OWNER
	// has no schema/table component.
	if preset == models.ServerGrantOwner {
		stmt := fmt.Sprintf(
			"ALTER DATABASE %s OWNER TO %s",
			pq.QuoteIdentifier(dbname),
			pq.QuoteIdentifier(username),
		)
		if _, err := c.db.ExecContext(ctx, stmt); err != nil {
			return classifyPgError(err)
		}
		return nil
	}

	dbConn, err := c.WithDatabase(dbname)
	if err != nil {
		return fmt.Errorf("connect to target database: %w", err)
	}
	defer dbConn.Close()

	roleIdent := pq.QuoteIdentifier(username)
	dbIdent := pq.QuoteIdentifier(dbname)

	common := []string{
		fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s", dbIdent, roleIdent),
		fmt.Sprintf("GRANT USAGE ON SCHEMA public TO %s", roleIdent),
	}

	var rest []string
	switch preset {
	case models.ServerGrantReadOnly:
		rest = []string{
			fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s", roleIdent),
			fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %s", roleIdent),
		}
	case models.ServerGrantReadWrite:
		rest = []string{
			fmt.Sprintf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %s", roleIdent),
			fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %s", roleIdent),
			fmt.Sprintf("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %s", roleIdent),
			fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %s", roleIdent),
		}
	default:
		return fmt.Errorf("unknown preset %q", preset)
	}

	for _, stmt := range append(common, rest...) {
		if _, err := dbConn.db.ExecContext(ctx, stmt); err != nil {
			return classifyPgError(err)
		}
	}
	return nil
}
