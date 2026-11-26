// Schedule and retention helpers shared by the database pages, the Schedules
// page and anything else that edits or describes a backup schedule.
import type { RotationPolicy } from '@/lib/api/types'
import { describeCron } from '@/lib/format'

export type ScheduleKind = 'hourly' | 'every_n_hours' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface ScheduleModel {
  kind: ScheduleKind
  /** Minute past the hour (hourly, every N hours). */
  minute: number
  /** Interval for every N hours. */
  everyHours: number
  /** "HH:MM" for daily/weekly/monthly. */
  time: string
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  /** 1–28 for monthly. */
  monthday: number
  /** Raw expression for custom (and the source of truth when kind = custom). */
  cron: string
}

export const SCHEDULE_KIND_OPTIONS: { value: ScheduleKind; label: string }[] = [
  { value: 'hourly', label: 'Every hour' },
  { value: 'every_n_hours', label: 'Every N hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom cron expression' },
]

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const DEFAULT_CRON = '0 2 * * *'

const INT = /^\d{1,2}$/

function int(v: string, min: number, max: number): number | null {
  if (!INT.test(v)) return null
  const n = Number(v)
  return n >= min && n <= max ? n : null
}

const pad = (n: number) => String(n).padStart(2, '0')

function timeOf(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`
}

/** Interpret a cron expression as one of the presets, or custom. */
export function parseCron(expr: string): ScheduleModel {
  const base: ScheduleModel = { kind: 'custom', minute: 0, everyHours: 6, time: '02:00', weekday: 1, monthday: 1, cron: expr.trim() }
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) return base
  const [mi, ho, dom, mon, dow] = f
  const minute = int(mi, 0, 59)
  if (minute === null || mon !== '*') return base
  if (ho === '*' && dom === '*' && dow === '*') return { ...base, kind: 'hourly', minute }
  const every = /^\*\/(\d{1,2})$/.exec(ho)
  if (every && dom === '*' && dow === '*') {
    const n = Number(every[1])
    if (n >= 1 && n <= 23) return { ...base, kind: 'every_n_hours', minute, everyHours: n }
    return base
  }
  const hour = int(ho, 0, 23)
  if (hour === null) return base
  const time = timeOf(hour, minute)
  if (dom === '*' && dow === '*') return { ...base, kind: 'daily', time }
  const wd = int(dow, 0, 6)
  if (dom === '*' && wd !== null) return { ...base, kind: 'weekly', time, weekday: wd }
  const md = int(dom, 1, 31)
  if (md !== null && dow === '*') return { ...base, kind: 'monthly', time, monthday: md }
  return base
}

/** Build the cron expression for a model. */
export function buildCron(m: ScheduleModel): string {
  const [h, mi] = (m.time || '00:00').split(':').map((x) => Number(x) || 0)
  switch (m.kind) {
    case 'hourly':
      return `${m.minute} * * * *`
    case 'every_n_hours':
      return `${m.minute} */${m.everyHours} * * *`
    case 'daily':
      return `${mi} ${h} * * *`
    case 'weekly':
      return `${mi} ${h} * * ${m.weekday}`
    case 'monthly':
      return `${mi} ${h} ${m.monthday} * *`
    default:
      return m.cron.trim()
  }
}

/** Human description of a schedule, e.g. "At 02:00" or "Every 6 hours". */
export function describeSchedule(cron: string): string {
  return describeCron(cron)
}

/** The viewer's IANA time zone. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

let zones: string[] | null = null
/** Every IANA zone the browser knows, UTC first. */
export function timeZones(): string[] {
  if (zones) return zones
  let list: string[] = []
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    list = []
  }
  if (list.length === 0) list = [browserTimeZone()]
  zones = ['UTC', ...list.filter((z) => z !== 'UTC')]
  return zones
}

/** Format an instant in a given IANA zone ("Fri 28 Nov, 02:00"). */
export function formatInZone(iso: string, tz?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: tz || undefined,
    }).format(d)
  } catch {
    return d.toLocaleString()
  }
}

/** Display label for a stored time zone; '' means the server's zone. */
export function zoneLabel(tz: string | undefined, serverZone?: string): string {
  if (tz) return tz
  const z = realZone(serverZone)
  return z ? `Server (${z})` : 'Server time zone'
}

/** The server reports Go's "Local" when it has no named zone; treat that as unknown. */
export function realZone(z?: string): string | undefined {
  return z && z !== 'Local' ? z : undefined
}

// ------------------------------------------------------------- retention

export const DEFAULT_RETENTION: RotationPolicy = { type: 'count', value: 7 }
export const RETENTION_MAX = { count: 10000, days: 3650 } as const

/** Short summary for tables: "Keep last 7" / "Keep 14 days". */
export function describeRetention(p?: RotationPolicy): string {
  if (!p || !p.value) return '—'
  if (p.type === 'days') return `Keep ${p.value} ${p.value === 1 ? 'day' : 'days'}`
  return `Keep last ${p.value}`
}

/** Plain-language explanation of what a policy does. */
export function explainRetention(p: RotationPolicy): string {
  const n = p.value || 0
  if (p.type === 'days') {
    return `Keeps successful backups for ${n} ${n === 1 ? 'day' : 'days'}. Older ones are deleted from storage after each successful backup. The newest successful backup is never deleted, even if it is older than ${n} ${n === 1 ? 'day' : 'days'}.`
  }
  return `Keeps the ${n === 1 ? 'most recent successful backup' : `${n} most recent successful backups`}. Older ones are deleted from storage after each successful backup. The newest successful backup is never deleted.`
}

export function validateRetention(p: RotationPolicy): string | undefined {
  if (!Number.isInteger(p.value) || p.value < 1) return 'Enter a whole number of at least 1.'
  const max = RETENTION_MAX[p.type]
  if (p.value > max) return `The maximum is ${max.toLocaleString()}.`
  return undefined
}
