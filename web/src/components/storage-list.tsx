import { useAuth } from "@/components/auth-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useDatabases } from "@/lib/api/databases";
import { useDeleteStorageConfig, useStorageConfigs } from "@/lib/api/storage";
import { useLabels, useAssignLabelsToStorage } from "@/lib/api/labels";
import type { StorageConfig } from "@/lib/types/api";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  Clock,
  Cloud,
  Database,
  Edit2,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Zap,
  Tags,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StorageDialog } from "./storage-dialog";

// Cloudflare R2 Logo Component
function R2Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16.604 5.975c-.123-.47-.562-.8-1.053-.79l-9.48.177a.208.208 0 0 0-.194.154.212.212 0 0 0 .06.228l.616.492c.102.081.228.126.357.127l8.14-.003c.078 0 .14.064.14.142a.141.141 0 0 1-.027.084L8.84 15.312a.208.208 0 0 0 .076.31c.046.023.098.03.149.02l7.076-1.342c.18-.034.34-.138.443-.29l2.563-3.74c.393-.573.557-1.278.457-1.97l-.257-1.785-.743-.54zm2.59 2.85l-.46 3.12c-.05.348-.22.67-.476.913l-4.078 3.847a.208.208 0 0 0 .015.32l.502.377c.112.084.252.12.39.102l7.68-1.04a.208.208 0 0 0 .16-.29l-2.51-6.876a.707.707 0 0 0-.578-.469.706.706 0 0 0-.645.297v-.3z" />
    </svg>
  );
}

