import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDatabaseBackups,
  useDatabaseById,
  usePauseDatabase,
  useTriggerBackup,
  useUnpauseDatabase,
} from "@/lib/api/databases";
import { useNotificationById } from "@/lib/api/notifications";
import { useStorageConfigById } from "@/lib/api/storage";
import { BackupStatus } from "@/lib/types/api";
import {
  formatBytes,
  formatDate,
  parseCronExpression,
} from "@/lib/utils/format";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Database,
  HardDrive,
  Loader2,
  PauseCircle,
  PlayCircle,
  Server,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/databases/$id")({
  component: RouteComponent,
});

const statusConfig: Record<
  BackupStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: { label: "Success", variant: "default", icon: CheckCircle },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
  running: { label: "Running", variant: "secondary", icon: Loader2 },
  pending: { label: "Pending", variant: "outline", icon: Clock },
};

function RouteComponent() {
  const databaseId = Route.useParams().id;
  const navigator = useNavigate();

  const { data: database, isLoading: isDatabaseLoading } =
    useDatabaseById(databaseId);
  const { data: backups, isLoading: isBackupsLoading } =
    useDatabaseBackups(databaseId);

  const { data: notification, isLoading: isNotificationLoading } =
    useNotificationById(database?.notification_id || "");
  const { data: storage, isLoading: isStorageLoading } = useStorageConfigById(
    database?.storage_id || ""
  );

  const pauseMutation = usePauseDatabase();
  const unpauseMutation = useUnpauseDatabase();
  const triggerBackupMutation = useTriggerBackup();

  const handlePauseToggle = async () => {
    if (!database) return;
    if (database.paused) {
      await unpauseMutation.mutateAsync(database.id);
    } else {
      await pauseMutation.mutateAsync(database.id);
    }
  };

  const handleTriggerBackup = async () => {
    if (!database) return;
    await triggerBackupMutation.mutateAsync(database.id);
  };

  if (isDatabaseLoading) {
    return (
      <div className="space-y-6 container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!database) {
    return (
      <div className="flex flex-col items-center justify-center py-12 container mx-auto px-4 py-8">
        <Database className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Database Not Found</h3>
        <p className="text-muted-foreground text-center mb-4">
          The database configuration you're looking for doesn't exist.
        </p>
        <Button
          onClick={() =>
            navigator({
              to: `/dashboard?tab=databases`,
            })
          }
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard?tab=databases">
              Databases
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{database.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                navigator({
                  to: `/dashboard?tab=databases`,
                })
              }
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{database.name}</h1>
              <p className="text-muted-foreground">
                {database.host}:{database.port}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {database.paused ? (
            <Badge variant="secondary" className="h-6">
              Paused
            </Badge>
          ) : (
            <Badge variant="default" className="h-6">
              Active
            </Badge>
          )}
          {database.enabled && (
            <Badge variant="outline" className="h-6">
              Enabled
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handlePauseToggle} variant="outline">
          {database.paused ? (
            <>
              <PlayCircle className="h-4 w-4 mr-2" />
              Resume Backups
            </>
          ) : (
            <>
              <PauseCircle className="h-4 w-4 mr-2" />
              Pause Backups
            </>
          )}
        </Button>
        <Button onClick={handleTriggerBackup} variant="outline">
          <Archive className="h-4 w-4 mr-2" />
          Trigger Manual Backup
        </Button>
      </div>

      {/* Configuration Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Configuration Details
          </CardTitle>
          <CardDescription>
            Database connection and backup configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Host</p>
              <p className="text-sm font-mono">{database.host}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Port</p>
              <p className="text-sm font-mono">{database.port}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Database Name
              </p>
              <p className="text-sm font-mono">{database.dbname}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">User</p>
              <p className="text-sm font-mono">{database.user}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                PostgreSQL Version
              </p>
              <p className="text-sm">{database.postgres_version}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Version Last Checked
              </p>
              <p className="text-sm">
                {formatDate(database.version_last_checked)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Backup Schedule
            </p>
            <p className="text-sm font-mono">{database.schedule}</p>
            <p className="text-sm text-muted-foreground">
              {parseCronExpression(database.schedule)}
            </p>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Created At
              </p>
              <p className="text-sm">{formatDate(database.created_at)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Updated At
              </p>
              <p className="text-sm">{formatDate(database.updated_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Storage Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Configuration
          </CardTitle>
          <CardDescription>Where backups are stored</CardDescription>
        </CardHeader>
        <CardContent>
          {isStorageLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : storage ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{storage.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {storage.provider}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {storage.bucket}
                    </p>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Region
                  </p>
                  <p className="text-sm">{storage.region}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Endpoint
                  </p>
                  <p className="text-sm font-mono text-xs break-all">
                    {storage.endpoint}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No storage configuration found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notification Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>Where backup notifications are sent</CardDescription>
        </CardHeader>
        <CardContent>
          {isNotificationLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : notification ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{notification.name}</p>
                <p className="text-sm text-muted-foreground">
                  Discord webhook configured
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Created At
                  </p>
                  <p className="text-sm">
                    {formatDate(notification.created_at)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Updated At
                  </p>
                  <p className="text-sm">
                    {formatDate(notification.updated_at)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No notification configuration found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Backup History
          </CardTitle>
          <CardDescription>Recent backups for this database</CardDescription>
        </CardHeader>
        <CardContent>
          {isBackupsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : backups && backups.length > 0 ? (
            <div className="space-y-3">
              {backups.slice(0, 10).map((backup) => {
                const config = statusConfig[backup.status];
                const StatusIcon = config.icon;
                return (
                  <div
                    key={backup.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div
                        className={`p-2 rounded-full ${
                          backup.status === "success"
                            ? "bg-green-100 text-green-600"
                            : backup.status === "failed"
                              ? "bg-red-100 text-red-600"
                              : backup.status === "running"
                                ? "bg-blue-100 text-blue-600"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        <StatusIcon
                          className={`h-5 w-5 ${backup.status === "running" ? "animate-spin" : ""}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium truncate">
                            {backup.storage_path || "Backup in progress"}
                          </p>
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(backup.timestamp)}
                          </span>
                          {backup.size_bytes > 0 && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              {formatBytes(backup.size_bytes)}
                            </span>
                          )}
                        </div>
                        {backup.error_message && (
                          <p className="text-xs text-destructive mt-1">
                            {backup.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Archive className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No backups yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
