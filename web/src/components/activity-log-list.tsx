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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogs } from "@/lib/api/logs";
import type {
  ActivityLogAction,
  ActivityLogLevel,
  ActivityLogListParams,
} from "@/lib/types/api";
import { formatDate } from "@/lib/utils/format";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Info,
  RefreshCw,
  User,
} from "lucide-react";
import { useState } from "react";

const levelConfig = {
  info: {
    label: "Info",
    variant: "secondary" as const,
    icon: Info,
    color: "text-blue-600",
  },
  success: {
    label: "Success",
    variant: "default" as const,
    icon: CheckCircle2,
    color: "text-green-600",
  },
  warning: {
    label: "Warning",
    variant: "outline" as const,
    icon: AlertTriangle,
    color: "text-yellow-600",
  },
  error: {
    label: "Error",
    variant: "destructive" as const,
    icon: AlertCircle,
    color: "text-red-600",
  },
};

const actionLabels: Record<ActivityLogAction, string> = {
  login: "User Login",
  logout: "User Logout",
  storage_created: "Storage Created",
  storage_updated: "Storage Updated",
  storage_deleted: "Storage Deleted",
  notification_created: "Notification Created",
  notification_updated: "Notification Updated",
  notification_deleted: "Notification Deleted",
  database_created: "Database Created",
  database_updated: "Database Updated",
  database_deleted: "Database Deleted",
  database_paused: "Database Paused",
  database_unpaused: "Database Resumed",
  backup_triggered: "Backup Triggered",
  backup_started: "Backup Started",
  backup_completed: "Backup Completed",
  backup_failed: "Backup Failed",
  restore_triggered: "Restore Triggered",
  restore_started: "Restore Started",
  restore_completed: "Restore Completed",
  restore_failed: "Restore Failed",
  system_startup: "System Startup",
  system_shutdown: "System Shutdown",
};

export function ActivityLogList() {
  const [filters, setFilters] = useState<ActivityLogListParams>({
    limit: 50,
    offset: 0,
  });

  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useActivityLogs(filters);

  const handleFilterChange = (key: keyof ActivityLogListParams, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      offset: 0, // Reset to first page when changing filters
    }));
  };

  const handlePageChange = (direction: "prev" | "next") => {
    setFilters((prev) => ({
      ...prev,
      offset:
        direction === "next"
          ? (prev.offset || 0) + (prev.limit || 50)
          : Math.max(0, (prev.offset || 0) - (prev.limit || 50)),
    }));
  };

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
  const totalPages = data ? Math.ceil(data.total / (filters.limit || 50)) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-4">
          {[...Array(10)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Failed to Load Activity Logs
          </CardTitle>
          <CardDescription>
            {(error as { message?: string }).message ||
              "An error occurred while fetching activity logs"}
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Activity Logs</h2>
          <p className="text-muted-foreground">
            Monitor all system activities and events
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Log Level</label>
              <Select
                value={filters.level || "all"}
                onValueChange={(value) =>
                  handleFilterChange("level", value === "all" ? undefined : value as ActivityLogLevel)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Entity Type</label>
              <Select
                value={filters.entity_type || "all"}
                onValueChange={(value) =>
                  handleFilterChange("entity_type", value === "all" ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="backup">Backup</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Results Per Page</label>
              <Select
                value={filters.limit?.toString() || "50"}
                onValueChange={(value) => {
                  setFilters((prev) => ({
                    ...prev,
                    limit: parseInt(value),
                    offset: 0,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {data && (
        <div className="text-sm text-muted-foreground">
          Showing {data.logs.length > 0 ? (filters.offset || 0) + 1 : 0} to{" "}
          {Math.min((filters.offset || 0) + data.logs.length, data.total)} of{" "}
          {data.total} logs
        </div>
      )}

      {/* Activity Logs */}
      {!data || data.logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Activity Logs</h3>
            <p className="text-muted-foreground text-center">
              {filters.level || filters.entity_type
                ? "No logs match your current filters"
                : "Activity logs will appear here as actions are performed"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.logs.map((log) => {
            const config = levelConfig[log.level];
            const LevelIcon = config.icon;

            return (
              <Card
                key={log.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`mt-0.5 ${config.color}`}>
                        <LevelIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">
                            {actionLabels[log.action] || log.action}
                          </CardTitle>
                          <Badge variant={config.variant} className="text-xs">
                            {config.label}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {log.description}
                        </CardDescription>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {formatDate(log.created_at)}
                          </span>
                          {log.entity_name && (
                            <span className="flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              {log.entity_name}
                            </span>
                          )}
                          {log.user && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {log.user.discord_username}
                            </span>
                          )}
                          {log.ip_address && (
                            <span className="flex items-center gap-1">
                              IP: {log.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > (filters.limit || 50) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange("prev")}
              disabled={(filters.offset || 0) === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange("next")}
              disabled={
                (filters.offset || 0) + (filters.limit || 50) >= data.total
              }
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
