import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CronBuilder } from "@/components/cron-builder";
import { LabelSelector } from "@/components/ui/label-selector";
import { useCreateDatabase, useUpdateDatabase } from "@/lib/api/databases";
import { useNotifications } from "@/lib/api/notifications";
import { useStorageConfigs } from "@/lib/api/storage";
import { useAssignLabelsToDatabase } from "@/lib/api/labels";
import type { DatabaseConfig, DatabaseConfigInput } from "@/lib/types/api";

interface DatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database?: DatabaseConfig | null;
}

export function DatabaseDialog({
  open,
  onOpenChange,
  database,
}: DatabaseDialogProps) {
  const isEditing = !!database;
  const createMutation = useCreateDatabase();
  const updateMutation = useUpdateDatabase();
  const assignLabelsMutation = useAssignLabelsToDatabase();
  const { data: notifications } = useNotifications();
  const { data: storageConfigs } = useStorageConfigs();
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<DatabaseConfigInput>({
    defaultValues: {
      name: "",
      host: "",
      port: 5432,
      user: "",
      password: "",
      dbname: "",
      schedule: "0 2 * * *",
      storage_id: "",
      notification_id: "",
      postgres_version: "latest",
      rotation_policy: {
        type: "days",
        value: 30,
      },
    },
  });

  const rotationType = watch("rotation_policy.type");

  useEffect(() => {
    if (database) {
      reset({
        name: database.name,
        host: database.host,
        port: database.port,
        user: database.user,
        password: "", // Don't populate password for security
        dbname: database.dbname,
        schedule: database.schedule,
        storage_id: database.storage_id,
        notification_id: database.notification_id,
        postgres_version: database.postgres_version,
        rotation_policy: {
          type: "days",
          value: 30,
        },
      });
      setSelectedLabelIds(database.labels?.map((l) => l.id) || []);
    } else {
      reset({
        name: "",
        host: "",
        port: 5432,
        user: "",
        password: "",
        dbname: "",
        schedule: "0 2 * * *",
        storage_id: "",
        notification_id: "",
        postgres_version: "latest",
        rotation_policy: {
          type: "days",
          value: 30,
        },
      });
      setSelectedLabelIds([]);
    }
  }, [database, reset]);

  const onSubmit = async (data: DatabaseConfigInput) => {
    try {
      if (isEditing && database) {
        await updateMutation.mutateAsync({ id: database.id, input: data });
        // Assign labels after update
        await assignLabelsMutation.mutateAsync({
          databaseId: database.id,
          labelIds: selectedLabelIds,
        });
      } else {
        const result = await createMutation.mutateAsync(data);
        // Assign labels after creation
        if (selectedLabelIds.length > 0) {
          await assignLabelsMutation.mutateAsync({
            databaseId: result.id,
            labelIds: selectedLabelIds,
          });
        }
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit" : "Add"} Database Configuration
          </DialogTitle>
          <DialogDescription>
            Configure a PostgreSQL database for automated backups
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Production DB"
                {...register("name", { required: "Name is required" })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="host">Host *</Label>
              <Input
                id="host"
                placeholder="db.example.com"
                {...register("host", { required: "Host is required" })}
              />
              {errors.host && (
                <p className="text-sm text-destructive">
                  {errors.host.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="port">Port *</Label>
              <Input
                id="port"
                type="number"
                placeholder="5432"
                {...register("port", {
                  required: "Port is required",
                  min: {
                    value: 1,
                    message: "Port must be between 1 and 65535",
                  },
                  max: {
                    value: 65535,
                    message: "Port must be between 1 and 65535",
                  },
                  valueAsNumber: true,
                })}
              />
              {errors.port && (
                <p className="text-sm text-destructive">
                  {errors.port.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user">User *</Label>
              <Input
                id="user"
                placeholder="backup_user"
                {...register("user", { required: "User is required" })}
              />
              {errors.user && (
                <p className="text-sm text-destructive">
                  {errors.user.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password", {
                  required: !isEditing ? "Password is required" : false,
                })}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep current password
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dbname">Database Name *</Label>
              <Input
                id="dbname"
                placeholder="proddb"
                {...register("dbname", {
                  required: "Database name is required",
                })}
              />
              {errors.dbname && (
                <p className="text-sm text-destructive">
                  {errors.dbname.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="postgres_version">PostgreSQL Version</Label>
              <Input
                id="postgres_version"
                placeholder="latest"
                {...register("postgres_version")}
              />
              <p className="text-xs text-muted-foreground">
                e.g., &quot;15&quot;, &quot;14&quot;, &quot;latest&quot;
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Backup Schedule</h4>
            <CronBuilder
              value={watch("schedule")}
              onChange={(value) => setValue("schedule", value)}
              error={errors.schedule?.message}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storage_id">Storage Backend *</Label>
              <Select
                value={watch("storage_id")}
                onValueChange={(value) => setValue("storage_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select storage" />
                </SelectTrigger>
                <SelectContent>
                  {storageConfigs?.map((storage) => (
                    <SelectItem key={storage.id} value={storage.id}>
                      {storage.name} ({storage.provider.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.storage_id && (
                <p className="text-sm text-destructive">
                  {errors.storage_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification_id">Notification Channel</Label>
              <Select
                value={watch("notification_id") || "none"}
                onValueChange={(value) =>
                  setValue("notification_id", value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select notification (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {notifications?.map((notification) => (
                    <SelectItem key={notification.id} value={notification.id}>
                      {notification.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Labels</h4>
            <LabelSelector
              selectedLabelIds={selectedLabelIds}
              onChange={setSelectedLabelIds}
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Rotation Policy</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rotation_type">Type *</Label>
                <Select
                  value={rotationType}
                  onValueChange={(value: "count" | "days") =>
                    setValue("rotation_policy.type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Keep for Days</SelectItem>
                    <SelectItem value="count">Keep Last Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rotation_value">
                  {rotationType === "days" ? "Days to Keep" : "Backups to Keep"}{" "}
                  *
                </Label>
                <Input
                  id="rotation_value"
                  type="number"
                  min={1}
                  placeholder="30"
                  {...register("rotation_policy.value", {
                    required: "Value is required",
                    min: { value: 1, message: "Value must be at least 1" },
                    valueAsNumber: true,
                  })}
                />
                {errors.rotation_policy?.value && (
                  <p className="text-sm text-destructive">
                    {errors.rotation_policy.value.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
