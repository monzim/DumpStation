// Connection form state and conversions to API inputs.
import type { ConnectionTestInput, Database, DatabaseInput, ExecutionMode } from '@/lib/api/types'

export type CredentialSource = 'agent' | 'central'

export interface ConnectionState {
  mode: ExecutionMode
  agentId: string
  /** Agent mode: credentials defined on the agent, or stored (encrypted) by DumpStation. */
  credSource: CredentialSource
  agentConnection: string
  host: string
  port: number
  dbname: string
  user: string
  /** Empty on edit = keep the stored password. */
  password: string
}

export const EMPTY_CONNECTION: ConnectionState = {
  mode: 'direct',
  agentId: '',
  credSource: 'agent',
  agentConnection: '',
  host: '',
  port: 5432,
  dbname: '',
  user: '',
  password: '',
}

export interface ConnectionView {
  host: string
  port: number
  dbname: string
  user: string
  has_password: boolean
}

/** Rebuild editable connection state from a saved database and its unmasked connection. */
export function connectionFromDatabase(db: Database, conn?: ConnectionView): ConnectionState {
  const agentDefined = db.execution_mode === 'agent' && !!db.agent_connection
  return {
    mode: db.execution_mode,
    agentId: db.agent_id ?? '',
    credSource: agentDefined ? 'agent' : 'central',
    agentConnection: db.agent_connection ?? '',
    host: agentDefined ? '' : (conn?.host ?? ''),
    port: agentDefined ? 5432 : conn?.port || 5432,
    dbname: agentDefined ? '' : (conn?.dbname ?? ''),
    user: agentDefined ? '' : (conn?.user ?? ''),
    password: '',
  }
}

export const usesAgentConnection = (c: ConnectionState) => c.mode === 'agent' && c.credSource === 'agent'

/** Connection fields of a DatabaseInput. */
export function connectionInput(c: ConnectionState): Pick<
  DatabaseInput,
  'execution_mode' | 'agent_id' | 'agent_connection' | 'host' | 'port' | 'dbname' | 'user' | 'password'
> {
  if (usesAgentConnection(c)) {
    return { execution_mode: 'agent', agent_id: c.agentId, agent_connection: c.agentConnection.trim() }
  }
  return {
    execution_mode: c.mode,
    agent_id: c.mode === 'agent' ? c.agentId : undefined,
    host: c.host.trim(),
    port: c.port,
    dbname: c.dbname.trim(),
    user: c.user.trim(),
    password: c.password || undefined,
  }
}

export function connectionTestInput(c: ConnectionState, databaseId?: string): ConnectionTestInput {
  const i = connectionInput(c)
  return { ...i, password: c.password, database_id: databaseId }
}

export type ConnectionErrors = Partial<Record<'agentId' | 'agentConnection' | 'host' | 'port' | 'dbname' | 'user' | 'password', string>>

/** Client-side checks mirroring the server's ValidateConnection. */
export function validateConnection(c: ConnectionState, opts: { passwordStored: boolean }): ConnectionErrors {
  const e: ConnectionErrors = {}
  if (c.mode === 'agent' && !c.agentId) e.agentId = 'Choose the agent that will run backups.'
  if (usesAgentConnection(c)) {
    if (!c.agentConnection.trim()) e.agentConnection = 'Enter the name of a connection configured on the agent.'
    else if (c.agentConnection.trim().length > 128) e.agentConnection = 'Use at most 128 characters.'
    return e
  }
  if (!c.host.trim()) e.host = 'Enter the database host.'
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) e.port = 'Enter a port between 1 and 65535.'
  if (!c.dbname.trim()) e.dbname = 'Enter the database name.'
  if (!c.user.trim()) e.user = 'Enter the user name.'
  if (!c.password && !opts.passwordStored) e.password = 'Enter the password.'
  return e
}

/** Env var name the agent reads for a named connection. */
export function agentEnvVar(name: string): string {
  const n = (name || 'NAME').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `DUMPSTATION_CONN_${n || 'NAME'}`
}

/**
 * Full DatabaseInput for an existing database, so a partial edit (schedule,
 * storage, …) can be PUT without changing anything else. The password is
 * left empty, which keeps the stored one.
 */
export function databaseInputFrom(db: Database, conn: ConnectionView | undefined, patch: Partial<DatabaseInput> = {}): DatabaseInput {
  const c = connectionFromDatabase(db, conn)
  return {
    name: db.name,
    ...connectionInput(c),
    password: undefined,
    schedule: db.schedule,
    timezone: db.timezone ?? '',
    storage_id: db.storage_id,
    notification_id: db.notification_id ?? null,
    postgres_version: db.postgres_version || undefined,
    rotation_policy: db.rotation_policy,
    ...patch,
  }
}

/** Whether a database needs its unmasked connection to build a full input. */
export const needsConnectionView = (db: Database) => !(db.execution_mode === 'agent' && db.agent_connection)
