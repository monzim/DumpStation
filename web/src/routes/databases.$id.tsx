import { useAuth } from "@/components/auth-provider";
import { DashboardNav } from "@/components/dashboard-nav";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDatabaseBackups,
  useDatabaseById,
  useDeleteDatabase,
  usePauseDatabase,
  useTriggerBackup,
  useUnpauseDatabase,
  useUpdateDatabase,
} from "@/lib/api/databases";
import { useNotificationById, useNotifications } from "@/lib/api/notifications";
import { useStorageConfigById, useStorageConfigs } from "@/lib/api/storage";
import type { BackupStatus, DatabaseConfigInput } from "@/lib/types/api";
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
  Check,
  CheckCircle,
  Clock,
  Copy,
  Database,
  Edit3,
  HardDrive,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Server,
  Settings,
  Shield,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatabaseIcon } from "@/components/database-icon";
import { LabelBadge } from "@/components/ui/label-badge";

export const Route = createFileRoute("/databases/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { title: `Database Details - DumpStation` },
      {
        name: "description",
        content: `View and manage database configuration, backup history, and settings for database ${params.id}.`,
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      // Open Graph
      {
        property: "og:title",
        content: "Database Details - DumpStation",
      },
      {
        property: "og:description",
        content:
          "View database configuration, backup history, and manage settings.",
      },
      {
        property: "og:url",
        content: `https://dumpstation.monzim.com/databases/${params.id}`,
      },
      // Twitter Card
      {
        name: "twitter:title",
        content: "Database Details - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "View database configuration, backup history, and manage settings.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: `https://dumpstation.monzim.com/databases/${params.id}`,
      },
    ],
  }),
});

const statusConfig: Record<
  BackupStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
    bgColor: string;
    textColor: string;
  }
> = {
  success: {
    label: "Success",
    variant: "default",
    icon: CheckCircle,
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-500",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle,
    bgColor: "bg-red-500/10",
    textColor: "text-red-500",
  },
  running: {
    label: "Running",
    variant: "secondary",
    icon: Loader2,
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-500",
  },
  pending: {
    label: "Pending",
    variant: "outline",
    icon: Clock,
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-500",
  },
};

// Common cron presets
const cronPresets = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 2 AM", value: "0 2 * * *" },
  { label: "Weekly on Sunday", value: "0 0 * * 0" },
  { label: "Monthly", value: "0 0 1 * *" },
];

