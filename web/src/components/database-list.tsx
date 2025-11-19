import { DatabaseDialog } from "@/components/database-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDatabases,
  useDeleteDatabase,
  usePauseDatabase,
  useTriggerBackup,
  useUnpauseDatabase,
} from "@/lib/api/databases";
import type { DatabaseConfig } from "@/lib/types/api";
import { parseCronExpression } from "@/lib/utils/format";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Database,
  MoreVertical,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { DatabaseBackupsDialog } from "./database-backups-dialog";

export function DatabaseList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<DatabaseConfig | null>(
    null
  );
  const [viewBackupsDatabase, setViewBackupsDatabase] =
    useState<DatabaseConfig | null>(null);
  const [deletingDatabase, setDeletingDatabase] =
    useState<DatabaseConfig | null>(null);

  const { data: databases, isLoading } = useDatabases();
  const deleteMutation = useDeleteDatabase();
  const pauseMutation = usePauseDatabase();
  const unpauseMutation = useUnpauseDatabase();
  const triggerBackupMutation = useTriggerBackup();

  const navigate = useNavigate();

  const handleDelete = async () => {
    if (!deletingDatabase) return;
    await deleteMutation.mutateAsync(deletingDatabase.id);
    setDeletingDatabase(null);
  };

  const handlePauseToggle = async (database: DatabaseConfig) => {
    if (database.paused) {
      await unpauseMutation.mutateAsync(database.id);
    } else {
      await pauseMutation.mutateAsync(database.id);
    }
  };

  const handleTriggerBackup = async (database: DatabaseConfig) => {
    await triggerBackupMutation.mutateAsync(database.id);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Database Configurations</h2>
            <p className="text-muted-foreground">
              Manage your PostgreSQL database backup configurations
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Database
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : databases && databases.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {databases.map((database) => (
              <Card
                key={database.id}
                className="relative cursor-pointer transition-all hover:shadow-md"
                onClick={() =>
                  navigate({
                    to: `/databases/${database.id}`,
                  })
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{database.name}</CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={() => setEditingDatabase(database)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handlePauseToggle(database)}
                        >
                          {database.paused ? (
                            <>
                              <PlayCircle className="h-4 w-4 mr-2" />
                              Resume
                            </>
                          ) : (
                            <>
                              <PauseCircle className="h-4 w-4 mr-2" />
                              Pause
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleTriggerBackup(database)}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Trigger Backup
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setViewBackupsDatabase(database)}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          View Backups
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingDatabase(database)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>
                    {database.host}:{database.port}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Database:</span>
                    <span className="font-mono">{database.dbname}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Schedule:</span>
                      <span className="font-mono text-xs">
                        {database.schedule}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {parseCronExpression(database.schedule)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version:</span>
                    <span>{database.postgres_version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {database.paused ? (
                      <Badge variant="secondary">Paused</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                    {database.enabled && (
                      <Badge variant="outline">Enabled</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No Databases Configured
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by adding your first database configuration
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Database
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <DatabaseDialog
        open={isCreateOpen || !!editingDatabase}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingDatabase(null);
          }
        }}
        database={editingDatabase}
      />

      <DatabaseBackupsDialog
        open={!!viewBackupsDatabase}
        onOpenChange={(open) => {
          if (!open) {
            setViewBackupsDatabase(null);
          }
        }}
        database={viewBackupsDatabase}
      />

      <AlertDialog
        open={!!deletingDatabase}
        onOpenChange={() => setDeletingDatabase(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Database Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the database configuration &quot;
              {deletingDatabase?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
