import { AppLayout } from "@/components/app-layout";
import { NotificationDialog } from "@/components/notification-dialog";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDatabases } from "@/lib/api/databases";
import {
  useDeleteNotification,
  useNotifications,
  useTestNotification,
} from "@/lib/api/notifications";
import type { NotificationConfig } from "@/lib/types/api";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  Check,
  Clock,
  Database,
  Edit2,
  ExternalLink,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Notifications - DumpStation" },
      {
        name: "description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Notifications - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/notifications",
      },
      {
        name: "twitter:title",
        content: "Notifications - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/notifications",
      },
    ],
  }),
});

function NotificationCard({
  notification,
  linkedDatabases,
  onEdit,
  onDelete,
  onTest,
  isTestPending,
}: {
  notification: NotificationConfig;
  linkedDatabases: number;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTestPending: boolean;
}) {
  const isActive = linkedDatabases > 0;

  return (
    <div className="group relative rounded-xl border bg-card p-4 transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
      {/* Active indicator line */}
      <div
        className={`absolute left-0 top-4 bottom-4 w-1 rounded-full transition-colors ${
          isActive ? "bg-emerald-500" : "bg-muted"
        }`}
      />

      <div className="flex items-start gap-4 pl-3">
        {/* Discord Icon */}
        <div className="relative shrink-0">
          <div className="h-12 w-12 rounded-xl bg-[#5865F2]/10 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-[#5865F2]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          {isActive && (
            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
              <Check className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">
                  {notification.name}
                </h3>
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={`text-[10px] px-1.5 py-0 h-5 ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : ""
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                Discord Webhook
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onTest}
                      disabled={isTestPending}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      {isTestPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Send test</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Actions - Always visible */}
            <div className="flex items-center gap-1 shrink-0 sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={onTest}
                disabled={isTestPending}
                className="h-8 w-8 text-muted-foreground"
              >
                {isTestPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <Database className="h-3 w-3" />
              {linkedDatabases}{" "}
              {linkedDatabases === 1 ? "database" : "databases"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(notification.updated_at), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsPage() {
  const {
    data: notifications,
    isLoading,
    refetch,
    isRefetching,
  } = useNotifications();
  const { data: databases } = useDatabases();
  const deleteNotification = useDeleteNotification();
  const testNotification = useTestNotification();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationConfig | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] =
    useState<NotificationConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Calculate linked databases for each notification
  const getLinkedDatabasesCount = (notificationId: string) => {
    return (
      databases?.filter((db) => db.notification_id === notificationId).length ||
      0
    );
  };

  const handleEdit = (notification: NotificationConfig) => {
    setEditingNotification(notification);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingNotification(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingNotification(null);
  };

  const handleDeleteClick = (notification: NotificationConfig) => {
    setNotificationToDelete(notification);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!notificationToDelete) return;

    try {
      await deleteNotification.mutateAsync(notificationToDelete.id);
      toast.success(`"${notificationToDelete.name}" deleted successfully`);
    } catch {
      toast.error("Failed to delete notification");
    } finally {
      setDeleteDialogOpen(false);
      setNotificationToDelete(null);
    }
  };

  const handleTest = async (notification: NotificationConfig) => {
    setTestingId(notification.id);
    try {
      await testNotification.mutateAsync(notification.id);
      toast.success("Test notification sent successfully");
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setTestingId(null);
    }
  };

  const handleRefresh = () => refetch();

  // Calculate stats
  const totalWebhooks = notifications?.length ?? 0;
  const activeWebhooks =
    notifications?.filter((n) =>
      databases?.some((db) => db.notification_id === n.id)
    ).length ?? 0;
  const dbsWithAlerts =
    databases?.filter((db) => db.notification_id).length ?? 0;
  const dbsWithoutAlerts =
    databases?.filter((db) => !db.notification_id).length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-linear-to-br from-[#5865F2] to-[#7289DA] flex items-center justify-center shadow-lg shadow-[#5865F2]/20">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Notifications
                </h1>
                <p className="text-sm text-muted-foreground hidden sm:block">
                  Discord webhooks for backup alerts
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                disabled={isRefetching}
                variant="ghost"
                size="icon"
                className="h-9 w-9"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button onClick={handleCreate} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Webhook</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total
              </span>
              <Bell className="h-4 w-4 text-muted-foreground/50" />
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {totalWebhooks}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active
              </span>
              <Zap className="h-4 w-4 text-emerald-500" />
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {activeWebhooks}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                With Alerts
              </span>
              <Database className="h-4 w-4 text-blue-500" />
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                {dbsWithAlerts}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                No Alerts
              </span>
              <BellOff className="h-4 w-4 text-amber-500" />
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {dbsWithoutAlerts}
              </p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-4">
          {/* Section Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Configured Webhooks</h2>
              {notifications && notifications.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5 px-1.5">
                  {notifications.length}
                </Badge>
              )}
            </div>
          </div>

          {/* Webhooks List */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-4 pl-3">
                    <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                      <Skeleton className="h-4 w-24" />
                      <div className="flex gap-3">
                        <Skeleton className="h-6 w-24 rounded-md" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 px-4">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-1">No webhooks yet</h3>
                <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
                  Add a Discord webhook to receive real-time notifications for
                  your backup events
                </p>
                <Button onClick={handleCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Webhook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  linkedDatabases={getLinkedDatabasesCount(notification.id)}
                  onEdit={() => handleEdit(notification)}
                  onDelete={() => handleDeleteClick(notification)}
                  onTest={() => handleTest(notification)}
                  isTestPending={testingId === notification.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-[#5865F2]/10 flex items-center justify-center shrink-0">
              <ExternalLink className="h-5 w-5 text-[#5865F2]" />
            </div>
            <div className="space-y-1 min-w-0">
              <h4 className="font-medium text-sm">
                How to get a Discord Webhook URL
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Server Settings → Integrations → Webhooks → New Webhook → Copy
                URL
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <NotificationDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        notification={editingNotification}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{notificationToDelete?.name}"?
              {getLinkedDatabasesCount(notificationToDelete?.id || "") > 0 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Warning: This webhook is linked to{" "}
                  {getLinkedDatabasesCount(notificationToDelete?.id || "")}{" "}
                  database(s). They will no longer receive notifications.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNotification.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
