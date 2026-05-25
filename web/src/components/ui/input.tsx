import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 rounded-app-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium text-body",
  {
    variants: {
      variant: {
        // Dark text-input — the in-product default on canvas pages.
        default:
          "bg-canvas text-ash border border-ink-soft h-11 px-3 placeholder:text-mute file:text-on-primary focus:bg-canvas-light focus:text-ink focus:border-link-blue focus:ring-2 focus:ring-link-blue/40 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/30",
        // Light text-input — for the rare light-section forms (pricing, contact).
        light:
          "bg-canvas-light text-ink border border-hairline h-11 px-3 placeholder:text-mute file:text-ink focus:border-link-blue focus:ring-2 focus:ring-link-blue/40 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Input({
  className,
  variant,
  type,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
