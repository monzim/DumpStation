// In-browser stand-in for the DumpStation API, used only by the public demo
// build (`vite build --mode demo`). Everything lives in memory and resets on
// reload. Jobs advance with wall-clock time, so polling sees them move through
// the same stages a real server reports.
import { ApiError, type RequestOptions } from '@/lib/api/client'
import type {
  ActivityLog,
  Agent,
  AgentJob,
  Backup,
  BackupStage,
  BackupStatus,
  Database,
  DatabaseHealth,
  DailyCount,
  JobEvent,
  Label,
  LogLevel,
  NotificationConfig,
  Overview,
  RestoreJob,
  StorageConfig,
  TestResult,
  UserProfile,
} from '@/lib/api/types'
import { nextRuns, parseCron, validTimeZone } from './cron'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T0 = Date.now()
const iso = (t: number) => new Date(t).toISOString()
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2))
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mask = (s: string) => (s.length <= 3 ? '***' : s.slice(0, 3) + '***')
const maskHost = (h: string) => (h.includes('.') ? '***' + h.slice(h.indexOf('.')) : '***')

// A seeded PRNG keeps the history identical between reloads.
let seed = 42
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const WORDS_A = ['quiet', 'amber', 'swift', 'modern', 'calm', 'bright', 'silver', 'brave', 'gentle', 'lucky', 'noble', 'rapid']
const WORDS_B = ['falcon', 'harbor', 'meadow', 'emerald', 'canyon', 'river', 'comet', 'maple', 'summit', 'lagoon', 'ember', 'willow']
const backupName = (t: number) => {
  const d = new Date(t)
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  return `${WORDS_A[Math.floor(rnd() * WORDS_A.length)]}-${WORDS_B[Math.floor(rnd() * WORDS_B.length)]}-${ymd}`
}

// ------------------------------------------------------------------ seed data

const ME: UserProfile = {
  id: 'u-0001',
  discord_username: 'admin',
  email: 'admin@acme.dev',
  has_profile_picture: false,
  is_demo: false,
  is_admin: true,
  two_factor_enabled: true,
  created_at: iso(T0 - 120 * DAY),
  updated_at: iso(T0 - 2 * DAY),
}

const mkLabel = (id: string, name: string, color: string, description?: string): Label => ({
  id,
  name,
  color,
  description,
  created_at: iso(T0 - 90 * DAY),
  updated_at: iso(T0 - 90 * DAY),
})
const labels: Label[] = [
  mkLabel('l-prod', 'production', 'red', 'Customer-facing databases'),
  mkLabel('l-stg', 'staging', 'orange'),
  mkLabel('l-eu', 'eu-west', 'blue', 'Data that must stay in the EU'),
  mkLabel('l-fin', 'finance', 'purple'),
]
const L = (...ids: string[]) => labels.filter((l) => ids.includes(l.id))

interface StorageRow { cfg: StorageConfig; bucket: string; endpoint: string; region: string }
const storages: StorageRow[] = [
  { bucket: 'acme-backups', endpoint: 'https://8f2c1e.r2.cloudflarestorage.com', region: 'auto', cfg: { id: 's-r2', name: 'Primary R2', provider: 'r2', bucket: '', access_key: '', is_default: true, labels: L('l-prod'), database_count: 0, backup_count: 0, used_bytes: 0, created_at: iso(T0 - 110 * DAY), updated_at: iso(T0 - 30 * DAY) } },
  { bucket: 'acme-pg-archive', endpoint: '', region: 'eu-central-1', cfg: { id: 's-s3', name: 'S3 archive (Frankfurt)', provider: 's3', bucket: '', access_key: '', is_default: false, labels: L('l-eu'), database_count: 0, backup_count: 0, used_bytes: 0, created_at: iso(T0 - 80 * DAY), updated_at: iso(T0 - 80 * DAY) } },
  { bucket: 'pg-dumps', endpoint: 'http://minio.office.lan:9000', region: 'us-east-1', cfg: { id: 's-minio', name: 'Office MinIO', provider: 'minio', bucket: '', access_key: '', is_default: false, labels: [], database_count: 0, backup_count: 0, used_bytes: 0, created_at: iso(T0 - 40 * DAY), updated_at: iso(T0 - 40 * DAY) } },
]
storages.forEach((s) => {
  s.cfg.bucket = mask(s.bucket)
  s.cfg.region = s.region
  s.cfg.endpoint = s.endpoint ? s.endpoint.replace(/\/\/([^.]+)/, '//***') : undefined
  s.cfg.access_key = 'AKIA***'
})

const notifications: NotificationConfig[] = [
  { id: 'n-discord', name: 'Ops Discord', discord_webhook_url: 'https://discord.com/api/webhooks/***/***', has_discord: true, has_telegram: false, labels: L('l-prod'), created_at: iso(T0 - 100 * DAY), updated_at: iso(T0 - 100 * DAY) },
  { id: 'n-telegram', name: 'On-call Telegram', has_discord: false, telegram_bot_token: '***:***', telegram_chat_id: '-100***', has_telegram: true, labels: [], created_at: iso(T0 - 60 * DAY), updated_at: iso(T0 - 60 * DAY) },
]

const PG_ALL = ['12', '13', '14', '15', '16', '17', '18']
interface AgentRow { a: Agent; deployAt?: number }
const agents: AgentRow[] = [
  {
    a: {
      id: 'a-eu', user_id: ME.id, name: 'eu-private-vpc', description: 'Production VPC in eu-west-1, next to the orders and analytics clusters',
      status: 'active', token_prefix: 'dsa_c907d4f2', version: '2.0.0', hostname: 'ip-10-0-3-41', platform: 'linux/amd64', pg_versions: PG_ALL,
      connections: [{ name: 'orders', database: 'orders', host: '10.0.0.12' }, { name: 'ledger', database: 'ledger', host: '10.0.0.15' }],
      labels: ['production', 'eu-west'], allow_restore: true, agent_allow_restore: true, upload_modes: ['direct', 'proxy'], max_concurrency: 2,
      running_jobs: 0, last_seen_at: iso(T0), last_ip: '52.17.204.9', enrolled_at: iso(T0 - 75 * DAY), credential_issued_at: iso(T0 - 75 * DAY),
      created_at: iso(T0 - 75 * DAY), updated_at: iso(T0 - DAY), connectivity: 'online', database_count: 0, recent_failures: 0,
    },
  },
  {
    a: {
      id: 'a-office', user_id: ME.id, name: 'office-nas', description: 'Synology box in the Dhaka office',
      status: 'active', token_prefix: 'dsa_4b1e90aa', version: '2.0.0', hostname: 'nas-01', platform: 'linux/arm64', pg_versions: ['15', '16'],
      connections: [{ name: 'inventory', database: 'inventory', host: '192.168.1.20' }],
      labels: ['office'], allow_restore: false, agent_allow_restore: false, upload_modes: ['proxy'], max_concurrency: 1,
      running_jobs: 0, last_seen_at: iso(T0 - 3 * HOUR - 12 * MIN), last_ip: '103.92.84.17', enrolled_at: iso(T0 - 50 * DAY), credential_issued_at: iso(T0 - 50 * DAY),
      created_at: iso(T0 - 50 * DAY), updated_at: iso(T0 - 3 * HOUR), connectivity: 'offline', database_count: 0, recent_failures: 0,
    },
  },
]

