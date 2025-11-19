import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogs } from "@/lib/api/logs";
import type { ActivityLog } from "@/lib/types/api";
import { formatDate } from "@/lib/utils/format";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowRight,
} from "lucide-react";

interface RecentActivityProps {
  onViewAll?: () => void;
}

const levelConfig = {
  info: {
    icon: Info,
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  success: {
    icon: CheckCircle2,
    variant: "default" as const,
    color: "text-green-600",
  },
  warning: {
    icon: AlertTriangle,
    variant: "outline" as const,
    color: "text-yellow-600",
  },
  error: {
    icon: AlertCircle,
    variant: "destructive" as const,
    color: "text-red-600",
  },
};

const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    login: "User Login",
    storage_created: "Storage Created",
    storage_updated: "Storage Updated",
    storage_deleted: "Storage Deleted",
    database_created: "Database Created",
    database_updated: "Database Updated",
    database_deleted: "Database Deleted",
    database_paused: "Database Paused",
    database_unpaused: "Database Resumed",
    backup_triggered: "Backup Triggered",
    backup_completed: "Backup Completed",
    backup_failed: "Backup Failed",
    restore_initiated: "Restore Initiated",
    restore_completed: "Restore Completed",
    restore_failed: "Restore Failed",
    notification_created: "Notification Created",
    notification_updated: "Notification Updated",
    notification_deleted: "Notification Deleted",
    system_startup: "System Startup",
    system_shutdown: "System Shutdown",
  };
  return labels[action] || action;
};

export function RecentActivity({ onViewAll }: RecentActivityProps) {
  const { data, isLoading, error } = useActivityLogs({ limit: 10 });

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Failed to Load Activity
          </CardTitle>
          <CardDescription>
            {(error as { message?: string }).message ||
              "An error occurred while fetching activity logs"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Last 10 system events</CardDescription>
            </div>
          </div>
          {onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAll}
              className="gap-1"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No activity logs yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.logs.map((log: ActivityLog) => {
              const config = levelConfig[log.level];
              const Icon = config.icon;
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0"
                >
                  <div
                    className={`${config.color} bg-muted rounded-full p-2 flex-shrink-0`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm">
                        {getActionLabel(log.action)}
                      </p>
                      <Badge variant={config.variant} className="flex-shrink-0">
                        {log.level}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {log.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{formatDate(log.created_at)}</span>
                      {log.entity_name && (
                        <>
                          <span>•</span>
                          <span className="truncate">{log.entity_name}</span>
                        </>
                      )}
                      {log.user && (
                        <>
                          <span>•</span>
                          <span className="truncate">
                            {log.user.discord_username}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
