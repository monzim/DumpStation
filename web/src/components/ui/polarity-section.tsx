import * as React from "react";
import { cn } from "@/lib/utils";

type Polarity = "dark" | "light" | "paper";

interface PolaritySectionProps extends React.HTMLAttributes<HTMLElement> {
  polarity?: Polarity;
  as?: "section" | "header" | "footer" | "div";
  containerClassName?: string;
  padding?: "default" | "tight" | "loose" | "none";
}

const polarityClass: Record<Polarity, string> = {
  dark: "bg-canvas text-on-primary",
  light: "bg-canvas-light text-ink",
  paper: "bg-canvas-paper text-ink",
};

const paddingClass: Record<NonNullable<PolaritySectionProps["padding"]>, string> = {
  none: "",
  tight: "py-12 md:py-16",
  default: "py-16 md:py-24 lg:py-32",
  loose: "py-24 md:py-32 lg:py-40",
};

/*
 * Section wrapper that handles the Saniti polarity rhythm. Adjacent sections
 * with different `polarity` props produce the hard-edge cut that is Saniti's
 * primary depth cue on marketing pages.
 */
export function PolaritySection({
  polarity = "dark",
  as: Tag = "section",
  padding = "default",
  className,
  containerClassName,
  children,
  ...props
}: PolaritySectionProps) {
  return (
    <Tag
      data-slot="polarity-section"
      data-polarity={polarity}
      className={cn(polarityClass[polarity], paddingClass[padding], className)}
      {...props}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[1640px] px-6 lg:px-12",
          containerClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}