interface DbRow { d: Database; host: string; port: number; dbname: string; user: string; size: number }
const mkDb = (o: Partial<Database> & { id: string; name: string }, conn: { host: string; port?: number; dbname: string; user: string; size: number }): DbRow => ({
  host: conn.host,
  port: conn.port ?? 5432,
  dbname: conn.dbname,
  user: conn.user,
  size: conn.size,
  d: {
    host: maskHost(conn.host), port: '****', dbname: mask(conn.dbname), user: mask(conn.user),
    schedule: '0 2 * * *', timezone: 'UTC', storage_id: 's-r2', postgres_version: '16', enabled: true, paused: false,
    rotation_policy: { type: 'count', value: 14 }, execution_mode: 'direct', central_credentials: true, labels: [],
    created_at: iso(T0 - 90 * DAY), updated_at: iso(T0 - 10 * DAY), version_last_checked: iso(T0 - DAY),
    ...o,
  },
})
const dbs: DbRow[] = [
  mkDb({ id: 'd-orders', name: 'orders', execution_mode: 'agent', agent_id: 'a-eu', agent_connection: 'orders', central_credentials: false, schedule: '0 2 * * *', timezone: 'UTC', notification_id: 'n-discord', labels: L('l-prod', 'l-eu'), postgres_version: '16' }, { host: '10.0.0.12', dbname: 'orders', user: 'backup', size: 1.84e9 }),
  mkDb({ id: 'd-analytics', name: 'analytics', schedule: '0 */6 * * *', timezone: 'Europe/Berlin', storage_id: 's-s3', notification_id: 'n-discord', labels: L('l-prod', 'l-eu'), postgres_version: '17', rotation_policy: { type: 'days', value: 30 } }, { host: 'analytics.c9x2k.eu-west-1.rds.amazonaws.com', dbname: 'analytics', user: 'dumpstation', size: 6.2e9 }),
  mkDb({ id: 'd-billing', name: 'billing', schedule: '0 * * * *', timezone: 'America/New_York', notification_id: 'n-telegram', labels: L('l-prod', 'l-fin'), postgres_version: '15', rotation_policy: { type: 'count', value: 48 } }, { host: 'billing-db.internal.acme.dev', dbname: 'billing', user: 'backup', size: 2.4e8 }),
  mkDb({ id: 'd-ledger', name: 'ledger', execution_mode: 'agent', agent_id: 'a-eu', agent_connection: 'ledger', central_credentials: false, schedule: '30 3 * * *', timezone: 'Europe/Dublin', storage_id: 's-s3', labels: L('l-fin', 'l-eu'), postgres_version: '18' }, { host: '10.0.0.15', dbname: 'ledger', user: 'backup', size: 4.1e8 }),
  mkDb({ id: 'd-inventory', name: 'inventory', execution_mode: 'agent', agent_id: 'a-office', agent_connection: 'inventory', central_credentials: false, schedule: '0 1 * * *', timezone: 'Asia/Dhaka', storage_id: 's-minio', postgres_version: '15' }, { host: '192.168.1.20', dbname: 'inventory', user: 'postgres', size: 9.6e7 }),
  mkDb({ id: 'd-staging', name: 'staging-app', schedule: '0 4 * * 0', timezone: 'UTC', labels: L('l-stg'), paused: true, postgres_version: '16', rotation_policy: { type: 'count', value: 4 } }, { host: 'staging.db.acme.dev', dbname: 'app', user: 'app', size: 3.3e8 }),
]
const dbById = (id?: string) => dbs.find((r) => r.d.id === id)
const agentById = (id?: string) => agents.find((r) => r.a.id === id)
const storageById = (id?: string) => storages.find((s) => s.cfg.id === id)

// ------------------------------------------------------------------ jobs

interface Step { stage: BackupStage; ms: number; msg?: string; level?: LogLevel; source?: 'server' | 'agent' }
interface BackupRow { b: Backup; plan?: Step[]; start?: number; events: JobEvent[]; finalSize?: number; failAt?: { code: string; message: string } }
interface RestoreRow { r: RestoreJob; plan?: Step[]; start?: number; events: JobEvent[] }
const backups: BackupRow[] = []
const restores: RestoreRow[] = []
const activity: ActivityLog[] = []
const agentJobs = new Map<string, { job: AgentJob; doneAt: number; result: TestResult }>()

function log(action: string, level: LogLevel, description: string, entity?: { type: string; id?: string; name?: string }, at = Date.now()) {
  activity.unshift({ id: uid(), user_id: ME.id, action, level, entity_type: entity?.type, entity_id: entity?.id, entity_name: entity?.name, description, ip_address: '203.0.113.24', created_at: iso(at) })
}

const ev = (kind: 'backup' | 'restore', jobId: string, at: number, level: LogLevel, message: string, stage = '', source: 'server' | 'agent' = 'server'): JobEvent => ({
  id: uid(), job_kind: kind, job_id: jobId, level, stage, message, source, created_at: iso(at),
})

function viewBackup(row: DbRow, o: Partial<Backup> & { id: string; t: number }): Backup {
  const s = storageById(row.d.storage_id)
  const a = agentById(row.d.agent_id)
  const { t, ...rest } = o
  return {
    name: backupName(t), database_id: row.d.id, status: 'success', trigger: 'scheduled', executor: row.d.execution_mode,
    agent_id: row.d.agent_id, storage_id: row.d.storage_id, dump_format: 'custom', postgres_version: row.d.postgres_version,
    timestamp: iso(t), database_name: row.d.name, storage_name: s?.cfg.name, agent_name: a?.a.name, restorable: false,
    ...rest,
  }
}

function historyEvents(b: Backup, row: DbRow): JobEvent[] {
  const t = Date.parse(b.run_started_at ?? b.timestamp)
  const agent = b.executor === 'agent'
  const src = agent ? 'agent' : 'server'
  const out = [ev('backup', b.id, Date.parse(b.timestamp), 'info', agent ? `Assigned to agent "${b.agent_name}"` : 'Queued', 'queued')]
  if (agent) out.push(ev('backup', b.id, t, 'info', `Agent "${b.agent_name}" picked up the job`, 'preparing', 'agent'))
  out.push(ev('backup', b.id, t + 400, 'info', agent ? `Connecting to ${row.host}:${row.port}` : 'Connecting to PostgreSQL from the DumpStation server', 'preparing', src))
  out.push(ev('backup', b.id, t + 900, 'info', `Server is PostgreSQL ${row.d.postgres_version}; using pg_dump ${row.d.postgres_version}`, 'preparing', src))
  if (b.status === 'failed') {
    out.push(ev('backup', b.id, Date.parse(b.completed_at!), 'error', b.error_message ?? 'Backup failed', b.error_code === 'host_unreachable' ? 'preparing' : 'dumping', src))
    return out
  }
  const d = b.duration_ms ?? 30_000
  out.push(ev('backup', b.id, t + 1200, 'info', 'Running pg_dump (custom format)', 'dumping', src))
  out.push(ev('backup', b.id, t + d * 0.62, 'info', `Uploading to storage "${b.storage_name}"${agent ? ' with a presigned URL' : ''}`, 'uploading', src))
  out.push(ev('backup', b.id, t + d * 0.9, 'info', 'Verifying the uploaded artifact', 'verifying'))
  out.push(ev('backup', b.id, t + d, 'success', `Backup completed: ${fmtBytes(b.size_bytes ?? 0)}, sha256 ${b.checksum_sha256?.slice(0, 12)}…`, ''))
  return out
}

