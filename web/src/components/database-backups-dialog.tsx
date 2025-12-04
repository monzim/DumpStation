import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDatabaseBackups } from "@/lib/api/databases";
import type { DatabaseConfig } from "@/lib/types/api";
import { formatBytes } from "@/lib/utils/format";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { DatabaseIcon } from "./database-icon";

interface DatabaseBackupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseConfig | null;
}

export function DatabaseBackupsDialog({
  open,
  onOpenChange,
  database,
}: DatabaseBackupsDialogProps) {
  const { data: backups, isLoading } = useDatabaseBackups(database?.id || "");

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge variant="default">Success</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
        return <Badge variant="secondary">Running</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {database && <DatabaseIcon databaseId={database.id} size="lg" />}
            <div>
              <DialogTitle>Backup History</DialogTitle>
              <DialogDescription>
                {database?.name} - {database?.dbname}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : backups && backups.length > 0 ? (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="mt-1">{getStatusIcon(backup.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">
                        {backup.name}
                      </span>
                      {getStatusBadge(backup.status)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="font-mono text-xs text-muted-foreground/70">
                        ID: {backup.id}
                      </p>
                      <p>
                        Started: {new Date(backup.timestamp).toLocaleString()}
                      </p>
                      {backup.completed_at && (
                        <p>
                          Completed:{" "}
                          {new Date(backup.completed_at).toLocaleString()}
                        </p>
                      )}
                      {backup.size_bytes > 0 && (
                        <p>Size: {formatBytes(backup.size_bytes)}</p>
                      )}
                      {backup.storage_path && (
                        <p className="font-mono text-xs break-all">
                          Path: {backup.storage_path}
                        </p>
                      )}
                      {backup.error_message && (
                        <p className="text-destructive">
                          Error: {backup.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No backups found for this database
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
