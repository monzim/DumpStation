import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateNotification,
  useUpdateNotification,
} from "@/lib/api/notifications";
import { toast } from "sonner";
import type {
  NotificationConfig,
  NotificationConfigInput,
} from "@/lib/types/api";

interface NotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification?: NotificationConfig | null;
}

export function NotificationDialog({
  open,
  onOpenChange,
  notification,
}: NotificationDialogProps) {
  const createNotification = useCreateNotification();
  const updateNotification = useUpdateNotification();
  const isEditing = !!notification;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NotificationConfigInput>({
    defaultValues: {
      name: "",
      discord_webhook_url: "",
    },
  });

  useEffect(() => {
    if (notification) {
      reset({
        name: notification.name,
        discord_webhook_url: "https://discord.com/api/webhooks/...",
      });
    } else {
      reset({
        name: "",
        discord_webhook_url: "",
      });
    }
  }, [notification, reset]);

  const onSubmit = async (data: NotificationConfigInput) => {
    try {
      if (isEditing && notification) {
        await updateNotification.mutateAsync({
          id: notification.id,
          input: data,
        });
        toast.success("Notification updated successfully");
      } else {
        await createNotification.mutateAsync(data);
        toast.success("Notification created successfully");
      }
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(
        isEditing
          ? "Failed to update notification"
          : "Failed to create notification"
      );
    }
  };

  const isPending =
    createNotification.isPending || updateNotification.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Notification" : "Create Notification"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your Discord webhook notification settings."
              : "Add a new Discord webhook to receive backup notifications."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="DevOps Alerts"
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook">Discord Webhook URL</Label>
            <Input
              id="webhook"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              {...register("discord_webhook_url", {
                required: "Webhook URL is required",
                pattern: {
                  value: /^https:\/\/discord\.com\/api\/webhooks\/.+/,
                  message: "Invalid Discord webhook URL",
                },
              })}
            />
            {errors.discord_webhook_url && (
              <p className="text-sm text-destructive">
                {errors.discord_webhook_url.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
