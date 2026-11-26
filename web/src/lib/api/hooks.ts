// Data hooks for every API resource. Pages import from here; they do not
// call `api()` directly except for one-off imperative actions.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { keys } from './keys'
import type {
  ActivityLogList,
  ActivityQuery,
  AdminUser,
  Agent,
  AgentInput,
  AgentJob,
  AuthConfig,
  Backup,
  BackupListQuery,
  ConnectionTestInput,
  ConnectionTestResponse,
  Database,
  DatabaseInput,
  EnrollmentResponse,
  JobEvent,
  LabelWithUsage,
  NotificationConfig,
  NotificationInput,
  Overview,
  Page,
  RestoreJob,
  RestoreRequest,
  SchedulePreview,
  StorageConfig,
  StorageInput,
  StorageTestResult,
  SystemHealth,
  TwoFactorStatus,
  UserProfile,
} from './types'

const ACTIVE_POLL = 3_000

function hasActive(items: { status: string }[] | undefined) {
  return !!items?.some((b) => b.status === 'pending' || b.status === 'running')
}

// ------------------------------------------------------------- session

export const useMe = (enabled = true) =>
  useQuery({ queryKey: keys.me, queryFn: () => api<UserProfile>('/users/me'), enabled, staleTime: 60_000 })

export const useAuthConfig = () =>
  useQuery({
    queryKey: keys.authConfig,
    queryFn: () => api<AuthConfig>('/auth/config', { anonymous: true }),
    staleTime: 5 * 60_000,
  })

export const useTwoFactorStatus = () =>
  useQuery({ queryKey: keys.twoFactor, queryFn: () => api<TwoFactorStatus>('/auth/2fa/status') })

// ------------------------------------------------------------- overview & system

export const useOverview = () =>
  useQuery({
    queryKey: keys.overview,
    queryFn: () => api<Overview>('/overview'),
    refetchInterval: (q) => (q.state.data?.backups.active ? ACTIVE_POLL : 30_000),
  })

export const useSystemHealth = () =>
  useQuery({ queryKey: keys.system, queryFn: () => api<SystemHealth>('/system/health'), refetchInterval: 30_000 })

export const useSchedulePreview = (cron: string, tz: string) =>
  useQuery({
    queryKey: keys.schedulePreview(cron, tz),
    queryFn: () => api<SchedulePreview>('/schedules/preview', { query: { cron, tz } }),
    enabled: cron.trim().length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

// ------------------------------------------------------------- databases

export const useDatabases = () =>
  useQuery({
    queryKey: keys.databases.list(),
    queryFn: () => api<Database[]>('/databases'),
    refetchInterval: (q) => (q.state.data?.some((d) => d.active_backup) ? ACTIVE_POLL : 30_000),
  })

export const useDatabase = (id: string) =>
  useQuery({
    queryKey: keys.databases.detail(id),
    queryFn: () => api<Database>(`/databases/${id}`),
    refetchInterval: (q) => (q.state.data?.active_backup ? ACTIVE_POLL : 30_000),
  })

export const useDatabaseConnection = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.databases.connection(id),
    queryFn: () =>
      api<{ host: string; port: number; dbname: string; user: string; has_password: boolean }>(
        `/databases/${id}/connection`,
      ),
    enabled,
  })

export function useSaveDatabase(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DatabaseInput) =>
      id ? api<Database>(`/databases/${id}`, { method: 'PUT', body: input }) : api<Database>('/databases', { body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.overview })
      qc.invalidateQueries({ queryKey: keys.agents.all })
      qc.invalidateQueries({ queryKey: keys.storage.all })
    },
  })
}

export function useDeleteDatabase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, deleteBackups }: { id: string; deleteBackups: boolean }) =>
      api<void>(`/databases/${id}`, { method: 'DELETE', query: { delete_backups: deleteBackups ? 'true' : undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.backups.all })
      qc.invalidateQueries({ queryKey: keys.overview })
    },
  })
}

