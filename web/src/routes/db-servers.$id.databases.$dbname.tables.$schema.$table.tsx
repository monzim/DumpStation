import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  useDbServer,
  useServerTableRows,
  useTruncateServerTable,
  TABLE_ROWS_PER_PAGE,
} from "@/lib/api/db-servers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Key,
  Table as TableIcon,
} from "lucide-react";
import type { ServerColumnInfo } from "@/lib/types/api";

export const Route = createFileRoute(
  "/db-servers/$id/databases/$dbname/tables/$schema/$table"
)({
  component: TableContentPage,
});

function TableContentPage() {
  const { id, dbname, schema, table } = useParams({
    from: "/db-servers/$id/databases/$dbname/tables/$schema/$table",
  });
  const navigate = useNavigate();
  const { data: server } = useDbServer(id);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useServerTableRows(
    id,
    dbname,
    schema,
    table,
    page
  );
  const truncateMutation = useTruncateServerTable(id, dbname);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const totalPages = data
    ? Math.max(1, Math.ceil(data.estimated_total / TABLE_ROWS_PER_PAGE))
    : 1;
  const firstRowIndex = data
    ? (page - 1) * TABLE_ROWS_PER_PAGE + (data.rows.length > 0 ? 1 : 0)
    : 0;
  const lastRowIndex = data
    ? (page - 1) * TABLE_ROWS_PER_PAGE + data.rows.length
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() =>
            navigate({
              to: "/db-servers/$id/databases/$dbname",
              params: { id, dbname },
            })
          }
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to {dbname}
        </Button>

        {/* Header */}
        <Card variant="console">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-md shrink-0">
                  <TableIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight font-mono truncate">
                    <span className="text-muted-foreground">{schema}.</span>
                    {table}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="secondary" className="font-normal">
                      {data?.columns.length ?? 0} column
                      {data?.columns.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="secondary" className="font-normal tabular-nums">
                      ~{(data?.estimated_total ?? 0).toLocaleString()} rows
                    </Badge>
                    {server && (
                      <Badge variant="outline" className="font-normal">
                        on {server.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                className="shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  setConfirmText("");
                  setConfirmOpen(true);
                }}
              >
                <Eraser className="h-4 w-4 mr-2" /> Clear table
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rows table */}
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : isError ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load rows: {(error as Error)?.message}
            </CardContent>
          </Card>
        ) : !data || data.rows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <div className="bg-canvas-soft border border-hairline-soft text-on-primary p-3 rounded-app-md">
                <TableIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-sm">
                  {data?.estimated_total === 0
                    ? "Table is empty"
                    : "No rows on this page"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {data?.estimated_total === 0
                    ? "Insert rows on the server, then refresh."
                    : "Try going back to page 1."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50">
                  <tr>
                    {data.columns.map((c) => (
                      <ColumnHeader key={c.name} column={c} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className="px-4 py-2 align-top"
                        >
                          {renderCell(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {data && data.rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground tabular-nums">
              Showing {firstRowIndex.toLocaleString()}–
              {lastRowIndex.toLocaleString()} of ~
              {data.estimated_total.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Page {page} / ~{totalPages.toLocaleString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.rows.length < TABLE_ROWS_PER_PAGE}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Truncate confirm */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Clear table <span className="font-mono">{table}</span>?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    This permanently deletes all rows in{" "}
                    <span className="font-mono">
                      {schema}.{table}
                    </span>
                    . The table structure stays. If another table references
                    this one via a foreign key, the truncate will fail and no
                    data is changed. Type the table name to confirm.
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={table}
                    autoFocus
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={
                  confirmText !== table || truncateMutation.isPending
                }
                onClick={async () => {
                  if (confirmText !== table) return;
                  await truncateMutation.mutateAsync({ schema, table });
                  setConfirmOpen(false);
                  setPage(1);
                }}
              >
                Clear table
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function ColumnHeader({ column }: { column: ServerColumnInfo }) {
  return (
    <th className="px-4 py-2 text-left font-medium border-b">
      <div className="flex items-center gap-1.5">
        {column.is_primary_key && (
          <Key className="h-3 w-3 text-primary" aria-label="primary key" />
        )}
        <span className="font-mono text-xs">{column.name}</span>
      </div>
      <div className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide">
        {column.data_type}
        {column.is_nullable ? "" : " · NOT NULL"}
      </div>
    </th>
  );
}

const MAX_CELL_CHARS = 120;

function renderCell(value: unknown) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className="font-mono text-xs">{value ? "true" : "false"}</span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono tabular-nums">{value}</span>;
  }
  if (typeof value === "string") {
    return renderText(value);
  }
  if (typeof value === "object") {
    // Arrays / JSON / JSONB come through as parsed objects from JSON.parse.
    return renderText(JSON.stringify(value));
  }
  return <span className="font-mono">{String(value)}</span>;
}

function renderText(text: string) {
  // Date-ish ISO strings get a subtle hint without parsing.
  const truncated =
    text.length > MAX_CELL_CHARS
      ? text.slice(0, MAX_CELL_CHARS) + "…"
      : text;
  return (
    <span
      className="font-mono text-xs whitespace-pre-wrap break-words"
      title={text.length > MAX_CELL_CHARS ? text : undefined}
    >
      {truncated}
    </span>
  );
}
