import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Stepper, Step } from '@astryxdesign/core/Stepper'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { Banner } from '@astryxdesign/core/Banner'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { Table } from '@astryxdesign/core/Table'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Facts, Panel, When } from '@/components/common'
import { AgentConnectivityBadge } from '@/components/status'
import { ErrorState, BlockSkeleton } from '@/components/states'
import { useAgent, useCreateAgent } from '@/lib/api/hooks'
import { ApiError } from '@/lib/api/client'
import type { Agent, AgentConnectionInfo, EnrollmentResponse } from '@/lib/api/types'
import { useSession } from '@/lib/auth/session'
import { AgentFields, emptyAgentForm, formToInput, validateAgentForm, type AgentFormState } from '@/components/agents/AgentFields'
import { EnrollmentResult } from '@/components/agents/EnrollmentResult'
import { RESTORE_TEXT, normalizeAgent, pgVersionsText, restoreState } from '@/components/agents/AgentBits'
import { TTL_OPTIONS } from '@/components/agents/deploy'

export const Route = createFileRoute('/_app/agents/new')({
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({ id: typeof s.id === 'string' ? s.id : undefined }),
  component: NewAgentPage,
})

function NewAgentPage() {
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<EnrollmentResponse | null>(null)
  const [deployed, setDeployed] = useState(false)
  const [finished, setFinished] = useState(false)

  const agentId = enrollment?.agent.id ?? id
  // Step 1 (token) only exists while the token is in memory; after a reload
  // the page resumes at "Connect".
  const step = !agentId ? 0 : finished ? 3 : enrollment && !deployed ? 1 : 2

  return (
    <Page width="form">
      <PageHeader
        title="Add agent"
        description="An agent runs next to private databases and connects out to DumpStation over HTTPS. No inbound ports, VPN or database exposure needed."
        crumbs={[{ label: 'Backup Agents', href: '/agents' }, { label: 'Add agent' }]}
      />
      <Stepper activeStep={step} label="Agent setup">
        <Step step={0} label="Details" status={step > 0 ? 'success' : undefined} />
        <Step step={1} label="Deploy" status={step > 1 ? 'success' : undefined} />
        <Step step={2} label="Connect" status={step > 2 ? 'success' : undefined} />
        <Step step={3} label="Next steps" />
      </Stepper>
      {step === 0 && (
        <DetailsStep
          onCreated={(e) => {
            setEnrollment(e)
            navigate({ to: '/agents/new', search: { id: e.agent.id }, replace: true })
          }}
        />
      )}
      {step === 1 && enrollment && (
        <Panel title="Deploy the agent" description="Run it anywhere that can reach both your database and this server.">
          <EnrollmentResult enrollment={enrollment} />
          <HStack gap={2} hAlign="end">
            <Button label="I've started the agent" variant="primary" onClick={() => setDeployed(true)} />
          </HStack>
        </Panel>
      )}
      {step === 2 && agentId && (
        <WaitStep id={agentId} hadToken={!!enrollment} onBack={enrollment ? () => setDeployed(false) : undefined} onContinue={() => setFinished(true)} />
      )}
      {step === 3 && agentId && <NextSteps id={agentId} />}
    </Page>
  )
}

function DetailsStep({ onCreated }: { onCreated: (e: EnrollmentResponse) => void }) {
  const { isDemo } = useSession()
  const [form, setForm] = useState<AgentFormState>(emptyAgentForm)
  const [ttl, setTtl] = useState('60')
  const [submitted, setSubmitted] = useState(false)
  const create = useCreateAgent()
  const errors = submitted ? validateAgentForm(form) : {}
  const serverErrors = create.error instanceof ApiError ? create.error.fieldErrors : undefined

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(validateAgentForm(form)).length > 0) return
    create.mutate({ input: formToInput(form), ttlMinutes: Number(ttl) }, { onSuccess: onCreated })
  }

  return (
    <Panel title="Agent details">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <VStack gap={4}>
          <AgentFields value={form} onChange={setForm} errors={errors} serverErrors={serverErrors} />
          <Selector
            label="Enrollment token lifetime"
            options={TTL_OPTIONS}
            value={ttl}
            onChange={(v) => setTtl(v ?? '60')}
            description="The token is single-use. Start the agent before it expires, or issue a new one later."
          />
          {create.error && !serverErrors?.name ? <ErrorState title="Could not create the agent" error={create.error} /> : null}
          {isDemo && <Banner status="info" title="Demo accounts are read-only" />}
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" href="/agents" />
            <Button label="Create agent" variant="primary" type="submit" isLoading={create.isPending} isDisabled={isDemo} />
          </HStack>
        </VStack>
      </form>
    </Panel>
  )
}

