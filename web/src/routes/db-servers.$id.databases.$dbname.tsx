import { useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  useDbServer,
  useDbServerTables,
} from "@/lib/api/db-servers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ServerGrantDialog } from "@/components/server-grant-dialog";
import {
  ArrowLeft,
  Database as DbIcon,
  KeyRound,
  Search,
  Table as TableIcon,
} from "lucide-react";

export const Route = createFileRoute("/db-servers/$id/databases/$dbname")({
  component: DbServerDatabasePage,
});

function DbServerDatabasePage() {
  const { id, dbname } = useParams({
    from: "/db-servers/$id/databases/$dbname",
  });
  const navigate = useNavigate();
  const { data: server } = useDbServer(id);
  const { data: tables, isLoading, isError } = useDbServerTables(id, dbname);
  const [search, setSearch] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);

  const filtered = useMemo(
    () =>
      (tables ?? []).filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.schema.toLowerCase().includes(search.toLowerCase())
      ),
    [tables, search]
  );

  const totalRows = useMemo(
    () => (tables ?? []).reduce((sum, t) => sum + (t.row_count ?? 0), 0),
    [tables]
  );
  const totalBytes = useMemo(
    () => (tables ?? []).reduce((sum, t) => sum + (t.size_bytes ?? 0), 0),
    [tables]
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate({ to: "/db-servers/$id", params: { id } })}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {server ? `Back to ${server.name}` : "Back"}
        </Button>

        {/* Header card */}
        <Card className="border-0 shadow-sm bg-linear-to-br from-primary/5 via-background to-background">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-md shrink-0">
                  <DbIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight font-mono truncate">
                    {dbname}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tables in this database (read-only browse)
                  </p>
                </div>
              </div>
              <Button onClick={() => setGrantOpen(true)} className="shrink-0">
                <KeyRound className="h-4 w-4 mr-2" /> Grant access
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-full bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>
          {tables && tables.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-normal">
                {tables.length} table{tables.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary" className="font-normal tabular-nums">
                {totalRows.toLocaleString()} rows
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {formatBytes(totalBytes)}
              </Badge>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load tables.
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <div className="bg-primary/10 text-primary p-3 rounded-2xl">
                <TableIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-sm">
                  {tables && tables.length === 0
                    ? "No user tables in this database"
                    : "No matches"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {tables && tables.length === 0
                    ? "Tables created on the server will appear here."
                    : "Try a different search."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((t) => (
              <div
                key={`${t.schema}.${t.name}`}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 transition-colors"
              >
                <div className="bg-muted text-muted-foreground p-2 rounded-lg shrink-0">
                  <TableIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm truncate">
                    <span className="text-muted-foreground">{t.schema}.</span>
                    <span className="font-medium">{t.name}</span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">rows</div>
                    <div className="text-xs font-medium tabular-nums">
                      {t.row_count.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right min-w-16">
                    <div className="text-xs text-muted-foreground">size</div>
                    <div className="text-xs font-medium tabular-nums">
                      {t.size_human}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <ServerGrantDialog
          serverId={id}
          dbname={dbname}
          open={grantOpen}
          onOpenChange={setGrantOpen}
        />
      </div>
    </AppLayout>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
