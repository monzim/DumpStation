// Utility for generating consistent colors for database configurations

// A set of visually distinct colors that work well in both light and dark themes
const DATABASE_COLORS = [
  { bg: "bg-blue-500/15", text: "text-blue-600", border: "border-blue-500/30" },
  {
    bg: "bg-emerald-500/15",
    text: "text-emerald-600",
    border: "border-emerald-500/30",
  },
  {
    bg: "bg-violet-500/15",
    text: "text-violet-600",
    border: "border-violet-500/30",
  },
  {
    bg: "bg-orange-500/15",
    text: "text-orange-600",
    border: "border-orange-500/30",
  },
  { bg: "bg-pink-500/15", text: "text-pink-600", border: "border-pink-500/30" },
  { bg: "bg-cyan-500/15", text: "text-cyan-600", border: "border-cyan-500/30" },
  {
    bg: "bg-amber-500/15",
    text: "text-amber-600",
    border: "border-amber-500/30",
  },
  {
    bg: "bg-indigo-500/15",
    text: "text-indigo-600",
    border: "border-indigo-500/30",
  },
  { bg: "bg-rose-500/15", text: "text-rose-600", border: "border-rose-500/30" },
  { bg: "bg-teal-500/15", text: "text-teal-600", border: "border-teal-500/30" },
  { bg: "bg-lime-500/15", text: "text-lime-600", border: "border-lime-500/30" },
  {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-600",
    border: "border-fuchsia-500/30",
  },
] as const;

export type DatabaseColor = (typeof DATABASE_COLORS)[number];

/**
 * Generates a consistent color index based on a database ID.
 * Uses a simple hash function to ensure the same ID always gets the same color.
 */
function hashStringToIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get the color configuration for a database based on its ID.
 * The color is deterministically assigned based on the ID, so the same
 * database will always have the same color.
 */
export function getDatabaseColor(databaseId: string): DatabaseColor {
  const index = hashStringToIndex(databaseId) % DATABASE_COLORS.length;
  return DATABASE_COLORS[index];
}

/**
 * Get all available database colors (useful for legends or documentation)
 */
export function getAllDatabaseColors(): readonly DatabaseColor[] {
  return DATABASE_COLORS;
}
