package dbadmin

import (
	"context"
	"fmt"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// ListTables returns every base table in the public schema of the connected
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
