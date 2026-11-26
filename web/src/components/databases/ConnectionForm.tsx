import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Cpu, Server } from 'lucide-react'
import { useAgentJob, useAgents, useTestConnection } from '@/lib/api/hooks'
import type { Agent, ExecutionMode, TestResult } from '@/lib/api/types'
import { errorCodeLabel, relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/api/client'
import { AgentConnectivityBadge } from '@/components/status'
import {
  agentEnvVar,
  connectionTestInput,
  usesAgentConnection,
  type ConnectionErrors,
  type ConnectionState,
} from './connection'

const OTHER = '__other__'

const err = (m?: string) => (m ? ({ type: 'error', message: m } as const) : undefined)

/** Direct vs agent-based execution, as two comparable cards. */
export function ExecutionModePicker({
  value,
  onChange,
  isDisabled,
}: {
  value: ExecutionMode
  onChange: (mode: ExecutionMode) => void
  isDisabled?: boolean
}) {
  return (
    <Grid columns={{ minWidth: 260, max: 2 }} gap={3}>
      <SelectableCard label="Direct connection" isSelected={value === 'direct'} onChange={() => onChange('direct')} isDisabled={isDisabled}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Server size={16} aria-hidden />
            <Text weight="semibold">Direct connection</Text>
          </HStack>
          <Text type="supporting" color="secondary">
            The DumpStation server connects to PostgreSQL and runs pg_dump itself. Use it for local databases, public or managed
            databases (RDS, Cloud SQL, Supabase…) and databases on the same network as the server.
          </Text>
        </VStack>
      </SelectableCard>
      <SelectableCard label="Agent-based" isSelected={value === 'agent'} onChange={() => onChange('agent')} isDisabled={isDisabled}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Cpu size={16} aria-hidden />
            <Text weight="semibold">Agent-based</Text>
          </HStack>
          <Text type="supporting" color="secondary">
            A DumpStation Agent inside the private network runs the backup and uploads it to storage. It only makes outbound
            connections, so no inbound ports are needed. Use it for private networks, Docker, Kubernetes, on-premises servers and
            databases behind NAT.
          </Text>
        </VStack>
      </SelectableCard>
    </Grid>
  )
}

function agentDescription(a: Agent) {
  if (a.status === 'revoked') return 'Revoked: cannot run jobs'
  if (a.status === 'disabled') return 'Disabled: will not receive jobs'
  if (a.status === 'pending') return 'Awaiting enrollment'
  if (a.connectivity === 'online') return `Online${a.hostname ? ` · ${a.hostname}` : ''}`
  if (a.connectivity === 'never_connected') return 'Never connected'
  return `Offline${a.last_seen_at ? ` · last seen ${relativeTime(a.last_seen_at)}` : ''}`
}

/** Agent selector with connectivity; links to /agents/new when there are none. */
export function AgentPicker({
  value,
  onChange,
  error,
  isDisabled,
}: {
  value: string
  onChange: (id: string) => void
  error?: string
  isDisabled?: boolean
}) {
  const agents = useAgents()
  const list = agents.data ?? []
  const selected = list.find((a) => a.id === value)
  if (agents.isLoading) return <Spinner size="sm" label="Loading agents" />
  if (agents.error && !agents.data) return <Banner status="error" title="Could not load agents" description={errorMessage(agents.error)} />
  if (list.length === 0) {
    return (
      <Banner
        status="warning"
        title="No agents yet"
        description="Install a DumpStation Agent inside the private network first, then come back to pick it."
        endContent={<Button label="Add agent" size="sm" href="/agents/new" />}
      />
    )
  }
  return (
    <VStack gap={2}>
      <Selector
        label="Agent"
        placeholder="Choose an agent"
        options={list.map((a) => ({
          value: a.id,
          label: a.name,
          description: agentDescription(a),
          disabled: a.status === 'revoked',
        }))}
        value={value || undefined}
        onChange={(v) => v && onChange(v)}
        status={err(error)}
        isDisabled={isDisabled}
      />
      {selected && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <AgentConnectivityBadge status={selected.status} connectivity={selected.connectivity} />
          {selected.version && (
            <Text type="supporting" color="secondary">
              v{selected.version}
            </Text>
          )}
          {selected.pg_versions?.length > 0 && (
            <Text type="supporting" color="secondary">
              PostgreSQL clients {selected.pg_versions.join(', ')}
            </Text>
          )}
          {selected.connectivity !== 'online' && selected.status === 'active' && (
            <Text type="supporting" color="secondary">
              Jobs wait in the queue until the agent reconnects.
            </Text>
          )}
          <Link href={`/agents/${selected.id}`} type="supporting">
            View agent
          </Link>
        </HStack>
      )}
      <Text type="supporting" color="secondary">
        Need another one? <Link href="/agents/new" type="inherit">Add an agent</Link>.
      </Text>
    </VStack>
  )
}

/**
 * Connection details for the chosen execution mode. Direct and central
 * credentials share host/port/database/user/password; agent-defined
 * connections only need the connection name.
 */
