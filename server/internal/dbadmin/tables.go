package dbadmin

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// MaxBrowseLimit caps how many rows a single Browse call can return so a
// client cannot DoS the foreign server with a huge LIMIT.
const MaxBrowseLimit = 200

// ListTables returns every base table in non-system schemas of the connected
// database, including a row-count estimate and on-disk size.
//
// `reltuples` is an estimate maintained by ANALYZE — for accurate counts users
// should still run `SELECT COUNT(*)` themselves. The trade-off is intentional:
// pg_class is O(1) where SELECT COUNT(*) is O(rows).
func (c *Client) ListTables(ctx context.Context) ([]models.ServerTableInfo, error) {
	const q = `
SELECT
    n.nspname                          AS schema,
    c.relname                          AS name,
    COALESCE(c.reltuples, 0)::bigint   AS row_count,
    pg_total_relation_size(c.oid)      AS size_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS size_human
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;`

	rows, err := c.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()

	var out []models.ServerTableInfo
	for rows.Next() {
		var t models.ServerTableInfo
		if err := rows.Scan(&t.Schema, &t.Name, &t.RowCount, &t.SizeBytes, &t.SizeHuman); err != nil {
			return nil, fmt.Errorf("scan table row: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetTableColumns returns the columns of a single table in ordinal position
// order. The Default field is empty when the column has no default. The
// IsPrimaryKey flag is computed from pg_index, so composite primary keys
// mark every constituent column.
func (c *Client) GetTableColumns(ctx context.Context, schema, name string) ([]models.ServerColumnInfo, error) {
	if schema == "" || name == "" {
		return nil, fmt.Errorf("schema and name are required")
	}
	// regclass cast accepts "schema"."table" with embedded double quotes,
	// which is exactly what QuoteIdentifier produces.
	relident := pq.QuoteIdentifier(schema) + "." + pq.QuoteIdentifier(name)

	const q = `
SELECT
    a.attname                                          AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod)    AS data_type,
    NOT a.attnotnull                                   AS is_nullable,
    COALESCE(pg_get_expr(d.adbin, d.adrelid), '')      AS column_default,
    EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = a.attrelid
          AND i.indisprimary
          AND a.attnum = ANY(i.indkey)
    )                                                  AS is_primary_key
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = $1::regclass
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;`

	rows, err := c.db.QueryContext(ctx, q, relident)
	if err != nil {
		return nil, classifyPgError(err)
	}
	defer rows.Close()

	var out []models.ServerColumnInfo
	for rows.Next() {
		var c models.ServerColumnInfo
		if err := rows.Scan(&c.Name, &c.DataType, &c.IsNullable, &c.Default, &c.IsPrimaryKey); err != nil {
			return nil, fmt.Errorf("scan column row: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// BrowseTable returns a page of rows for the given table, plus column metadata
// and a row-count estimate.
//
// The page is ordered by the table's primary key when one exists (ascending,
// composite key in attnum order). If there's no primary key, we fall back to
// the first column so pagination remains deterministic.
//
// Cells are scanned into `any` and post-processed:
//   - []byte is converted to string (so UUIDs / JSON / TEXT serialise as text,
//     not as base64 in the JSON response).
//   - time.Time is left as-is; encoding/json marshals it RFC3339.
//   - Everything else passes through.
func (c *Client) BrowseTable(ctx context.Context, schema, name string, limit, offset int) (*models.ServerTableRowsResult, error) {
	if schema == "" || name == "" {
		return nil, fmt.Errorf("schema and name are required")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > MaxBrowseLimit {
		limit = MaxBrowseLimit
	}
	if offset < 0 {
		offset = 0
	}

	cols, err := c.GetTableColumns(ctx, schema, name)
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, fmt.Errorf("table %s.%s has no columns or does not exist", schema, name)
	}

	// Order by the first PK column; fall back to the first column.
	orderCol := cols[0].Name
	for _, col := range cols {
		if col.IsPrimaryKey {
			orderCol = col.Name
			break
		}
	}

	// Build "col1","col2",... so the SELECT order matches `cols`.
	var selectBuilder strings.Builder
	for i, col := range cols {
		if i > 0 {
			selectBuilder.WriteString(", ")
		}
		selectBuilder.WriteString(pq.QuoteIdentifier(col.Name))
	}
	selectList := selectBuilder.String()

	relident := pq.QuoteIdentifier(schema) + "." + pq.QuoteIdentifier(name)
	query := fmt.Sprintf(
		"SELECT %s FROM %s ORDER BY %s LIMIT $1 OFFSET $2",
		selectList,
		relident,
		pq.QuoteIdentifier(orderCol),
	)

	rows, err := c.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, classifyPgError(err)
	}
	defer rows.Close()

	colCount := len(cols)
	var data [][]any
	for rows.Next() {
		cell := make([]any, colCount)
		ptrs := make([]any, colCount)
		for i := range cell {
			ptrs[i] = &cell[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		for i, v := range cell {
			switch t := v.(type) {
			case []byte:
				cell[i] = string(t)
			case time.Time:
				cell[i] = t
			}
		}
		data = append(data, cell)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}

	// Best-effort row estimate from pg_class.
	var estimated int64
	const estQ = `SELECT COALESCE(reltuples, 0)::bigint FROM pg_class WHERE oid = $1::regclass;`
	_ = c.db.QueryRowContext(ctx, estQ, relident).Scan(&estimated)
	if estimated < 0 {
		estimated = 0
	}

	return &models.ServerTableRowsResult{
		Columns:        cols,
		Rows:           data,
		Limit:          limit,
		Offset:         offset,
		EstimatedTotal: estimated,
	}, nil
}

// TruncateTable empties a table. Plain TRUNCATE only — no CASCADE, no
// RESTART IDENTITY. If the table is referenced by another table's FK,
// PostgreSQL returns an error and we surface it through classifyPgError.
func (c *Client) TruncateTable(ctx context.Context, schema, name string) error {
	if schema == "" || name == "" {
		return fmt.Errorf("schema and name are required")
	}
	stmt := "TRUNCATE TABLE " +
		pq.QuoteIdentifier(schema) + "." + pq.QuoteIdentifier(name)
	if _, err := c.db.ExecContext(ctx, stmt); err != nil {
		return classifyPgError(err)
	}
	return nil
}