function fmtBytes(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return n + ' B'
}

// History: scheduled runs over the last two weeks (hourly ones over two days).
for (const row of dbs) {
  const c = parseCron(row.d.schedule)!
  const span = 14 * DAY
  let runs = nextRuns(c, row.d.timezone, T0 - span, 400).filter((t) => t < T0 - 2 * MIN)
  if (row.d.paused) runs = runs.filter((t) => t < T0 - 6 * DAY)
  runs.forEach((t, i) => {
    const newest = i === runs.length - 1
    let status: BackupStatus = rnd() < 0.03 ? 'failed' : 'success'
    let code: string | undefined
    let msg: string | undefined
    if (status === 'failed') { code = 'timeout'; msg = 'pg_dump exceeded the 2h timeout' }
    if (row.d.id === 'd-billing' && i >= runs.length - 3) { status = 'failed'; code = 'host_unreachable'; msg = 'dial tcp 10.2.0.7:5432: connect: no route to host' }
    if (row.d.id === 'd-inventory' && i >= runs.length - 2) { status = 'failed'; code = 'agent_unavailable'; msg = 'Agent "office-nas" did not pick up the job within 6h' }
    const dur = Math.round((status === 'success' ? 18_000 : 4_000) + (row.size / 1e9) * 22_000 * (0.85 + rnd() * 0.3))
    const id = uid()
    const size = Math.round(row.size * (0.94 + 0.06 * (i / Math.max(1, runs.length))))
    const b = viewBackup(row, {
      id, t, status, run_started_at: iso(t + 2_000), completed_at: iso(t + 2_000 + dur), duration_ms: dur,
      size_bytes: status === 'success' ? size : undefined, checksum_sha256: status === 'success' ? hex(32) : undefined,
      storage_path: status === 'success' ? `dumpstation/${row.d.name}/${new Date(t).toISOString().slice(0, 10)}/${id.slice(0, 8)}.dump` : undefined,
      error_code: code, error_message: msg, restorable: status === 'success', agent_attempts: row.d.execution_mode === 'agent' ? 1 : undefined,
    })
    backups.push({ b, events: historyEvents(b, row) })
    if (newest || status === 'failed') log(status === 'success' ? 'backup_completed' : 'backup_failed', status === 'success' ? 'success' : 'error', status === 'success' ? `Backup completed for ${row.d.name}` : `Backup failed for ${row.d.name}: ${msg}`, { type: 'backup', id, name: b.name }, t + dur)
  })
}
backups.sort((a, b) => Date.parse(b.b.timestamp) - Date.parse(a.b.timestamp))

// A couple of past restores.
{
  const ord = backups.find((x) => x.b.database_id === 'd-orders' && x.b.status === 'success' && Date.parse(x.b.timestamp) < T0 - 3 * DAY)!
  const t = T0 - 3 * DAY + 5 * HOUR
  const r: RestoreJob = {
    id: uid(), backup_id: ord.b.id, database_id: 'd-orders', target: 'custom', executor: 'agent', agent_id: 'a-eu', agent_connection: 'orders',
    target_dbname: 'orders_drill', clean_target: true, status: 'success', started_at: iso(t), completed_at: iso(t + 96_000), created_at: iso(t),
    backup_name: ord.b.name, database_name: 'orders', target_name: 'orders_drill (custom)', agent_name: 'eu-private-vpc',
  }
  restores.push({ r, events: [ev('restore', r.id, t, 'info', `Restore of backup "${ord.b.name}" into orders_drill queued`, 'queued'), ev('restore', r.id, t + 3000, 'info', 'Agent "eu-private-vpc" picked up the restore', 'preparing', 'agent'), ev('restore', r.id, t + 9000, 'info', 'Downloading backup artifact', 'downloading', 'agent'), ev('restore', r.id, t + 31000, 'info', 'Checksum verified', 'downloading', 'agent'), ev('restore', r.id, t + 32000, 'info', 'Restoring into orders_drill (custom format)', 'restoring', 'agent'), ev('restore', r.id, t + 96000, 'success', 'Restore completed', '', 'agent')] })
  log('restore_completed', 'success', 'Restore into orders_drill completed', { type: 'restore', id: r.id }, t + 96_000)
}

log('agent_registered', 'success', 'Agent "eu-private-vpc" registered from ip-10-0-3-41 (52.17.204.9)', { type: 'agent', id: 'a-eu', name: 'eu-private-vpc' }, T0 - 75 * DAY)
log('storage_created', 'success', "Storage configuration 'S3 archive (Frankfurt)' created", { type: 'storage', id: 's-s3' }, T0 - 80 * DAY)
log('login', 'success', 'User admin logged in successfully', { type: 'user', id: ME.id, name: 'admin' }, T0 - 4 * MIN)
activity.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

// ------------------------------------------------------------------ simulation

const BACKUP_PLAN = (row: DbRow): Step[] => {
  const agent = row.d.execution_mode === 'agent'
  const a = agentById(row.d.agent_id)?.a
  const src = agent ? 'agent' : 'server'
  return [
    { stage: 'queued', ms: 900, msg: agent ? `Assigned to agent "${a?.name}"` : 'Queued' },
    ...(agent ? [{ stage: 'waiting_for_agent' as BackupStage, ms: 1600, msg: `Agent "${a?.name}" picked up the job`, source: 'agent' as const }] : []),
    { stage: 'preparing', ms: 1500, msg: agent ? `Connecting to ${row.host}:${row.port}` : 'Connecting to PostgreSQL from the DumpStation server', source: src },
    { stage: 'dumping', ms: 5200, msg: 'Running pg_dump (custom format)', source: src },
    { stage: 'uploading', ms: 3000, msg: `Uploading to storage "${storageById(row.d.storage_id)?.cfg.name}"${agent ? ' with a presigned URL' : ''}`, source: src },
    { stage: 'verifying', ms: 1200, msg: 'Verifying the uploaded artifact' },
  ]
}

function stepAt(plan: Step[], start: number, now: number) {
  let t = start
  for (let i = 0; i < plan.length; i++) {
    if (now < t + plan[i].ms) return { i, t, frac: (now - t) / plan[i].ms }
    t += plan[i].ms
  }
  return { i: plan.length, t, frac: 1 }
}

