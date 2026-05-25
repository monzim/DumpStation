/*
 * Saniti is monochrome + coral. The 12-hue per-database palette is collapsed
 * to a single neutral record — every database renders on canvas-soft with
 * hairline-soft borders and on-primary glyph color. The function signature
 * is preserved so call sites don't have to change.
 */

export type DatabaseColor = {
  bg: string;
  text: string;
  border: string;
};

const NEUTRAL: DatabaseColor = {
  bg: "bg-canvas-soft",
  text: "text-on-primary",
  border: "border-hairline-soft",
};

export function getDatabaseColor(_databaseId: string): DatabaseColor {
  return NEUTRAL;
}

export function getAllDatabaseColors(): readonly DatabaseColor[] {
  return [NEUTRAL];
}

/**
 * Derive a single-letter monogram from a name. Empty/undefined inputs
 * return "D" so the chip is never blank.
 */
export function getDatabaseMonogram(name?: string | null): string {
  if (!name) return "D";
  const trimmed = name.trim();
  if (!trimmed) return "D";
  return trimmed[0]!.toUpperCase();
}
