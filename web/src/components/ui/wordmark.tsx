import * as React from "react";
import { Link } from "@tanstack/react-router";
import { BrandDot } from "@/components/ui/brand-dot";
import { cn } from "@/lib/utils";

type WordmarkSize = "sm" | "md" | "lg" | "xl";

interface WordmarkProps {
  size?: WordmarkSize;
  to?: string;
  className?: string;
  tone?: "light" | "dark";
  label?: string;
}

const textClass: Record<WordmarkSize, string> = {
  sm: "text-button-sm",
  md: "text-button-lg",
  lg: "text-heading-sm",
  xl: "text-heading-md",
};

const dotSize: Record<WordmarkSize, "xs" | "sm" | "md" | "lg"> = {
  sm: "xs",
  md: "sm",
  lg: "md",
  xl: "lg",
};

/*
 * <BrandDot> + "DumpStation" lockup. Enforces by construction the
 * Saniti rule that the brand-dot must accompany the wordmark.
 */
export function Wordmark({
  size = "md",
  to,
  className,
  tone = "light",
  label = "DumpStation",
}: WordmarkProps) {
  const inner = (
    <span
      data-slot="wordmark"
      className={cn(
        "inline-flex items-center gap-2 font-medium tracking-tight",
        tone === "dark" ? "text-ink" : "text-on-primary",
        textClass[size],
        className,
      )}
    >
      <BrandDot size={dotSize[size]} />
      <span>{label}</span>
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex items-center" aria-label={label}>
        {inner}
      </Link>
    );
  }
  return inner;
}
