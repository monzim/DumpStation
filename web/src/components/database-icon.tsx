import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface DatabaseIconProps {
  databaseId: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showBackground?: boolean;
}

const sizeConfig = {
  xs: { wrapper: "size-6 rounded-app-xs", icon: "size-3" },
  sm: { wrapper: "size-8 rounded-app-sm", icon: "size-4" },
  md: { wrapper: "size-10 rounded-app-md", icon: "size-5" },
  lg: { wrapper: "size-12 rounded-app-md", icon: "size-6" },
  xl: { wrapper: "size-14 rounded-app-lg", icon: "size-7" },
} as const;

/**
 * Monochrome database glyph chip. Saniti is single-coral; per-database hues
 * have been collapsed to canvas-soft. The chip serves the same visual role
 * (a stable, recognizable marker) without spending the brand accent.
 */
export function DatabaseIcon({
  size = "md",
  className,
  showBackground = true,
}: DatabaseIconProps) {
  const sizeStyles = sizeConfig[size];

  if (!showBackground) {
    return (
      <Database
        className={cn(sizeStyles.icon, "text-ash shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "bg-canvas-soft border border-hairline-soft flex items-center justify-center shrink-0",
        sizeStyles.wrapper,
        className,
      )}
    >
      <Database className={cn(sizeStyles.icon, "text-on-primary")} />
    </div>
  );
}

export function DatabaseIconSimple({
  size = "md",
  className,
}: Omit<DatabaseIconProps, "showBackground">) {
  const sizeStyles = sizeConfig[size];
  return (
    <Database
      className={cn(sizeStyles.icon, "text-ash shrink-0", className)}
    />
  );
}
