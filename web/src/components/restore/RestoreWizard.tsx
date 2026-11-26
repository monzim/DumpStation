// Restore wizard: a deliberately explicit, five-step flow because a restore
// writes into a live database. Source → destination → options → validation → review.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter, HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Stepper, Step } from '@astryxdesign/core/Stepper'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Text, Heading } from '@astryxdesign/core/Text'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Switch } from '@astryxdesign/core/Switch'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Link } from '@astryxdesign/core/Link'
import { Divider } from '@astryxdesign/core/Divider'
import { CheckCircle2, PlugZap, RotateCcw, XCircle } from 'lucide-react'
import { Facts, useNotify } from '@/components/common'
import { ExecutorLabel } from '@/components/status'
import { ApiError, errorMessage } from '@/lib/api/client'
import {
  useAgentJob,
  useAgentTestConnection,
  useAgents,
  useDatabases,
  useStartRestore,
  useTestConnection,
  useTestExistingDatabase,
} from '@/lib/api/hooks'
import type { Agent, Backup, ConnectionTestResponse, Database, RestoreRequest, TestResult } from '@/lib/api/types'
import { bytes, dateTime, errorCodeLabel } from '@/lib/format'
import { useSession } from '@/lib/auth/session'

type Target = 'original' | 'database' | 'custom'
type Mode = 'direct' | 'agent'
type AgentCred = 'connection' | 'explicit'

interface Creds {
  host: string
  port: string
  dbname: string
  user: string
  password: string
}
const emptyCreds: Creds = { host: '', port: '5432', dbname: '', user: '', password: '' }

const STEPS = ['Backup', 'Destination', 'Options', 'Validate', 'Review']

export function agentCanRestore(a: Agent) {
  return a.status === 'active' && a.allow_restore && a.agent_allow_restore
}

function agentRestoreReason(a: Agent): string | undefined {
  if (a.status !== 'active') return `Agent is ${a.status}`
  const missing = [!a.allow_restore && 'restore is off in DumpStation', !a.agent_allow_restore && 'the agent config does not allow restores'].filter(Boolean)
  return missing.length ? `Not eligible: ${missing.join(' and ')}` : undefined
}

function credsError(c: Creds): Partial<Record<keyof Creds, string>> {
  const e: Partial<Record<keyof Creds, string>> = {}
  if (!c.host.trim()) e.host = 'Host is required'
  const p = Number(c.port)
  if (!Number.isInteger(p) || p < 1 || p > 65535) e.port = 'Port must be 1–65535'
  if (!c.dbname.trim()) e.dbname = 'Database name is required'
  if (!c.user.trim()) e.user = 'User is required'
  return e
}

function CredFields({ value, onChange, showErrors }: { value: Creds; onChange: (c: Creds) => void; showErrors: boolean }) {
  const err = showErrors ? credsError(value) : {}
  const st = (k: keyof Creds) => (err[k] ? { type: 'error' as const, message: err[k] } : undefined)
  return (
    <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
      <TextInput label="Host" value={value.host} onChange={(v) => onChange({ ...value, host: v })} status={st('host')} autoComplete="off" placeholder="db.internal or 10.0.0.5" />
      <TextInput label="Port" value={value.port} onChange={(v) => onChange({ ...value, port: v.replace(/\D/g, '') })} inputMode="numeric" status={st('port')} />
      <TextInput label="Database" value={value.dbname} onChange={(v) => onChange({ ...value, dbname: v })} status={st('dbname')} autoComplete="off" description="Must already exist on the server" />
      <TextInput label="User" value={value.user} onChange={(v) => onChange({ ...value, user: v })} status={st('user')} autoComplete="off" />
      <TextInput label="Password" type="password" value={value.password} onChange={(v) => onChange({ ...value, password: v })} autoComplete="new-password" isOptional />
    </Grid>
  )
}

function TestOutcome({ result, error }: { result?: TestResult; error?: string }) {
  if (error) return <Banner status="error" title="Connection test failed" description={error} />
  if (!result) return null
  if (result.ok)
    return (
      <Banner
        status="success"
        title="Destination reachable"
        description={[result.message, result.server_version && `PostgreSQL ${result.server_version}`, `${result.latency_ms} ms`].filter(Boolean).join(' · ')}
      />
    )
  return <Banner status="error" title={errorCodeLabel(result.code) || 'Connection test failed'} description={result.message} collapsible={false} />
}