export function usePauseDatabase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      api<Database>(`/databases/${id}/${paused ? 'pause' : 'unpause'}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.overview })
    },
  })
}

export function useTriggerBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (databaseId: string) => api<Backup>(`/databases/${databaseId}/backup`, { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.backups.all })
      qc.invalidateQueries({ queryKey: keys.overview })
    },
  })
}

/** Test a connection. Direct tests answer immediately; agent tests return a job to poll with useAgentJob. */
export const useTestConnection = () =>
  useMutation({ mutationFn: (input: ConnectionTestInput) => api<ConnectionTestResponse>('/databases/test', { body: input, timeoutMs: 60_000 }) })

export const useTestExistingDatabase = () =>
  useMutation({ mutationFn: (id: string) => api<ConnectionTestResponse>(`/databases/${id}/test`, { method: 'POST', timeoutMs: 60_000 }) })

// ------------------------------------------------------------- backups

export const useBackups = (q: BackupListQuery, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: keys.backups.list(q),
    queryFn: () => api<Page<Backup>>('/backups', { query: q as Record<string, string | number | undefined> }),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
    refetchInterval: (query) => (hasActive(query.state.data?.items) ? ACTIVE_POLL : 30_000),
  })

export const useBackup = (id: string) =>
  useQuery({
    queryKey: keys.backups.detail(id),
    queryFn: () => api<Backup>(`/backups/${id}`),
    refetchInterval: (q) => (q.state.data && !isTerminal(q.state.data.status) ? 2_000 : false),
  })

export const useBackupEvents = (id: string, live: boolean) =>
  useQuery({
    queryKey: keys.backups.events(id),
    queryFn: () => api<JobEvent[]>(`/backups/${id}/events`),
    refetchInterval: live ? 2_000 : false,
  })

export function useCancelBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/backups/${id}/cancel`, { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.backups.all })
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.overview })
    },
  })
}

export const useFailedBackupCount = () =>
  useQuery({ queryKey: keys.backups.failedCount, queryFn: () => api<{ count: number }>('/backups/failed/count') })

export function usePurgeFailedBackups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ deleted: number }>('/backups/failed', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.backups.all }),
  })
}

export function isTerminal(status: string) {
  return status === 'success' || status === 'failed' || status === 'cancelled' || status === 'deleted'
}

// ------------------------------------------------------------- restores

export function useStartRestore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ backupId, req }: { backupId: string; req: RestoreRequest }) =>
      api<RestoreJob>(`/backups/${backupId}/restore`, { body: req }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.restores.all }),
  })
}

export const useRestores = (q: { backup_id?: string; database_id?: string; limit?: number }) =>
  useQuery({
    queryKey: keys.restores.list(q),
    queryFn: () => api<RestoreJob[]>('/restores', { query: q }),
    refetchInterval: (query) => (hasActive(query.state.data) ? ACTIVE_POLL : false),
  })

export const useRestore = (id: string) =>
  useQuery({
    queryKey: keys.restores.detail(id),
    queryFn: () => api<RestoreJob>(`/restores/${id}`),
    refetchInterval: (q) => (q.state.data && !isTerminal(q.state.data.status) ? 2_000 : false),
  })

export const useRestoreEvents = (id: string, live: boolean) =>
  useQuery({
    queryKey: keys.restores.events(id),
    queryFn: () => api<JobEvent[]>(`/restores/${id}/events`),
    refetchInterval: live ? 2_000 : false,
  })

// ------------------------------------------------------------- agents

export const useAgents = () =>
  useQuery({ queryKey: keys.agents.list(), queryFn: () => api<Agent[]>('/agents'), refetchInterval: 15_000 })

export const useAgent = (id: string) =>
  useQuery({ queryKey: keys.agents.detail(id), queryFn: () => api<Agent>(`/agents/${id}`), refetchInterval: 10_000 })

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, ttlMinutes }: { input: AgentInput; ttlMinutes?: number }) =>
      api<EnrollmentResponse>('/agents', { body: input, query: { ttl_minutes: ttlMinutes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.agents.all }),
  })
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AgentInput) => api<Agent>(`/agents/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.agents.all }),
  })
}

export function useAgentAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'enable' | 'disable' | 'revoke' }) =>
      api<Agent>(`/agents/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.agents.all })
      qc.invalidateQueries({ queryKey: keys.overview })
    },
  })
}

