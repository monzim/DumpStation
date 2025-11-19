import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateStorageConfig,
  useUpdateStorageConfig,
} from "@/lib/api/storage";
import type { StorageConfig, StorageConfigInput } from "@/lib/types/api";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface StorageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storage?: StorageConfig | null;
}

export function StorageDialog({
  open,
  onOpenChange,
  storage,
}: StorageDialogProps) {
  const createStorageConfig = useCreateStorageConfig();
  const updateStorageConfig = useUpdateStorageConfig();
  const isEditing = !!storage;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StorageConfigInput>({
    defaultValues: {
      name: "",
      provider: "r2",
      access_key: "",
      secret_key: "",
      bucket: "",
      region: "",
      endpoint: "",
    },
  });

  const provider = watch("provider");

  useEffect(() => {
    if (storage) {
      reset({
        name: storage.name,
        provider: storage.provider,
        access_key: "********",
        secret_key: "********",
        bucket: storage.bucket,
        region: storage.region,
        endpoint: storage.endpoint,
      });
    } else {
      reset({
        name: "",
        provider: "r2",
        access_key: "",
        secret_key: "",
        bucket: "",
        region: "",
        endpoint: "",
      });
    }
  }, [storage, reset]);

  const onSubmit = async (data: StorageConfigInput) => {
    try {
      if (isEditing && storage) {
        await updateStorageConfig.mutateAsync({ id: storage.id, input: data });
        toast.success("Storage configuration updated successfully");
      } else {
        await createStorageConfig.mutateAsync(data);
        toast.success("Storage configuration created successfully");
      }
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(
        isEditing
          ? "Failed to update storage configuration"
          : "Failed to create storage configuration"
      );
    }
  };

  const isPending =
    createStorageConfig.isPending || updateStorageConfig.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Storage" : "Create Storage"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your storage backend configuration."
              : "Add a new S3 or R2 storage backend for backups."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My R2 Bucket"
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) =>
                setValue("provider", value as "s3" | "r2")
              }
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="r2">Cloudflare R2</SelectItem>
                <SelectItem value="s3">AWS S3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="access_key">Access Key</Label>
              <Input
                id="access_key"
                type="password"
                placeholder="your-access-key"
                {...register("access_key", {
                  required: "Access key is required",
                })}
              />
              {errors.access_key && (
                <p className="text-sm text-destructive">
                  {errors.access_key.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret_key">Secret Key</Label>
              <Input
                id="secret_key"
                type="password"
                placeholder="your-secret-key"
                {...register("secret_key", {
                  required: "Secret key is required",
                })}
              />
              {errors.secret_key && (
                <p className="text-sm text-destructive">
                  {errors.secret_key.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket">Bucket Name</Label>
            <Input
              id="bucket"
              placeholder="my-backup-bucket"
              {...register("bucket", { required: "Bucket name is required" })}
            />
            {errors.bucket && (
              <p className="text-sm text-destructive">
                {errors.bucket.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              placeholder={provider === "r2" ? "auto" : "us-east-1"}
              {...register("region")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint">Endpoint (Optional)</Label>
            <Input
              id="endpoint"
              placeholder="https://account-id.r2.cloudflarestorage.com"
              {...register("endpoint")}
            />
            <p className="text-xs text-muted-foreground">
              {provider === "r2"
                ? "Your R2 account endpoint URL"
                : "Leave empty for default AWS S3 endpoint"}
            </p>
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