function advanceBackup(x: BackupRow, now: number) {
  if (!x.plan || x.start === undefined) return
  const b = x.b
  if (b.status === 'cancelled') return
  const row = dbById(b.database_id)
  const { i } = stepAt(x.plan, x.start, now)
  // emit events for every step reached
  let t = x.start
  for (let k = 0; k < Math.min(i + 1, x.plan.length); k++) {
    const s = x.plan[k]
    if (s.msg && !x.events.some((e) => e.stage === s.stage && e.message === s.msg)) x.events.push(ev('backup', b.id, t, s.level ?? 'info', s.msg, s.stage, s.source))
    if (s.stage === 'preparing' && row && !x.events.some((e) => e.message.startsWith('Server is PostgreSQL'))) {
      x.events.push(ev('backup', b.id, t + 600, 'info', `Server is PostgreSQL ${row.d.postgres_version}; using pg_dump ${row.d.postgres_version}`, 'preparing', s.source))
    }
    t += s.ms
  }
  if (i >= x.plan.length) {
    b.status = 'success'
    b.stage = ''
    b.completed_at = iso(t)
    b.duration_ms = t - Date.parse(b.run_started_at ?? b.timestamp)
    b.size_bytes = x.finalSize
    b.checksum_sha256 = hex(32)
    b.storage_path = `dumpstation/${b.database_name}/${b.timestamp.slice(0, 10)}/${b.id.slice(0, 8)}.dump`
    b.restorable = true
    x.events.push(ev('backup', b.id, t, 'success', `Backup completed: ${fmtBytes(b.size_bytes ?? 0)}, sha256 ${b.checksum_sha256.slice(0, 12)}…`))
    x.plan = undefined
    log('backup_completed', 'success', `Backup completed for ${b.database_name}`, { type: 'backup', id: b.id, name: b.name }, t)
    return
  }
  const s = x.plan[i]
  b.stage = s.stage
  b.status = s.stage === 'queued' || s.stage === 'waiting_for_agent' ? 'pending' : 'running'
  if (b.status === 'running' && !b.run_started_at) b.run_started_at = iso(now)
  if (s.stage === 'dumping') b.size_bytes = Math.round((x.finalSize ?? 0) * stepAt(x.plan, x.start, now).frac)
}

const RESTORE_PLAN = (r: RestoreJob, b: Backup): Step[] => {
  const agent = r.executor === 'agent'
  const src = agent ? 'agent' : 'server'
  return [
    { stage: 'queued', ms: 900, msg: `Restore of backup "${b.name}" into ${r.target_name} queued` },
    ...(agent ? [{ stage: 'waiting_for_agent' as BackupStage, ms: 1400, msg: `Agent "${r.agent_name}" picked up the restore`, source: 'agent' as const }] : []),
    { stage: 'downloading', ms: 2600, msg: 'Downloading backup artifact', source: src },
    { stage: 'restoring', ms: 5200, msg: `Restoring into ${r.target_name} (custom format)`, source: src },
  ]
}

function advanceRestore(x: RestoreRow, now: number) {
  if (!x.plan || x.start === undefined) return
  const r = x.r
  const { i } = stepAt(x.plan, x.start, now)
  let t = x.start
  for (let k = 0; k < Math.min(i + 1, x.plan.length); k++) {
    const s = x.plan[k]
    if (s.msg && !x.events.some((e) => e.message === s.msg)) x.events.push(ev('restore', r.id, t, 'info', s.msg, s.stage, s.source))
    if (s.stage === 'restoring' && !x.events.some((e) => e.message === 'Checksum verified')) x.events.push(ev('restore', r.id, t - 200, 'info', 'Checksum verified', 'downloading', s.source))
    t += s.ms
  }
  if (i >= x.plan.length) {
    r.status = 'success'
    r.stage = ''
    r.completed_at = iso(t)
    x.events.push(ev('restore', r.id, t, 'success', 'Restore completed', '', r.executor === 'agent' ? 'agent' : 'server'))
    x.plan = undefined
    log('restore_completed', 'success', `Restore into ${r.target_name} completed`, { type: 'restore', id: r.id }, t)
    return
  }
  r.stage = x.plan[i].stage
  r.status = r.stage === 'queued' || r.stage === 'waiting_for_agent' ? 'pending' : 'running'
}

function tick() {
  const now = Date.now()
  backups.forEach((x) => advanceBackup(x, now))
  restores.forEach((x) => advanceRestore(x, now))
  for (const { a } of agents) {
    const row = agents.find((r) => r.a === a)!
    if (row.deployAt && now >= row.deployAt && a.status === 'pending') {
      a.status = 'active'
      a.connectivity = 'online'
      a.enrolled_at = iso(row.deployAt)
      a.credential_issued_at = iso(row.deployAt)
      a.version = '2.0.0'
      a.hostname = 'office-vm-02'
      a.platform = 'linux/amd64'
      a.pg_versions = PG_ALL
      a.connections = [{ name: 'crm', database: 'crm', host: '10.20.0.8' }]
      a.upload_modes = ['direct', 'proxy']
      a.last_ip = '198.51.100.40'
      a.token_prefix = 'dsa_' + hex(4)
      log('agent_registered', 'success', `Agent "${a.name}" registered from office-vm-02 (198.51.100.40)`, { type: 'agent', id: a.id, name: a.name }, row.deployAt)
    }
    if (a.connectivity === 'online') a.last_seen_at = iso(now - Math.round(rnd() * 4000))
    a.running_jobs = backups.filter((x) => x.plan && x.b.agent_id === a.id && x.b.status === 'running').length
  }
}

// ------------------------------------------------------------------ views

function nextRunAt(d: Database) {
  if (d.paused) return undefined
  const c = parseCron(d.schedule)
  return c ? iso(nextRuns(c, d.timezone, Date.now(), 1)[0]) : undefined
}

function summary(b?: Backup) {
  return b ? { id: b.id, name: b.name, status: b.status, stage: b.stage, started_at: b.run_started_at ?? b.timestamp, completed_at: b.completed_at, size_bytes: b.size_bytes, error_code: b.error_code } : undefined
}

function dbView(row: DbRow): Database {
  const mine = backups.filter((x) => x.b.database_id === row.d.id).map((x) => x.b)
  const active = mine.find((b) => b.status === 'pending' || b.status === 'running')
  const last = mine.find((b) => b.status === 'success' || b.status === 'failed')
  const lastOk = mine.find((b) => b.status === 'success')
  let health: DatabaseHealth = 'healthy'
  if (row.d.paused) health = 'paused'
  else if (active) health = 'running'
  else if (!last) health = 'never_backed_up'
  else if (last.status === 'failed') health = 'failing'
  else if (lastOk && Date.now() - Date.parse(lastOk.completed_at!) > 3 * DAY) health = 'stale'
  return { ...row.d, next_run_at: nextRunAt(row.d), last_backup: summary(last), last_success_at: lastOk?.completed_at, active_backup: summary(active), health }
}

