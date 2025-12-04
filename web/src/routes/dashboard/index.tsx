import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackups } from "@/lib/api/backups";
import { useDatabases } from "@/lib/api/databases";
import { useActivityLogs } from "@/lib/api/logs";
import { useSystemStats } from "@/lib/api/stats";
import type { Backup, DatabaseConfig, ActivityLog } from "@/lib/types/api";
import { formatBytes, formatPercentage } from "@/lib/utils/format";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
  head: () => ({
    meta: [
      { title: "Dashboard - DumpStation" },
      {
        name: "description",
        content:
          "Monitor and manage your PostgreSQL database backups. View backup status, storage usage, and system health in real-time.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Dashboard - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/dashboard",
      },
      {
        name: "twitter:title",
        content: "Dashboard - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/dashboard",
      },
    ],
  }),
});

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "danger";
  isLoading?: boolean;
}) {
  const iconVariants = {
    default: "bg-muted text-muted-foreground",
    success:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    warning:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    danger: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
  };

  const valueVariants = {
    default: "",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
          <div className={`p-2 rounded-lg ${iconVariants[variant]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-bold ${valueVariants[variant]}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FailedBackupItem({
  backup,
  database,
}: {
  backup: Backup;
  database?: DatabaseConfig;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/30">
      <div className="h-8 w-8 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0 mt-0.5">
        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">
            {database?.name || "Unknown Database"}
          </p>
          <Badge variant="destructive" className="text-[10px] h-5">
            Failed
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {backup.error_message || "Backup failed without error message"}
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-1.5">
          {formatDistanceToNow(new Date(backup.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function DatabaseStatusItem({ database }: { database: DatabaseConfig }) {
  const isPaused = database.paused;
  const isDisabled = !database.enabled;

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`h-2 w-2 rounded-full shrink-0 ${
            isPaused || isDisabled ? "bg-amber-500" : "bg-emerald-500"
          }`}
        />
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{database.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {database.host}:{database.port}
          </p>
        </div>
      </div>
      <Badge
        variant={isPaused ? "secondary" : isDisabled ? "outline" : "default"}
        className="shrink-0 text-xs"
      >
        {isPaused ? "Paused" : isDisabled ? "Disabled" : "Active"}
      </Badge>
    </div>
  );
}

function ActivityItem({ log }: { log: ActivityLog }) {
  const levelConfig = {
    info: {
      icon: AlertCircle,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    success: {
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/50",
    },
    error: {
      icon: XCircle,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-950/50",
    },
  };

  const config = levelConfig[log.level];
  const Icon = config.icon;

  const actionLabels: Record<string, string> = {
    backup_completed: "Backup completed",
    backup_failed: "Backup failed",
    backup_triggered: "Backup started",
    database_created: "Database added",
    database_deleted: "Database removed",
    database_paused: "Database paused",
    database_unpaused: "Database resumed",
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className={`p-1.5 rounded-md ${config.bg} shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {actionLabels[log.action] || log.action}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {log.entity_name || log.description}
        </p>
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0">
        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
      </span>
    </div>
  );
}

function OverviewPage() {
  const navigate = useNavigate();
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch,
    isRefetching,
  } = useSystemStats();
  const { data: backups, isLoading: backupsLoading } = useBackups();
  const { data: databases, isLoading: databasesLoading } = useDatabases();
  const { data: activityData, isLoading: activityLoading } = useActivityLogs({
    limit: 5,
  });

  const handleRefresh = () => refetch();

  // Calculate additional stats from backups
  const failedBackups = backups?.filter((b) => b.status === "failed") || [];
  const pendingBackups =
    backups?.filter((b) => b.status === "pending" || b.status === "running") ||
    [];
  const recentFailedBackups = failedBackups.slice(0, 5);

  // Get database map for lookup
  const databaseMap = new Map(databases?.map((d) => [d.id, d]) || []);

  // Active vs paused databases
  const activeDatabases =
    databases?.filter((d) => d.enabled && !d.paused) || [];
  const pausedDatabases = databases?.filter((d) => d.paused) || [];

  const isLoading = statsLoading || backupsLoading || databasesLoading;

  if (statsError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Unable to load dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {(statsError as { message?: string }).message ||
                "Failed to connect to the server"}
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const successRate = stats?.success_rate_24h ?? 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            System overview and backup monitoring
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefetching}
          variant="outline"
          size="sm"
          className="w-fit gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Databases"
          value={stats?.total_databases ?? 0}
          subtitle={`${activeDatabases.length} active`}
          icon={Database}
          isLoading={isLoading}
        />
        <StatCard
          title="Backups Today"
          value={stats?.total_backups_24h ?? 0}
          subtitle="Last 24 hours"
          icon={Archive}
          isLoading={isLoading}
        />
        <StatCard
          title="Success Rate"
          value={formatPercentage(successRate)}
          subtitle="Last 24 hours"
          icon={CheckCircle2}
          variant={
            successRate >= 90
              ? "success"
              : successRate >= 70
                ? "warning"
                : "danger"
          }
          isLoading={isLoading}
        />
        <StatCard
          title="Storage Used"
          value={stats ? formatBytes(stats.total_storage_used_bytes) : "0 B"}
          subtitle="Total consumed"
          icon={HardDrive}
          isLoading={isLoading}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Server className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  activeDatabases.length
                )}
              </p>
              <p className="text-xs text-muted-foreground">Active DBs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  pausedDatabases.length
                )}
              </p>
              <p className="text-xs text-muted-foreground">Paused</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  failedBackups.length
                )}
              </p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Loader2
                className={`h-5 w-5 text-blue-600 dark:text-blue-400 ${pendingBackups.length > 0 ? "animate-spin" : ""}`}
              />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  pendingBackups.length
                )}
              </p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Failed Backups */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                Failed Backups
              </CardTitle>
              {failedBackups.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failedBackups.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {backupsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-3 rounded-lg bg-muted/30"
                  >
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentFailedBackups.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-medium">All backups successful</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No failed backups to display
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentFailedBackups.map((backup) => (
                  <FailedBackupItem
                    key={backup.id}
                    backup={backup}
                    database={databaseMap.get(backup.database_id)}
                  />
                ))}
                {failedBackups.length > 5 && (
                  <Button variant="ghost" className="w-full text-sm" asChild>
                    <Link to="/backups">
                      View all {failedBackups.length} failed backups
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                Database Status
              </CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-xs h-7">
                <Link to="/databases">
                  View All
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {databasesLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2.5 border-b"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : !databases || databases.length === 0 ? (
              <div className="text-center py-8">
                <Database className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No databases configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add a database to start backups
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link to="/databases">Add Database</Link>
                </Button>
              </div>
            ) : (
              <div>
                {databases.slice(0, 5).map((db) => (
                  <DatabaseStatusItem key={db.id} database={db} />
                ))}
                {databases.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-3">
                    +{databases.length - 5} more databases
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Activity
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/activity" })}
              className="text-xs h-7"
            >
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {activityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b">
                  <Skeleton className="h-7 w-7 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : !activityData || activityData.logs.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No recent activity</p>
              <p className="text-sm text-muted-foreground mt-1">
                Activity will appear here
              </p>
            </div>
          ) : (
            <div>
              {activityData.logs.map((log) => (
                <ActivityItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
