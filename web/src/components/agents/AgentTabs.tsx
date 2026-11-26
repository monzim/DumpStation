import { useState, type ReactNode } from 'react'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Link } from '@astryxdesign/core/Link'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Pagination } from '@astryxdesign/core/Pagination'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { CheckCircle2, XCircle, Plus } from 'lucide-react'
import type { ActivityLog, Agent, AgentConnectionInfo, Backup } from '@/lib/api/types'
import { useActivity, useAgentJob, useAgentTestConnection, useBackups, useSystemHealth } from '@/lib/api/hooks'
import { errorMessage } from '@/lib/api/client'
import { bytes, duration, errorCodeLabel } from '@/lib/format'
import { Facts, Panel, When } from '@/components/common'
import { BackupStatusBadge, FailureCause } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useSession } from '@/lib/auth/session'
import { RESTORE_TEXT, pgVersionsText, restoreState } from './AgentBits'
import { DeploymentInstructions } from './DeploymentInstructions'
import { ENV_REFERENCE, connectionsFileExample, type EnvVar } from './deploy'

function YesNo({ on, yes = 'Allowed', no = 'Not allowed' }: { on: boolean; yes?: string; no?: string }) {
  return (
    <HStack gap={1} vAlign="center">
      {on ? <CheckCircle2 size={14} aria-hidden color="var(--color-success)" /> : <XCircle size={14} aria-hidden color="var(--color-text-secondary)" />}
      <Text>{on ? yes : no}</Text>
    </HStack>
  )
}

