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

// Notification configs accept Discord, Telegram, or both. At least one
// channel is required; the form validates client-side so the user gets
// immediate feedback rather than a 400 round trip.
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
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NotificationConfigInput>({
    defaultValues: {
      name: "",
      discord_webhook_url: "",
      telegram_bot_token: "",
      telegram_chat_id: "",
    },
  });

  useEffect(() => {
    if (notification) {
      // When editing, the API hands back masked credentials. Pre-filling
      // the form with the masked value would let the user save the mask
      // back as the secret — clear them instead. The user must re-enter
      // any credential they want to change.
      reset({
        name: notification.name,
        discord_webhook_url: "",
        telegram_bot_token: "",
        telegram_chat_id: "",
      });
    } else {
      reset({
        name: "",
        discord_webhook_url: "",
        telegram_bot_token: "",
        telegram_chat_id: "",
      });
    }
  }, [notification, reset]);

  const onSubmit = async (data: NotificationConfigInput) => {
    clearErrors();
    const hasDiscord = !!data.discord_webhook_url?.trim();
    const hasTelegram =
      !!data.telegram_bot_token?.trim() && !!data.telegram_chat_id?.trim();

    if (!hasDiscord && !hasTelegram) {
      setError("discord_webhook_url", {
        message: "Provide a Discord webhook URL, a Telegram pair, or both.",
      });
      return;
    }

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
    } catch {
      toast.error(
        isEditing
          ? "Failed to update notification"
          : "Failed to create notification"
      );
    }
  };

  const isPending =
    createNotification.isPending || updateNotification.isPending;

  const discordValue = watch("discord_webhook_url");
  const tgToken = watch("telegram_bot_token");
  const tgChat = watch("telegram_chat_id");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Notification" : "Create Notification"}
          </DialogTitle>
          <DialogDescription>
            Configure Discord, Telegram, or both. Provide at least one
            channel.
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

          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="webhook" className="font-medium">
              Discord Webhook URL
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {isEditing ? "(blank = keep existing)" : "(optional)"}
              </span>
            </Label>
            <Input
              id="webhook"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              {...register("discord_webhook_url", {
                pattern: discordValue
                  ? {
                      value: /^https:\/\/discord\.com\/api\/webhooks\/.+/,
                      message: "Invalid Discord webhook URL",
                    }
                  : undefined,
              })}
            />
            {errors.discord_webhook_url && (
              <p className="text-sm text-destructive">
                {errors.discord_webhook_url.message}
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="font-medium">
              Telegram
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {isEditing ? "(blank = keep existing)" : "(optional)"}
              </span>
            </Label>
            <Input
              id="tg-token"
              placeholder="Bot token (e.g. 123456789:ABC…)"
              {...register("telegram_bot_token", {
                validate: (v) =>
                  !v || !tgChat || /:/.test(v) || "Bot token must contain ':'",
              })}
            />
            {errors.telegram_bot_token && (
              <p className="text-sm text-destructive">
                {errors.telegram_bot_token.message}
              </p>
            )}
            <Input
              id="tg-chat"
              placeholder="Chat ID (e.g. -1001234567890 or 123456789)"
              {...register("telegram_chat_id", {
                validate: (v) =>
                  !!v === !!tgToken ||
                  "Provide both token and chat id, or neither",
              })}
            />
            {errors.telegram_chat_id && (
              <p className="text-sm text-destructive">
                {errors.telegram_chat_id.message}
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
