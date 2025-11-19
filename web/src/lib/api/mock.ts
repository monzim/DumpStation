// Mock API responses for development

import type { AuthResponse, SystemStats, NotificationConfig, NotificationConfigInput, StorageConfig, StorageConfigInput, DatabaseConfig, DatabaseConfigInput, Backup, RestoreJob, RestoreRequest } from '@/lib/types/api';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockApi = {
  login: async (username?: string): Promise<{ message: string }> => {
    await delay(1000);
    console.log('[v0] Mock login called with username:', username || 'admin');
    return { message: 'OTP sent to Discord webhook successfully' };
  },

  verify: async (username: string, otp: string): Promise<AuthResponse> => {
    await delay(1000);
    console.log('[v0] Mock verify called with OTP:', otp);
    
    // Simulate OTP validation
    if (otp !== '123456') {
      throw {
        message: 'Invalid or expired OTP',
        code: 'INVALID_OTP',
      };
    }

    return {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.token',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  getStats: async (): Promise<SystemStats> => {
    await delay(800);
    console.log('[v0] Mock stats fetched');
    
    return {
      total_databases: 5,
      total_backups_24h: 10,
      success_rate_24h: 95.5,
      failure_rate_24h: 4.5,
      total_storage_used_bytes: 1073741824, // 1 GB
    };
  },

  // Notifications
  getNotifications: async (): Promise<NotificationConfig[]> => {
    await delay(800);
    console.log('[v0] Mock notifications fetched');
    
    return [
      {
        id: '1',
        name: 'DevOps Alerts',
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        name: 'Production Alerts',
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  },

  getNotificationById: async (id: string): Promise<NotificationConfig> => {
    await delay(600);
    console.log('[v0] Mock notification fetched:', id);
    
    return {
      id,
      name: 'DevOps Alerts',
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  createNotification: async (input: NotificationConfigInput): Promise<NotificationConfig> => {
    await delay(1000);
    console.log('[v0] Mock notification created:', input);
    
    return {
      id: Math.random().toString(36).substring(7),
      name: input.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  updateNotification: async (id: string, input: NotificationConfigInput): Promise<NotificationConfig> => {
    await delay(1000);
    console.log('[v0] Mock notification updated:', id, input);
    
    return {
      id,
      name: input.name,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  deleteNotification: async (id: string): Promise<void> => {
    await delay(800);
    console.log('[v0] Mock notification deleted:', id);
  },

  // Storage
  getStorageConfigs: async (): Promise<StorageConfig[]> => {
    await delay(800);
    console.log('[v0] Mock storage configs fetched');
    
    return [
      {
        id: '1',
        name: 'My R2 Bucket',
        provider: 'r2',
        bucket: 'my-backup-bucket',
        region: 'auto',
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        name: 'AWS S3 Production',
        provider: 's3',
        bucket: 'prod-backups',
        region: 'us-east-1',
        endpoint: 's3.amazonaws.com',
        created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  },

  getStorageConfigById: async (id: string): Promise<StorageConfig> => {
    await delay(600);
    console.log('[v0] Mock storage config fetched:', id);
    
    return {
      id,
      name: 'My R2 Bucket',
      provider: 'r2',
      bucket: 'my-backup-bucket',
      region: 'auto',
      endpoint: 'https://account-id.r2.cloudflarestorage.com',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  createStorageConfig: async (input: StorageConfigInput): Promise<StorageConfig> => {
    await delay(1000);
    console.log('[v0] Mock storage config created:', input);
    
    return {
      id: Math.random().toString(36).substring(7),
      name: input.name,
      provider: input.provider,
      bucket: input.bucket,
      region: input.region || 'auto',
      endpoint: input.endpoint || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  updateStorageConfig: async (id: string, input: StorageConfigInput): Promise<StorageConfig> => {
    await delay(1000);
    console.log('[v0] Mock storage config updated:', id, input);
    
    return {
      id,
      name: input.name,
      provider: input.provider,
      bucket: input.bucket,
      region: input.region || 'auto',
      endpoint: input.endpoint || '',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  deleteStorageConfig: async (id: string): Promise<void> => {
    await delay(800);
    console.log('[v0] Mock storage config deleted:', id);
  },

  // Databases
  getDatabases: async (): Promise<DatabaseConfig[]> => {
    await delay(800);
    console.log('[v0] Mock databases fetched');
    
    return [
      {
        id: '1',
        name: 'Production DB',
        host: 'prod-db.example.com',
        port: 5432,
        user: 'backup_user',
        dbname: 'proddb',
        schedule: '0 2 * * *',
        storage_id: '1',
        notification_id: '1',
        postgres_version: '15',
        version_last_checked: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        paused: false,
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        name: 'Staging DB',
        host: 'staging-db.example.com',
        port: 5432,
        user: 'backup_user',
        dbname: 'stagingdb',
        schedule: '0 4 * * *',
        storage_id: '2',
        notification_id: '2',
        postgres_version: '14',
        version_last_checked: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        paused: true,
        created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  },

  getDatabaseById: async (id: string): Promise<DatabaseConfig> => {
    await delay(600);
    console.log('[v0] Mock database fetched:', id);
    
    return {
      id,
      name: 'Production DB',
      host: 'prod-db.example.com',
      port: 5432,
      user: 'backup_user',
      dbname: 'proddb',
      schedule: '0 2 * * *',
      storage_id: '1',
      notification_id: '1',
      postgres_version: '15',
      version_last_checked: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      enabled: true,
      paused: false,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  createDatabase: async (input: DatabaseConfigInput): Promise<DatabaseConfig> => {
    await delay(1000);
    console.log('[v0] Mock database created:', input);
    
    return {
      id: Math.random().toString(36).substring(7),
      name: input.name,
      host: input.host,
      port: input.port,
      user: input.user,
      dbname: input.dbname,
      schedule: input.schedule,
      storage_id: input.storage_id,
      notification_id: input.notification_id || '',
      postgres_version: input.postgres_version || 'latest',
      version_last_checked: new Date().toISOString(),
      enabled: true,
      paused: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  updateDatabase: async (id: string, input: DatabaseConfigInput): Promise<DatabaseConfig> => {
    await delay(1000);
    console.log('[v0] Mock database updated:', id, input);
    
    return {
      id,
      name: input.name,
      host: input.host,
      port: input.port,
      user: input.user,
      dbname: input.dbname,
      schedule: input.schedule,
      storage_id: input.storage_id,
      notification_id: input.notification_id || '',
      postgres_version: input.postgres_version || 'latest',
      version_last_checked: new Date().toISOString(),
      enabled: true,
      paused: false,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  deleteDatabase: async (id: string): Promise<void> => {
    await delay(800);
    console.log('[v0] Mock database deleted:', id);
  },

  pauseDatabase: async (id: string): Promise<DatabaseConfig> => {
    await delay(600);
    console.log('[v0] Mock database paused:', id);
    
    return {
      id,
      name: 'Production DB',
      host: 'prod-db.example.com',
      port: 5432,
      user: 'backup_user',
      dbname: 'proddb',
      schedule: '0 2 * * *',
      storage_id: '1',
      notification_id: '1',
      postgres_version: '15',
      version_last_checked: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      enabled: true,
      paused: true,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  unpauseDatabase: async (id: string): Promise<DatabaseConfig> => {
    await delay(600);
    console.log('[v0] Mock database unpaused:', id);
    
    return {
      id,
      name: 'Production DB',
      host: 'prod-db.example.com',
      port: 5432,
      user: 'backup_user',
      dbname: 'proddb',
      schedule: '0 2 * * *',
      storage_id: '1',
      notification_id: '1',
      postgres_version: '15',
      version_last_checked: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      enabled: true,
      paused: false,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  triggerBackup: async (id: string): Promise<Backup> => {
    await delay(1000);
    console.log('[v0] Mock backup triggered for database:', id);
    
    return {
      id: Math.random().toString(36).substring(7),
      database_id: id,
      status: 'pending',
      size_bytes: 0,
      storage_path: '',
      timestamp: new Date().toISOString(),
      completed_at: '',
      error_message: '',
    };
  },

  getDatabaseBackups: async (id: string): Promise<Backup[]> => {
    await delay(800);
    console.log('[v0] Mock backups fetched for database:', id);
    
    return [
      {
        id: '1',
        database_id: id,
        status: 'success',
        size_bytes: 104857600, // 100 MB
        storage_path: 's3://my-bucket/backups/db1/2025-01-15.sql.gz',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        error_message: '',
      },
      {
        id: '2',
        database_id: id,
        status: 'success',
        size_bytes: 98304000, // 93.75 MB
        storage_path: 's3://my-bucket/backups/db1/2025-01-14.sql.gz',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
        error_message: '',
      },
      {
        id: '3',
        database_id: id,
        status: 'failed',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 71.5 * 60 * 60 * 1000).toISOString(),
        error_message: 'Connection timeout',
      },
      {
        id: '4',
        database_id: id,
        status: 'running',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        completed_at: '',
        error_message: '',
      },
      {
        id: '5',
        database_id: id,
        status: 'pending',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString(),
        completed_at: '',
        error_message: '',
      },
    ];
  },

  getAllBackups: async (): Promise<Backup[]> => {
    await delay(1000);
    console.log('[v0] Mock all backups fetched');
    
    return [
      {
        id: '1',
        database_id: '1',
        status: 'success',
        size_bytes: 104857600, // 100 MB
        storage_path: 's3://my-bucket/backups/db1/2025-01-15.sql.gz',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 1.8 * 60 * 60 * 1000).toISOString(),
        error_message: '',
      },
      {
        id: '2',
        database_id: '1',
        status: 'success',
        size_bytes: 98304000, // 93.75 MB
        storage_path: 's3://my-bucket/backups/db1/2025-01-14.sql.gz',
        timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 25.8 * 60 * 60 * 1000).toISOString(),
        error_message: '',
      },
      {
        id: '3',
        database_id: '2',
        status: 'failed',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 4.9 * 60 * 60 * 1000).toISOString(),
        error_message: 'Failed to connect to database server',
      },
      {
        id: '4',
        database_id: '2',
        status: 'running',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString(),
        completed_at: '',
        error_message: '',
      },
      {
        id: '5',
        database_id: '1',
        status: 'pending',
        size_bytes: 0,
        storage_path: '',
        timestamp: new Date().toISOString(),
        completed_at: '',
        error_message: '',
      },
    ];
  },

  getBackupById: async (id: string): Promise<Backup> => {
    await delay(600);
    console.log('[v0] Mock backup fetched:', id);
    
    return {
      id,
      database_id: '1',
      status: 'success',
      size_bytes: 104857600,
      storage_path: 's3://my-bucket/backups/db1/2025-01-15.sql.gz',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      error_message: '',
    };
  },

  restoreBackup: async (id: string, request?: RestoreRequest): Promise<RestoreJob> => {
    await delay(1500);
    console.log('[v0] Mock restore initiated for backup:', id, request);
    
    return {
      id: Math.random().toString(36).substring(7),
      backup_id: id,
      status: 'pending',
      target_host: request?.target_host || 'localhost',
      target_port: request?.target_port || 5432,
      target_dbname: request?.target_dbname || 'restored_db',
      target_user: request?.target_user || 'postgres',
      created_at: new Date().toISOString(),
      started_at: '',
      completed_at: '',
      error_message: '',
    };
  },
};
