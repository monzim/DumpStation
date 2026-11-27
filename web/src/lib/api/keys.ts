// Centralised TanStack Query keys. Invalidate by prefix (e.g. keys.backups.all).
export const keys = {
  me: ['me'] as const,
  authConfig: ['auth-config'] as const,
  twoFactor: ['2fa-status'] as const,
  overview: ['overview'] as const,
  system: ['system-health'] as const,
  databases: {
    all: ['databases'] as const,
    list: () => ['databases', 'list'] as const,
    detail: (id: string) => ['databases', 'detail', id] as const,
    connection: (id: string) => ['databases', 'connection', id] as const,
  },
  backups: {
    all: ['backups'] as const,
    list: (q: object) => ['backups', 'list', q] as const,
    detail: (id: string) => ['backups', 'detail', id] as const,
    events: (id: string) => ['backups', 'events', id] as const,
    failedCount: ['backups', 'failed-count'] as const,
  },
  restores: {
    all: ['restores'] as const,
    list: (q: object) => ['restores', 'list', q] as const,
    detail: (id: string) => ['restores', 'detail', id] as const,
    events: (id: string) => ['restores', 'events', id] as const,
  },
  agents: {
    all: ['agents'] as const,
    list: () => ['agents', 'list'] as const,
    detail: (id: string) => ['agents', 'detail', id] as const,
    job: (id: string) => ['agent-job', id] as const,
  },
  storage: {
    all: ['storage'] as const,
    list: () => ['storage', 'list'] as const,
    detail: (id: string) => ['storage', 'detail', id] as const,
    settings: (id: string) => ['storage', 'settings', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
  },
  labels: ['labels'] as const,
  logs: (q: object) => ['logs', q] as const,
  users: ['admin-users'] as const,
  schedulePreview: (cron: string, tz: string) => ['schedule-preview', cron, tz] as const,
  servers: {
    all: ['servers'] as const,
    list: () => ['servers', 'list'] as const,
    detail: (id: string) => ['servers', 'detail', id] as const,
    databases: (id: string) => ['servers', id, 'databases'] as const,
    users: (id: string) => ['servers', id, 'users'] as const,
    tables: (id: string, db: string) => ['servers', id, 'db', db, 'tables'] as const,
    rows: (id: string, db: string, schema: string, table: string, offset: number, limit: number) =>
      ['servers', id, 'db', db, 'rows', schema, table, offset, limit] as const,
    erd: (id: string, db: string) => ['servers', id, 'db', db, 'erd'] as const,
  },
}
