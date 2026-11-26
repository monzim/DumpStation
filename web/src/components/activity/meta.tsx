// Activity log vocabulary: actions, entity types, level badges and entity links.
import { Badge } from '@astryxdesign/core/Badge'
import type { ActivityLog, LogLevel } from '@/lib/api/types'

/** Mirrors ActivityLogAction in server/internal/models/models.go, grouped for the filter. */
export const ACTION_GROUPS: { title: string; actions: string[] }[] = [
  {
    title: 'Backups',
    actions: [
      'backup_triggered',
      'backup_started',
      'backup_completed',
      'backup_failed',
      'backup_cancelled',
      'backup_job_assigned',
      'backup_missed',
      'retention_applied',
      'failed_backups_purged',
      'backup_download_otp_requested',
      'backup_downloaded',
    ],
  },
  { title: 'Restores', actions: ['restore_triggered', 'restore_started', 'restore_completed', 'restore_failed'] },
  {
    title: 'Databases',
    actions: ['database_created', 'database_updated', 'database_deleted', 'database_paused', 'database_unpaused'],
  },
  {
    title: 'Agents',
    actions: [
      'agent_created',
      'agent_updated',
      'agent_deleted',
      'agent_registered',
      'agent_connected',
      'agent_disconnected',
      'agent_revoked',
      'agent_disabled',
      'agent_enabled',
      'agent_enrollment_issued',
    ],
  },
  { title: 'Storage', actions: ['storage_created', 'storage_updated', 'storage_deleted', 'storage_test_failed'] },
  { title: 'Notifications', actions: ['notification_created', 'notification_updated', 'notification_deleted'] },
  { title: 'Labels', actions: ['label_created', 'label_updated', 'label_deleted'] },
  {
    title: 'Database servers',
    actions: [
      'server_connection_created',
      'server_connection_updated',
      'server_connection_deleted',
      'server_database_created',
      'server_database_dropped',
      'server_user_created',
      'server_user_dropped',
      'server_role_granted',
      'server_table_truncated',
    ],
  },
  {
    title: 'Access',
    actions: [
      'login',
      'logout',
      'session_refreshed',
      '2fa_setup_started',
      '2fa_enabled',
      '2fa_verified',
      '2fa_disabled',
      '2fa_backup_code_used',
      '2fa_verification_failed',
      'user_role_changed',
    ],
  },
  { title: 'System', actions: ['system_startup', 'system_shutdown'] },
]

const ACTION_OVERRIDES: Record<string, string> = {
  '2fa_setup_started': '2FA setup started',
  '2fa_enabled': '2FA enabled',
  '2fa_verified': '2FA verified',
  '2fa_disabled': '2FA disabled',
  '2fa_backup_code_used': '2FA backup code used',
  '2fa_verification_failed': '2FA verification failed',
  backup_download_otp_requested: 'Backup download code requested',
  backup_job_assigned: 'Backup assigned to agent',
  agent_enrollment_issued: 'Agent enrollment issued',
  storage_test_failed: 'Storage test failed',
  failed_backups_purged: 'Failed backups purged',
  login: 'Signed in',
  logout: 'Signed out',
}

/** "backup_completed" → "Backup completed" */
export function actionLabel(action: string): string {
  if (ACTION_OVERRIDES[action]) return ACTION_OVERRIDES[action]
  const s = action.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: 'backup', label: 'Backup' },
  { value: 'restore', label: 'Restore' },
  { value: 'database', label: 'Database' },
  { value: 'agent', label: 'Agent' },
  { value: 'storage', label: 'Storage' },
  { value: 'notification', label: 'Notification' },
  { value: 'label', label: 'Label' },
  { value: 'user', label: 'User' },
  { value: 'system', label: 'System' },
]

export const LEVELS: { value: LogLevel; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

export function LevelBadge({ level }: { level: LogLevel }) {
  const variant = level === 'success' ? 'success' : level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'neutral'
  const label = LEVELS.find((l) => l.value === level)?.label ?? level
  return <Badge variant={variant} label={label} />
}

/** Route for the resource an activity entry refers to, when one exists. */
export function entityHref(log: Pick<ActivityLog, 'entity_type' | 'entity_id'>): string | undefined {
  const id = log.entity_id
  switch (log.entity_type) {
    case 'database':
      return id ? `/databases/${id}` : undefined
    case 'backup':
      return id ? `/backups/${id}` : undefined
    case 'agent':
      return id ? `/agents/${id}` : undefined
    case 'restore':
      return id ? `/restores/${id}` : undefined
    case 'storage':
      return id ? '/storage' : undefined
    case 'notification':
      return id ? '/notifications' : undefined
    default:
      return undefined
  }
}

/** Metadata arrives as a JSON string or an object; returns null when empty. */
export function parseMetadata(raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === '') return null
  let v = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (v && typeof v === 'object' && Object.keys(v as object).length === 0) return null
  return v
}
