import type { RestoreJob } from '@/lib/api/types'

/** One-line description of where a restore writes to (hosts arrive masked from the API). */
export function restoreTargetLabel(r: RestoreJob): string {
  if (r.target === 'original') return `${r.target_name ?? r.database_name ?? 'Original database'} (original)`
  if (r.target === 'database') return r.target_name ?? 'Configured database'
  if (r.agent_connection) return `Connection “${r.agent_connection}”${r.agent_name ? ` on ${r.agent_name}` : ''}`
  const host = [r.target_user && `${r.target_user}@`, r.target_host, r.target_port && `:${r.target_port}`, r.target_dbname && `/${r.target_dbname}`]
    .filter(Boolean)
    .join('')
  return host || 'Custom target'
}

export const TARGET_KIND_LABEL: Record<RestoreJob['target'], string> = {
  original: 'Original database',
  database: 'Configured database',
  custom: 'Custom target',
}
