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
  Grid3X3,
  List,
  MoreVertical,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DatabaseBackupsDialog } from "./database-backups-dialog";

type ViewMode = "card" | "list";

interface DatabaseListSettings {
  viewMode: ViewMode;
}

const STORAGE_KEY = "database-list-settings";

function getStoredSettings(): DatabaseListSettings {
  if (typeof window === "undefined") {
    return { viewMode: "card" };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as DatabaseListSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return { viewMode: "card" };
}

function saveSettings(settings: DatabaseListSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function DatabaseList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<DatabaseConfig | null>(
    null
  );
  const [viewBackupsDatabase, setViewBackupsDatabase] =
    useState<DatabaseConfig | null>(null);
  const [deletingDatabase, setDeletingDatabase] =
    useState<DatabaseConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<DatabaseListSettings>(() =>
    getStoredSettings()
  );

  const { data: databases, isLoading } = useDatabases();
  const deleteMutation = useDeleteDatabase();
  const pauseMutation = usePauseDatabase();
  const unpauseMutation = useUnpauseDatabase();
  const triggerBackupMutation = useTriggerBackup();

  const navigate = useNavigate();

  // Sync settings to localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleViewModeChange = (mode: ViewMode) => {
    setSettings((prev) => ({ ...prev, viewMode: mode }));
  };

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

  const renderDatabaseActions = (database: DatabaseConfig) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setEditingDatabase(database)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePauseToggle(database)}>
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
        <DropdownMenuItem onClick={() => handleTriggerBackup(database)}>
          <Archive className="h-4 w-4 mr-2" />
          Trigger Backup
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setViewBackupsDatabase(database)}>
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
  );

  const renderCardView = (databases: DatabaseConfig[]) => (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {databases.map((database) => (
        <Card
          key={database.id}
          className="relative cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
          onClick={() =>
            navigate({
              to: `/databases/${database.id}`,
            })
          }
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Database className="h-5 w-5 text-primary shrink-0" />
                <CardTitle className="text-lg truncate">
                  {database.name}
                </CardTitle>
              </div>
              {renderDatabaseActions(database)}
            </div>
            <CardDescription className="truncate">
              {database.host}:{database.port}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Database:</span>
              <span className="font-mono truncate ml-2">{database.dbname}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Schedule:</span>
                <span className="font-mono text-xs">{database.schedule}</span>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {parseCronExpression(database.schedule)}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Version:</span>
              <span>{database.postgres_version || "Unknown"}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {database.paused ? (
                <Badge variant="secondary">Paused</Badge>
              ) : (
                <Badge variant="default">Active</Badge>
              )}
              {database.enabled && <Badge variant="outline">Enabled</Badge>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderListView = (databases: DatabaseConfig[]) => (
    <div className="border rounded-lg overflow-hidden">
      {/* Desktop Table Header */}
      <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 bg-muted/50 border-b font-medium text-sm text-muted-foreground">
        <span>Database</span>
        <span>Host</span>
        <span>Schedule</span>
        <span>Status</span>
        <span className="w-10" />
      </div>
      <div className="divide-y">
        {databases.map((database) => (
          <div
            key={database.id}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() =>
              navigate({
                to: `/databases/${database.id}`,
              })
            }
          >
            {/* Desktop Row */}
            <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 items-center">
              <div className="flex items-center gap-3 min-w-0">
                <Database className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{database.name}</p>
                  <p className="text-sm text-muted-foreground font-mono truncate">
                    {database.dbname}
                  </p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm truncate">
                  {database.host}:{database.port}
                </p>
                <p className="text-xs text-muted-foreground">
                  PostgreSQL {database.postgres_version || "?"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs truncate">
                  {database.schedule}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {parseCronExpression(database.schedule)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {database.paused ? (
                  <Badge variant="secondary">Paused</Badge>
                ) : (
                  <Badge variant="default">Active</Badge>
                )}
              </div>
              {renderDatabaseActions(database)}
            </div>

            {/* Mobile Row */}
            <div className="md:hidden p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Database className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{database.name}</p>
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {database.host}:{database.port}
                    </p>
                  </div>
                </div>
                {renderDatabaseActions(database)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Database: </span>
                  <span className="font-mono">{database.dbname}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Version: </span>
                  <span>{database.postgres_version || "?"}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {parseCronExpression(database.schedule)}
                </div>
                <div className="flex items-center gap-2">
                  {database.paused ? (
                    <Badge variant="secondary">Paused</Badge>
                  ) : (
                    <Badge variant="default">Active</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSkeletonCards = () => (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-6 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderSkeletonList = () => (
    <div className="border rounded-lg overflow-hidden">
      <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 bg-muted/50 border-b">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <div className="w-10" />
      </div>
      <div className="divide-y">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 items-center"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Database Configurations
            </h2>
            <p className="text-muted-foreground">
              Manage your PostgreSQL database backup configurations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Database</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Toolbar Section */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {databases?.length ?? 0} database
              {databases?.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-lg p-1 bg-muted/30">
              <Button
                variant={settings.viewMode === "card" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => handleViewModeChange("card")}
                className="h-7 w-7"
                title="Card view"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={settings.viewMode === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => handleViewModeChange("list")}
                className="h-7 w-7"
                title="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Settings Dropdown */}
            <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" className="h-9 w-9">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">View Settings</p>
                  <p className="text-xs text-muted-foreground">
                    Customize how databases are displayed
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleViewModeChange("card")}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Card View
                  </div>
                  {settings.viewMode === "card" && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleViewModeChange("list")}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    List View
                  </div>
                  {settings.viewMode === "list" && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          settings.viewMode === "card" ? (
            renderSkeletonCards()
          ) : (
            renderSkeletonList()
          )
        ) : databases && databases.length > 0 ? (
          settings.viewMode === "card" ? (
            renderCardView(databases)
          ) : (
            renderListView(databases)
          )
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No Databases Configured
              </h3>
              <p className="text-muted-foreground text-center mb-4 max-w-md">
                Get started by adding your first database configuration to
                enable automated backups
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