function agentView(row: AgentRow): Agent {
  const a = row.a
  const mine = dbs.filter((d) => d.d.agent_id === a.id)
  const fails = backups.filter((x) => x.b.agent_id === a.id && x.b.status === 'failed' && Date.now() - Date.parse(x.b.timestamp) < 7 * DAY)
  return {
    ...a,
    database_count: mine.length,
    recent_failures: fails.length,
    last_failure: fails[0]?.b,
    databases: mine.map((d) => ({ id: d.d.id, name: d.d.name, agent_connection: d.d.agent_connection, paused: d.d.paused })),
  }
}

function storageView(s: StorageRow): StorageConfig {
  const ok = backups.filter((x) => x.b.storage_id === s.cfg.id && x.b.status === 'success')
  return { ...s.cfg, database_count: dbs.filter((d) => d.d.storage_id === s.cfg.id).length, backup_count: ok.length, used_bytes: ok.reduce((n, x) => n + (x.b.size_bytes ?? 0), 0) }
}

function restoreView(x: RestoreRow) {
  return { ...x.r }
}

function overview(): Overview {
  const now = Date.now()
  const done = backups.map((x) => x.b).filter((b) => b.status === 'success' || b.status === 'failed')
  const within = (b: Backup, ms: number) => now - Date.parse(b.completed_at ?? b.timestamp) < ms
  const s24 = done.filter((b) => b.status === 'success' && within(b, DAY)).length
  const f24 = done.filter((b) => b.status === 'failed' && within(b, DAY)).length
  const s7 = done.filter((b) => b.status === 'success' && within(b, 7 * DAY)).length
  const f7 = done.filter((b) => b.status === 'failed' && within(b, 7 * DAY)).length
  const views = dbs.map(dbView)
  const daily: DailyCount[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY)
    const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    const z = a + DAY
    const inDay = done.filter((b) => { const t = Date.parse(b.completed_at ?? b.timestamp); return t >= a && t < z })
    daily.push({ day: iso(a), success: inDay.filter((b) => b.status === 'success').length, failed: inDay.filter((b) => b.status === 'failed').length })
  }
  const upcoming = views.filter((d) => d.next_run_at).map((d) => ({ database_id: d.id, database_name: d.name, at: d.next_run_at!, executor: d.execution_mode })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const ok = backups.filter((x) => x.b.status === 'success')
  return {
    databases: { total: views.length, protected: views.filter((d) => !d.paused).length, unprotected: 0, paused: views.filter((d) => d.paused).length, attention: views.filter((d) => d.health === 'failing' || d.health === 'stale').length },
    backups: { success_24h: s24, failed_24h: f24, success_7d: s7, failed_7d: f7, success_rate_7d: s7 + f7 ? (100 * s7) / (s7 + f7) : null, active: backups.filter((x) => x.plan).length },
    storage: { used_bytes: ok.reduce((n, x) => n + (x.b.size_bytes ?? 0), 0), artifact_count: ok.length, destinations: storages.length },
    agents: { total: agents.length, online: agents.filter((r) => r.a.connectivity === 'online').length, offline: agents.filter((r) => r.a.connectivity === 'offline').length, disabled: agents.filter((r) => r.a.status === 'disabled').length, pending: agents.filter((r) => r.a.status === 'pending').length },
    last_success_at: ok[0]?.b.completed_at,
    attention: views.filter((d) => d.health === 'failing' || d.health === 'stale'),
    upcoming,
    active: backups.filter((x) => x.plan).map((x) => x.b),
    recent_failed: backups.filter((x) => x.b.status === 'failed').slice(0, 5).map((x) => x.b),
    daily,
    activity: activity.slice(0, 8),
  }
}

// ------------------------------------------------------------------ router

type Q = Record<string, string>
type Handler = (m: RegExpMatchArray, body: any, q: Q) => unknown | Promise<unknown>
const routes: [string, RegExp, Handler][] = []
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), h])
const notFound = (what = 'resource') => new ApiError(404, `${what} not found`, { code: 'not_found', message: `${what} not found` })
const bad = (message: string, field?: string) => new ApiError(400, message, { code: 'validation_error', message, errors: field ? [{ field, message }] : undefined })

// session & auth
on('GET', '/users/me', () => ME)
on('GET', '/auth/config', () => ({ discord_enabled: true, github_enabled: true, demo_enabled: true }))
on('GET', '/auth/2fa/status', () => ({ enabled: true, verified_at: iso(T0 - 60 * DAY), backup_codes_count: 8 }))
on('POST', '/auth/login', () => ({ message: 'Demo: use any 6-digit code' }))
on('POST', '/auth/(verify|demo-login|2fa/verify)', () => ({ token: 'demo', expires_at: iso(Date.now() + 365 * DAY) }))
on('POST', '/auth/refresh', () => ({ token: 'demo', expires_at: iso(Date.now() + 365 * DAY), session_expires_at: iso(Date.now() + 365 * DAY) }))
on('POST', '/auth/logout', () => undefined)
on('POST', '/auth/2fa/backup-codes', () => ({ codes: Array.from({ length: 8 }, () => hex(4)), message: 'New backup codes generated' }))

// overview & system
on('GET', '/overview', () => overview())
on('GET', '/system/health', () => ({
  version: '2.0.0', server_time: iso(Date.now()), timezone: 'UTC', uptime: `${Math.floor((Date.now() - T0) / HOUR) + 312}h${Math.floor(((Date.now() - T0) % HOUR) / MIN)}m`,
  database_ok: true, database_latency_ms: 2, pg_client_versions: PG_ALL, scheduler: { active_schedules: dbs.filter((d) => !d.d.paused).length },
  jobs: { direct_concurrency: 4, queue_ttl: '6h0m0s', lease_ttl: '2m0s', max_attempts: 3 }, notifications: { discord_login_webhook: true },
  auth: { github: true, discord: true, turnstile: true, demo: false }, public_url: 'https://backups.acme.dev',
}))
on('GET', '/schedules/preview', (_m, _b, q) => {
  const tz = q.tz || 'UTC'
  const c = parseCron(q.cron ?? '')
  if (!c) return { valid: false, error: 'Expected 5 fields: minute hour day-of-month month day-of-week', timezone: tz }
  if (!validTimeZone(tz)) return { valid: false, error: `Unknown time zone "${tz}"`, timezone: tz }
  return { valid: true, timezone: tz, next: nextRuns(c, tz, Date.now(), 5).map(iso) }
})
on('GET', '/logs', (_m, _b, q) => {
  let list = activity
  if (q.level) list = list.filter((l) => l.level === q.level)
  if (q.action) list = list.filter((l) => l.action === q.action)
  if (q.entity_type) list = list.filter((l) => l.entity_type === q.entity_type)
  const limit = +q.limit || 50
  const offset = +q.offset || 0
  return { logs: list.slice(offset, offset + limit), total: list.length, limit, offset }
})
on('GET', '/labels', () => labels.map((l) => {
  const database_count = dbs.filter((d) => d.d.labels?.some((x) => x.id === l.id)).length
  const storage_count = storages.filter((s) => s.cfg.labels?.some((x) => x.id === l.id)).length
  const notification_count = notifications.filter((n) => n.labels?.some((x) => x.id === l.id)).length
  return { ...l, database_count, storage_count, notification_count, total_usage: database_count + storage_count + notification_count }
}))
on('POST', '/labels', (_m, b) => { const l = mkLabel(uid(), b.name, b.color || 'gray', b.description); labels.push(l); return l })
on('PUT', '/labels/:id', (m, b) => { const l = labels.find((x) => x.id === m[1]); if (!l) throw notFound('Label'); Object.assign(l, b, { updated_at: iso(Date.now()) }); return l })
on('DELETE', '/labels/:id', (m) => { const i = labels.findIndex((x) => x.id === m[1]); if (i >= 0) labels.splice(i, 1) })

