package dbadmin

import (
	"context"
	"fmt"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// GetSchemaERD returns every user table plus all foreign-key relations in
// the connected database. Composite FKs surface only the first column pair
// (sufficient for the high-level ERD purpose and avoids API noise).
func (c *Client) GetSchemaERD(ctx context.Context) (*models.ServerERDSchema, error) {
	tables, err := c.fetchERDTables(ctx)
	if err != nil {
		return nil, err
	}
	relations, err := c.fetchERDRelations(ctx)
	if err != nil {
		return nil, err
	}
	if tables == nil {
		tables = []models.ServerERDTable{}
	}
	if relations == nil {
		relations = []models.ServerERDRelation{}
	}
	return &models.ServerERDSchema{Tables: tables, Relations: relations}, nil
}

// fetchERDTables returns one row per (schema, table, column) and folds them
// into ServerERDTable values. Ordering by attnum ensures columns appear in
// declared order.
func (c *Client) fetchERDTables(ctx context.Context) ([]models.ServerERDTable, error) {
	const q = `
SELECT
    n.nspname                                       AS schema,
    cls.relname                                     AS table_name,
    a.attname                                       AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    NOT a.attnotnull                                AS is_nullable,
    EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = cls.oid
          AND i.indisprimary
          AND a.attnum = ANY(i.indkey)
    )                                               AS is_primary_key
FROM pg_class cls
JOIN pg_namespace n ON n.oid = cls.relnamespace
JOIN pg_attribute a ON a.attrelid = cls.oid
WHERE cls.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, cls.relname, a.attnum;`

	rows, err := c.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("erd tables: %w", err)
	}
	defer rows.Close()

	// Key tables by "schema.name" so repeated rows append columns to the
	// existing entry rather than creating duplicates.
	byKey := make(map[string]*models.ServerERDTable)
	var order []string

	for rows.Next() {
		var (
			schema, tableName string
			col               models.ServerERDColumn
		)
		if err := rows.Scan(&schema, &tableName, &col.Name, &col.DataType, &col.IsNullable, &col.IsPrimaryKey); err != nil {
			return nil, fmt.Errorf("scan erd table row: %w", err)
		}
		key := schema + "." + tableName
		t, ok := byKey[key]
		if !ok {
			t = &models.ServerERDTable{Schema: schema, Name: tableName}
			byKey[key] = t
			order = append(order, key)
		}
		t.Columns = append(t.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate erd tables: %w", err)
	}

	out := make([]models.ServerERDTable, 0, len(order))
	for _, k := range order {
		out = append(out, *byKey[k])
	}
	return out, nil
}

// fetchERDRelations returns one row per FK constraint using the first column
// pair (`conkey[1]` / `confkey[1]`). Composite FKs are rare in practice, and
// for the ERD's purpose the relation arrow matters more than every column.
func (c *Client) fetchERDRelations(ctx context.Context) ([]models.ServerERDRelation, error) {
	const q = `
SELECT
    src_ns.nspname  AS from_schema,
    src_tbl.relname AS from_table,
    src_att.attname AS from_column,
    dst_ns.nspname  AS to_schema,
    dst_tbl.relname AS to_table,
    dst_att.attname AS to_column,
    c.conname       AS constraint_name
FROM pg_constraint c
JOIN pg_class      src_tbl ON src_tbl.oid = c.conrelid
JOIN pg_namespace  src_ns  ON src_ns.oid  = src_tbl.relnamespace
JOIN pg_attribute  src_att ON src_att.attrelid = c.conrelid  AND src_att.attnum = c.conkey[1]
JOIN pg_class      dst_tbl ON dst_tbl.oid = c.confrelid
JOIN pg_namespace  dst_ns  ON dst_ns.oid  = dst_tbl.relnamespace
JOIN pg_attribute  dst_att ON dst_att.attrelid = c.confrelid AND dst_att.attnum = c.confkey[1]
WHERE c.contype = 'f'
  AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY src_ns.nspname, src_tbl.relname, c.conname;`

	rows, err := c.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("erd relations: %w", err)
	}
	defer rows.Close()

	var out []models.ServerERDRelation
	for rows.Next() {
		var r models.ServerERDRelation
		if err := rows.Scan(
			&r.FromSchema, &r.FromTable, &r.FromColumn,
			&r.ToSchema, &r.ToTable, &r.ToColumn,
			&r.ConstraintName,
		); err != nil {
			return nil, fmt.Errorf("scan erd relation row: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
