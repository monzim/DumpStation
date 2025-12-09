import { useState } from "react";
import { Plus, Trash2, Edit, Tag } from "lucide-react";
import { useLabels, useDeleteLabel } from "@/lib/api/labels";
import { Button } from "@/components/ui/button";
import { LabelBadge } from "@/components/ui/label-badge";
import { LabelDialog } from "@/components/label-dialog";
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
import { toast } from "sonner";
import type { Label } from "@/lib/types/api";
import { useAuth } from "@/components/auth-provider";

export function LabelManager() {
  const { isDemo } = useAuth();
  const { data: labels, isLoading } = useLabels();
  const deleteLabel = useDeleteLabel();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);

  const handleCreate = () => {
    setEditingLabel(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (label: Label) => {
    setEditingLabel(label);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingLabel) return;

    try {
      await deleteLabel.mutateAsync(deletingLabel.id);
      toast.success(`Label "${deletingLabel.name}" deleted`);
      setDeletingLabel(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete label");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading labels...</p>
        </div>
      </div>
    );
  }

  const labelCount = labels?.length || 0;
  const maxLabels = 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Labels</h3>
          <p className="text-sm text-muted-foreground">
            Organize your configurations with custom labels ({labelCount}/
            {maxLabels})
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={isDemo || labelCount >= maxLabels}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Label
        </Button>
      </div>

      {!labels || labels.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No labels yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create labels to organize your databases, storage, and
            notifications.
          </p>
          <Button onClick={handleCreate} disabled={isDemo}>
            <Plus className="h-4 w-4 mr-2" />
            Create your first label
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <LabelBadge label={label} size="md" />
                <div className="flex-1 min-w-0">
                  {label.description && (
                    <p className="text-sm text-muted-foreground truncate">
                      {label.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {label.database_count} databases
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {label.storage_count} storage
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {label.notification_count} notifications
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      Total: {label.total_usage}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(label)}
                  disabled={isDemo}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeletingLabel(label)}
                  disabled={isDemo}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LabelDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        label={editingLabel}
      />

      <AlertDialog
        open={!!deletingLabel}
        onOpenChange={() => setDeletingLabel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Label</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the label "{deletingLabel?.name}"?
              {deletingLabel && deletingLabel.total_usage > 0 && (
                <>
                  <br />
                  <br />
                  This label is currently used by {
                    deletingLabel.total_usage
                  }{" "}
                  configuration{deletingLabel.total_usage !== 1 ? "s" : ""}. It
                  will be removed from all of them.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
