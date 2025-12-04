import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Filter,
  Globe,
  Info,
  RefreshCw,
  Search,
  Server,
  User,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DatabaseIconSimple } from "./database-icon";

const levelConfig = {
  info: {
    label: "Info",
    variant: "secondary" as const,
    icon: Info,
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    textColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  success: {
    label: "Success",
    variant: "default" as const,
    icon: CheckCircle2,
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  warning: {
    label: "Warning",
    variant: "outline" as const,
    icon: AlertTriangle,
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    textColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  error: {
    label: "Error",
    variant: "destructive" as const,
    icon: AlertCircle,
    bgColor: "bg-red-50 dark:bg-red-950/30",
    textColor: "text-red-600 dark:text-red-400",
    borderColor: "border-red-200 dark:border-red-800",
  },
};

const actionLabels: Record<ActivityLogAction, string> = {
  login: "Login",
  logout: "Logout",
  storage_created: "Storage Created",
  storage_updated: "Storage Updated",
  storage_deleted: "Storage Deleted",
  notification_created: "Notification Created",
  notification_updated: "Notification Updated",
  notification_deleted: "Notification Deleted",
  database_created: "DB Created",
  database_updated: "DB Updated",
  database_deleted: "DB Deleted",
  database_paused: "DB Paused",
  database_unpaused: "DB Resumed",
  backup_triggered: "Backup Triggered",
  backup_started: "Backup Started",
  backup_completed: "Backup Complete",
  backup_failed: "Backup Failed",
  restore_triggered: "Restore Triggered",
  restore_started: "Restore Started",
  restore_completed: "Restore Complete",
  restore_failed: "Restore Failed",
  system_startup: "System Start",
  system_shutdown: "System Stop",
};

function formatRelativeTime(dateString: string): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatFullDate(dateString: string): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

export function ActivityLogList() {
  const [filters, setFilters] = useState<ActivityLogListParams>({
    limit: 25,
    offset: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [actionCategory, setActionCategory] = useState<string>("all");

  const { data, isLoading, error, refetch, isRefetching } =
    useActivityLogs(filters);

  const handleFilterChange = (
    key: keyof ActivityLogListParams,
    value: string | undefined
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      offset: 0,
    }));
  };

  const handleActionCategoryChange = (category: string) => {
    setActionCategory(category);
    if (category === "all") {
      handleFilterChange("action", undefined);
    }
  };

  const handlePageChange = (direction: "prev" | "next") => {
    setFilters((prev) => ({
      ...prev,
      offset:
        direction === "next"
          ? (prev.offset || 0) + (prev.limit || 25)
          : Math.max(0, (prev.offset || 0) - (prev.limit || 25)),
    }));
  };

  const clearFilters = () => {
    setFilters({ limit: 25, offset: 0 });
    setSearchQuery("");
    setActionCategory("all");
  };

  const hasActiveFilters =
    filters.level ||
    filters.entity_type ||
    filters.action ||
    actionCategory !== "all";

  const currentPage =
    Math.floor((filters.offset || 0) / (filters.limit || 25)) + 1;
  const totalPages = data ? Math.ceil(data.total / (filters.limit || 25)) : 0;

  // Filter logs by search query (client-side)
  const filteredLogs = useMemo(() => {
    if (!data?.logs || !searchQuery.trim()) return data?.logs || [];
    const query = searchQuery.toLowerCase();
    return data.logs.filter(
      (log) =>
        log.description.toLowerCase().includes(query) ||
        log.entity_name?.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.user?.discord_username?.toLowerCase().includes(query)
    );
  }, [data?.logs, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-destructive">
              Failed to Load Activity Logs
            </h3>
            <p className="text-sm text-muted-foreground">
              {(error as { message?: string }).message ||
                "An error occurred while fetching activity logs"}
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Activity Logs
          </h2>
          <p className="text-sm text-muted-foreground">
            {data?.total || 0} total events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {
                  [
                    filters.level,
                    filters.entity_type,
                    actionCategory !== "all",
                  ].filter(Boolean).length
                }
              </span>
            )}
          </Button>
          <Button
            onClick={() => refetch()}
            disabled={isRefetching}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs by description, entity, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Level
                  </label>
                  <Select
                    value={filters.level || "all"}
                    onValueChange={(value) =>
                      handleFilterChange(
                        "level",
                        value === "all"
                          ? undefined
                          : (value as ActivityLogLevel)
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="info">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          Info
                        </span>
                      </SelectItem>
                      <SelectItem value="success">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Success
                        </span>
                      </SelectItem>
                      <SelectItem value="warning">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          Warning
                        </span>
                      </SelectItem>
                      <SelectItem value="error">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Error
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Entity Type
                  </label>
                  <Select
                    value={filters.entity_type || "all"}
                    onValueChange={(value) =>
                      handleFilterChange(
                        "entity_type",
                        value === "all" ? undefined : value
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="user">
                        <span className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          User
                        </span>
                      </SelectItem>
                      <SelectItem value="storage">
                        <span className="flex items-center gap-2">
                          <Server className="h-3 w-3" />
                          Storage
                        </span>
                      </SelectItem>
                      <SelectItem value="database">
                        <span className="flex items-center gap-2">
                          <Database className="h-3 w-3" />
                          Database
                        </span>
                      </SelectItem>
                      <SelectItem value="backup">
                        <span className="flex items-center gap-2">
                          <ArrowDownUp className="h-3 w-3" />
                          Backup
                        </span>
                      </SelectItem>
                      <SelectItem value="system">
                        <span className="flex items-center gap-2">
                          <Globe className="h-3 w-3" />
                          System
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Action Category
                  </label>
                  <Select
                    value={actionCategory}
                    onValueChange={handleActionCategoryChange}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="auth">Authentication</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="backup">Backup</SelectItem>
                      <SelectItem value="restore">Restore</SelectItem>
                      <SelectItem value="storage">Storage</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Per Page
                  </label>
                  <Select
                    value={filters.limit?.toString() || "25"}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        limit: parseInt(value),
                        offset: 0,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 flex items-center gap-2 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Active filters:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {filters.level && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        {levelConfig[filters.level].label}
                        <button
                          onClick={() => handleFilterChange("level", undefined)}
                          className="ml-0.5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {filters.entity_type && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        {filters.entity_type}
                        <button
                          onClick={() =>
                            handleFilterChange("entity_type", undefined)
                          }
                          className="ml-0.5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {actionCategory !== "all" && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        {actionCategory}
                        <button
                          onClick={() => handleActionCategoryChange("all")}
                          className="ml-0.5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="ml-auto h-7 text-xs"
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity Log Table/List */}
      {!data || filteredLogs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No Activity Logs</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {hasActiveFilters || searchQuery
                ? "No logs match your current filters. Try adjusting your search criteria."
                : "Activity logs will appear here as actions are performed in the system."}
            </p>
            {(hasActiveFilters || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[100px]">
                      Level
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Action
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Description
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[140px]">
                      Entity
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[120px]">
                      User
                    </th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-3 w-[100px]">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLogs.map((log) => {
                    const config = levelConfig[log.level];
                    const LevelIcon = config.icon;

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}
                          >
                            <LevelIcon className="h-3 w-3" />
                            {config.label}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">
                            {actionLabels[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-muted-foreground line-clamp-1"
                            title={log.description}
                          >
                            {log.description}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {log.entity_name ? (
                            <div className="flex items-center gap-1.5">
                              {log.entity_id ? (
                                <DatabaseIconSimple
                                  databaseId={log.entity_id}
                                  size="xs"
                                />
                              ) : (
                                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span
                                className="truncate max-w-[100px]"
                                title={log.entity_name}
                              >
                                {log.entity_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.user ? (
                            <div
                              className="flex items-center gap-1.5"
                              title={log.user.discord_username}
                            >
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="truncate max-w-20">
                                {log.user.discord_username}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              System
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className="text-muted-foreground text-xs"
                            title={formatFullDate(log.created_at)}
                          >
                            {formatRelativeTime(log.created_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-2">
            {filteredLogs.map((log) => {
              const config = levelConfig[log.level];
              const LevelIcon = config.icon;

              return (
                <div
                  key={log.id}
                  className={`rounded-lg border p-3 ${config.bgColor} ${config.borderColor}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div
                        className={`mt-0.5 p-1.5 rounded-full bg-background/80 ${config.textColor}`}
                      >
                        <LevelIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {actionLabels[log.action] || log.action}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${config.textColor} ${config.borderColor}`}
                          >
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {log.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span
                            className="flex items-center gap-1"
                            title={formatFullDate(log.created_at)}
                          >
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(log.created_at)}
                          </span>
                          {log.entity_name && (
                            <span className="flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              <span className="truncate max-w-20">
                                {log.entity_name}
                              </span>
                            </span>
                          )}
                          {log.user && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span className="truncate max-w-[60px]">
                                {log.user.discord_username}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      {data && data.total > (filters.limit || 25) && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium">
              {filteredLogs.length > 0 ? (filters.offset || 0) + 1 : 0}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(
                (filters.offset || 0) + filteredLogs.length,
                data.total
              )}
            </span>{" "}
            of <span className="font-medium">{data.total}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange("prev")}
              disabled={(filters.offset || 0) === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <div className="flex items-center gap-1 px-2">
              <span className="text-sm font-medium">{currentPage}</span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm text-muted-foreground">
                {totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange("next")}
              disabled={
                (filters.offset || 0) + (filters.limit || 25) >= data.total
              }
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
