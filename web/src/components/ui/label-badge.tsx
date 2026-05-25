import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Label } from "@/lib/types/api";

interface LabelBadgeProps {
  label: Label;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

/*
 * LabelBadge preserves the user-supplied dynamic background color (labels are
 * user data, not brand surface). Only the chrome around it adopts Saniti
 * conventions: rounded-full pill, mono-micro caps for size sm, body caption
 * for size md.
 */
export function LabelBadge({
  label,
  onRemove,
  size = "md",
  className,
}: LabelBadgeProps) {
  const sizeClasses = {
    sm: "text-mono-micro px-2 py-0.5 uppercase",
    md: "text-caption px-2.5 py-1",
  };

  const isDark = isColorDark(label.color);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        sizeClasses[size],
        isDark ? "text-on-primary" : "text-ink",
        className,
      )}
      style={{ backgroundColor: label.color }}
    >
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "ml-0.5 rounded hover:opacity-70",
            isDark ? "text-on-primary" : "text-ink",
          )}
          aria-label={`Remove ${label.name} label`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}