export function useIssueEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ttlMinutes }: { id: string; ttlMinutes?: number }) =>
      api<EnrollmentResponse>(`/agents/${id}/enrollment`, { method: 'POST', query: { ttl_minutes: ttlMinutes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.agents.all }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.agents.all }),
  })
}

export const useAgentTestConnection = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: Omit<ConnectionTestInput, 'execution_mode'> }) =>
      api<ConnectionTestResponse>(`/agents/${id}/test-connection`, { body: input }),
  })

/** Poll a dispatched agent job (connection tests) until it finishes. */
export const useAgentJob = (id: string | undefined) =>
  useQuery({
    queryKey: keys.agents.job(id ?? ''),
    queryFn: () => api<AgentJob>(`/agent-jobs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (!q.state.data || q.state.data.status === 'queued' || q.state.data.status === 'leased' ? 1_500 : false),
  })

// ------------------------------------------------------------- storage

export const useStorages = () =>
  useQuery({ queryKey: keys.storage.list(), queryFn: () => api<StorageConfig[]>('/storage') })

export const useStorage = (id: string) =>
  useQuery({ queryKey: keys.storage.detail(id), queryFn: () => api<StorageConfig>(`/storage/${id}`) })

export const useStorageSettings = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.storage.settings(id),
    queryFn: () => api<{ bucket: string; region: string; endpoint: string }>(`/storage/${id}/settings`),
    enabled,
  })

export function useSaveStorage(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StorageInput) =>
      id ? api<StorageConfig>(`/storage/${id}`, { method: 'PUT', body: input }) : api<StorageConfig>('/storage', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.storage.all }),
  })
}

export function useDeleteStorage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/storage/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.storage.all }),
  })
}

export const useTestStorage = () =>
  useMutation({
    mutationFn: (arg: { id: string } | { input: StorageInput & { id?: string } }) =>
      'id' in arg
        ? api<StorageTestResult>(`/storage/${arg.id}/test`, { method: 'POST', timeoutMs: 60_000 })
        : api<StorageTestResult>('/storage/test', { body: arg.input, timeoutMs: 60_000 }),
  })

export function useSetDefaultStorage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/storage/${id}/default`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.storage.all }),
  })
}

// ------------------------------------------------------------- notifications

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications.list(), queryFn: () => api<NotificationConfig[]>('/notifications') })

export function useSaveNotification(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NotificationInput) =>
      id
        ? api<NotificationConfig>(`/notifications/${id}`, { method: 'PUT', body: input })
        : api<NotificationConfig>('/notifications', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications.all }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.notifications.all })
      qc.invalidateQueries({ queryKey: keys.databases.all })
    },
  })
}

export const useTestNotification = () =>
  useMutation({ mutationFn: (id: string) => api<{ ok: boolean; message: string }>(`/notifications/${id}/test`, { method: 'POST' }) })

// ------------------------------------------------------------- labels

export const useLabels = () => useQuery({ queryKey: keys.labels, queryFn: () => api<LabelWithUsage[]>('/labels') })

// ------------------------------------------------------------- activity

export const useActivity = (q: ActivityQuery) =>
  useQuery({
    queryKey: keys.logs(q),
    queryFn: () => api<ActivityLogList>('/logs', { query: q as Record<string, string | number | undefined> }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

// ------------------------------------------------------------- admin

export const useAdminUsers = (enabled: boolean) =>
  useQuery({ queryKey: keys.users, queryFn: () => api<AdminUser[]>('/admin/users'), enabled })

export function useSetUserAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      api<void>(`/admin/users/${id}`, { method: 'PATCH', body: { is_admin: isAdmin } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}
