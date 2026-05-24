import { useState } from "react";
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

  const filtered = (tables ?? []).filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.schema.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate({ to: "/db-servers/$id", params: { id } })}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to {server?.name ?? "server"}
        </Button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2.5 rounded-xl">
              <DbIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {dbname}
              </h1>
              <p className="text-sm text-muted-foreground">
                {server?.name ? `on ${server.name}` : ""} · read-only browse of
                tables in this database
              </p>
            </div>
          </div>
          <Button onClick={() => setGrantOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Grant access
          </Button>
        </header>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load tables.
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
              {tables && tables.length === 0
                ? "No user tables in this database."
                : "No tables match your search."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr_120px_140px] text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2 border-b">
                <div>Schema / Table</div>
                <div className="text-right">Rows (est.)</div>
                <div className="text-right">Size</div>
              </div>
              <div className="divide-y">
                {filtered.map((t) => (
                  <div
                    key={`${t.schema}.${t.name}`}
                    className="grid grid-cols-[1fr_120px_140px] items-center px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TableIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-mono text-sm truncate">
                        <span className="text-muted-foreground">
                          {t.schema}.
                        </span>
                        {t.name}
                      </span>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      {t.row_count.toLocaleString()}
                    </div>
                    <div className="text-right text-sm tabular-nums text-muted-foreground">
                      {t.size_human}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
