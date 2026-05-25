import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Saniti card taxonomy. The default `console` variant is what every existing
 * <Card> in the auth shell picks up automatically — canvas-soft surface with
 * sharp app-lg radii (the studio-app look). Marketing/auth pages explicitly
 * request `feature-dark`/`feature-light`/`feature-brand`/`pricing*`.
 */
const cardVariants = cva("text-on-primary flex flex-col gap-4", {
  variants: {
    variant: {
      console:
        "bg-canvas border border-hairline-soft rounded-app-lg p-6",
      "feature-dark":
        "bg-canvas-soft text-on-primary border border-hairline-soft rounded-marketing p-8",
      "feature-light":
        "bg-canvas-light text-ink border border-hairline rounded-marketing p-8",
      "feature-brand":
        "bg-brand text-ink rounded-marketing p-8",
      pricing:
        "bg-canvas-light text-ink border border-hairline rounded-marketing p-8",
      "pricing-featured":
        "bg-ink text-on-primary rounded-marketing p-8",
      studio:
        "bg-canvas text-on-primary border border-hairline-soft rounded-app-lg p-4",
      ghost:
        "bg-transparent text-on-primary p-0 border-0",
    },
  },
  defaultVariants: {
    variant: "console",
  },
});

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-card-variant={variant ?? "console"}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header flex flex-col gap-2 has-data-[slot=card-action]:grid has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-action]:items-start",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-heading-sm", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-body-sm text-ash", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
