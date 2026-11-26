import type { Database, DatabaseHealth } from '@/lib/api/types'

export const HEALTH_OPTIONS: { value: DatabaseHealth; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'running', label: 'Backing up' },
  { value: 'failing', label: 'Failing' },
  { value: 'stale', label: 'Outdated' },
  { value: 'never_backed_up', label: 'No backups' },
  { value: 'paused', label: 'Paused' },
]

/** "Auto" for latest, otherwise the configured major version. */
export function pgVersionLabel(d: Pick<Database, 'postgres_version'>): string {
  const v = d.postgres_version
  if (!v || v === 'latest') return 'Auto'
  return v
}

type TokenColor = 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray'

/** Map a label's hex color onto the closest Token palette color (by hue). */
export function labelColor(hex?: string): TokenColor {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return 'default'
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 0.12) return 'gray'
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 345) return 'red'
  if (h < 40) return 'orange'
  if (h < 65) return 'yellow'
  if (h < 150) return 'green'
  if (h < 175) return 'teal'
  if (h < 200) return 'cyan'
  if (h < 255) return 'blue'
  if (h < 300) return 'purple'
  return 'pink'
}
