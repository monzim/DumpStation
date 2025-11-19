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
import { useDeleteStorageConfig, useStorageConfigs } from "@/lib/api/storage";
import type { StorageConfig } from "@/lib/types/api";
import { formatDistanceToNow } from "date-fns";
import { Cloud, Edit, HardDrive, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StorageDialog } from "./storage-dialog";

export function StorageList() {
  const { data: storageConfigs, isLoading } = useStorageConfigs();
  const deleteStorageConfig = useDeleteStorageConfig();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<StorageConfig | null>(
    null
  );

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteStorageConfig.mutateAsync(id);
      toast.success(`Storage "${name}" deleted successfully`);
    } catch (error) {
      toast.error("Failed to delete storage configuration");
    }
  };

  const handleEdit = (storage: StorageConfig) => {
    setEditingStorage(storage);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingStorage(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingStorage(null);
  };

  const getProviderBadge = (provider: string) => {
    return provider === "r2" ? (
      <Badge variant="secondary">Cloudflare R2</Badge>
    ) : (
      <Badge variant="secondary">AWS S3</Badge>
    );
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
          <h2 className="text-2xl font-bold">Storage</h2>
          <p className="text-muted-foreground">
            Manage S3 and R2 storage backends
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Storage
        </Button>
      </div>

      {storageConfigs?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No storage configured
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              Add an S3 or R2 storage backend to store your backups
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Storage
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {storageConfigs?.map((storage) => (
            <Card key={storage.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary p-2 rounded-lg">
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle>{storage.name}</CardTitle>
                        {getProviderBadge(storage.provider)}
                      </div>
                      <CardDescription>
                        Updated{" "}
                        {formatDistanceToNow(new Date(storage.updated_at), {
                          addSuffix: true,
                        })}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(storage)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(storage.id, storage.name)}
                      disabled={deleteStorageConfig.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Bucket</p>
                    <p className="font-medium">{storage.bucket}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Region</p>
                    <p className="font-medium">{storage.region}</p>
                  </div>
                  {storage.endpoint && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Endpoint</p>
                      <p className="font-medium text-xs truncate">
                        {storage.endpoint}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <StorageDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        storage={editingStorage}
      />
    </div>
  );
}
