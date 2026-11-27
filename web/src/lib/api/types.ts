// Types mirror the DumpStation v2 API (server/internal/models + handlers/*_v2.go).

export type UUID = string
export type ISODate = string

export type ExecutionMode = 'direct' | 'agent'
export type BackupStatus = 'pending' | 'running' | 'success' | 'failed' | 'deleted' | 'cancelled'
export type BackupStage =
  | ''
  | 'queued'
  | 'waiting_for_agent'
  | 'preparing'
  | 'dumping'
  | 'uploading'
  | 'verifying'
  | 'downloading'
  | 'restoring'
export type DatabaseHealth = 'healthy' | 'running' | 'failing' | 'stale' | 'never_backed_up' | 'paused'
export type RotationPolicyType = 'count' | 'days'
export type StorageProvider = 's3' | 'r2' | 'minio' | 's3_compatible'
export type AgentStatus = 'pending' | 'active' | 'disabled' | 'revoked'
export type AgentConnectivity = 'online' | 'offline' | 'never_connected'
export type RestoreTarget = 'original' | 'database' | 'custom'
export type LogLevel = 'info' | 'warning' | 'error' | 'success'

export interface ApiErrorBody {
  code?: string
  message: string
  errors?: { field: string; message: string }[]
}

export interface Label {
  id: UUID
  name: string
  color: string
  description?: string
  created_at: ISODate
  updated_at: ISODate
}

export interface LabelWithUsage extends Label {
  database_count: number
  storage_count: number
  notification_count: number
  total_usage: number
}

export interface RotationPolicy {
  type: RotationPolicyType
  value: number
}

export interface BackupSummary {
  id: UUID
  name: string
  status: BackupStatus
  stage?: BackupStage
  started_at: ISODate
  completed_at?: ISODate
  size_bytes?: number
  error_code?: string
}

export interface Database {
  id: UUID
  name: string
  host: string // masked
  port: string // masked
  dbname: string // masked
  user: string // masked
  schedule: string
  timezone: string
  storage_id: UUID
  notification_id?: UUID
  postgres_version: string
  version_last_checked?: ISODate
  enabled: boolean
  paused: boolean
  rotation_policy: RotationPolicy
  execution_mode: ExecutionMode
  agent_id?: UUID
  agent_connection?: string
  central_credentials: boolean
  labels?: Label[]
  created_at: ISODate
  updated_at: ISODate
  next_run_at?: ISODate
  last_backup?: BackupSummary
  last_success_at?: ISODate
  active_backup?: BackupSummary
  health?: DatabaseHealth
}

export interface DatabaseInput {
  name: string
  execution_mode: ExecutionMode
  agent_id?: UUID
  agent_connection?: string
  host?: string
  port?: number
  dbname?: string
  user?: string
  password?: string
  schedule: string
  timezone?: string
  storage_id: UUID
  notification_id?: UUID | null
  postgres_version?: string
  rotation_policy: RotationPolicy
}

export interface ConnectionTestInput {
  execution_mode: ExecutionMode
  agent_id?: UUID
  agent_connection?: string
  host?: string
  port?: number
  dbname?: string
  user?: string
  password?: string
  database_id?: UUID
}

export interface TestResult {
  ok: boolean
  server_version?: string
  server_major?: number
  client_major?: number
  latency_ms: number
  code?: string
  message: string
}

export interface ConnectionTestResponse {
  result?: TestResult
  job_id?: UUID
}