export function OverviewTab({ agent: a }: { agent: Agent }) {
  const rs = restoreState(a)
  return (
    <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
      <Panel title="Health">
        <Facts
          items={[
            { label: 'Last heartbeat', value: <When value={a.last_seen_at} empty="Never" /> },
            { label: 'Last IP', value: <Text className="ds-mono">{a.last_ip || '—'}</Text> },
            { label: 'Running jobs', value: `${a.running_jobs} of ${a.max_concurrency || 1}` },
            { label: 'Max concurrency', value: String(a.max_concurrency || 1) },
            {
              label: 'Failures (7d)',
              value:
                a.recent_failures > 0 ? (
                  <Link href={`/backups?agent_id=${a.id}&status=failed`}>{`${a.recent_failures} failed`}</Link>
                ) : (
                  'None'
                ),
            },
            ...(a.last_failure
              ? [
                  {
                    label: 'Last failure',
                    value: (
                      <VStack gap={0.5}>
                        <Link href={`/backups/${a.last_failure.id}`}>{a.last_failure.database_name || a.last_failure.name}</Link>
                        <FailureCause code={a.last_failure.error_code} message={a.last_failure.error_message} />
                      </VStack>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>
      <Panel title="Host">
        <Facts
          items={[
            { label: 'Hostname', value: <Text className="ds-mono">{a.hostname || '—'}</Text> },
            { label: 'Platform', value: a.platform || '—' },
            { label: 'Agent version', value: <Text className="ds-mono">{a.version || '—'}</Text> },
            { label: 'PostgreSQL clients', value: pgVersionsText(a.pg_versions) },
            { label: 'Transfer modes', value: a.upload_modes.length ? a.upload_modes.join(', ') : '—' },
          ]}
        />
      </Panel>
      <Panel title="Credential">
        <Facts
          items={[
            { label: 'Credential prefix', value: <Text className="ds-mono">{a.token_prefix ? `${a.token_prefix}…` : '—'}</Text> },
            { label: 'Credential issued', value: <When value={a.credential_issued_at} empty="Not issued" /> },
            { label: 'Enrolled', value: <When value={a.enrolled_at} empty="Not yet" /> },
            { label: 'Created', value: <When value={a.created_at} /> },
          ]}
        />
      </Panel>
      <Panel title="Restore permission" description={RESTORE_TEXT[rs]}>
        <Facts
          items={[
            { label: 'Server side', value: <YesNo on={a.allow_restore} /> },
            {
              label: 'Agent side',
              value: a.enrolled_at ? (
                <YesNo on={a.agent_allow_restore} yes="DUMPSTATION_ALLOW_RESTORE=true" no="DUMPSTATION_ALLOW_RESTORE not set" />
              ) : (
                <Text color="secondary">Not reported yet</Text>
              ),
            },
          ]}
        />
      </Panel>
    </Grid>
  )
}

type DbRow = NonNullable<Agent['databases']>[number] & Record<string, unknown>

export function DatabasesTab({ agent }: { agent: Agent }) {
  const { isDemo } = useSession()
  const dbs = (agent.databases ?? []) as DbRow[]
  const assign = (
    <Button label="Assign database" icon={<Plus size={16} />} href={`/databases/new?agent=${agent.id}`} isDisabled={isDemo || agent.status === 'revoked'} />
  )
  if (dbs.length === 0)
    return (
      <Panel>
        <Empty title="No databases assigned" description="Databases assigned to this agent are backed up by it instead of the server." actions={assign} />
      </Panel>
    )
  return (
    <Panel title={`${dbs.length} assigned ${dbs.length === 1 ? 'database' : 'databases'}`} actions={assign} padding={0}>
      <Table<DbRow>
        data={dbs}
        idKey="id"
        density="compact"
        columns={[
          { key: 'name', header: 'Database', renderCell: (d) => <Link href={`/databases/${d.id}`}>{d.name}</Link> },
          {
            key: 'agent_connection',
            header: 'Connection',
            renderCell: (d) =>
              d.agent_connection ? <span className="ds-mono">{d.agent_connection}</span> : <Text color="secondary">Credentials on server</Text>,
          },
          { key: 'paused', header: 'Schedule', renderCell: (d) => (d.paused ? <Badge label="Paused" /> : <Text color="secondary">Active</Text>) },
        ]}
      />
    </Panel>
  )
}

interface ConnRow extends AgentConnectionInfo, Record<string, unknown> {}

export function ConnectionsTab({ agent }: { agent: Agent }) {
  const conns = agent.connections as ConnRow[]
  const canTest = agent.status === 'active' && agent.connectivity === 'online'
  if (conns.length === 0)
    return (
      <Panel>
        <Empty
          title="No connections reported"
          description={
            agent.enrolled_at
              ? 'The agent has no local connections. Add DUMPSTATION_CONN_<NAME> variables or a connections file and restart it.'
              : 'Connections appear here once the agent enrolls.'
          }
        />
      </Panel>
    )
  return (
    <Panel
      title="Connections configured on the agent"
      description="Credentials stay on the agent host. DumpStation only sees the name, database and host."
      padding={0}
    >
      {!canTest && (
        <div style={{ padding: 'var(--spacing-3) var(--spacing-4) 0' }}>
          <Banner status="info" title="Tests run on the agent, so it has to be active and online." />
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <Table<ConnRow>
          data={conns}
          idKey="name"
          density="compact"
          verticalAlign="middle"
          columns={[
            { key: 'name', header: 'Name', renderCell: (c) => <span className="ds-mono">{c.name}</span> },
            { key: 'database', header: 'Database', renderCell: (c) => c.database || '—' },
            { key: 'host', header: 'Host', renderCell: (c) => <span className="ds-mono">{c.host || '—'}</span> },
            { key: 'test', header: 'Test', width: { type: 'proportional', value: 2, minWidth: 260 }, renderCell: (c) => <ConnectionTest agentId={agent.id} name={c.name} disabled={!canTest} /> },
          ]}
        />
      </div>
    </Panel>
  )
}

function ConnectionTest({ agentId, name, disabled }: { agentId: string; name: string; disabled: boolean }) {
  const start = useAgentTestConnection()
  const [jobId, setJobId] = useState<string>()
  const job = useAgentJob(jobId)
  const running = start.isPending || (!!jobId && (!job.data || job.data.status === 'queued' || job.data.status === 'leased'))
  const run = () => {
    setJobId(undefined)
    start.mutate({ id: agentId, input: { agent_connection: name } }, { onSuccess: (r) => setJobId(r.job_id) })
  }
  let result: ReactNode = null
  if (start.error) result = <Text color="secondary">{errorMessage(start.error)}</Text>
  else if (job.error) result = <Text color="secondary">{errorMessage(job.error)}</Text>
  else if (running) result = <Text color="secondary">{job.data?.status === 'leased' ? 'Testing on the agent…' : 'Waiting for the agent…'}</Text>
  else if (job.data) {
    const r = job.data.result
    if (job.data.status === 'completed' && r) {
      result = (
        <Tooltip content={r.message}>
          <HStack gap={1} vAlign="center">
            <Badge variant={r.ok ? 'success' : 'error'} label={r.ok ? 'Connected' : errorCodeLabel(r.code) || 'Failed'} />
            <Text type="supporting" color="secondary" className="ds-nowrap">
              {r.ok ? `PG ${r.server_major ?? r.server_version ?? '?'} · ${r.latency_ms} ms` : r.message}
            </Text>
          </HStack>
        </Tooltip>
      )
    } else {
      result = (
        <HStack gap={1} vAlign="center">
          <Badge variant="error" label={job.data.status === 'expired' ? 'Expired' : 'Failed'} />
          <Text type="supporting" color="secondary">
            {job.data.error_message || r?.message || 'The agent did not complete the test.'}
          </Text>
        </HStack>
      )
    }
  }
  return (
    <HStack gap={2} vAlign="center">
      <Button label="Test" size="sm" onClick={run} isDisabled={disabled || running} icon={running ? <Spinner size="sm" shade="inherit" /> : undefined} />
      {result}
    </HStack>
  )
}

type BackupRow = Backup & Record<string, unknown>
const PAGE_SIZE = 20

export function HistoryTab({ agent, page, onPage }: { agent: Agent; page: number; onPage: (p: number) => void }) {
  const q = useBackups({ agent_id: agent.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  if (q.isLoading) return <TableSkeleton />
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const data = q.data!
  if (data.total === 0)
    return (
      <Panel>
        <Empty title="No jobs yet" description="Backups this agent runs appear here." />
      </Panel>
    )
  return (
    <Panel title={`${data.total} ${data.total === 1 ? 'backup' : 'backups'} executed by this agent`} padding={0}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 820 }}>
          <Table<BackupRow>
            data={data.items as BackupRow[]}
            idKey="id"
            density="compact"
            hasHover
            columns={[
              {
                key: 'database_name',
                header: 'Backup',
                renderCell: (b) => (
                  <VStack gap={0}>
                    <Link href={`/backups/${b.id}`}>{b.database_name}</Link>
                    <Text type="supporting" color="secondary" className="ds-mono" maxLines={1}>
                      {b.name}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                renderCell: (b) => (
                  <VStack gap={0.5}>
                    <BackupStatusBadge status={b.status} stage={b.stage} />
                    {b.status === 'failed' && <FailureCause code={b.error_code} message={b.error_message} />}
                  </VStack>
                ),
              },
              { key: 'trigger', header: 'Trigger', renderCell: (b) => <Text color="secondary">{b.trigger === 'manual' ? 'Manual' : 'Scheduled'}</Text> },
              { key: 'timestamp', header: 'Started', renderCell: (b) => <When value={b.run_started_at ?? b.timestamp} /> },
              { key: 'duration_ms', header: 'Duration', align: 'end', renderCell: (b) => <Text hasTabularNumbers>{duration(b.duration_ms)}</Text> },
              { key: 'size_bytes', header: 'Size', align: 'end', renderCell: (b) => <Text hasTabularNumbers>{bytes(b.size_bytes)}</Text> },
            ]}
          />
        </div>
      </div>
      {data.total > PAGE_SIZE && (
        <HStack hAlign="end" padding={3}>
          <Pagination page={page} onChange={onPage} totalItems={data.total} pageSize={PAGE_SIZE} size="sm" />
        </HStack>
      )}
    </Panel>
  )
}

type LogRow = ActivityLog & Record<string, unknown>
const LEVEL_VARIANT = { info: 'neutral', success: 'success', warning: 'warning', error: 'error' } as const

export function ActivityTab({ agent }: { agent: Agent }) {
  const [page, setPage] = useState(1)
  const q = useActivity({ entity_id: agent.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  if (q.isLoading) return <TableSkeleton />
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const data = q.data!
  if (data.total === 0)
    return (
      <Panel>
        <Empty title="No activity recorded" />
      </Panel>
    )
  return (
    <Panel padding={0}>
      <Table<LogRow>
        data={data.logs as LogRow[]}
        idKey="id"
        density="compact"
        columns={[
          {
            key: 'created_at',
            header: 'When',
            width: { type: 'pixel', value: 170 },
            renderCell: (l) => <When value={l.created_at} />,
          },
          {
            key: 'level',
            header: 'Level',
            width: { type: 'pixel', value: 110 },
            renderCell: (l) => <Badge variant={LEVEL_VARIANT[l.level] ?? 'neutral'} label={l.level} />,
          },
          { key: 'description', header: 'Event', renderCell: (l) => <Text>{l.description}</Text> },
        ]}
      />
      {data.total > PAGE_SIZE && (
        <HStack hAlign="end" padding={3}>
          <Pagination page={page} onChange={setPage} totalItems={data.total} pageSize={PAGE_SIZE} size="sm" />
        </HStack>
      )}
    </Panel>
  )
}

type EnvRow = EnvVar & Record<string, unknown>

export function ConfigurationTab({ agent }: { agent: Agent }) {
  const health = useSystemHealth()
  const serverUrl = (health.data?.public_url || window.location.origin).replace(/\/+$/, '')
  return (
    <VStack gap={4}>
      <Panel
        title="Deployment"
        description="Reference snippets for this agent. The enrollment token is shown only when you issue one (Rotate credential / redeploy)."
      >
        <DeploymentInstructions serverUrl={serverUrl} allowRestore={agent.allow_restore} name={agent.name} />
      </Panel>
      <Panel title="Connections file" description="An alternative to DUMPSTATION_CONN_<NAME> variables, with passwords read from files or other variables.">
        <CodeBlock code={connectionsFileExample()} language="yaml" title="connections.yaml" width="100%" size="sm" />
      </Panel>
      <Panel title="Environment variables" padding={0}>
        <div style={{ overflowX: 'auto' }}>
          <Table<EnvRow>
            data={ENV_REFERENCE as EnvRow[]}
            idKey="name"
            density="compact"
            verticalAlign="top"
            columns={[
              {
                key: 'name',
                header: 'Variable',
                width: { type: 'proportional', value: 2, minWidth: 260 },
                renderCell: (v) => (
                  <VStack gap={0.5}>
                    <span className="ds-mono">{v.name}</span>
                    {v.required && <Text type="supporting" color="secondary">Required</Text>}
                  </VStack>
                ),
              },
              { key: 'default', header: 'Default', width: { type: 'proportional', value: 1, minWidth: 140 }, renderCell: (v) => <span className="ds-mono">{v.default ?? '—'}</span> },
              { key: 'description', header: 'Description', width: { type: 'proportional', value: 3, minWidth: 280 }, renderCell: (v) => <Text>{v.description}</Text> },
            ]}
          />
        </div>
      </Panel>
    </VStack>
  )
}
