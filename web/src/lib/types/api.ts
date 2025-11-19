// API Types based on Swagger documentation

// Authentication Types
export interface LoginRequest {
  username?: string;
}

export interface VerifyRequest {
  username?: string;
  otp: string;
}

export interface AuthResponse {
  token: string;
  expires_at: string;
}

// Notification Types
export type StorageProvider = 's3' | 'r2';

export interface NotificationConfig {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationConfigInput {
  name: string;
  discord_webhook_url: string;
}

// Statistics Types
export interface SystemStats {
  total_databases: number;
  total_backups_24h: number;
  success_rate_24h: number;
  failure_rate_24h: number;
  total_storage_used_bytes: number;
}

// Storage Types
export interface StorageConfig {
  id: string;
  name: string;
  provider: StorageProvider;
  bucket: string;
  region: string;
  endpoint: string;
  created_at: string;
  updated_at: string;
}

export interface StorageConfigInput {
  name: string;
  provider: StorageProvider;
  access_key: string;
  secret_key: string;
  bucket: string;
  region?: string;
  endpoint?: string;
}

// Database Types
export type RotationPolicyType = 'count' | 'days';
export type BackupStatus = 'pending' | 'running' | 'success' | 'failed';

export interface RotationPolicy {
  type: RotationPolicyType;
  value: number;
}

export interface DatabaseConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  dbname: string;
  schedule: string;
  storage_id: string;
  notification_id: string;
  postgres_version: string;
  version_last_checked: string;
  enabled: boolean;
  paused: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatabaseConfigInput {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  dbname: string;
  schedule: string;
  storage_id: string;
  notification_id?: string;
  postgres_version?: string;
  rotation_policy: RotationPolicy;
}

export interface Backup {
  id: string;
  name: string;
  database_id: string;
  status: BackupStatus;
  size_bytes: number;
  storage_path: string;
  timestamp: string;
  completed_at: string;
  error_message: string;
}

export interface RestoreRequest {
  target_host?: string;
  target_port?: number;
  target_dbname?: string;
  target_user?: string;
  target_password?: string;
}

export interface RestoreJob {
  id: string;
  backup_id: string;
  status: BackupStatus;
  target_host: string;
  target_port: number;
  target_dbname: string;
  target_user: string;
  created_at: string;
  started_at: string;
  completed_at: string;
  error_message: string;
}

// Activity Log Types
export type ActivityLogAction =
  | 'login'
  | 'logout'
  | 'storage_created'
  | 'storage_updated'
  | 'storage_deleted'
  | 'notification_created'
  | 'notification_updated'
  | 'notification_deleted'
  | 'database_created'
  | 'database_updated'
  | 'database_deleted'
  | 'database_paused'
  | 'database_unpaused'
  | 'backup_triggered'
  | 'backup_started'
  | 'backup_completed'
  | 'backup_failed'
  | 'restore_triggered'
  | 'restore_started'
  | 'restore_completed'
  | 'restore_failed'
  | 'system_startup'
  | 'system_shutdown';

export type ActivityLogLevel = 'info' | 'warning' | 'error' | 'success';

export interface User {
  id: string;
  discord_user_id: string;
  discord_username: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  user?: User;
  action: ActivityLogAction;
  level: ActivityLogLevel;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  description: string;
  metadata?: string;
  ip_address?: string;
  created_at: string;
}

export interface ActivityLogListParams {
  user_id?: string;
  action?: ActivityLogAction;
  level?: ActivityLogLevel;
  entity_type?: string;
  entity_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityLogListResponse {
  logs: ActivityLog[];
  total: number;
  limit: number;
  offset: number;
}

// Error Types
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationErrorResponse {
  code: string;
  message: string;
  errors: ValidationError[];
}

export interface ApiError {
  message: string;
  code?: string;
  errors?: ValidationError[];
}
