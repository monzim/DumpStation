import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  createFileRoute,
  Link,
  useParams,
  useNavigate,
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
  Database as DbIcon,
  Plus,
  Search,
  Server,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/db-servers/$id")({
  component: DbServerDetailPage,
});

type TabKey = "databases" | "users" | "connection";

function DbServerDetailPage() {
  const { id } = useParams({ from: "/db-servers/$id" });
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
      <div className="space-y-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate({ to: "/db-servers" })}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to servers
        </Button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2.5 rounded-xl">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {server.name}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {server.host}:{server.port} · {server.user} ·{" "}
                <span className="text-xs">ssl: {server.ssl_mode}</span>
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Settings className="h-4 w-4 mr-2" /> Connection settings
          </Button>
        </header>

        <nav className="flex items-center gap-1 bg-muted/40 p-1 rounded-full w-fit">
          <TabButton current={tab} value="databases" onChange={setTab}>
            <DbIcon className="h-4 w-4" /> Databases
          </TabButton>
          <TabButton current={tab} value="users" onChange={setTab}>
            <Users className="h-4 w-4" /> Users
          </TabButton>
        </nav>

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
        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
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

  const filtered = (data ?? []).filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search databases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create database
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load databases: {(error as Error)?.message}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
            {data && data.length === 0
              ? "No databases on this server yet."
              : "No databases match your search."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {filtered.map((d) => (
              <div
                key={d.name}
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <Link
                    to="/db-servers/$id/databases/$dbname"
                    params={{ id: serverId, dbname: d.name }}
                    className="font-medium text-sm hover:underline truncate block"
                  >
                    {d.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    owner {d.owner} · {d.encoding} · {d.size_human}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setToDrop(d.name);
                    setConfirmText("");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
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
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Create role
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load roles.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
            No roles match.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {filtered.map((u) => (
              <div
                key={u.name}
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted text-muted-foreground p-1.5 rounded-md">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{u.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {u.can_login && (
                        <Badge variant="outline" className="text-xs">
                          LOGIN
                        </Badge>
                      )}
                      {u.is_superuser && (
                        <Badge variant="destructive" className="text-xs">
                          SUPERUSER
                        </Badge>
                      )}
                      {u.create_db && (
                        <Badge variant="secondary" className="text-xs">
                          CREATEDB
                        </Badge>
                      )}
                      {u.create_role && (
                        <Badge variant="secondary" className="text-xs">
                          CREATEROLE
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setToDrop(u.name)}
                  disabled={u.is_superuser}
                  title={
                    u.is_superuser
                      ? "Cannot drop superuser from this UI"
                      : "Drop role"
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
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