function isConnected(a?: Agent) {
  return !!a && a.status === 'active' && a.connectivity === 'online'
}

function WaitStep({ id, hadToken, onBack, onContinue }: { id: string; hadToken: boolean; onBack?: () => void; onContinue: () => void }) {
  const q = useAgent(id)
  const connected = isConnected(q.data)
  const { refetch } = q
  // Poll faster than the hook's default while we wait for the first heartbeat.
  useEffect(() => {
    if (connected) return
    const t = setInterval(() => refetch(), 3000)
    return () => clearInterval(t)
  }, [connected, refetch])

  if (q.isLoading) return <BlockSkeleton height={200} />
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const a = normalizeAgent(q.data!)

  if (!connected) {
    return (
      <Panel title="Waiting for the agent to connect…" actions={<AgentConnectivityBadge status={a.status} connectivity={a.connectivity} />}>
        <HStack gap={3} vAlign="center">
          <Spinner size="md" aria-label="Waiting for the agent" />
          <Text color="secondary">
            Checking every few seconds. This page moves on as soon as <strong>{a.name}</strong> enrolls and sends its first heartbeat.
          </Text>
        </HStack>
        {a.status === 'revoked' || a.status === 'disabled' ? (
          <Banner status="warning" title={`This agent is ${a.status}.`} description="Open the agent page to enable it or issue a new enrollment token." />
        ) : (
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              Not connecting? Check the agent's logs, that it can reach the server URL, and that the token has not expired.
            </Text>
            {!hadToken && (
              <Text type="supporting" color="secondary">
                The enrollment token is no longer shown. Issue a new one from the agent page if you still need it.
              </Text>
            )}
          </VStack>
        )}
        <HStack gap={2} hAlign="end" wrap="wrap">
          {onBack && <Button label="Show instructions again" onClick={onBack} />}
          <Button label="Open agent page" href={`/agents/${a.id}`} />
        </HStack>
      </Panel>
    )
  }

  return (
    <Panel title="Agent connected" actions={<AgentConnectivityBadge status={a.status} connectivity={a.connectivity} />}>
      <ReportedFacts agent={a} />
      <HStack gap={2} hAlign="end">
        <Button label="Continue" variant="primary" onClick={onContinue} />
      </HStack>
    </Panel>
  )
}

interface ConnRow extends AgentConnectionInfo, Record<string, unknown> {}

function ReportedFacts({ agent: a }: { agent: Agent }) {
  return (
    <VStack gap={4}>
      <Facts
        items={[
          { label: 'Hostname', value: a.hostname || '—' },
          { label: 'Version', value: a.version || '—' },
          { label: 'Platform', value: a.platform || '—' },
          { label: 'PostgreSQL clients', value: pgVersionsText(a.pg_versions) },
          { label: 'Restores', value: RESTORE_TEXT[restoreState(a)] },
          { label: 'Last heartbeat', value: <When value={a.last_seen_at} /> },
        ]}
      />
      <VStack gap={2}>
        <Text type="label">Connections reported by the agent</Text>
        {a.connections.length === 0 ? (
          <Banner
            status="info"
            title="No connections configured on the agent"
            description="You can still assign databases with credentials stored on the server, or add DUMPSTATION_CONN_<NAME> variables to the agent and restart it."
          />
        ) : (
          <Table<ConnRow>
            data={a.connections as ConnRow[]}
            idKey="name"
            density="compact"
            columns={[
              { key: 'name', header: 'Name', renderCell: (c) => <span className="ds-mono">{c.name}</span> },
              { key: 'database', header: 'Database', renderCell: (c) => c.database || '—' },
              { key: 'host', header: 'Host', renderCell: (c) => c.host || '—' },
            ]}
          />
        )}
      </VStack>
    </VStack>
  )
}

function NextSteps({ id }: { id: string }) {
  const q = useAgent(id)
  return (
    <Panel title="Next steps">
      <Text>
        {q.data ? <strong>{q.data.name}</strong> : 'The agent'} is ready. Assign a database to it so scheduled and manual backups run on the
        agent instead of the server.
      </Text>
      <HStack gap={2} hAlign="end" wrap="wrap">
        <Button label="Back to agents" href="/agents" />
        <Button label="Assign a database" variant="primary" href={`/databases/new?agent=${id}`} />
      </HStack>
    </Panel>
  )
}
