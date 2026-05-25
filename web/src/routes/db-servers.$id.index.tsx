import { useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  useDbServer,
  useDbServerDatabases,
  useDbServerUsers,
  useDropServerDatabase,
  useDropServerUser,
} from "@/lib/api/db-servers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { DbServerDialog } from "@/components/db-server-dialog";
import { ServerDatabaseCreateDialog } from "@/components/server-database-create-dialog";
import { ServerUserCreateDialog } from "@/components/server-user-create-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronRight,
  Database as DbIcon,
  KeyRound,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/db-servers/$id/")({
  component: DbServerDetailPage,
});

type TabKey = "databases" | "users";

function DbServerDetailPage() {
  const { id } = useParams({ from: "/db-servers/$id/" });
  const navigate = useNavigate();
  const { data: server, isLoading } = useDbServer(id);
  const [tab, setTab] = useState<TabKey>("databases");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !server) {
    return (
      <AppLayout>
        <Skeleton className="h-12 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate({ to: "/db-servers" })}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to servers
        </Button>

        {/* Header card */}
        <Card variant="console">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-md shrink-0">
                  <Server className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight truncate">
                    {server.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {server.host}:{server.port}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {server.user}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      ssl: {server.ssl_mode}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                className="shrink-0"
              >
                <Settings className="h-4 w-4 mr-2" /> Connection settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-full w-fit">
          <TabButton current={tab} value="databases" onChange={setTab}>
            <DbIcon className="h-4 w-4" /> Databases
          </TabButton>
          <TabButton current={tab} value="users" onChange={setTab}>
            <Users className="h-4 w-4" /> Users & Roles
          </TabButton>
        </div>

        {tab === "databases" && <DatabasesPanel serverId={id} />}
        {tab === "users" && <UsersPanel serverId={id} />}

        <DbServerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          server={server}
        />
      </div>
    </AppLayout>
  );
}

function TabButton({
  current,
  value,
  onChange,
  children,
}: {
  current: TabKey;
  value: TabKey;
  onChange: (v: TabKey) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
      )}
    >
      {children}
    </button>
  );
}

function DatabasesPanel({ serverId }: { serverId: string }) {
  const { data, isLoading, isError, error } = useDbServerDatabases(serverId);
  const dropMutation = useDropServerDatabase(serverId);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDrop, setToDrop] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((d) => d.name.toLowerCase().includes(q));
  }, [data, search]);

  const totalBytes = useMemo(
    () => (data ?? []).reduce((sum, d) => sum + (d.size_bytes ?? 0), 0),
    [data]
  );

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search databases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-full bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-full">
          <Plus className="h-4 w-4 mr-2" /> Create database
        </Button>
      </div>

      {/* Summary line */}
      {data && data.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {data.length} database{data.length === 1 ? "" : "s"} ·{" "}
          {formatBytes(totalBytes)} total
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load databases: {(error as Error)?.message}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={DbIcon}
          title={
            data && data.length === 0
              ? "No databases on this server"
              : "No matches"
          }
          body={
            data && data.length === 0
              ? "Create your first database to get started."
              : "Try a different search."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((d) => (
            <Link
              key={d.name}
              to="/db-servers/$id/databases/$dbname"
              params={{ id: serverId, dbname: d.name }}
              className="group block"
            >
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 hover:border-muted-foreground/20 transition-colors">
                <div className="bg-canvas border border-hairline-soft text-ash p-2 rounded-app-sm shrink-0 group-hover:bg-canvas-soft group-hover:text-on-primary transition-colors">
                  <DbIcon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm font-mono truncate">
                    {d.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    owner {d.owner} · {d.encoding}
                  </div>
                </div>

                <div className="hidden sm:block text-right shrink-0">
                  <div className="text-xs font-medium tabular-nums">
                    {d.size_human}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setToDrop(d.name);
                    setConfirmText("");
                  }}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={`Drop ${d.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <ServerDatabaseCreateDialog
        serverId={serverId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <AlertDialog
        open={!!toDrop}
        onOpenChange={(open) => !open && setToDrop(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop database {toDrop}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This permanently destroys the database and all of its data on
                  the remote server. Type the database name to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={toDrop ?? ""}
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmText !== toDrop || dropMutation.isPending}
              onClick={async () => {
                if (!toDrop || confirmText !== toDrop) return;
                await dropMutation.mutateAsync(toDrop);
                setToDrop(null);
              }}
            >
              Drop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UsersPanel({ serverId }: { serverId: string }) {
  const { data, isLoading, isError } = useDbServerUsers(serverId);
  const dropMutation = useDropServerUser(serverId);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDrop, setToDrop] = useState<string | null>(null);

  const filtered = (data ?? []).filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-full bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-full">
          <UserPlus className="h-4 w-4 mr-2" /> Create role
        </Button>
      </div>

      {data && data.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {data.length} role{data.length === 1 ? "" : "s"}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load roles.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={KeyRound}
          title={
            data && data.length === 0 ? "No user roles yet" : "No matches"
          }
          body={
            data && data.length === 0
              ? "Create a role to grant access to specific databases."
              : "Try a different search."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <div
              key={u.name}
              className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 transition-colors"
            >
              <div className="bg-muted text-muted-foreground p-2 rounded-lg shrink-0">
                <Users className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm font-mono truncate">
                  {u.name}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {u.can_login && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      LOGIN
                    </Badge>
                  )}
                  {u.is_superuser && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] h-4 px-1.5"
                    >
                      SUPERUSER
                    </Badge>
                  )}
                  {u.create_db && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-4 px-1.5"
                    >
                      CREATEDB
                    </Badge>
                  )}
                  {u.create_role && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-4 px-1.5"
                    >
                      CREATEROLE
                    </Badge>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setToDrop(u.name)}
                disabled={u.is_superuser}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                title={
                  u.is_superuser
                    ? "Cannot drop superuser from this UI"
                    : "Drop role"
                }
                aria-label={`Drop ${u.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ServerUserCreateDialog
        serverId={serverId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <AlertDialog
        open={!!toDrop}
        onOpenChange={(open) => !open && setToDrop(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop role {toDrop}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the role from the server. Objects owned by the role
              must be reassigned first or the drop will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!toDrop) return;
                await dropMutation.mutateAsync(toDrop);
                setToDrop(null);
              }}
            >
              Drop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div className="bg-canvas-soft border border-hairline-soft text-on-primary p-3 rounded-app-md">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <p className="text-sm text-muted-foreground mt-1">{body}</p>
        </div>
      </CardContent>
    </Card>
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
