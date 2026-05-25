import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Saniti badge taxonomy. The `mono` variant is the in-console status pill
 * (IBM Plex Mono caps on canvas with a hairline-soft border). Semantic
 * variants (success/error/info) layer a color on top of that same mono base,
 * with a translucent border tint to keep the chip readable on canvas-soft.
 *
 * Legacy aliases (default/secondary/destructive/outline) map onto the Saniti
 * variants so existing call sites compile until they're audited.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-on-primary text-ink text-caption",
        filled: "bg-ink text-on-primary text-caption",
        mono:
          "bg-transparent text-ash border border-hairline-soft text-mono-micro uppercase",
        success:
          "bg-transparent text-success border border-success/40 text-mono-micro uppercase",
        error:
          "bg-transparent text-error border border-error/40 text-mono-micro uppercase",
        warning:
          "bg-transparent text-amber-400 border border-amber-400/40 text-mono-micro uppercase",
        info:
          "bg-transparent text-link-blue-soft border border-link-blue-soft/40 text-mono-micro uppercase",
        brand:
          "bg-brand text-ink text-caption",

        // Legacy aliases
        default: "bg-on-primary text-ink text-caption",
        secondary: "bg-ink text-on-primary text-caption",
        destructive:
          "bg-transparent text-error border border-error/40 text-mono-micro uppercase",
        outline:
          "bg-transparent text-ash border border-hairline-soft text-mono-micro uppercase",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
