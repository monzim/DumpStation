// URL search-param schema for the backup history page.
export interface BackupSearch {
  q?: string
  db?: string
  status?: string // comma list of API status values
  executor?: 'direct' | 'agent'
  agent?: string
  trigger?: 'scheduled' | 'manual'
  from?: string // YYYY-MM-DD
  to?: string
  sort?: string
  page?: number
  size?: number
}

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'success', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'deleted', label: 'Expired' },
]

export const PAGE_SIZES = [25, 50, 100]
const SORTS = ['started_at', '-started_at', 'size', '-size', 'duration', '-duration']
const DATE = /^\d{4}-\d{2}-\d{2}/

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : undefined)

export function parseBackupSearch(s: Record<string, unknown>): BackupSearch {
  const status = str(s.status)
    ?.split(',')
    .filter((x) => STATUS_FILTERS.some((f) => f.value === x))
    .join(',')
  const page = Number(s.page)
  const size = Number(s.size)
  const from = str(s.from)
  const to = str(s.to)
  const sort = str(s.sort)
  return {
    q: str(s.q),
    db: str(s.db) ?? str(s.database_id),
    status: status || undefined,
    executor: s.executor === 'direct' || s.executor === 'agent' ? s.executor : undefined,
    agent: str(s.agent) ?? str(s.agent_id),
    trigger: s.trigger === 'scheduled' || s.trigger === 'manual' ? s.trigger : undefined,
    from: from && DATE.test(from) ? from.slice(0, 10) : undefined,
    to: to && DATE.test(to) ? to.slice(0, 10) : undefined,
    sort: sort && SORTS.includes(sort) && sort !== '-started_at' ? sort : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    size: PAGE_SIZES.includes(size) && size !== 25 ? size : undefined,
  }
}

export function hasFilters(s: BackupSearch) {
  return !!(s.q || s.db || s.status || s.executor || s.agent || s.trigger || s.from || s.to)
}
