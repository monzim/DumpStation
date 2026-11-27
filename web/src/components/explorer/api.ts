// DB Explorer data layer: types and hooks for /server-connections.
// Types are defined locally because the shared ones in lib/api/types.ts drift
// from the server (see server/internal/models/models.go "DB Servers").
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

export type SslMode = 'require' | 'prefer' | 'disable'

export interface ServerConnection extends Record<string, unknown> {
  id: string
  name: string
  /** Masked by the API (e.g. "***.example.com", "***" for single-label hosts). */
  host: string
  port: number
  /** Masked by the API (e.g. "pos***"). */
  user: string
  ssl_mode: SslMode | string
  last_tested_at?: string
  last_test_status?: 'ok' | 'failed' | string
  last_test_error?: string
  last_test_ssl_mode?: string
  created_at: string
  updated_at: string
}

export interface ServerConnectionInput {
  name: string
  host: string
  port: number
  user: string
  password: string
  ssl_mode: SslMode
}

export interface ServerTestResult {
  ok: boolean
  ssl_mode: string
  message?: string
  latency?: string
}

export interface ServerDatabase extends Record<string, unknown> {
  name: string
  owner: string
  encoding: string
  size_bytes: number
  size_human: string
}

export interface ServerTable extends Record<string, unknown> {
  schema: string
  name: string
  /** pg_class.reltuples estimate; -1 when the table was never analyzed. */
  row_count: number
  size_bytes: number
  size_human: string
}

export interface ServerRole extends Record<string, unknown> {
  name: string
  can_login: boolean
  is_superuser: boolean
  create_db: boolean
  create_role: boolean
}

export interface ServerColumn {
  name: string
  data_type: string
  is_nullable: boolean
  default?: string
  is_primary_key: boolean
}

export interface ServerTableRows {
  columns: ServerColumn[]
  rows: unknown[][] | null
  limit: number
  offset: number
  estimated_total: number
}

export interface ServerERD {
  tables: { schema: string; name: string; columns: Omit<ServerColumn, 'default'>[] }[] | null
  relations:
    | {
        from_schema: string
        from_table: string
        from_column: string
        to_schema: string
        to_table: string
        to_column: string
        constraint_name: string
      }[]
    | null
}

export type GrantPreset = 'readonly' | 'readwrite' | 'owner'

const enc = encodeURIComponent
const base = (id: string) => `/server-connections/${enc(id)}`
const dbBase = (id: string, db: string) => `${base(id)}/databases/${enc(db)}`

// Remote admin queries can be slow (server-side timeout is 30s).
const REMOTE_TIMEOUT = 45_000

export const useServers = () =>
  useQuery({ queryKey: keys.servers.list(), queryFn: () => api<ServerConnection[]>('/server-connections') })

/** Unmasked host/user for edit forms (never the password). */
export const useServerConnectionForEdit = (id: string | undefined) =>
  useQuery({
    queryKey: [...keys.servers.detail(id ?? ''), 'edit'],
    queryFn: () => api<{ host: string; port: number; user: string; ssl_mode: string; has_password: boolean }>(`${base(id!)}/connection`),
    enabled: !!id,
  })

export const useServer = (id: string) =>
  useQuery({ queryKey: keys.servers.detail(id), queryFn: () => api<ServerConnection>(base(id)) })

export const useServerDatabases = (id: string) =>
  useQuery({
    queryKey: keys.servers.databases(id),
    queryFn: () => api<ServerDatabase[] | null>(`${base(id)}/databases`, { timeoutMs: REMOTE_TIMEOUT }).then((r) => r ?? []),
    retry: false,
  })

export const useServerRoles = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.servers.users(id),
    queryFn: () => api<ServerRole[] | null>(`${base(id)}/users`, { timeoutMs: REMOTE_TIMEOUT }).then((r) => r ?? []),
    enabled,
    retry: false,
  })

export const useServerTables = (id: string, db: string) =>
  useQuery({
    queryKey: keys.servers.tables(id, db),
    queryFn: () => api<ServerTable[] | null>(`${dbBase(id, db)}/tables`, { timeoutMs: REMOTE_TIMEOUT }).then((r) => r ?? []),
    retry: false,
  })

