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
import { useBackups } from "@/lib/api/backups";
import { useDatabases } from "@/lib/api/databases";
import type { Backup } from "@/lib/types/api";
import { formatBytes, formatDate } from "@/lib/utils/format";
import {
  AlertCircle,
  Archive,
  Calendar,
  Database,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { BackupDetailsDialog } from "./backup-details-dialog";

const statusConfig = {
  success: {
    label: "Success",
    variant: "default" as const,
    color: "text-green-600",
  },
  failed: {
    label: "Failed",
    variant: "destructive" as const,
    color: "text-red-600",
  },
  running: {
    label: "Running",
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  pending: {
    label: "Pending",
    variant: "outline" as const,
    color: "text-yellow-600",
  },
};

export function BackupList() {
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const {
    data: backups,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useBackups();
  const { data: databases } = useDatabases();

  const getDatabaseName = (databaseId: string) => {
    const db = databases?.find((d) => d.id === databaseId);
    return db?.name || "Unknown Database";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Failed to Load Backups
          </CardTitle>
          <CardDescription>
            {(error as { message?: string }).message ||
              "An error occurred while fetching backups"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refetch()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Backup History</h2>
          <p className="text-muted-foreground">
            View and manage all database backups
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isRefetching}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {!backups || backups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Backups Yet</h3>
            <p className="text-muted-foreground text-center">
              Backups will appear here once they are created
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {backups.map((backup) => {
            const config = statusConfig[backup.status];
            return (
              <Card
                key={backup.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedBackup(backup)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Archive className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{backup.name}</CardTitle>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <Database className="h-3 w-3" />
                    {getDatabaseName(backup.database_id)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(backup.timestamp)}</span>
                    </div>
                    {backup.size_bytes > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <HardDrive className="h-4 w-4" />
                        <span>{formatBytes(backup.size_bytes)}</span>
                      </div>
                    )}
                    {backup.error_message && (
                      <div className="flex items-start gap-2 text-destructive text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {backup.error_message}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedBackup && (
        <BackupDetailsDialog
          backup={selectedBackup}
          databaseName={getDatabaseName(selectedBackup.database_id)}
          open={!!selectedBackup}
          onOpenChange={(open) => !open && setSelectedBackup(null)}
        />
      )}
    </div>
  );
}
