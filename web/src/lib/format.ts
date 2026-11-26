import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import cronstrue from 'cronstrue'
import type { BackupStage, BackupStatus } from './api/types'

export function toDate(v?: string | Date | null): Date | null {
  if (!v) return null
  const d = typeof v === 'string' ? parseISO(v) : v
  return isValid(d) ? d : null
}

/** "3 min ago" / "in 2 h" */
export function relativeTime(v?: string | Date | null): string {
  const d = toDate(v)
  if (!d) return '—'
  const diff = d.getTime() - Date.now()
  const s = formatDistanceToNowStrict(d, { roundingMethod: 'floor' })
  if (Math.abs(diff) < 45_000) return diff > 0 ? 'in a few seconds' : 'just now'
  return diff > 0 ? `in ${s}` : `${s} ago`
}

/** "27 Nov 2026, 14:05" in the viewer's zone */
export function dateTime(v?: string | Date | null): string {
  const d = toDate(v)
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—'
}

export function dateTimeSeconds(v?: string | Date | null): string {
  const d = toDate(v)
  return d ? format(d, 'd MMM yyyy, HH:mm:ss') : '—'
}

export function timeOnly(v?: string | Date | null): string {
  const d = toDate(v)
  return d ? format(d, 'HH:mm:ss') : '—'
}

export function bytes(n?: number | null): string {
  if (n === undefined || n === null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function duration(ms?: number | null): string {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function percent(v?: number | null): string {
  if (v === undefined || v === null) return '—'
  return `${v >= 99.95 || v === 0 ? v.toFixed(0) : v.toFixed(1)}%`
}

export function describeCron(expr: string): string {
  if (!expr) return '—'
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: true, verbose: false })
  } catch {
    return expr
  }
}

export function shortId(id?: string): string {
  return id ? id.slice(0, 8) : '—'
}

export const STATUS_LABEL: Record<BackupStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  success: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  deleted: 'Expired',
}

export const STAGE_LABEL: Record<Exclude<BackupStage, ''>, string> = {
  queued: 'Queued',
  waiting_for_agent: 'Waiting for agent',
  preparing: 'Preparing',
  dumping: 'Creating backup',
  uploading: 'Uploading',
  verifying: 'Verifying',
  downloading: 'Downloading artifact',
  restoring: 'Restoring',
}

/** Human label for a backup/restore state, using the stage while active. */
export function lifecycleLabel(status: BackupStatus, stage?: BackupStage): string {
  if ((status === 'pending' || status === 'running') && stage) return STAGE_LABEL[stage] ?? STATUS_LABEL[status]
  return STATUS_LABEL[status] ?? status
}

export const ERROR_CODE_LABEL: Record<string, string> = {
  auth_failed: 'Database authentication failed',
  host_unreachable: 'Database host unreachable',
  database_not_found: 'Database not found',
  permission_denied: 'Insufficient database privileges',
  version_mismatch: 'Incompatible PostgreSQL client version',
  ssl_error: 'SSL negotiation failed',
  insufficient_disk: 'Insufficient temporary storage',
  timeout: 'Execution timeout',
  cancelled: 'Cancelled',
  tool_missing: 'PostgreSQL tools missing',
  upload_failed: 'Upload failed',
  download_failed: 'Download failed',
  verification_failed: 'Verification failed',
  storage_error: 'Storage error',
  agent_unavailable: 'Agent unavailable',
  agent_lost: 'Agent stopped responding',
  configuration_error: 'Configuration error',
  restore_failed: 'Restore failed',
  dump_failed: 'pg_dump failed',
  interrupted: 'Interrupted by restart',
  expired: 'Expired',
  unknown: 'Unknown error',
}

export function errorCodeLabel(code?: string): string {
  if (!code) return ''
  return ERROR_CODE_LABEL[code] ?? code.replace(/_/g, ' ')
}

export const PROVIDER_LABEL: Record<string, string> = {
  s3: 'Amazon S3',
  r2: 'Cloudflare R2',
  minio: 'MinIO',
  s3_compatible: 'S3-compatible',
}
