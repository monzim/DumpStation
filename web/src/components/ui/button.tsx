import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Saniti button taxonomy.
 *
 * The default variant is `secondary-dark` — every un-versioned <Button> in
 * the codebase reads as a quiet console secondary on canvas-soft. Landing,
 * login, and one-coral-CTA-per-viewport spots must opt into `primary` /
 * `brand` / `primary-on-light` explicitly.
 */
const buttonVariants = cva(
  // Note: no global `disabled:opacity-50`. The white-pill variants (primary,
  // primary-on-light, brand) become unreadable at 50% opacity because both
  // the bg and the on-color fade in lockstep and lose contrast. Instead,
  // each variant defines an explicit disabled treatment that swaps in a
  // neutralized surface (canvas-soft / hairline) so the label stays legible.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-link-blue-soft focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        // Saniti — marketing CTAs (rounded-full pill)
        primary:
          "bg-on-primary text-ink border border-ink rounded-full text-button-lg hover:bg-on-primary/90 disabled:bg-canvas-soft disabled:text-ash disabled:border-hairline-soft",
        "primary-on-light":
          "bg-ink text-on-primary rounded-full text-button-lg hover:bg-ink/90 disabled:bg-hairline disabled:text-slate disabled:border-transparent",
        brand:
          "bg-brand text-ink rounded-full text-button-lg hover:bg-brand/90 disabled:bg-canvas-soft disabled:text-ash disabled:border-hairline-soft",

        // Saniti — in-product / studio (sharp app-* radii). These already
        // sit on canvas-soft so an opacity fade reads as "off" without
        // losing the text. We keep them fading.
        "secondary-dark":
          "bg-canvas-soft text-ash border border-hairline-soft rounded-app-md text-button-sm hover:text-on-primary hover:bg-canvas-soft/80 disabled:opacity-50",
        "ghost-dark":
          "bg-transparent text-ash rounded-full text-button-sm hover:text-on-primary hover:bg-canvas-soft disabled:opacity-50",
        "app-tab":
          "bg-canvas-soft text-ash rounded-app-sm text-button-uppercase hover:text-on-primary data-[active=true]:bg-on-primary data-[active=true]:text-ink disabled:opacity-50",
        destructive:
          "bg-brand-deep text-on-primary rounded-app-md text-button-sm hover:bg-brand-deep/90 disabled:opacity-50",
        link: "text-link-blue-soft underline-offset-4 hover:underline disabled:opacity-50",

        // Legacy shadcn aliases (kept so existing call sites compile until
        // they're audited and switched to a Saniti variant). They map to
        // the closest Saniti equivalent.
        default:
          "bg-canvas-soft text-ash border border-hairline-soft rounded-app-md text-button-sm hover:text-on-primary disabled:opacity-50",
        secondary:
          "bg-canvas-soft text-ash border border-hairline-soft rounded-app-md text-button-sm hover:text-on-primary disabled:opacity-50",
        outline:
          "bg-transparent text-ash border border-hairline-soft rounded-app-md text-button-sm hover:bg-canvas-soft hover:text-on-primary disabled:opacity-50",
        ghost:
          "bg-transparent text-ash rounded-full text-button-sm hover:text-on-primary hover:bg-canvas-soft disabled:opacity-50",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-3",
        lg: "h-11 px-6",
        xl: "h-12 px-7 text-button-lg",
        icon: "size-9 px-0",
        "icon-sm": "size-8 px-0",
        "icon-lg": "size-11 px-0",
      },
    },
    defaultVariants: {
      variant: "secondary-dark",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
