// Minimal 5-field cron evaluation for the demo (schedule previews and next-run
// times). Supports *, numbers, ranges, lists and steps, evaluated in an IANA
// time zone. The real server uses robfig/cron; this only needs to agree on the
// presets the UI offers.

type Field = Set<number>

function parseField(src: string, min: number, max: number): Field | null {
  const out = new Set<number>()
  for (const part of src.split(',')) {
    const [range, stepS] = part.split('/')
    const step = stepS ? Number(stepS) : 1
    if (!Number.isInteger(step) || step < 1) return null
    let lo = min
    let hi = max
    if (range !== '*') {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = b !== undefined ? Number(b) : stepS ? max : lo
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null
    }
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

const MACROS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
}

export interface Cron {
  minute: Field
  hour: Field
  dom: Field
  month: Field
  dow: Field
  domStar: boolean
  dowStar: boolean
}

export function parseCron(expr: string): Cron | null {
  const e = MACROS[expr.trim()] ?? expr.trim()
  const f = e.split(/\s+/)
  if (f.length !== 5) return null
  const minute = parseField(f[0], 0, 59)
  const hour = parseField(f[1], 0, 23)
  const dom = parseField(f[2], 1, 31)
  const month = parseField(f[3], 1, 12)
  const dowRaw = parseField(f[4].replace(/7/g, '0'), 0, 6)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  return { minute, hour, dom, month, dow: dowRaw, domStar: f[2] === '*', dowStar: f[4] === '*' }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function parts(t: number, tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    })
    fmtCache.set(tz, f)
  }
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(t)) o[p.type] = p.value
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday)
  return { month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, dow: wd }
}

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The next `count` run times after `from`, in UTC milliseconds. */
export function nextRuns(c: Cron, tz: string, from: number, count: number): number[] {
  const out: number[] = []
  const HOUR = 3_600_000
  // Walk hour by hour (time zones with 30/45-minute offsets still land on
  // whole minutes because we test every minute inside a matching hour).
  let t = Math.floor(from / 60_000) * 60_000 + 60_000
  const end = from + 400 * 24 * HOUR
  while (t < end && out.length < count) {
    const p = parts(t, tz)
    const dayOk = c.domStar && c.dowStar ? true : c.domStar ? c.dow.has(p.dow) : c.dowStar ? c.dom.has(p.day) : c.dom.has(p.day) || c.dow.has(p.dow)
    if (!c.month.has(p.month) || !dayOk || !c.hour.has(p.hour)) {
      t += (60 - p.minute) * 60_000
      continue
    }
    if (c.minute.has(p.minute)) {
      out.push(t)
      t += 60_000
      continue
    }
    // jump to the next matching minute in this hour, or the next hour
    let next = -1
    for (const m of [...c.minute].sort((a, b) => a - b)) if (m > p.minute) { next = m; break }
    t += (next >= 0 ? next - p.minute : 60 - p.minute) * 60_000
  }
  return out
}
