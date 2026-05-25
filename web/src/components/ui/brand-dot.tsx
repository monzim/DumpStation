import * as React from "react";
import { cn } from "@/lib/utils";

type BrandDotSize = "xs" | "sm" | "md" | "lg";

interface BrandDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: BrandDotSize;
}

const sizeClass: Record<BrandDotSize, string> = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-4",
};

/*
 * The small coral-red filled circle paired with the DumpStation wordmark.
 * Per DESIGN.md, the dot must accompany the wordmark whenever it appears
 * at >= 24px. Sized to match wordmark size.
 */
export function BrandDot({
  size = "md",
  className,
  ...props
}: BrandDotProps) {
  return (
    <span
      data-slot="brand-dot"
      aria-hidden="true"
      className={cn(
        "inline-block rounded-full bg-brand shrink-0",
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}