export interface Backup {
  id: UUID
  name: string
  database_id: UUID
  status: BackupStatus
  stage?: BackupStage
  trigger: 'scheduled' | 'manual'
  executor: ExecutionMode
  agent_id?: UUID
  storage_id?: UUID
  size_bytes?: number
  storage_path?: string
  dump_format: 'plain' | 'custom'
  checksum_sha256?: string
  postgres_version?: string
  error_code?: string
  error_message?: string
  cancel_requested?: boolean
  timestamp: ISODate // queued at
  run_started_at?: ISODate
  completed_at?: ISODate
  // view fields
  database_name: string
  storage_name?: string
  agent_name?: string
  duration_ms?: number
  restorable: boolean
  agent_attempts?: number
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface BackupListQuery {
  database_id?: string
  agent_id?: string
  status?: string // comma separated
  executor?: string
  trigger?: string
  q?: string
  from?: string
  to?: string
  sort?: string
  limit?: number
  offset?: number
}

export interface JobEvent {
  id: UUID
  job_kind: 'backup' | 'restore'
  job_id: UUID
  level: LogLevel
  stage?: string
  message: string
  source: 'server' | 'agent'
  created_at: ISODate
}

export interface RestoreRequest {
  target: RestoreTarget
  target_database_id?: UUID
  execution_mode?: ExecutionMode
  agent_id?: UUID
  agent_connection?: string
  target_host?: string
  target_port?: number
  target_dbname?: string
  target_user?: string
  target_password?: string
  clean_target?: boolean
  confirm?: string
}

export interface RestoreJob {
  id: UUID
  backup_id: UUID
  target_host?: string
  target_port?: string
  target_dbname?: string
  target_user?: string
  database_id?: UUID
  target: RestoreTarget
  target_database_id?: UUID
  executor: ExecutionMode
  agent_id?: UUID
  agent_connection?: string
  clean_target: boolean
  stage?: BackupStage
  error_code?: string
  status: BackupStatus
  error_message?: string
  started_at: ISODate
  completed_at?: ISODate
  created_at: ISODate
  backup_name?: string
  database_name?: string
  target_name?: string
  agent_name?: string
}

export interface StorageConfig {
  id: UUID
  name: string
  provider: StorageProvider
  bucket: string // masked
  region?: string
  endpoint?: string // masked
  access_key: string // masked
  is_default: boolean
  labels?: Label[]
  database_count: number
  backup_count: number
  used_bytes: number
  created_at: ISODate
  updated_at: ISODate
}

export interface StorageInput {
  name: string
  provider: StorageProvider
  bucket: string
  region?: string
  endpoint?: string
  access_key?: string
  secret_key?: string
  is_default?: boolean
}

export interface StorageTestResult {
  ok: boolean
  stage?: string
  message: string
  latency_ms: number
}

export interface NotificationConfig {
  id: UUID
  name: string
  discord_webhook_url?: string // masked
  has_discord: boolean
  telegram_bot_token?: string // masked
  telegram_chat_id?: string // masked
  has_telegram: boolean
  labels?: Label[]
  created_at: ISODate
  updated_at: ISODate
}

export interface NotificationInput {
  name: string
  discord_webhook_url?: string
  telegram_bot_token?: string
  telegram_chat_id?: string
  clear_discord?: boolean
  clear_telegram?: boolean
}

export interface AgentConnectionInfo {
  name: string
  database?: string
  host?: string
}

export interface Agent {
  id: UUID
  user_id: UUID
  name: string
  description: string
  status: AgentStatus
  token_prefix?: string
  version?: string
  hostname?: string
  platform?: string
  pg_versions: string[]
  connections: AgentConnectionInfo[]
  labels: string[]
  allow_restore: boolean
  agent_allow_restore: boolean
  upload_modes: string[]
  max_concurrency: number
  running_jobs: number
  last_seen_at?: ISODate
  last_ip?: string
  enrolled_at?: ISODate
  credential_issued_at?: ISODate
  created_at: ISODate
  updated_at: ISODate
  connectivity: AgentConnectivity
  database_count: number
  recent_failures: number
  last_failure?: Backup
  databases?: { id: UUID; name: string; agent_connection?: string; paused: boolean }[]
}

export interface AgentInput {
  name: string
  description?: string
  labels?: string[]
  allow_restore?: boolean
}

export interface EnrollmentResponse {
  agent: Agent
  enrollment_token: string
  expires_at: ISODate
  server_url: string
}

export interface AgentJob {
  id: UUID
  kind: 'backup' | 'restore' | 'test_connection'
  status: 'queued' | 'leased' | 'completed' | 'failed' | 'cancelled' | 'expired'
  attempts: number
  error_message?: string
  result?: TestResult
  created_at: ISODate
  completed_at?: ISODate
}

export interface UpcomingRun {
  database_id: UUID
  database_name: string
  at: ISODate
  executor: ExecutionMode
}

export interface DailyCount {
  day: ISODate
  success: number
  failed: number
}

export interface ActivityLog {
  id: UUID
  user_id?: UUID
  action: string
  level: LogLevel
  entity_type?: string
  entity_id?: UUID
  entity_name?: string
  description: string
  metadata?: unknown
  ip_address?: string
  created_at: ISODate
}

export interface ActivityLogList {
  logs: ActivityLog[]
  total: number
  limit: number
  offset: number
}

export interface ActivityQuery {
  action?: string
  level?: string
  entity_type?: string
  entity_id?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

export interface Overview {
  databases: { total: number; protected: number; unprotected: number; paused: number; attention: number }
  backups: {
    success_24h: number
    failed_24h: number
    success_7d: number
    failed_7d: number
    success_rate_7d: number | null
    active: number
  }
  storage: { used_bytes: number; artifact_count: number; destinations: number }
  agents: { total: number; online: number; offline: number; disabled: number; pending: number }
  last_success_at?: ISODate
  attention: Database[]
  upcoming: UpcomingRun[]
  active: Backup[]
  recent_failed: Backup[]
  daily: DailyCount[]
  activity: ActivityLog[]
}

export interface SystemHealth {
  version: string
  server_time: ISODate
  timezone: string
  uptime: string
  database_ok: boolean
  database_latency_ms: number
  pg_client_versions: string[]
  scheduler: { active_schedules: number }
  jobs: { direct_concurrency: number; queue_ttl: string; lease_ttl: string; max_attempts: number }
  notifications: { discord_login_webhook: boolean }
  auth: { github: boolean; discord: boolean; turnstile: boolean; demo: boolean }
  public_url: string
}

export interface SchedulePreview {
  valid: boolean
  error?: string
  timezone: string
  next?: ISODate[]
}

export interface UserProfile {
  id: UUID
  discord_user_id?: string
  discord_username?: string
  github_login?: string
  avatar_url?: string
  email: string
  has_profile_picture: boolean
  is_demo: boolean
  is_admin: boolean
  two_factor_enabled: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface AdminUser {
  id: UUID
  display_name: string
  email?: string
  github_login?: string
  discord_username?: string
  is_admin: boolean
  is_demo: boolean
  two_factor_enabled: boolean
  created_at: ISODate
}

export interface AuthConfig {
  discord_enabled: boolean
  github_enabled: boolean
  demo_enabled: boolean
}

export interface AuthResponse {
  token?: string
  expires_at?: ISODate
  requires_2fa?: boolean
  two_factor_token?: string
  two_factor_expires_at?: ISODate
  is_demo?: boolean
}

export interface RefreshResponse {
  token: string
  expires_at: ISODate
  session_expires_at: ISODate
}

export interface TwoFactorSetup {
  secret: string
  qr_code_data_url: string
  issuer: string
  account_name: string
}

export interface TwoFactorStatus {
  enabled: boolean
  verified_at?: ISODate
  backup_codes_count: number
}

export interface BackupCodes {
  codes: string[]
  message: string
}

export interface DownloadOTPResponse {
  otp_id: UUID
  expires_at: ISODate
  channels: string[]
}

export interface DownloadURLResponse {
  download_url: string
  expires_at: ISODate
}

// DB Servers explorer
export interface ServerConnection {
  id: UUID
  name: string
  host: string
  port: number
  user: string
  ssl_mode: 'require' | 'prefer' | 'disable'
  last_tested_at?: ISODate
  last_test_status?: string
  last_test_error?: string
  last_test_ssl_mode?: string
  created_at: ISODate
  updated_at: ISODate
}

export interface ServerConnectionInput {
  name: string
  host: string
  port: number
  user: string
  password?: string
  ssl_mode: 'require' | 'prefer' | 'disable'
}

export interface ServerConnectionTestResult {
  ok: boolean
  ssl_mode?: string
  message?: string
  latency?: string
}

export interface ServerDatabaseInfo {
  name: string
  owner: string
  encoding: string
  size_bytes: number
  size_human: string
}

export interface ServerTableInfo {
  schema: string
  name: string
  row_count: number
  size_bytes: number
  size_human: string
}

export interface ServerRoleInfo {
  name: string
  can_login: boolean
  is_superuser: boolean
  create_db: boolean
  create_role: boolean
}

export interface ServerColumnInfo {
  name: string
  data_type: string
  is_nullable?: boolean
  is_primary_key?: boolean
}

export interface ServerTableRows {
  columns: ServerColumnInfo[]
  rows: unknown[][]
  limit: number
  offset: number
  estimated_total: number
}

export interface ServerERD {
  tables: { schema: string; name: string; columns: ServerColumnInfo[] }[]
  relations: {
    from_schema: string
    from_table: string
    from_column: string
    to_schema: string
    to_table: string
    to_column: string
    constraint_name: string
  }[]
}