// databases
on('GET', '/databases', () => dbs.map(dbView))
on('POST', '/databases/test', async (_m, b) => {
  if (b.execution_mode === 'agent') return { job_id: startAgentTest(b.agent_id, b.agent_connection) }
  await sleep(700)
  return { result: { ok: true, server_version: '16.4', server_major: 16, client_major: 16, latency_ms: 38, message: 'Connected to PostgreSQL 16.4' } }
})
on('GET', '/databases/:id', (m) => { const r = dbById(m[1]); if (!r) throw notFound('Database'); return dbView(r) })
on('GET', '/databases/:id/connection', (m) => { const r = dbById(m[1]); if (!r) throw notFound('Database'); return { host: r.host, port: r.port, dbname: r.dbname, user: r.user, has_password: true } })
on('POST', '/databases', (_m, b) => {
  if (!b.name?.trim()) throw bad('Name is required', 'name')
  const id = uid()
  const row = mkDb({ id, name: b.name.trim(), execution_mode: b.execution_mode, agent_id: b.agent_id, agent_connection: b.agent_connection, central_credentials: b.execution_mode !== 'agent', schedule: b.schedule, timezone: b.timezone || 'UTC', storage_id: b.storage_id, notification_id: b.notification_id ?? undefined, rotation_policy: b.rotation_policy, postgres_version: b.postgres_version || '16', created_at: iso(Date.now()), updated_at: iso(Date.now()) }, { host: b.host || 'db.internal', port: b.port, dbname: b.dbname || b.name, user: b.user || 'postgres', size: 1.2e8 + rnd() * 6e8 })
  dbs.push(row)
  log('database_created', 'success', `Database configuration '${row.d.name}' created`, { type: 'database', id, name: row.d.name })
  return dbView(row)
})
on('PUT', '/databases/:id', (m, b) => {
  const r = dbById(m[1]); if (!r) throw notFound('Database')
  const { host, port, dbname, user, password: _p, ...rest } = b
  Object.assign(r.d, rest, { updated_at: iso(Date.now()) })
  if (host) { r.host = host; r.d.host = maskHost(host) }
  if (port) r.port = port
  if (dbname) { r.dbname = dbname; r.d.dbname = mask(dbname) }
  if (user) { r.user = user; r.d.user = mask(user) }
  log('database_updated', 'info', `Database configuration '${r.d.name}' updated`, { type: 'database', id: r.d.id, name: r.d.name })
  return dbView(r)
})
on('DELETE', '/databases/:id', (m, _b, q) => {
  const i = dbs.findIndex((x) => x.d.id === m[1]); if (i < 0) throw notFound('Database')
  const [r] = dbs.splice(i, 1)
  if (q.delete_backups === 'true') for (let k = backups.length - 1; k >= 0; k--) if (backups[k].b.database_id === r.d.id) backups.splice(k, 1)
  log('database_deleted', 'warning', `Database configuration '${r.d.name}' deleted`, { type: 'database', id: r.d.id, name: r.d.name })
})
on('POST', '/databases/:id/(pause|unpause)', (m) => {
  const r = dbById(m[1]); if (!r) throw notFound('Database')
  r.d.paused = m[2] === 'pause'
  log(r.d.paused ? 'database_paused' : 'database_resumed', 'info', `Backups ${r.d.paused ? 'paused' : 'resumed'} for ${r.d.name}`, { type: 'database', id: r.d.id, name: r.d.name })
  return dbView(r)
})
on('POST', '/databases/:id/test', async (m) => {
  const r = dbById(m[1]); if (!r) throw notFound('Database')
  if (r.d.execution_mode === 'agent') return { job_id: startAgentTest(r.d.agent_id, r.d.agent_connection) }
  await sleep(600)
  if (r.d.id === 'd-billing') return { result: { ok: false, latency_ms: 3002, code: 'host_unreachable', message: 'dial tcp 10.2.0.7:5432: connect: no route to host' } }
  return { result: { ok: true, server_version: r.d.postgres_version + '.4', server_major: +r.d.postgres_version, client_major: +r.d.postgres_version, latency_ms: 24 + Math.round(rnd() * 30), message: `Connected to PostgreSQL ${r.d.postgres_version}.4` } }
})
on('POST', '/databases/:id/backup', (m) => {
  const row = dbById(m[1]); if (!row) throw notFound('Database')
  const running = backups.find((x) => x.plan && x.b.database_id === row.d.id)
  if (running) throw new ApiError(409, 'A backup is already running for this database', { code: 'conflict', message: 'A backup is already running for this database' })
  const now = Date.now()
  const b = viewBackup(row, { id: uid(), t: now, status: 'pending', stage: 'queued', trigger: 'manual', restorable: false, agent_attempts: row.d.execution_mode === 'agent' ? 1 : undefined })
  const x: BackupRow = { b, plan: BACKUP_PLAN(row), start: now, events: [], finalSize: Math.round(row.size * (0.99 + rnd() * 0.03)) }
  backups.unshift(x)
  advanceBackup(x, now)
  log('backup_started', 'info', `Backup started for ${row.d.name}`, { type: 'backup', id: b.id, name: b.name })
  return { ...b }
})

