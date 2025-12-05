import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Trash2, Edit, Plus } from "lucide-react";
import {
  useNotifications,
  useDeleteNotification,
} from "@/lib/api/notifications";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { NotificationDialog } from "./notification-dialog";
import type { NotificationConfig } from "@/lib/types/api";

export function NotificationList() {
  const { isDemo } = useAuth();
  const { data: notifications, isLoading } = useNotifications();
  const deleteNotification = useDeleteNotification();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationConfig | null>(null);

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteNotification.mutateAsync(id);
      toast.success(`Notification "${name}" deleted successfully`);
    } catch (error) {
      toast.error("Failed to delete notification");
    }
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notifications</h2>
          <p className="text-muted-foreground">
            Manage Discord webhook notifications
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isDemo}>
          <Plus className="h-4 w-4 mr-2" />
          Add Notification
        </Button>
      </div>

      {notifications?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No notifications configured
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              Add a Discord webhook to receive backup notifications
            </p>
            <Button onClick={handleCreate} disabled={isDemo}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Notification
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {notifications?.map((notification) => (
            <Card key={notification.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary p-2 rounded-lg">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>{notification.name}</CardTitle>
                      <CardDescription>
                        Updated{" "}
                        {formatDistanceToNow(
                          new Date(notification.updated_at),
                          { addSuffix: true }
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(notification)}
                      disabled={isDemo}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDelete(notification.id, notification.name)
                      }
                      disabled={deleteNotification.isPending || isDemo}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <NotificationDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        notification={editingNotification}
      />
    </div>
  );
}
