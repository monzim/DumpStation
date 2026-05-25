import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge needs to know about the Saniti token namespaces in
 * styles.css; otherwise it treats them as unclassified `text-*` / `bg-*`
 * siblings and dedupes them away. The classic symptom is `text-ink` getting
 * stripped when `text-button-lg` follows it in the same className, which
 * silently inherits the body's white color and produces a "blank white pill"
 * primary button on the dark canvas.
 *
 * Three extensions:
 *  - theme.colors: register every Saniti color name so text-/bg-/border-
 *    utilities using them are classified as color, not as font-size.
 *  - theme.borderRadius: register the app-* and marketing radii.
 *  - classGroups.font-size: register the Saniti type utilities so they
 *    conflict with each other (only one font size per element) but NOT
 *    with text-color utilities.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      colors: [
        "canvas",
        "canvas-soft",
        "canvas-light",
        "canvas-paper",
        "on-primary",
        "ink",
        "ink-soft",
        "on-canvas-light",
        "graphite",
        "slate",
        "slate-soft",
        "mute",
        "ash",
        "hairline",
        "hairline-soft",
        "brand",
        "brand-deep",
        "link-blue",
        "link-blue-soft",
        "surface-blue-bg",
        "success",
        "error",
      ],
      borderRadius: [
        "none",
        "app-xs",
        "app-sm",
        "app-md",
        "app-lg",
        "marketing",
      ],
    },
    classGroups: {
      "font-size": [
        {
          text: [
            "display-mega",
            "display-xl",
            "display-lg",
            "display-md",
            "display-sm",
            "heading-md",
            "heading-sm",
            "subtitle",
            "body",
            "body-sm",
            "caption",
            "caption-tight",
            "meta",
            "mono-eyebrow",
            "mono-caps",
            "mono-micro",
            "button-lg",
            "button-sm",
            "button-uppercase",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