export const useServerTableRows = (id: string, db: string, schema: string, table: string, offset: number, limit: number) =>
  useQuery({
    queryKey: keys.servers.rows(id, db, schema, table, offset, limit),
    queryFn: () =>
      api<ServerTableRows>(`${dbBase(id, db)}/tables/${enc(schema)}/${enc(table)}/rows`, {
        query: { limit, offset },
        timeoutMs: REMOTE_TIMEOUT,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  })

export const useServerERD = (id: string, db: string) =>
  useQuery({
    queryKey: keys.servers.erd(id, db),
    queryFn: () => api<ServerERD>(`${dbBase(id, db)}/erd`, { timeoutMs: REMOTE_TIMEOUT }),
    retry: false,
  })

export function useSaveServer(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ServerConnectionInput) =>
      id
        ? api<ServerConnection>(base(id), { method: 'PUT', body: input, timeoutMs: REMOTE_TIMEOUT })
        : api<ServerConnection>('/server-connections', { body: input, timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.all }),
  })
}

export function useDeleteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(base(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.all }),
  })
}

/** Test a saved connection (records the result on the connection). */
export function useTestServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<ServerTestResult>(`${base(id)}/test`, { method: 'POST', timeoutMs: REMOTE_TIMEOUT }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.servers.all }),
  })
}

/** Test unsaved credentials. Requires host, port, user and password. */
export const useTestServerInput = () =>
  useMutation({
    mutationFn: (input: ServerConnectionInput) =>
      api<ServerTestResult>('/server-connections/test', { body: input, timeoutMs: REMOTE_TIMEOUT }),
  })

export function useCreateServerDatabase(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; owner?: string }) =>
      api<{ name: string }>(`${base(id)}/databases`, { body: input, timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.databases(id) }),
  })
}

export function useDropServerDatabase(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (db: string) => api<void>(dbBase(id, db), { method: 'DELETE', timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.databases(id) }),
  })
}

export function useCreateServerRole(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { username: string; password: string; can_login: boolean }) =>
      api<{ username: string }>(`${base(id)}/users`, { body: input, timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.users(id) }),
  })
}

export function useDropServerRole(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => api<void>(`${base(id)}/users/${enc(username)}`, { method: 'DELETE', timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.users(id) }),
  })
}

export function useGrantPreset(id: string, db: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { username: string; preset: GrantPreset }) =>
      api<void>(`${dbBase(id, db)}/grants`, { body: input, timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.servers.databases(id) }),
  })
}

export function useTruncateTable(id: string, db: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ schema, table }: { schema: string; table: string }) =>
      api<void>(`${dbBase(id, db)}/tables/${enc(schema)}/${enc(table)}/truncate`, { method: 'POST', timeoutMs: REMOTE_TIMEOUT }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.servers.tables(id, db) })
      qc.invalidateQueries({ queryKey: ['servers', id, 'db', db, 'rows'] })
    },
  })
}

/** Go duration string ("186.640184ms", "1.2s") to a short label. */
export function formatLatency(v?: string) {
  if (!v) return ''
  const m = /^([\d.]+)(ns|µs|us|ms|s)$/.exec(v)
  if (!m) return v
  const n = Number(m[1])
  const ms = m[2] === 's' ? n * 1000 : m[2] === 'ms' ? n : m[2] === 'ns' ? n / 1e6 : n / 1000
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.max(1, Math.round(ms))} ms`
}

/** True when the API returned a masked value we must not send back. */
export const isMasked = (v: string) => v.includes('***')

export const SSL_OPTIONS: { value: SslMode; label: string; description: string }[] = [
  { value: 'prefer', label: 'Prefer', description: 'Use TLS when the server offers it' },
  { value: 'require', label: 'Require', description: 'Fail if TLS is not available (no certificate verification)' },
  { value: 'disable', label: 'Disable', description: 'Plain TCP, for local or private networks' },
]

export function explorerPaths(id: string) {
  return {
    server: `/explorer/${enc(id)}`,
    db: (db: string) => `/explorer/${enc(id)}/${enc(db)}`,
    erd: (db: string) => `/explorer/${enc(id)}/${enc(db)}/erd`,
    table: (db: string, schema: string, table: string) => `/explorer/${enc(id)}/${enc(db)}/${enc(schema)}/${enc(table)}`,
  }
}
