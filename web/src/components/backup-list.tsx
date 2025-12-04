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
import { useBackups } from "@/lib/api/backups";
import { useDatabases } from "@/lib/api/databases";
import type { Backup } from "@/lib/types/api";
import { formatBytes, formatDate } from "@/lib/utils/format";
import {
  AlertCircle,
  Archive,
  Calendar,
  Database,
  Grid3X3,
  HardDrive,
  List,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BackupDetailsDialog } from "./backup-details-dialog";

type ViewMode = "card" | "list";

interface BackupListSettings {
  viewMode: ViewMode;
}

const STORAGE_KEY = "backup-list-settings";

function getStoredSettings(): BackupListSettings {
  if (typeof window === "undefined") {
    return { viewMode: "card" };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as BackupListSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return { viewMode: "card" };
}

function saveSettings(settings: BackupListSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

const statusConfig = {
  success: {
    label: "Success",
    variant: "default" as const,
    color: "text-green-600",
  },
  failed: {
    label: "Failed",
    variant: "destructive" as const,
    color: "text-red-600",
  },
  running: {
    label: "Running",
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  pending: {
    label: "Pending",
    variant: "outline" as const,
    color: "text-yellow-600",
  },
};

export function BackupList() {
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<BackupListSettings>(() =>
    getStoredSettings()
  );
  const {
    data: backups,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useBackups();
  const { data: databases } = useDatabases();

  // Sync settings to localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleViewModeChange = (mode: ViewMode) => {
    setSettings((prev) => ({ ...prev, viewMode: mode }));
  };

  const getDatabaseName = (databaseId: string) => {
    const db = databases?.find((d) => d.id === databaseId);
    return db?.name || "Unknown Database";
  };

  const renderCardView = (backups: Backup[]) => (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {backups.map((backup) => {
        const config = statusConfig[backup.status];
        return (
          <Card
            key={backup.id}
            className="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
            onClick={() => setSelectedBackup(backup)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Archive className="h-5 w-5 text-muted-foreground shrink-0" />
                  <CardTitle className="text-lg truncate">
                    {backup.name}
                  </CardTitle>
                </div>
                <Badge variant={config.variant} className="shrink-0">
                  {config.label}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-2 truncate">
                <Database className="h-3 w-3 shrink-0" />
                {getDatabaseName(backup.database_id)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {formatDate(backup.timestamp)}
                  </span>
                </div>
                {backup.size_bytes > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="h-4 w-4 shrink-0" />
                    <span>{formatBytes(backup.size_bytes)}</span>
                  </div>
                )}
                {backup.error_message && (
                  <div className="flex items-start gap-2 text-destructive text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{backup.error_message}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const renderListView = (backups: Backup[]) => (
    <div className="border rounded-lg overflow-hidden">
      {/* Desktop Table Header */}
      <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 bg-muted/50 border-b font-medium text-sm text-muted-foreground">
        <span>Backup</span>
        <span>Database</span>
        <span>Date</span>
        <span>Size</span>
        <span>Status</span>
      </div>
      <div className="divide-y">
        {backups.map((backup) => {
          const config = statusConfig[backup.status];
          return (
            <div
              key={backup.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => setSelectedBackup(backup)}
            >
              {/* Desktop Row */}
              <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <Archive className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{backup.name}</p>
                    {backup.error_message && (
                      <p className="text-xs text-destructive truncate">
                        {backup.error_message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {getDatabaseName(backup.database_id)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {formatDate(backup.timestamp)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {backup.size_bytes > 0 ? formatBytes(backup.size_bytes) : "—"}
                </div>
                <div>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </div>
              </div>

              {/* Mobile Row */}
              <div className="md:hidden p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Archive className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{backup.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getDatabaseName(backup.database_id)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={config.variant} className="shrink-0">
                    {config.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(backup.timestamp)}</span>
                  </div>
                  {backup.size_bytes > 0 && (
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      <span>{formatBytes(backup.size_bytes)}</span>
                    </div>
                  )}
                </div>
                {backup.error_message && (
                  <div className="flex items-start gap-2 text-destructive text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{backup.error_message}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSkeletonCards = () => (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderSkeletonList = () => (
    <div className="border rounded-lg overflow-hidden">
      <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 bg-muted/50 border-b">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="divide-y">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="hidden md:grid md:grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 items-center"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded" />
          </div>
        </div>
        {settings.viewMode === "card"
          ? renderSkeletonCards()
          : renderSkeletonList()}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Failed to Load Backups
          </CardTitle>
          <CardDescription>
            {(error as { message?: string }).message ||
              "An error occurred while fetching backups"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refetch()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Backup History</h2>
          <p className="text-muted-foreground">
            View and manage all database backups
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isRefetching}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Toolbar Section */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {backups?.length ?? 0} backup{backups?.length !== 1 ? "s" : ""}
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
                  Customize how backups are displayed
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
      {!backups || backups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Backups Yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Backups will appear here once they are created from your database
              configurations
            </p>
          </CardContent>
        </Card>
      ) : settings.viewMode === "card" ? (
        renderCardView(backups)
      ) : (
        renderListView(backups)
      )}

      {selectedBackup && (
        <BackupDetailsDialog
          backup={selectedBackup}
          databaseName={getDatabaseName(selectedBackup.database_id)}
          open={!!selectedBackup}
          onOpenChange={(open) => !open && setSelectedBackup(null)}
        />
      )}
    </div>
  );
}
