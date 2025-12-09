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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { LabelBadge } from "@/components/ui/label-badge";
import {
  Bell,
  Trash2,
  Edit,
  Plus,
  MoreVertical,
  Check,
  Loader2,
  Tags,
} from "lucide-react";
import {
  useNotifications,
  useDeleteNotification,
} from "@/lib/api/notifications";
import { useLabels, useAssignLabelsToNotification } from "@/lib/api/labels";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { NotificationDialog } from "./notification-dialog";
import type { NotificationConfig } from "@/lib/types/api";

export function NotificationList() {
  const { isDemo } = useAuth();
  const { data: notifications, isLoading } = useNotifications();
  const { data: labels } = useLabels();
  const deleteNotification = useDeleteNotification();
  const assignLabelsMutation = useAssignLabelsToNotification();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationConfig | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDialogNotification, setLabelDialogNotification] =
    useState<NotificationConfig | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);

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

  const handleManageLabels = (notification: NotificationConfig) => {
    setLabelDialogNotification(notification);
    setLabelDialogOpen(true);
  };

  const handleQuickLabelToggle = async (labelId: string) => {
    if (!labelDialogNotification) return;

    const currentLabelIds =
      labelDialogNotification.labels?.map((l) => l.id) || [];
    const newLabelIds = currentLabelIds.includes(labelId)
      ? currentLabelIds.filter((id) => id !== labelId)
      : [...currentLabelIds, labelId];

    setLabelLoading(true);
    try {
      await assignLabelsMutation.mutateAsync({
        notificationId: labelDialogNotification.id,
        labelIds: newLabelIds,
      });
      toast.success("Labels updated");
    } catch {
      toast.error("Failed to update labels");
    } finally {
      setLabelLoading(false);
    }
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
                      {notification.labels &&
                        notification.labels.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {notification.labels.map((label) => (
                              <LabelBadge
                                key={label.id}
                                label={label}
                                size="sm"
                              />
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onClick={() => handleEdit(notification)}
                        disabled={isDemo}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleManageLabels(notification)}
                      >
                        <Tags className="h-4 w-4 mr-2" />
                        Labels
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          handleDelete(notification.id, notification.name)
                        }
                        disabled={deleteNotification.isPending || isDemo}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      {/* Label Management Dialog */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Labels</DialogTitle>
          </DialogHeader>
          <Command className="border rounded-lg">
            <CommandInput placeholder="Search labels..." />
            <CommandEmpty>No labels found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-y-auto">
              {labels?.map((label) => {
                const isSelected = labelDialogNotification?.labels?.some(
                  (l) => l.id === label.id
                );
                return (
                  <CommandItem
                    key={label.id}
                    onSelect={() => handleQuickLabelToggle(label.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1">{label.name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Loading Overlay */}
      {labelLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card p-6 rounded-lg shadow-lg flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Updating labels...</span>
          </div>
        </div>
      )}
    </div>
  );
}
