import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "w-full min-w-0 rounded-app-xs px-3 py-2 transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 text-body field-sizing-content min-h-24",
  {
    variants: {
      variant: {
        default:
          "bg-canvas text-ash border border-ink-soft placeholder:text-mute focus:bg-canvas-light focus:text-ink focus:border-link-blue focus:ring-2 focus:ring-link-blue/40 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/30",
        light:
          "bg-canvas-light text-ink border border-hairline placeholder:text-mute focus:border-link-blue focus:ring-2 focus:ring-link-blue/40 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