// backups
on('GET', '/backups', (_m, _b, q) => {
  let list = backups.map((x) => x.b)
  if (q.database_id) list = list.filter((b) => b.database_id === q.database_id)
  if (q.agent_id) list = list.filter((b) => b.agent_id === q.agent_id)
  if (q.status) { const s = q.status.split(','); list = list.filter((b) => s.includes(b.status)) }
  if (q.executor) list = list.filter((b) => b.executor === q.executor)
  if (q.trigger) list = list.filter((b) => b.trigger === q.trigger)
  if (q.q) { const v = q.q.toLowerCase(); list = list.filter((b) => (b.name + ' ' + b.database_name).toLowerCase().includes(v)) }
  if (q.from) list = list.filter((b) => Date.parse(b.timestamp) >= Date.parse(q.from))
  if (q.to) list = list.filter((b) => Date.parse(b.timestamp) <= Date.parse(q.to))
  if (q.sort === 'oldest') list = [...list].reverse()
  if (q.sort === 'largest') list = [...list].sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0))
  const limit = +q.limit || 25
  const offset = +q.offset || 0
  return { items: list.slice(offset, offset + limit).map((b) => ({ ...b })), total: list.length, limit, offset }
})
on('GET', '/backups/failed/count', () => ({ count: backups.filter((x) => x.b.status === 'failed').length }))
on('DELETE', '/backups/failed', () => { let n = 0; for (let k = backups.length - 1; k >= 0; k--) if (backups[k].b.status === 'failed') { backups.splice(k, 1); n++ } return { deleted: n } })
on('GET', '/backups/:id', (m) => { const x = backups.find((y) => y.b.id === m[1]); if (!x) throw notFound('Backup'); return { ...x.b } })
on('GET', '/backups/:id/events', (m) => { const x = backups.find((y) => y.b.id === m[1]); if (!x) throw notFound('Backup'); return [...x.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) })
on('POST', '/backups/:id/cancel', (m) => {
  const x = backups.find((y) => y.b.id === m[1]); if (!x) throw notFound('Backup')
  if (!x.plan) return
  x.plan = undefined
  Object.assign(x.b, { status: 'cancelled', stage: '', completed_at: iso(Date.now()), error_code: 'cancelled', error_message: 'Cancelled by admin', cancel_requested: true })
  x.events.push(ev('backup', x.b.id, Date.now(), 'warning', 'Cancellation requested'), ev('backup', x.b.id, Date.now() + 300, 'error', 'Backup cancelled'))
})
on('POST', '/backups/:id/download/request-otp', () => ({ otp_id: uid(), expires_at: iso(Date.now() + 5 * MIN), channels: ['discord'] }))
on('POST', '/backups/:id/download/verify', () => {
  throw new ApiError(400, 'Downloads are disabled in the demo. On your server this opens a short-lived presigned URL.', { code: 'demo', message: 'Downloads are disabled in the demo. On your server this opens a short-lived presigned URL.' })
})
on('POST', '/backups/:id/restore', (m, req) => {
  const x = backups.find((y) => y.b.id === m[1]); if (!x) throw notFound('Backup')
  const b = x.b
  const src = dbById(b.database_id)
  const target = req.target as RestoreJob['target']
  const tdb = target === 'database' ? dbById(req.target_database_id) : target === 'original' ? src : undefined
  const tName = target === 'custom' ? `${req.target_dbname || 'restore'} (custom)` : tdb?.d.name ?? b.database_name
  if ((target === 'original' || req.clean_target) && req.confirm !== undefined && req.confirm !== (tdb?.d.name ?? req.target_dbname)) throw bad('Type the target database name to confirm', 'confirm')
  const exec = req.execution_mode ?? (tdb?.d.execution_mode || b.executor)
  const agentId = exec === 'agent' ? req.agent_id ?? tdb?.d.agent_id ?? b.agent_id : undefined
  const now = Date.now()
  const r: RestoreJob = {
    id: uid(), backup_id: b.id, database_id: b.database_id, target, target_database_id: tdb?.d.id, executor: exec, agent_id: agentId,
    agent_connection: req.agent_connection ?? tdb?.d.agent_connection, target_host: req.target_host, target_dbname: req.target_dbname,
    clean_target: !!req.clean_target, status: 'pending', stage: 'queued', started_at: iso(now), created_at: iso(now),
    backup_name: b.name, database_name: b.database_name, target_name: tName, agent_name: agentById(agentId)?.a.name,
  }
  const row: RestoreRow = { r, plan: RESTORE_PLAN(r, b), start: now, events: [] }
  restores.unshift(row)
  advanceRestore(row, now)
  log('restore_started', 'info', `Restore of ${b.name} into ${tName} started`, { type: 'restore', id: r.id })
  return restoreView(row)
})

// restores
on('GET', '/restores', (_m, _b, q) => {
  let list = restores
  if (q.backup_id) list = list.filter((x) => x.r.backup_id === q.backup_id)
  if (q.database_id) list = list.filter((x) => x.r.database_id === q.database_id || x.r.target_database_id === q.database_id)
  return list.slice(0, +q.limit || 100).map(restoreView)
})
on('GET', '/restores/:id', (m) => { const x = restores.find((y) => y.r.id === m[1]); if (!x) throw notFound('Restore'); return restoreView(x) })
on('GET', '/restores/:id/events', (m) => { const x = restores.find((y) => y.r.id === m[1]); if (!x) throw notFound('Restore'); return [...x.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) })

// agents
function startAgentTest(agentId?: string, conn?: string) {
  const a = agentById(agentId)?.a
  const id = uid()
  const online = a?.connectivity === 'online'
  const known = a?.connections.some((c) => c.name === conn)
  const result: TestResult = !online
    ? { ok: false, latency_ms: 0, code: 'agent_unavailable', message: `Agent "${a?.name ?? 'unknown'}" is offline` }
    : known || !conn
      ? { ok: true, server_version: '16.4', server_major: 16, client_major: 16, latency_ms: 9, message: 'Connected to PostgreSQL 16.4 from the agent' }
      : { ok: false, latency_ms: 0, code: 'configuration_error', message: `The agent has no connection named "${conn}"` }
  agentJobs.set(id, { job: { id, kind: 'test_connection', status: 'queued', attempts: 1, created_at: iso(Date.now()) }, doneAt: Date.now() + (online ? 2200 : 6000), result })
  return id
}
on('GET', '/agent-jobs/:id', (m) => {
  const j = agentJobs.get(m[1]); if (!j) throw notFound('Job')
  const now = Date.now()
  if (now >= j.doneAt) return { ...j.job, status: j.result.ok ? 'completed' : 'failed', result: j.result, error_message: j.result.ok ? undefined : j.result.message, completed_at: iso(j.doneAt) }
  return { ...j.job, status: now > j.doneAt - 1500 ? 'leased' : 'queued' }
})
on('GET', '/agents', () => agents.map(agentView))
on('GET', '/agents/:id', (m) => { const r = agentById(m[1]); if (!r) throw notFound('Agent'); return agentView(r) })
const enrollment = (r: AgentRow, ttl = 60) => ({ agent: agentView(r), enrollment_token: 'dse_' + hex(20), expires_at: iso(Date.now() + ttl * MIN), server_url: 'https://backups.acme.dev' })
on('POST', '/agents', (_m, b, q) => {
  if (!b.name?.trim()) throw bad('Name is required', 'name')
  if (agents.some((r) => r.a.name === b.name.trim())) throw bad('An agent with this name already exists', 'name')
  const now = Date.now()
  const a: Agent = {
    id: uid(), user_id: ME.id, name: b.name.trim(), description: b.description ?? '', status: 'pending', pg_versions: [], connections: [], labels: b.labels ?? [],
    allow_restore: !!b.allow_restore, agent_allow_restore: false, upload_modes: [], max_concurrency: 1, running_jobs: 0, created_at: iso(now), updated_at: iso(now),
    connectivity: 'never_connected', database_count: 0, recent_failures: 0,
  }
  // The demo "deploys" the agent for you a few seconds after the token is issued.
  const row: AgentRow = { a, deployAt: now + 9000 }
  agents.push(row)
  log('agent_created', 'success', `Agent "${a.name}" created`, { type: 'agent', id: a.id, name: a.name })
  return enrollment(row, +q.ttl_minutes || 60)
})
on('PUT', '/agents/:id', (m, b) => { const r = agentById(m[1]); if (!r) throw notFound('Agent'); Object.assign(r.a, b, { updated_at: iso(Date.now()) }); return agentView(r) })
on('POST', '/agents/:id/(enable|disable|revoke)', (m) => {
  const r = agentById(m[1]); if (!r) throw notFound('Agent')
  const act = m[2]
  r.a.status = act === 'enable' ? 'active' : act === 'disable' ? 'disabled' : 'revoked'
  if (act !== 'enable') r.a.connectivity = 'offline'
  log('agent_' + act + 'd', act === 'enable' ? 'info' : 'warning', `Agent "${r.a.name}" ${act}d`, { type: 'agent', id: r.a.id, name: r.a.name })
  return agentView(r)
})
on('POST', '/agents/:id/enrollment', (m, _b, q) => {
  const r = agentById(m[1]); if (!r) throw notFound('Agent')
  if (r.a.status === 'pending') r.deployAt = Date.now() + 9000
  return enrollment(r, +q.ttl_minutes || 60)
})
on('DELETE', '/agents/:id', (m) => { const i = agents.findIndex((r) => r.a.id === m[1]); if (i >= 0) agents.splice(i, 1) })
on('POST', '/agents/:id/test-connection', (m, b) => ({ job_id: startAgentTest(m[1], b.agent_connection) }))

