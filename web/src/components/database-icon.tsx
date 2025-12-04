import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDatabaseColor } from "@/lib/utils/database-colors";

interface DatabaseIconProps {
  databaseId: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showBackground?: boolean;
}

const sizeConfig = {
  xs: {
    wrapper: "p-1 rounded",
    icon: "h-3 w-3",
  },
  sm: {
    wrapper: "p-1.5 rounded-md",
    icon: "h-4 w-4",
  },
  md: {
    wrapper: "p-2 rounded-lg",
    icon: "h-5 w-5",
  },
  lg: {
    wrapper: "p-2.5 rounded-lg",
    icon: "h-6 w-6",
  },
  xl: {
    wrapper: "p-3 rounded-xl",
    icon: "h-8 w-8",
  },
} as const;

/**
 * A database icon with a unique color based on the database ID.
 * The color is consistent across the application for the same database.
 */
export function DatabaseIcon({
  databaseId,
  size = "md",
  className,
  showBackground = true,
}: DatabaseIconProps) {
  const color = getDatabaseColor(databaseId);
  const sizeStyles = sizeConfig[size];

  if (!showBackground) {
    return (
      <Database
        className={cn(sizeStyles.icon, color.text, "shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeStyles.wrapper,
        color.bg,
        color.border,
        "border shrink-0",
        className
      )}
    >
      <Database className={cn(sizeStyles.icon, color.text)} />
    </div>
  );
}

/**
 * A simple colored database icon without background wrapper.
 * Useful for inline display in lists or descriptions.
 */
export function DatabaseIconSimple({
  databaseId,
  size = "md",
  className,
}: Omit<DatabaseIconProps, "showBackground">) {
  const color = getDatabaseColor(databaseId);
  const sizeStyles = sizeConfig[size];

  return (
    <Database
      className={cn(sizeStyles.icon, color.text, "shrink-0", className)}
    />
  );
}