// AWS S3 Logo Component
function S3Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function StorageCard({
  storage,
  linkedDatabases,
  onEdit,
  onDelete,
  onManageLabels,
  isDeleting,
  isDemo,
}: {
  storage: StorageConfig;
  linkedDatabases: number;
  onEdit: () => void;
  onDelete: () => void;
  onManageLabels: () => void;
  isDeleting: boolean;
  isDemo: boolean;
}) {
  const isActive = linkedDatabases > 0;
  const isR2 = storage.provider === "r2";

  return (
    <div className="group relative rounded-xl border bg-card p-4 transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
      {/* Active indicator line */}
      <div
        className={`absolute left-0 top-4 bottom-4 w-1 rounded-full transition-colors ${
          isActive ? "bg-emerald-500" : "bg-muted"
        }`}
      />

      <div className="flex items-start gap-4 pl-3">
        {/* Provider Icon */}
        <div className="relative shrink-0">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              isR2 ? "bg-[#F6821F]/10" : "bg-[#FF9900]/10"
            }`}
          >
            {isR2 ? (
              <Cloud className="h-6 w-6 text-[#F6821F]" />
            ) : (
              <HardDrive className="h-6 w-6 text-[#FF9900]" />
            )}
          </div>
          {isActive && (
            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
              <Check className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">
                  {storage.name}
                </h3>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 h-5 ${
                    isR2
                      ? "bg-[#F6821F]/10 text-[#F6821F] border-[#F6821F]/20"
                      : "bg-[#FF9900]/10 text-[#FF9900] border-[#FF9900]/20"
                  }`}
                >
                  {isR2 ? "Cloudflare R2" : "AWS S3"}
                </Badge>
                {isActive && (
                  <Badge
                    variant="default"
                    className="text-[10px] px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  >
                    Active
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {storage.bucket}
              </p>
              {storage.labels && storage.labels.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {storage.labels.map((label) => (
                    <LabelBadge key={label.id} label={label} size="sm" />
                  ))}
                </div>
              )}
            </div>

            {/* Actions - Desktop */}
            <div className="hidden sm:flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onEdit}
                      disabled={isDemo}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Edit</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={onEdit} disabled={isDemo}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onManageLabels}>
                    <Tags className="h-4 w-4 mr-2" />
                    Labels
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    disabled={isDeleting || isDemo}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Actions - Always visible */}
            <div className="flex items-center gap-1 shrink-0 sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={onEdit} disabled={isDemo}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onManageLabels}>
                    <Tags className="h-4 w-4 mr-2" />
                    Labels
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    disabled={isDeleting || isDemo}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Storage Details */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <Database className="h-3 w-3" />
              {linkedDatabases}{" "}
              {linkedDatabases === 1 ? "database" : "databases"}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <Globe className="h-3 w-3" />
              {storage.region}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(storage.updated_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Endpoint (if exists) */}
          {storage.endpoint && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{storage.endpoint}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StorageList() {
  const { isDemo } = useAuth();
  const {
    data: storageConfigs,
    isLoading,
    refetch,
    isRefetching,
  } = useStorageConfigs();
  const { data: databases } = useDatabases();
  const { data: labels } = useLabels();
  const deleteStorageConfig = useDeleteStorageConfig();
  const assignLabelsMutation = useAssignLabelsToStorage();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<StorageConfig | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storageToDelete, setStorageToDelete] = useState<StorageConfig | null>(
    null
  );
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDialogStorage, setLabelDialogStorage] =
    useState<StorageConfig | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);

  // Calculate linked databases for each storage
  const getLinkedDatabasesCount = (storageId: string) => {
    return databases?.filter((db) => db.storage_id === storageId).length || 0;
  };

  const handleDelete = (storage: StorageConfig) => {
    setStorageToDelete(storage);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!storageToDelete) return;

    try {
      await deleteStorageConfig.mutateAsync(storageToDelete.id);
      toast.success(`"${storageToDelete.name}" deleted successfully`);
    } catch {
      toast.error("Failed to delete storage configuration");
    } finally {
      setDeleteDialogOpen(false);
      setStorageToDelete(null);
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

  const handleRefresh = () => refetch();

  const handleManageLabels = (storage: StorageConfig) => {
    setLabelDialogStorage(storage);
    setLabelDialogOpen(true);
  };

  const handleQuickLabelToggle = async (labelId: string) => {
    if (!labelDialogStorage) return;

    const currentLabelIds = labelDialogStorage.labels?.map((l) => l.id) || [];
    const newLabelIds = currentLabelIds.includes(labelId)
      ? currentLabelIds.filter((id) => id !== labelId)
      : [...currentLabelIds, labelId];

    setLabelLoading(true);
    try {
      await assignLabelsMutation.mutateAsync({
        storageId: labelDialogStorage.id,
        labelIds: newLabelIds,
      });
      toast.success("Labels updated");
    } catch {
      toast.error("Failed to update labels");
    } finally {
      setLabelLoading(false);
    }
  };

  // Calculate stats
  const totalStorage = storageConfigs?.length ?? 0;
  const r2Count =
    storageConfigs?.filter((s) => s.provider === "r2").length ?? 0;
  const s3Count =
    storageConfigs?.filter((s) => s.provider === "s3").length ?? 0;
  const activeStorage =
    storageConfigs?.filter((s) =>
      databases?.some((db) => db.storage_id === s.id)
    ).length ?? 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-[#F6821F] to-[#FF9900] flex items-center justify-center shadow-lg shadow-[#F6821F]/20">
              <HardDrive className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Storage
              </h1>
              <p className="text-sm text-muted-foreground hidden sm:block">
                S3 and R2 storage backends
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefresh}
              disabled={isRefetching}
              variant="ghost"
              size="icon"
              className="h-9 w-9"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              onClick={handleCreate}
              size="sm"
              className="gap-2"
              disabled={isDemo}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Storage</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total
            </span>
            <FolderOpen className="h-4 w-4 text-muted-foreground/50" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <p className="text-3xl font-bold tracking-tight">{totalStorage}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active
            </span>
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {activeStorage}
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cloudflare R2
            </span>
            <Cloud className="h-4 w-4 text-[#F6821F]" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-[#F6821F]">
              {r2Count}
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AWS S3
            </span>
            <HardDrive className="h-4 w-4 text-[#FF9900]" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-[#FF9900]">
              {s3Count}
            </p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Configured Storage</h2>
            {storageConfigs && storageConfigs.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {storageConfigs.length}
              </Badge>
            )}
          </div>
        </div>

        {/* Storage List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-4 pl-3">
                  <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-3">
                      <Skeleton className="h-6 w-24 rounded-md" />
                      <Skeleton className="h-6 w-16 rounded-md" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !storageConfigs || storageConfigs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Cloud className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">
                No storage configured
              </h3>
              <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
                Add an S3 or R2 storage backend to store your database backups
              </p>
              <Button
                onClick={handleCreate}
                className="gap-2"
                disabled={isDemo}
              >
                <Plus className="h-4 w-4" />
                Add Your First Storage
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {storageConfigs.map((storage) => (
              <StorageCard
                key={storage.id}
                storage={storage}
                linkedDatabases={getLinkedDatabasesCount(storage.id)}
                onEdit={() => handleEdit(storage)}
                onDelete={() => handleDelete(storage)}
                onManageLabels={() => handleManageLabels(storage)}
                isDeleting={deleteStorageConfig.isPending}
                isDemo={isDemo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-dashed bg-muted/30 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-[#F6821F]/10 flex items-center justify-center shrink-0">
            <ExternalLink className="h-5 w-5 text-[#F6821F]" />
          </div>
          <div className="space-y-1 min-w-0">
            <h4 className="font-medium text-sm">Supported Storage Providers</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cloudflare R2 and AWS S3 compatible storage. You'll need your
              access key, secret key, bucket name, and region to get started.
            </p>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <StorageDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        storage={editingStorage}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Storage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{storageToDelete?.name}"?
              {getLinkedDatabasesCount(storageToDelete?.id || "") > 0 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Warning: This storage is linked to{" "}
                  {getLinkedDatabasesCount(storageToDelete?.id || "")}{" "}
                  database(s). They will no longer have a backup destination.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteStorageConfig.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                const isSelected = labelDialogStorage?.labels?.some(
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
