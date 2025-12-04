import { useState } from "react";
import { useRestoreBackup } from "@/lib/api/backups";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Archive,
  Database,
  Calendar,
  HardDrive,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import type { Backup, RestoreRequest } from "@/lib/types/api";
import { DatabaseIconSimple } from "./database-icon";

interface BackupDetailsDialogProps {
  backup: Backup;
  databaseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  success: {
    label: "Success",
    variant: "default" as const,
    icon: CheckCircle2,
    color: "text-green-600",
  },
  failed: {
    label: "Failed",
    variant: "destructive" as const,
    icon: AlertCircle,
    color: "text-red-600",
  },
  running: {
    label: "Running",
    variant: "secondary" as const,
    icon: Loader2,
    color: "text-blue-600",
  },
  pending: {
    label: "Pending",
    variant: "outline" as const,
    icon: Archive,
    color: "text-yellow-600",
  },
};

export function BackupDetailsDialog({
  backup,
  databaseName,
  open,
  onOpenChange,
}: BackupDetailsDialogProps) {
  const [showRestoreForm, setShowRestoreForm] = useState(false);
  const [restoreRequest, setRestoreRequest] = useState<RestoreRequest>({});
  const restoreMutation = useRestoreBackup();

  const config = statusConfig[backup.status];
  const StatusIcon = config.icon;

  const handleRestore = async () => {
    try {
      await restoreMutation.mutateAsync({
        backupId: backup.id,
        request:
          Object.keys(restoreRequest).length > 0 ? restoreRequest : undefined,
      });
      toast.success("Restore job created successfully", {
        description: "The backup restoration process has been initiated",
      });
      setShowRestoreForm(false);
      setRestoreRequest({});
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to restore backup", {
        description:
          (error as { message?: string }).message || "An error occurred",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{backup.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <DatabaseIconSimple databaseId={backup.database_id} size="xs" />
                {databaseName}
              </DialogDescription>
            </div>
            <Badge variant={config.variant} className="flex items-center gap-1">
              <StatusIcon
                className={`h-3 w-3 ${backup.status === "running" ? "animate-spin" : ""}`}
              />
              {config.label}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Backup Information */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Archive className="h-3 w-3" />
                  Backup ID
                </Label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {backup.id}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <DatabaseIconSimple
                    databaseId={backup.database_id}
                    size="xs"
                  />
                  Database ID
                </Label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {backup.database_id}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created At
                </Label>
                <p className="text-sm">{formatDate(backup.timestamp)}</p>
              </div>
              {backup.completed_at && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Completed At
                  </Label>
                  <p className="text-sm">{formatDate(backup.completed_at)}</p>
                </div>
              )}
            </div>

            {backup.size_bytes > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  Backup Size
                </Label>
                <p className="text-sm">{formatBytes(backup.size_bytes)}</p>
              </div>
            )}

            {backup.storage_path && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  Storage Path
                </Label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded break-all">
                  {backup.storage_path}
                </p>
              </div>
            )}

            {backup.error_message && (
              <div className="space-y-1">
                <Label className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Error Message
                </Label>
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {backup.error_message}
                </p>
              </div>
            )}
          </div>

          {/* Restore Section */}
          {backup.status === "success" && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Restore Backup
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Restore this backup to the original or a new database
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRestoreForm(!showRestoreForm)}
                  >
                    {showRestoreForm ? "Cancel" : "Configure Restore"}
                  </Button>
                </div>

                {showRestoreForm && (
                  <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      Leave fields empty to restore to the original database
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="target_host">Target Host</Label>
                        <Input
                          id="target_host"
                          placeholder="e.g., staging-db.example.com"
                          value={restoreRequest.target_host || ""}
                          onChange={(e) =>
                            setRestoreRequest({
                              ...restoreRequest,
                              target_host: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="target_port">Target Port</Label>
                        <Input
                          id="target_port"
                          type="number"
                          placeholder="5432"
                          value={restoreRequest.target_port || ""}
                          onChange={(e) =>
                            setRestoreRequest({
                              ...restoreRequest,
                              target_port:
                                parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="target_dbname">Target Database</Label>
                        <Input
                          id="target_dbname"
                          placeholder="e.g., restored_db"
                          value={restoreRequest.target_dbname || ""}
                          onChange={(e) =>
                            setRestoreRequest({
                              ...restoreRequest,
                              target_dbname: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="target_user">Target User</Label>
                        <Input
                          id="target_user"
                          placeholder="e.g., postgres"
                          value={restoreRequest.target_user || ""}
                          onChange={(e) =>
                            setRestoreRequest({
                              ...restoreRequest,
                              target_user: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target_password">Target Password</Label>
                      <Input
                        id="target_password"
                        type="password"
                        placeholder="Enter database password"
                        value={restoreRequest.target_password || ""}
                        onChange={(e) =>
                          setRestoreRequest({
                            ...restoreRequest,
                            target_password: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {backup.status === "success" && (
            <Button
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
              className="w-full sm:w-auto"
            >
              {restoreMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Backup
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