export function ConnectionFields({
  value,
  onChange,
  errors = {},
  passwordStored,
  passwordNote,
  isDisabled,
}: {
  value: ConnectionState
  onChange: (patch: Partial<ConnectionState>) => void
  errors?: ConnectionErrors
  /** Editing a database that already has a password: empty keeps it. */
  passwordStored?: boolean
  /** Overrides the password help text (e.g. why it must be re-entered). */
  passwordNote?: string
  isDisabled?: boolean
}) {
  const agents = useAgents()
  const agent = agents.data?.find((a) => a.id === value.agentId)
  const names = useMemo(() => agent?.connections?.map((c) => c) ?? [], [agent])
  const known = names.some((c) => c.name === value.agentConnection)
  const [custom, setCustom] = useState(false)
  useEffect(() => {
    if (value.agentConnection && !known && names.length > 0) setCustom(true)
  }, [known, names.length, value.agentConnection])
  const showFree = custom || names.length === 0

  return (
    <VStack gap={4}>
      {value.mode === 'agent' && (
        <RadioList
          label="Where are the credentials?"
          value={value.credSource}
          onChange={(v) => onChange({ credSource: v as ConnectionState['credSource'] })}
          isDisabled={isDisabled}
        >
          <RadioListItem
            value="agent"
            label="Connection defined on the agent"
            description="Recommended. Host, user and password stay on the agent's machine; DumpStation only stores the connection name."
          />
          <RadioListItem
            value="central"
            label="Credentials managed by DumpStation"
            description="DumpStation stores the credentials encrypted at rest and sends them to the agent for each job."
          />
        </RadioList>
      )}
      {usesAgentConnection(value) ? (
        <VStack gap={3}>
          {names.length > 0 && (
            <Selector
              label="Agent connection"
              options={[
                ...names.map((c) => ({
                  value: c.name,
                  label: c.name,
                  description: [c.database, c.host].filter(Boolean).join(' on ') || undefined,
                })),
                { type: 'divider' as const },
                { value: OTHER, label: 'Another name…', description: 'Type a connection name the agent has not reported yet' },
              ]}
              value={showFree ? OTHER : value.agentConnection || undefined}
              placeholder="Choose a connection"
              onChange={(v) => {
                if (v === OTHER) {
                  setCustom(true)
                  onChange({ agentConnection: '' })
                } else if (v) {
                  setCustom(false)
                  onChange({ agentConnection: v })
                }
              }}
              status={showFree ? undefined : err(errors.agentConnection)}
              isDisabled={isDisabled}
              description="Connections the agent reported when it last checked in."
            />
          )}
          {showFree && (
            <TextInput
              label="Connection name"
              value={value.agentConnection}
              onChange={(v) => onChange({ agentConnection: v })}
              placeholder="e.g. orders-primary"
              autoComplete="off"
              status={err(errors.agentConnection)}
              isDisabled={isDisabled}
              description={names.length === 0 ? 'This agent has not reported any connections yet. Enter the name you configured on it.' : undefined}
            />
          )}
          <VStack gap={1.5}>
            <Text type="supporting" color="secondary">
              Define the connection on the agent with an environment variable (or in its connections file). The credentials never leave
              the agent.
            </Text>
            <CodeBlock
              code={`${agentEnvVar(value.agentConnection)}=postgres://backup_user:secret@db.internal:5432/${value.agentConnection.trim() || 'mydb'}`}
              language="bash"
              size="sm"
              width="100%"
              isWrapped
            />
          </VStack>
        </VStack>
      ) : (
        <VStack gap={3}>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <TextInput
              label="Host"
              value={value.host}
              onChange={(v) => onChange({ host: v })}
              placeholder={value.mode === 'agent' ? 'e.g. postgres.internal' : 'e.g. db.example.com'}
              autoComplete="off"
              status={err(errors.host)}
              isDisabled={isDisabled}
              description={value.mode === 'agent' ? 'As reachable from the agent.' : undefined}
            />
            <NumberInput
              label="Port"
              value={value.port}
              min={1}
              max={65535}
              isIntegerOnly
              onChange={(v) => onChange({ port: v })}
              status={err(errors.port)}
              isDisabled={isDisabled}
              formatValue={(n) => String(n)}
            />
            <TextInput
              label="Database"
              value={value.dbname}
              onChange={(v) => onChange({ dbname: v })}
              placeholder="e.g. postgres"
              autoComplete="off"
              status={err(errors.dbname)}
              isDisabled={isDisabled}
            />
            <TextInput
              label="User"
              value={value.user}
              onChange={(v) => onChange({ user: v })}
              placeholder="e.g. backup_user"
              autoComplete="off"
              status={err(errors.user)}
              isDisabled={isDisabled}
            />
          </Grid>
          <TextInput
            label="Password"
            type="password"
            value={value.password}
            onChange={(v) => onChange({ password: v })}
            autoComplete="new-password"
            placeholder={passwordStored ? 'Unchanged' : undefined}
            isRequired={!!passwordNote}
            description={
              passwordNote ??
              (passwordStored
                ? 'Leave empty to keep the stored password.'
                : 'Stored encrypted at rest. A read-only role with pg_dump privileges is enough.')
            }
            status={err(errors.password)}
            isDisabled={isDisabled}
          />
        </VStack>
      )}
    </VStack>
  )
}

