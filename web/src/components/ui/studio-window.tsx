import * as React from "react";
import { cn } from "@/lib/utils";

interface StudioWindowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show the macOS traffic-light dot chrome strip. */
  chrome?: boolean;
  /** Optional caption rendered in the chrome strip after the dots. */
  caption?: React.ReactNode;
  bodyClassName?: string;
}

/*
 * Saniti's recurring framed-panel chrome. Canvas-soft fill, sharp 6px radius,
 * 1px hairline-soft border. Used to frame screenshots on the landing page and
 * to frame dense list containers in the console.
 */
export function StudioWindow({
  chrome = false,
  caption,
  bodyClassName,
  className,
  children,
  ...props
}: StudioWindowProps) {
  return (
    <div
      data-slot="studio-window"
      className={cn(
        "bg-canvas-soft border border-hairline-soft rounded-app-lg overflow-hidden",
        className,
      )}
      {...props}
    >
      {chrome && (
        <div className="flex items-center gap-3 border-b border-hairline-soft px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-deep/80" />
            <span className="size-2 rounded-full bg-amber-400/80" />
            <span className="size-2 rounded-full bg-success/80" />
          </span>
          {caption && (
            <span className="text-mono-micro text-ash uppercase">
              {caption}
            </span>
          )}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </div>
  );
}