export interface RestoreWizardProps {
  backup: Backup
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

/** Large dialog that walks through a restore of `backup`. Navigates to the restore on success. */
export function RestoreDialog({ backup, isOpen, onOpenChange }: RestoreWizardProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={780} maxHeight="92dvh">
      {isOpen && <RestoreWizard backup={backup} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

export function RestoreWizard({ backup, onClose }: { backup: Backup; onClose: () => void }) {
  const navigate = useNavigate()
  const notify = useNotify()
  const { isDemo } = useSession()
  const databases = useDatabases()
  const agents = useAgents()

  const [step, setStep] = useState(0)
  const [touched, setTouched] = useState(false)
  const [target, setTarget] = useState<Target>('custom')
  const [targetDbId, setTargetDbId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('direct')
  const [direct, setDirect] = useState<Creds>(emptyCreds)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentCred, setAgentCred] = useState<AgentCred>('connection')
  const [agentConn, setAgentConn] = useState<string | null>(null)
  const [agentCreds, setAgentCreds] = useState<Creds>(emptyCreds)
  const [clean, setClean] = useState(false)
  const [skipTest, setSkipTest] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [serverConfirm, setServerConfirm] = useState<string | null>(null)

  const sourceDb = databases.data?.find((d) => d.id === backup.database_id)
  const targetDb: Database | undefined =
    target === 'original' ? sourceDb : target === 'database' ? databases.data?.find((d) => d.id === targetDbId) : undefined
  const agent = agents.data?.find((a) => a.id === (target === 'custom' ? agentId : targetDb?.agent_id))
  const selectedAgent = agents.data?.find((a) => a.id === agentId)

  // ------------------------------------------------------------ destination validity
  const destProblem: string | null = (() => {
    if (target === 'original') {
      if (databases.isLoading) return 'Loading databases…'
      if (!sourceDb) return 'The source database no longer exists. Choose another destination.'
    }
    if (target === 'database' && !targetDb) return 'Choose a target database.'
    if (targetDb && targetDb.execution_mode === 'agent') {
      if (!agent) return 'The agent for this database was not found.'
      if (!agentCanRestore(agent)) return `Agent “${agent.name}” cannot run restores. ${agentRestoreReason(agent)}.`
    }
    if (target === 'custom' && mode === 'direct' && Object.keys(credsError(direct)).length) return 'Fill in the connection details.'
    if (target === 'custom' && mode === 'agent') {
      if (!selectedAgent) return 'Choose an agent.'
      if (!agentCanRestore(selectedAgent)) return 'This agent is not eligible to run restores.'
      if (agentCred === 'connection' && !agentConn) return 'Choose a connection configured on the agent.'
      if (agentCred === 'explicit' && Object.keys(credsError(agentCreds)).length) return 'Fill in the connection details.'
    }
    return null
  })()

  // Changing the destination invalidates a previous test.
  const destKey = JSON.stringify([target, targetDbId, mode, direct, agentId, agentCred, agentConn, agentCreds])

  // ------------------------------------------------------------ connection test
  const testDirect = useTestConnection()
  const testExisting = useTestExistingDatabase()
  const testAgent = useAgentTestConnection()
  const [testedKey, setTestedKey] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | undefined>()
  const [testResult, setTestResult] = useState<TestResult | undefined>()
  const [testError, setTestError] = useState<string | undefined>()
  const job = useAgentJob(jobId)

  useEffect(() => {
    if (!job.data) return
    if (job.data.status === 'completed' || job.data.status === 'failed') {
      if (job.data.result) setTestResult(job.data.result)
      else if (job.data.status === 'failed') setTestError(job.data.error_message || 'The agent could not complete the test')
      setJobId(undefined)
    } else if (job.data.status === 'expired' || job.data.status === 'cancelled') {
      setTestError(`The agent did not pick up the test (${job.data.status}). Check that it is online.`)
      setJobId(undefined)
    }
  }, [job.data])

  useEffect(() => {
    if (testedKey !== null && testedKey !== destKey) {
      setTestResult(undefined)
      setTestError(undefined)
      setJobId(undefined)
      setTestedKey(null)
    }
    setServerConfirm(null)
  }, [destKey, testedKey])

  const testing = testDirect.isPending || testExisting.isPending || testAgent.isPending || !!jobId
  const runTest = () => {
    setTestResult(undefined)
    setTestError(undefined)
    setJobId(undefined)
    setTestedKey(destKey)
    const handle = {
      onSuccess: (r: ConnectionTestResponse) => {
        if (r.result) setTestResult(r.result)
        else if (r.job_id) setJobId(r.job_id)
      },
      onError: (e: unknown) => setTestError(errorMessage(e)),
    }
    if (targetDb) testExisting.mutate(targetDb.id, handle)
    else if (mode === 'direct')
      testDirect.mutate(
        { execution_mode: 'direct', host: direct.host.trim(), port: Number(direct.port), dbname: direct.dbname.trim(), user: direct.user.trim(), password: direct.password },
        handle,
      )
    else if (agentId)
      testAgent.mutate(
        {
          id: agentId,
          input:
            agentCred === 'connection'
              ? { agent_connection: agentConn ?? '' }
              : { host: agentCreds.host.trim(), port: Number(agentCreds.port), dbname: agentCreds.dbname.trim(), user: agentCreds.user.trim(), password: agentCreds.password },
        },
        handle,
      )
  }
  const testPassed = testedKey === destKey && !!testResult?.ok

  // ------------------------------------------------------------ confirmation word (mirrors server rules)
  const destinationDbName =
    targetDb?.name ?? (mode === 'direct' ? direct.dbname.trim() : agentCred === 'connection' ? agentConn ?? '' : agentCreds.dbname.trim())
  const expectedConfirm =
    serverConfirm ??
    (targetDb ? targetDb.name : clean ? (mode === 'agent' && agentCred === 'connection' ? agentConn ?? '' : destinationDbName) || 'restore' : '')
  const overwrites = target !== 'custom' || clean

  const destinationLabel: ReactNode = targetDb ? (
    <>
      {targetDb.name} {target === 'original' && <Text color="secondary">(original database)</Text>}
    </>
  ) : mode === 'direct' ? (
    <span className="ds-mono">
      {direct.user}@{direct.host}:{direct.port}/{direct.dbname}
    </span>
  ) : agentCred === 'connection' ? (
    <>
      Connection <span className="ds-mono">{agentConn}</span> on agent {selectedAgent?.name}
    </>
  ) : (
    <>
      <span className="ds-mono">
        {agentCreds.user}@{agentCreds.host}:{agentCreds.port}/{agentCreds.dbname}
      </span>{' '}
      via agent {selectedAgent?.name}
    </>
  )
  const executorMode: Mode = targetDb ? targetDb.execution_mode : mode
  const executorAgentName = targetDb ? agent?.name : selectedAgent?.name

  // ------------------------------------------------------------ submit
  const start = useStartRestore()
  const submit = () => {
    const req: RestoreRequest = { target, clean_target: clean, confirm: expectedConfirm ? confirm : undefined }
    if (target === 'database') req.target_database_id = targetDbId ?? undefined
    if (target === 'custom') {
      req.execution_mode = mode
      if (mode === 'direct') {
        Object.assign(req, { target_host: direct.host.trim(), target_port: Number(direct.port), target_dbname: direct.dbname.trim(), target_user: direct.user.trim(), target_password: direct.password })
      } else {
        req.agent_id = agentId ?? undefined
        if (agentCred === 'connection') req.agent_connection = agentConn ?? undefined
        else
          Object.assign(req, {
            target_host: agentCreds.host.trim(),
            target_port: Number(agentCreds.port),
            target_dbname: agentCreds.dbname.trim(),
            target_user: agentCreds.user.trim(),
            target_password: agentCreds.password,
          })
      }
    }
    start.mutate(
      { backupId: backup.id, req },
      {
        onSuccess: (job) => {
          notify.success('Restore started')
          onClose()
          navigate({ to: '/restores/$id', params: { id: job.id } })
        },
        onError: (e) => {
          const m = e instanceof ApiError && e.status === 400 ? /type "([^"]+)" to confirm/.exec(e.message) : null
          if (m) {
            setServerConfirm(m[1])
            setConfirm('')
          }
        },
      },
    )
  }

  // ------------------------------------------------------------ step gating
  const canNext = (() => {
    if (step === 0) return backup.restorable
    if (step === 1) return !destProblem
    if (step === 3) return testPassed || skipTest
    return true
  })()
  const confirmOk = !expectedConfirm || confirm === expectedConfirm

  const next = () => {
    if (!canNext) {
      setTouched(true)
      return
    }
    setTouched(false)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  // ------------------------------------------------------------ agent options
  const agentOptions = useMemo(
    () =>
      (agents.data ?? []).map((a) => ({
        value: a.id,
        label: a.name,
        description: agentRestoreReason(a) ?? `${a.connectivity === 'online' ? 'Online' : 'Offline'} · ${a.connections.length} connection${a.connections.length === 1 ? '' : 's'}`,
        disabled: !agentCanRestore(a),
      })),
    [agents.data],
  )
  const ineligibleAgents = (agents.data ?? []).filter((a) => !agentCanRestore(a))

  // ------------------------------------------------------------ bodies
  let body: ReactNode
  if (step === 0) {
    body = (
      <VStack gap={4}>
        <Text>You are about to restore data from this backup into a PostgreSQL database. Check that it is the backup you mean to restore.</Text>
        <Facts
          items={[
            { label: 'Backup', value: <Text weight="medium">{backup.name}</Text> },
            { label: 'Source database', value: backup.database_name },
            { label: 'Completed', value: dateTime(backup.completed_at) },
            { label: 'Size', value: bytes(backup.size_bytes) },
            { label: 'Format', value: backup.dump_format === 'custom' ? 'Custom (pg_restore)' : 'Plain SQL (psql)' },
            { label: 'PostgreSQL', value: backup.postgres_version || '—' },
            {
              label: 'SHA-256',
              value: backup.checksum_sha256 ? (
                <span className="ds-mono" style={{ wordBreak: 'break-all' }}>
                  {backup.checksum_sha256}
                </span>
              ) : (
                '—'
              ),
            },
          ]}
        />
        {!backup.restorable && <Banner status="error" title="This backup cannot be restored" description="Only completed backups with a stored artifact can be restored." />}
      </VStack>
    )
  } else if (step === 1) {
    body = (
      <VStack gap={4}>
        <RadioList label="Restore into" value={target} onChange={(v) => setTarget(v as Target)}>
          <RadioListItem
            value="custom"
            label="A custom target"
            description="Any PostgreSQL database you can reach, directly from the DumpStation server or through an agent. Safest for test restores."
          />
          <RadioListItem value="database" label="Another configured database" description="One of the databases DumpStation already backs up." />
          <RadioListItem value="original" label={`The original database (${backup.database_name})`} description="Writes back into the database this backup came from." />
        </RadioList>
        <Divider />
        {target === 'original' && (
          <Banner
            status="warning"
            title="Restoring into the original database"
            description="Existing tables, rows and objects in this database can be overwritten. Make sure nothing depends on its current state, or take a fresh backup first."
          />
        )}
        {target === 'database' && (
          <Selector
            label="Target database"
            placeholder="Choose a database"
            hasSearch
            value={targetDbId ?? undefined}
            onChange={setTargetDbId}
            isLoading={databases.isLoading}
            options={(databases.data ?? []).map((d) => ({
              value: d.id,
              label: d.name,
              description: `${d.execution_mode === 'agent' ? 'Agent' : 'Direct'}${d.id === backup.database_id ? ' · source of this backup' : ''}`,
            }))}
            status={touched && !targetDbId ? { type: 'error', message: 'Choose a database' } : undefined}
          />
        )}
        {targetDb && targetDb.execution_mode === 'agent' && agent && (
          <Text type="supporting" color="secondary">
            Runs on agent <Link href={`/agents/${agent.id}`}>{agent.name}</Link> using the database's connection.
          </Text>
        )}
        {target === 'custom' && (
          <VStack gap={3}>
            <SegmentedControl label="Execution method" value={mode} onChange={(v) => setMode(v as Mode)}>
              <SegmentedControlItem value="direct" label="Direct" />
              <SegmentedControlItem value="agent" label="Agent" />
            </SegmentedControl>
            <Text type="supporting" color="secondary">
              {mode === 'direct'
                ? 'The DumpStation server downloads the artifact and runs pg_restore against the target.'
                : 'A Backup Agent inside the target network downloads the artifact and runs pg_restore. Use this for databases the server cannot reach.'}
            </Text>
            {mode === 'direct' ? (
              <CredFields value={direct} onChange={setDirect} showErrors={touched} />
            ) : (
              <VStack gap={3}>
                <Selector
                  label="Agent"
                  placeholder={agents.isLoading ? 'Loading agents…' : 'Choose an agent'}
                  value={agentId ?? undefined}
                  onChange={(v) => {
                    setAgentId(v)
                    setAgentConn(null)
                  }}
                  options={agentOptions}
                  emptyText="No agents registered"
                  isLoading={agents.isLoading}
                  status={touched && !agentId ? { type: 'error', message: 'Choose an agent' } : undefined}
                />
                {ineligibleAgents.length > 0 && (
                  <Text type="supporting" color="secondary">
                    An agent can run restores only when both switches are on: <strong>Allow restores</strong> in the agent's settings in DumpStation, and{' '}
                    <span className="ds-mono">allow_restore: true</span> in the agent's own config file on its host. {ineligibleAgents.length} agent
                    {ineligibleAgents.length === 1 ? ' is' : 's are'} not eligible.
                  </Text>
                )}
                {selectedAgent && agentCanRestore(selectedAgent) && (
                  <>
                    <SegmentedControl label="Credentials" value={agentCred} onChange={(v) => setAgentCred(v as AgentCred)}>
                      <SegmentedControlItem value="connection" label="Agent connection" />
                      <SegmentedControlItem value="explicit" label="Explicit credentials" />
                    </SegmentedControl>
                    {agentCred === 'connection' ? (
                      <Selector
                        label="Connection on the agent"
                        description="Credentials stay on the agent host."
                        placeholder="Choose a connection"
                        value={agentConn ?? undefined}
                        onChange={setAgentConn}
                        emptyText="This agent reports no named connections"
                        options={selectedAgent.connections.map((c) => ({
                          value: c.name,
                          label: c.name,
                          description: [c.database, c.host].filter(Boolean).join(' @ '),
                        }))}
                        status={touched && !agentConn ? { type: 'error', message: 'Choose a connection' } : undefined}
                      />
                    ) : (
                      <>
                        <Text type="supporting" color="secondary">
                          The password is encrypted on the server and sent to the agent for this job only.
                        </Text>
                        <CredFields value={agentCreds} onChange={setAgentCreds} showErrors={touched} />
                      </>
                    )}
                  </>
                )}
              </VStack>
            )}
          </VStack>
        )}
        {touched && destProblem && !destProblem.startsWith('Fill in') && !destProblem.startsWith('Choose') && <Banner status="error" title={destProblem} />}
        {!touched && destProblem && targetDb && <Banner status="error" title={destProblem} />}
      </VStack>
    )
  } else if (step === 2) {
    body = (
      <VStack gap={4}>
        <Switch
          label="Drop existing objects before restoring (--clean)"
          description="Runs pg_restore with --clean --if-exists so tables, views and functions in the backup replace the ones in the target."
          value={clean}
          onChange={(v) => setClean(v)}
        />
        {clean ? (
          <Banner
            status="error"
            title="Existing objects will be dropped"
            description="Every object contained in the backup is dropped from the target and recreated. Data written to those tables since the backup is permanently lost. Objects not in the backup are left alone."
          />
        ) : (
          <Banner
            status="info"
            title="Objects are added, not replaced"
            description="Without --clean, restoring into a database that already has these tables usually fails with “already exists” errors. Use an empty database, or turn this on."
          />
        )}
      </VStack>
    )
  } else if (step === 3) {
    body = (
      <VStack gap={4}>
        <Text>
          Check that the destination is reachable with these credentials before the restore starts. {executorMode === 'agent' ? 'The test runs on the agent.' : 'The test runs from the DumpStation server.'}
        </Text>
        <Facts
          items={[
            { label: 'Destination', value: destinationLabel },
            { label: 'Runs on', value: <ExecutorLabel mode={executorMode} agentName={executorAgentName} /> },
          ]}
        />
        <HStack gap={2} vAlign="center">
          <Button label={testedKey === destKey && (testResult || testError) ? 'Test again' : 'Test connection'} icon={<PlugZap size={16} />} variant="primary" isLoading={testing} onClick={runTest} />
          {jobId && (
            <HStack gap={1} vAlign="center">
              <Spinner size="sm" />
              <Text type="supporting" color="secondary">
                Waiting for the agent ({job.data?.status ?? 'queued'})…
              </Text>
            </HStack>
          )}
        </HStack>
        {testedKey === destKey && <TestOutcome result={testResult} error={testError} />}
        <CheckboxInput
          label="Skip validation and restore anyway"
          description="Only if the destination cannot be tested from here. The restore fails if the connection does not work."
          value={skipTest}
          onChange={(v) => setSkipTest(v)}
        />
      </VStack>
    )
  } else {
    body = (
      <VStack gap={4}>
        {overwrites ? (
          <Banner
            status="error"
            title="This is a restore, not a backup: it writes into the destination"
            description={
              clean
                ? 'Objects in the destination that are also in the backup will be dropped and recreated. This cannot be undone.'
                : 'Existing data in the destination database may be overwritten. This cannot be undone.'
            }
          />
        ) : (
          <Banner status="warning" title="This is a restore, not a backup" description="Data from the backup will be written into the destination database." />
        )}
        <Facts
          items={[
            { label: 'Restore from', value: <Text weight="medium">{backup.name}</Text> },
            { label: 'Taken', value: `${dateTime(backup.completed_at)} · ${backup.database_name}` },
            { label: 'Into', value: destinationLabel },
            { label: 'Runs on', value: <ExecutorLabel mode={executorMode} agentName={executorAgentName} /> },
            {
              label: 'Drop existing',
              value: clean ? (
                <Text color="accent" weight="medium">
                  Yes (--clean)
                </Text>
              ) : (
                'No'
              ),
            },
            {
              label: 'Validation',
              value: testPassed ? (
                <HStack gap={1} vAlign="center">
                  <CheckCircle2 size={14} aria-hidden /> <Text>Connection verified</Text>
                </HStack>
              ) : (
                <HStack gap={1} vAlign="center">
                  <XCircle size={14} aria-hidden /> <Text color="secondary">Skipped</Text>
                </HStack>
              ),
            },
          ]}
        />
        {expectedConfirm && (
          <TextInput
            label={`Type "${expectedConfirm}" to confirm`}
            description={serverConfirm ? 'The server requires this exact confirmation.' : 'The name of the destination being written to.'}
            value={confirm}
            onChange={setConfirm}
            autoComplete="off"
            status={confirm && !confirmOk ? { type: 'error', message: `Type ${expectedConfirm} exactly` } : undefined}
            onEnter={() => confirmOk && !start.isPending && !isDemo && submit()}
          />
        )}
        {start.error ? <Banner status="error" title="The restore was not started" description={errorMessage(start.error)} /> : null}
        {isDemo && <Banner status="info" title="Demo accounts cannot start restores" />}
      </VStack>
    )
  }

  return (
    <Layout
      height="auto"
      header={<DialogHeader title="Restore backup" subtitle={backup.name} onOpenChange={() => onClose()} />}
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            <Stepper activeStep={step} density="compact" label="Restore steps" onStepClick={(i) => i < step && setStep(i)}>
              {STEPS.map((s, i) => (
                <Step key={s} step={i} label={s} />
              ))}
            </Stepper>
            <Heading level={3}>
              {['Source backup', 'Choose the destination', 'Restore options', 'Validate the destination', 'Review and confirm'][step]}
            </Heading>
            {body}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={4}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <Button label="Cancel" variant="ghost" onClick={onClose} />
            </StackItem>
            {step > 0 && <Button label="Back" onClick={() => setStep(step - 1)} />}
            {step < STEPS.length - 1 ? (
              <Button label="Continue" variant="primary" isDisabled={step === 0 ? !backup.restorable : step === 3 ? !canNext : false} onClick={next} />
            ) : (
              <Button
                label="Start restore"
                variant="destructive"
                icon={<RotateCcw size={16} />}
                isDisabled={!confirmOk || isDemo}
                isLoading={start.isPending}
                onClick={submit}
              />
            )}
          </HStack>
        </LayoutFooter>
      }
    />
  )
}
