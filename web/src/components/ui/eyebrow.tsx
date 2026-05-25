import * as React from "react";
import { cn } from "@/lib/utils";

type EyebrowTone = "mute" | "ash" | "brand" | "ink";

interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  tone?: EyebrowTone;
  as?: "p" | "span" | "div";
}

const toneClass: Record<EyebrowTone, string> = {
  mute: "text-mute",
  ash: "text-ash",
  brand: "text-brand",
  ink: "text-ink",
};

/*
 * The canonical "MONO EYEBROW" lockup paired above every display headline.
 * IBM Plex Mono caps, 13px, slight tracking, in mute by default — the line
 * that marks Saniti as developer-platform-aware rather than generic marketing.
 */
export function Eyebrow({
  tone = "mute",
  as: Tag = "p",
  className,
  children,
  ...props
}: EyebrowProps) {
  return (
    <Tag
      data-slot="eyebrow"
      className={cn(
        "text-mono-eyebrow uppercase",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