function RouteComponent() {
  const databaseId = Route.useParams().id;
  const navigator = useNavigate();
  const { logout } = useAuth();
  const currentTab = "databases";

  // State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Queries
  const {
    data: database,
    isLoading: isDatabaseLoading,
    refetch: refetchDatabase,
  } = useDatabaseById(databaseId);
  const {
    data: backups,
    isLoading: isBackupsLoading,
    refetch: refetchBackups,
  } = useDatabaseBackups(databaseId);
  const { data: notification, isLoading: isNotificationLoading } =
    useNotificationById(database?.notification_id || "");
  const { data: storage, isLoading: isStorageLoading } = useStorageConfigById(
    database?.storage_id || ""
  );
  const { data: allStorages } = useStorageConfigs();
  const { data: allNotifications } = useNotifications();

  // Mutations
  const pauseMutation = usePauseDatabase();
  const unpauseMutation = useUnpauseDatabase();
  const triggerBackupMutation = useTriggerBackup();
  const updateMutation = useUpdateDatabase();
  const deleteMutation = useDeleteDatabase();

  // Form state for edit
  const [editForm, setEditForm] = useState<Partial<DatabaseConfigInput>>({});

  const handleCopy = async (text: string, field: string) => {
    await window.navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePauseToggle = async () => {
    if (!database) return;
    try {
      if (database.paused) {
        await unpauseMutation.mutateAsync(database.id);
      } else {
        await pauseMutation.mutateAsync(database.id);
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleTriggerBackup = async () => {
    if (!database) return;
    try {
      await triggerBackupMutation.mutateAsync(database.id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleOpenEditDialog = () => {
    if (!database) return;
    setEditForm({
      name: database.name,
      host: database.host,
      port: database.port,
      user: database.user,
      dbname: database.dbname,
      schedule: database.schedule,
      storage_id: database.storage_id,
      notification_id: database.notification_id,
      password: "",
      rotation_policy: { type: "count", value: 7 },
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateDatabase = async () => {
    if (!database || !editForm.name) return;
    try {
      await updateMutation.mutateAsync({
        id: database.id,
        input: editForm as DatabaseConfigInput,
      });
      setIsEditDialogOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDatabase = async () => {
    if (!database) return;
    try {
      await deleteMutation.mutateAsync(database.id);
      setIsDeleteDialogOpen(false);
      navigator({ to: "/databases" });
    } catch {
      // Error handled by mutation
    }
  };

  const handleLogout = () => {
    logout();
    toast.info("Logged out successfully");
  };

  const handleRefresh = () => {
    refetchDatabase();
    refetchBackups();
    toast.success("Data refreshed");
  };

  const handleTabChange = (_tab: string) => {
    // Navigation is handled by DashboardNav
  };

  // Loading skeleton
  if (isDatabaseLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/20">
        <Header
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
        />
        <main className="container mx-auto px-4 py-6 lg:py-8 max-w-7xl">
          <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>

            {/* Stats skeleton */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>

            {/* Content skeleton */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-80 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-48 rounded-xl" />
                <Skeleton className="h-48 rounded-xl" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Not found state
  if (!database) {
    return (
      <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/20">
        <Header
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
        />
        <main className="container mx-auto px-4 py-6 lg:py-8 max-w-7xl">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-muted p-6 mb-6">
              <Database className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Database Not Found</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              The database configuration you're looking for doesn't exist or may
              have been deleted.
            </p>
            <Button onClick={() => navigator({ to: "/databases" })} size="lg">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Databases
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Calculate stats
  const successCount =
    backups?.filter((b) => b.status === "success").length || 0;
  const failedCount = backups?.filter((b) => b.status === "failed").length || 0;
  const totalSize =
    backups?.reduce((acc, b) => acc + (b.size_bytes ?? 0), 0) || 0;
  const successRate = backups?.length
    ? Math.round((successCount / backups.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/20">
      <Header
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onRefresh={handleRefresh}
        onLogout={handleLogout}
      />

      <main className="container mx-auto px-4 py-6 lg:py-8 max-w-7xl">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigator({ to: "/databases" })}
                className="shrink-0 mt-1"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <DatabaseIcon databaseId={database.id} size="lg" />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    {database.name}
                  </h1>
                  <div className="flex items-center gap-2">
                    {database.paused ? (
                      <Badge
                        variant="secondary"
                        className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                      >
                        <PauseCircle className="h-3 w-3 mr-1" />
                        Paused
                      </Badge>
                    ) : (
                      <Badge
                        variant="default"
                        className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    {database.enabled && (
                      <Badge variant="outline" className="hidden sm:flex">
                        <Shield className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground text-sm sm:text-base font-mono">
                  {database.host}:{database.port}/{database.dbname}
                </p>
                {database.labels && database.labels.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-2">
                    {database.labels.map((label) => (
                      <LabelBadge key={label.id} label={label} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseToggle}
                disabled={pauseMutation.isPending || unpauseMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                {pauseMutation.isPending || unpauseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : database.paused ? (
                  <PlayCircle className="h-4 w-4 mr-2" />
                ) : (
                  <PauseCircle className="h-4 w-4 mr-2" />
                )}
                {database.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerBackup}
                disabled={triggerBackupMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                {triggerBackupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Backup Now
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenEditDialog}
                className="flex-1 sm:flex-none"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatsCard
              icon={Archive}
              label="Total Backups"
              value={backups?.length || 0}
              subtext="All time"
              iconColor="text-blue-500"
              iconBg="bg-blue-500/10"
            />
            <StatsCard
              icon={CheckCircle}
              label="Success Rate"
              value={`${successRate}%`}
              subtext={`${successCount} successful`}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
            />
            <StatsCard
              icon={XCircle}
              label="Failed"
              value={failedCount}
              subtext="Requires attention"
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
            />
            <StatsCard
              icon={HardDrive}
              label="Storage Used"
              value={formatBytes(totalSize)}
              subtext="Total backup size"
              iconColor="text-purple-500"
              iconBg="bg-purple-500/10"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Configuration Card */}
              <Card className="pt-0">
                <CardHeader className="bg-linear-to-r from-primary/5 to-transparent py-4 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Server className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          Connection Details
                        </CardTitle>
                        <CardDescription>
                          Database connection configuration
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleOpenEditDialog}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoField
                      label="Host"
                      value={database.host}
                      mono
                      onCopy={() => handleCopy(database.host, "host")}
                      isCopied={copiedField === "host"}
                    />
                    <InfoField
                      label="Port"
                      value={String(database.port)}
                      mono
                      onCopy={() => handleCopy(String(database.port), "port")}
                      isCopied={copiedField === "port"}
                    />
                    <InfoField
                      label="Database Name"
                      value={database.dbname}
                      mono
                      onCopy={() => handleCopy(database.dbname, "dbname")}
                      isCopied={copiedField === "dbname"}
                    />
                    <InfoField
                      label="Username"
                      value={database.user}
                      mono
                      onCopy={() => handleCopy(database.user, "user")}
                      isCopied={copiedField === "user"}
                    />
                    <InfoField
                      label="PostgreSQL Version"
                      value={database.postgres_version || "Unknown"}
                    />
                    <InfoField
                      label="Version Checked"
                      value={formatDate(database.version_last_checked)}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Backup Schedule
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <code className="text-sm bg-muted px-3 py-1.5 rounded-md font-mono">
                        {database.schedule}
                      </code>
                      <span className="text-sm text-muted-foreground">
                        {parseCronExpression(database.schedule)}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium">
                        {formatDate(database.created_at)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">
                        Last Updated
                      </span>
                      <p className="font-medium">
                        {formatDate(database.updated_at)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Backup History */}
              <Card className="pt-0">
                <CardHeader className="bg-linear-to-r from-primary/5 to-transparent py-4 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          Backup History
                        </CardTitle>
                        <CardDescription>
                          Recent backup operations
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchBackups()}
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isBackupsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 rounded-lg border"
                        >
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : backups && backups.length > 0 ? (
                    <div className="space-y-2">
                      {backups.slice(0, 10).map((backup) => {
                        const config = statusConfig[backup.status];
                        const StatusIcon = config.icon;
                        return (
                          <div
                            key={backup.id}
                            className="group flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div
                              className={`p-2.5 rounded-full ${config.bgColor} ${config.textColor}`}
                            >
                              <StatusIcon
                                className={`h-4 w-4 ${backup.status === "running" ? "animate-spin" : ""}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="font-medium text-sm truncate max-w-[200px] sm:max-w-none">
                                  {backup.name ||
                                    `Backup #${backup.id.slice(0, 8)}`}
                                </p>
                                <Badge
                                  variant={config.variant}
                                  className={`text-xs ${config.bgColor} ${config.textColor} border-0`}
                                >
                                  {config.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
                                <p className="text-xs text-destructive mt-2 line-clamp-2">
                                  {backup.error_message}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      {backups.length > 10 && (
                        <p className="text-center text-sm text-muted-foreground pt-4">
                          Showing 10 of {backups.length} backups
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <Archive className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="font-medium mb-1">No backups yet</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Trigger a manual backup or wait for the scheduled backup
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTriggerBackup}
                        disabled={triggerBackupMutation.isPending}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Create First Backup
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Storage Card */}
              <Card className="pt-0">
                <CardHeader className="bg-linear-to-r from-purple-500/5 to-transparent  py-4 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <HardDrive className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Storage</CardTitle>
                      <CardDescription className="text-xs">
                        Backup destination
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isStorageLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ) : storage ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{storage.name}</span>
                        <Badge variant="outline" className="uppercase text-xs">
                          {storage.provider}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Bucket</span>
                          <span className="font-mono text-foreground">
                            {storage.bucket}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Region</span>
                          <span className="text-foreground">
                            {storage.region}
                          </span>
                        </div>
                      </div>
                      {storage.endpoint && (
                        <p className="text-xs text-muted-foreground font-mono truncate pt-2 border-t">
                          {storage.endpoint}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No storage configured
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Notification Card */}
              <Card className="pt-0">
                <CardHeader className="bg-linear-to-r from-amber-500/5 to-transparent py-4 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Bell className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Notifications</CardTitle>
                      <CardDescription className="text-xs">
                        Alert settings
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isNotificationLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ) : notification ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{notification.name}</span>
                        <Badge variant="outline" className="text-xs">
                          Discord
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>Created</span>
                          <span className="text-foreground text-xs">
                            {formatDate(notification.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No notifications configured
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className=" pt-0">
                <CardHeader className="bg-linear-to-r from-destructive/5 to-transparent py-4 rounded-t-xl">
                  <CardTitle className="text-base text-destructive">
                    Danger Zone
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Irreversible actions
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Database
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Edit Database Configuration
            </DialogTitle>
            <DialogDescription>
              Update the database connection settings and backup configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editForm.name || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="My Database"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={editForm.host || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, host: e.target.value })
                  }
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={editForm.port || ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      port: parseInt(e.target.value) || 5432,
                    })
                  }
                  placeholder="5432"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dbname">Database Name</Label>
                <Input
                  id="dbname"
                  value={editForm.dbname || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, dbname: e.target.value })
                  }
                  placeholder="mydb"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user">Username</Label>
                <Input
                  id="user"
                  value={editForm.user || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, user: e.target.value })
                  }
                  placeholder="postgres"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={editForm.password || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, password: e.target.value })
                }
                placeholder="Leave blank to keep current password"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="schedule">Backup Schedule</Label>
              <Select
                value={editForm.schedule || ""}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, schedule: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a schedule" />
                </SelectTrigger>
                <SelectContent>
                  {cronPresets.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={editForm.schedule || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, schedule: e.target.value })
                }
                placeholder="Or enter custom cron expression"
                className="mt-2 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="storage">Storage Configuration</Label>
              <Select
                value={editForm.storage_id || ""}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, storage_id: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select storage" />
                </SelectTrigger>
                <SelectContent>
                  {allStorages?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification">Notification (Optional)</Label>
              <Select
                value={editForm.notification_id || "none"}
                onValueChange={(value) =>
                  setEditForm({
                    ...editForm,
                    notification_id: value === "none" ? undefined : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select notification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No notification</SelectItem>
                  {allNotifications?.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateDatabase}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Database
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{database.name}"? This action
              cannot be undone. All backup history will be preserved, but no new
              backups will be created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDatabase}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Header Component
function Header({
  currentTab,
  onTabChange,
  onRefresh,
  onLogout,
}: {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="border-b bg-background/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-linear-to-br from-primary to-primary/80 text-primary-foreground p-2 rounded-xl shadow-lg shadow-primary/20">
              <Database className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                DumpStation
              </h1>
              <p className="text-xs text-muted-foreground">
                PostgreSQL Backup Service
              </p>
            </div>
          </div>

          <DashboardNav
            currentTab={currentTab}
            onTabChange={onTabChange}
            onRefresh={onRefresh}
            onLogout={onLogout}
            isRefreshing={false}
          />
        </div>
      </div>
    </header>
  );
}

// Stats Card Component
function StatsCard({
  icon: Icon,
  label,
  value,
  subtext,
  iconColor,
  iconBg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtext: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight">
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
          <div className={`p-2 sm:p-3 rounded-xl ${iconBg}`}>
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Info Field Component
function InfoField({
  label,
  value,
  mono = false,
  onCopy,
  isCopied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  isCopied?: boolean;
}) {
  return (
    <div className="space-y-1 group">
      <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
        {onCopy && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onCopy}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
