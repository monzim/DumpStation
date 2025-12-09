import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useCreateLabel, useUpdateLabel } from "@/lib/api/labels";
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
import { Label as LabelComponent } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Label } from "@/lib/types/api";

interface LabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: Label | null;
}

interface LabelFormData {
  name: string;
  color: string;
  description: string;
}

// Predefined color palette
const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
];

export function LabelDialog({ open, onOpenChange, label }: LabelDialogProps) {
  const isEditing = !!label;
  const [selectedColor, setSelectedColor] = useState(
    label?.color || PRESET_COLORS[10]
  );

  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LabelFormData>({
    defaultValues: {
      name: "",
      color: PRESET_COLORS[10],
      description: "",
    },
  });

  // Reset form when dialog opens/closes or label changes
  useEffect(() => {
    if (open) {
      if (label) {
        reset({
          name: label.name,
          color: label.color,
          description: label.description || "",
        });
        setSelectedColor(label.color);
      } else {
        reset({
          name: "",
          color: PRESET_COLORS[10],
          description: "",
        });
        setSelectedColor(PRESET_COLORS[10]);
      }
    }
  }, [open, label, reset]);

  // Update form color when selected color changes
  useEffect(() => {
    setValue("color", selectedColor);
  }, [selectedColor, setValue]);

  const onSubmit = async (data: LabelFormData) => {
    try {
      if (isEditing) {
        await updateLabel.mutateAsync({
          id: label.id,
          input: {
            name: data.name,
            color: data.color,
            description: data.description || undefined,
          },
        });
        toast.success("Label updated successfully");
      } else {
        await createLabel.mutateAsync({
          name: data.name,
          color: data.color,
          description: data.description || undefined,
        });
        toast.success("Label created successfully");
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save label");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Label" : "Create Label"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the label details below."
              : "Create a new label to organize your configurations."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <LabelComponent htmlFor="name">
              Name <span className="text-red-500">*</span>
            </LabelComponent>
            <Input
              id="name"
              {...register("name", {
                required: "Label name is required",
                maxLength: {
                  value: 100,
                  message: "Name must be 100 characters or less",
                },
              })}
              placeholder="Production"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <LabelComponent>
              Color <span className="text-red-500">*</span>
            </LabelComponent>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`h-8 w-8 rounded-md border-2 transition-all hover:scale-110 ${
                    selectedColor === color
                      ? "border-gray-900 dark:border-gray-100 ring-2 ring-offset-2"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-10 w-20 cursor-pointer"
              />
              <Input
                type="text"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                placeholder="#3b82f6"
                maxLength={7}
                className="font-mono"
              />
            </div>
            <input type="hidden" {...register("color")} />
          </div>

          <div className="space-y-2">
            <LabelComponent htmlFor="description">Description</LabelComponent>
            <Textarea
              id="description"
              {...register("description", {
                maxLength: {
                  value: 255,
                  message: "Description must be 255 characters or less",
                },
              })}
              placeholder="Production environment resources"
              rows={3}
            />
            {errors.description && (
              <p className="text-sm text-red-500">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Preview:
            </p>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium"
                style={{
                  backgroundColor: selectedColor,
                  color: isColorDark(selectedColor) ? "#ffffff" : "#000000",
                }}
              >
                {register("name").name || "Label Name"}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to determine if a color is dark
function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}