export type TestOutcome = { state: 'idle' } | { state: 'running' } | { state: 'done'; result: TestResult } | { state: 'error'; message: string }

/**
 * Runs a connection test. Direct tests answer immediately; agent tests are
 * dispatched as jobs and polled until they finish or expire.
 */
export function ConnectionTest({
  value,
  databaseId,
  canTest = true,
  onOutcome,
  label = 'Test connection',
}: {
  value: ConnectionState
  databaseId?: string
  canTest?: boolean
  onOutcome?: (o: TestOutcome) => void
  label?: string
}) {
  const test = useTestConnection()
  const [jobId, setJobId] = useState<string>()
  const [outcome, setOutcome] = useState<TestOutcome>({ state: 'idle' })
  const job = useAgentJob(jobId)

  const set = (o: TestOutcome) => {
    setOutcome(o)
    onOutcome?.(o)
  }

  // Reset when the connection being tested changes.
  const sig = JSON.stringify(connectionTestInput(value, databaseId))
  useEffect(() => {
    setJobId(undefined)
    setOutcome((o) => (o.state === 'idle' ? o : { state: 'idle' }))
    onOutcome?.({ state: 'idle' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  useEffect(() => {
    const j = job.data
    if (!jobId || !j) return
    if (j.status === 'completed' && j.result) set({ state: 'done', result: j.result })
    else if (j.status === 'completed') set({ state: 'error', message: j.error_message || 'The agent returned no result' })
    else if (j.status === 'failed') set(j.result ? { state: 'done', result: j.result } : { state: 'error', message: j.error_message || 'The test failed' })
    else if (j.status === 'expired') set({ state: 'error', message: 'The agent did not pick up the test in time. Check that it is online.' })
    else if (j.status === 'cancelled') set({ state: 'error', message: 'The test was cancelled.' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data, jobId])

  const run = async () => {
    setJobId(undefined)
    set({ state: 'running' })
    try {
      const res = await test.mutateAsync(connectionTestInput(value, databaseId))
      if (res.result) set({ state: 'done', result: res.result })
      else if (res.job_id) setJobId(res.job_id)
      else set({ state: 'error', message: 'Unexpected response' })
    } catch (e) {
      set({ state: 'error', message: errorMessage(e) })
    }
  }

  const waitingAgent = outcome.state === 'running' && !!jobId
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Button label={label} onClick={run} isLoading={outcome.state === 'running'} isDisabled={!canTest} />
        {waitingAgent && (
          <Text type="supporting" color="secondary">
            {job.data?.status === 'leased' ? 'The agent is testing the connection…' : 'Waiting for the agent to pick up the test…'}
          </Text>
        )}
      </HStack>
      <TestResultView outcome={outcome} />
    </VStack>
  )
}

export function TestResultView({ outcome }: { outcome: TestOutcome }) {
  if (outcome.state === 'error') return <Banner status="error" title="Connection test could not run" description={outcome.message} />
  if (outcome.state !== 'done') return null
  const r = outcome.result
  const facts = (
    <HStack gap={4} wrap="wrap">
      {r.server_version && <Fact label="Server" value={r.server_version} />}
      {r.client_major ? <Fact label="pg_dump client" value={String(r.client_major)} /> : null}
      <Fact label="Latency" value={`${r.latency_ms} ms`} />
    </HStack>
  )
  if (r.ok) {
    const older = r.client_major && r.server_major && r.client_major < r.server_major
    return (
      <Banner
        status={older ? 'warning' : 'success'}
        title={older ? 'Connected, but the client is older than the server' : 'Connection succeeded'}
        description={older ? `pg_dump ${r.client_major} cannot back up PostgreSQL ${r.server_major}. Install a newer client.` : undefined}
        collapsible={false}
      >
        {facts}
      </Banner>
    )
  }
  return (
    <Banner status="error" title={errorCodeLabel(r.code) || 'Connection failed'} collapsible={false}>
      <VStack gap={2}>
        <Text type="supporting">{r.message}</Text>
        {facts}
      </VStack>
    </Banner>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={1}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="supporting" weight="medium">
        {value}
      </Text>
    </HStack>
  )
}

/** Compact one-line connection summary. */
export function ConnectionSummary({ value, agentName }: { value: ConnectionState; agentName?: string }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Badge label={value.mode === 'agent' ? 'Agent' : 'Direct'} variant="neutral" />
      <StackItem size="fill">
        <Text className="ds-mono" maxLines={1}>
          {usesAgentConnection(value)
            ? `${agentName ?? 'agent'} → ${value.agentConnection}`
            : `${value.user}@${value.host}:${value.port}/${value.dbname}`}
        </Text>
      </StackItem>
    </HStack>
  )
}
