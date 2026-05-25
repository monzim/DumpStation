import * as React from "react";
import { cn } from "@/lib/utils";

type AlertBannerTone = "info" | "warn" | "error" | "success";

interface AlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertBannerTone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
}

const toneClass: Record<AlertBannerTone, string> = {
  info: "bg-surface-blue-bg text-ink border-transparent",
  warn: "bg-amber-300 text-ink border-transparent",
  error: "bg-error/15 text-on-primary border-error/40",
  success: "bg-success/15 text-on-primary border-success/40",
};

/*
 * Soft surface-blue informational banner — the only chromatic surface fill
 * Saniti uses. `tone` switches the fill but keeps the rounded-app-lg shape.
 */
export function AlertBanner({
  tone = "info",
  icon,
  title,
  className,
  children,
  ...props
}: AlertBannerProps) {
  return (
    <div
      data-slot="alert-banner"
      data-tone={tone}
      role="status"
      className={cn(
        "rounded-app-lg p-4 text-body-sm flex items-start gap-3 border",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div className="flex flex-col gap-1 min-w-0">
        {title && <p className="font-medium leading-tight">{title}</p>}
        {children}
      </div>
    </div>
  );
}
