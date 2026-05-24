import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  useDbServers,
  useDeleteDbServer,
  useTestDbServer,
} from "@/lib/api/db-servers";
import type { ServerConnection } from "@/lib/types/api";
import {
  CheckCircle2,
  MoreVertical,
  Plus,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Pencil,
  Trash2,
  PlugZap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export function DbServerList() {
  const { data, isLoading, isError, refetch } = useDbServers();
  const deleteMutation = useDeleteDbServer();
  const testMutation = useTestDbServer();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerConnection | null>(null);
  const [toDelete, setToDelete] = useState<ServerConnection | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.user.toLowerCase().includes(q)
    );
  }, [data, search]);

  const onTest = async (s: ServerConnection) => {
    try {
      const r = await testMutation.mutateAsync(s.id);
      if (r.ok) {
        toast.success(
          `Connected via ${r.ssl_mode}${r.latency ? ` in ${r.latency}` : ""}`
        );
      } else {
        toast.error(r.message ?? "Connection failed");
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Connection failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DB Servers</h1>
          <p className="text-sm text-muted-foreground">
            Register PostgreSQL servers and administer their databases, tables,
            and users without leaving DumpStation.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Server
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, host, or user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load server connections.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasSearch={search.length > 0}
          onAdd={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              onEdit={() => {
                setEditing(s);
                setDialogOpen(true);
              }}
              onDelete={() => setToDelete(s)}
              onTest={() => onTest(s)}
            />
          ))}
        </div>
      )}

      <DbServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        server={editing}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete server connection?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>
                  This removes the stored credentials for{" "}
                  <strong>{toDelete.name}</strong>. Databases on the remote
                  server are not touched. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!toDelete) return;
                await deleteMutation.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ServerCard({
  server,
  onEdit,
  onDelete,
  onTest,
}: {
  server: ServerConnection;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const status = server.last_test_status;
  return (
    <Card className="group relative overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">
                {server.name}
              </CardTitle>
              <CardDescription className="text-xs truncate font-mono">
                {server.host}:{server.port}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onTest}>
                <PlugZap className="h-4 w-4 mr-2" /> Test connection
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="font-mono text-xs">
            {server.user}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            ssl: {server.ssl_mode}
          </Badge>
          {status === "ok" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30">
              <ShieldCheck className="h-3 w-3 mr-1" /> Healthy
            </Badge>
          )}
          {status === "failed" && (
            <Badge variant="destructive" className="text-xs">
              <ShieldAlert className="h-3 w-3 mr-1" /> Failed
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {server.last_tested_at
            ? `Last tested ${formatDistanceToNow(new Date(server.last_tested_at), {
                addSuffix: true,
              })}`
            : "Not yet tested"}
        </div>
        <Link
          to="/db-servers/$id"
          params={{ id: server.id }}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <CheckCircle2 className="h-4 w-4" />
          Manage databases & users
        </Link>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  hasSearch,
  onAdd,
}: {
  hasSearch: boolean;
  onAdd: () => void;
}) {
  if (hasSearch) {
    return (
      <Card>
        <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
          No server connections match your search.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-dashed">
      <CardContent className="pt-12 pb-12 flex flex-col items-center gap-3 text-center">
        <div className="bg-primary/10 text-primary p-3 rounded-2xl">
          <Server className="h-8 w-8" />
        </div>
        <h3 className="font-semibold text-base">No servers yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Register a PostgreSQL server to create databases, manage users, and
          grant access directly from DumpStation. Credentials are encrypted at
          rest.
        </p>
        <Button onClick={onAdd} className="mt-2">
          <Plus className="h-4 w-4 mr-2" /> Add your first server
        </Button>
      </CardContent>
    </Card>
  );
}