// storage
on('GET', '/storage', () => storages.map(storageView))
on('POST', '/storage/test', async () => { await sleep(900); return { ok: true, message: 'Wrote, read back and deleted a probe object', latency_ms: 212 } })
on('GET', '/storage/:id', (m) => { const s = storageById(m[1]); if (!s) throw notFound('Storage'); return storageView(s) })
on('GET', '/storage/:id/settings', (m) => { const s = storageById(m[1]); if (!s) throw notFound('Storage'); return { bucket: s.bucket, region: s.region, endpoint: s.endpoint } })
on('POST', '/storage', (_m, b) => {
  const now = Date.now()
  const s: StorageRow = { bucket: b.bucket, endpoint: b.endpoint ?? '', region: b.region ?? 'auto', cfg: { id: uid(), name: b.name, provider: b.provider, bucket: mask(b.bucket ?? ''), region: b.region, endpoint: b.endpoint, access_key: 'AKIA***', is_default: !!b.is_default, labels: [], database_count: 0, backup_count: 0, used_bytes: 0, created_at: iso(now), updated_at: iso(now) } }
  if (s.cfg.is_default) storages.forEach((x) => (x.cfg.is_default = false))
  storages.push(s)
  log('storage_created', 'success', `Storage configuration '${s.cfg.name}' created`, { type: 'storage', id: s.cfg.id })
  return storageView(s)
})
on('PUT', '/storage/:id', (m, b) => { const s = storageById(m[1]); if (!s) throw notFound('Storage'); s.cfg.name = b.name ?? s.cfg.name; if (b.bucket) { s.bucket = b.bucket; s.cfg.bucket = mask(b.bucket) } if (b.region) s.cfg.region = s.region = b.region; return storageView(s) })
on('DELETE', '/storage/:id', (m) => {
  if (dbs.some((d) => d.d.storage_id === m[1])) throw new ApiError(409, 'Storage is used by databases', { code: 'conflict', message: 'This storage is still used by databases. Move them to another storage first.' })
  const i = storages.findIndex((s) => s.cfg.id === m[1]); if (i >= 0) storages.splice(i, 1)
})
on('POST', '/storage/:id/test', async (m) => {
  const s = storageById(m[1]); if (!s) throw notFound('Storage')
  await sleep(900)
  return { ok: true, message: 'Wrote, read back and deleted a probe object', latency_ms: s.cfg.provider === 'minio' ? 41 : 180 + Math.round(rnd() * 90) }
})
on('POST', '/storage/:id/default', (m) => { storages.forEach((s) => (s.cfg.is_default = s.cfg.id === m[1])) })

// notifications
on('GET', '/notifications', () => notifications)
on('POST', '/notifications', (_m, b) => {
  const now = Date.now()
  const n: NotificationConfig = { id: uid(), name: b.name, has_discord: !!b.discord_webhook_url, discord_webhook_url: b.discord_webhook_url ? 'https://discord.com/api/webhooks/***/***' : undefined, has_telegram: !!b.telegram_bot_token, telegram_bot_token: b.telegram_bot_token ? '***:***' : undefined, telegram_chat_id: b.telegram_chat_id ? mask(b.telegram_chat_id) : undefined, labels: [], created_at: iso(now), updated_at: iso(now) }
  notifications.push(n)
  return n
})
on('PUT', '/notifications/:id', (m, b) => { const n = notifications.find((x) => x.id === m[1]); if (!n) throw notFound('Notification'); n.name = b.name ?? n.name; return n })
on('DELETE', '/notifications/:id', (m) => { const i = notifications.findIndex((x) => x.id === m[1]); if (i >= 0) notifications.splice(i, 1) })
on('POST', '/notifications/:id/test', async () => { await sleep(600); return { ok: true, message: 'Test message sent' } })

// admin & explorer
on('GET', '/admin/users', () => [
  { id: ME.id, display_name: 'admin', email: ME.email, discord_username: 'admin', is_admin: true, is_demo: false, two_factor_enabled: true, created_at: ME.created_at },
  { id: 'u-0002', display_name: 'priya', email: 'priya@acme.dev', github_login: 'priya-dev', is_admin: false, is_demo: false, two_factor_enabled: true, created_at: iso(T0 - 40 * DAY) },
  { id: 'u-0003', display_name: 'demo', email: 'demo@acme.dev', is_admin: false, is_demo: true, two_factor_enabled: false, created_at: iso(T0 - 20 * DAY) },
])
on('PATCH', '/admin/users/:id', () => undefined)
on('GET', '/server-connections', () => [])

// ------------------------------------------------------------------ entry

const GENERIC_OK = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function demoApi<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = (opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')).toUpperCase()
  const q: Q = {}
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') q[k] = String(v)
  // Feel like a network, not a function call.
  await sleep(method === 'GET' ? 60 + Math.random() * 120 : 180 + Math.random() * 220)
  tick()
  for (const [m, re, h] of routes) {
    if (m !== method) continue
    const match = path.match(re)
    if (match) {
      const out = await h(match, opts.body ?? {}, q)
      return structuredClone(out) as T
    }
  }
  if (method === 'GET') throw notFound('Endpoint')
  if (GENERIC_OK.has(method)) return undefined as T
  throw notFound('Endpoint')
}
