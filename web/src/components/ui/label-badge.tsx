import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Label } from "@/lib/types/api";

interface LabelBadgeProps {
  label: Label;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function LabelBadge({
  label,
  onRemove,
  size = "md",
  className,
}: LabelBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
  };

  // Determine if the background is dark to adjust text color
  const isDark = isColorDark(label.color);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium",
        sizeClasses[size],
        isDark ? "text-white" : "text-gray-900",
        className
      )}
      style={{ backgroundColor: label.color }}
    >
      {label.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "ml-0.5 rounded hover:opacity-70",
            isDark ? "text-white" : "text-gray-900"
          )}
          aria-label={`Remove ${label.name} label`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// Helper function to determine if a color is dark
function isColorDark(hexColor: string): boolean {
  // Remove # if present
  const hex = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate perceived brightness
  // Using the formula: (R * 299 + G * 587 + B * 114) / 1000
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness < 128;
}
