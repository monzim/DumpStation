import { useMemo, useState, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Facts, useNotify } from '@/components/common'
import { AgentPicker, ConnectionFields, ConnectionTest, ExecutionModePicker, type TestOutcome } from '@/components/databases/ConnectionForm'
import { RetentionEditor } from '@/components/databases/RetentionEditor'
import { ScheduleEditor, useScheduleCheck, type ScheduleValue } from '@/components/databases/ScheduleEditor'
import {
  EMPTY_CONNECTION,
  connectionInput,
  usesAgentConnection,
  validateConnection,
  type ConnectionState,
} from '@/components/databases/connection'
import { DEFAULT_CRON, DEFAULT_RETENTION, browserTimeZone, describeRetention, describeSchedule, validateRetention } from '@/components/databases/schedule'
import { useAgents, useNotifications, useSaveDatabase, useStorages } from '@/lib/api/hooks'
import type { DatabaseInput, RotationPolicy } from '@/lib/api/types'
import { errorMessage } from '@/lib/api/client'
import { PROVIDER_LABEL } from '@/lib/format'
import { useSession } from '@/lib/auth/session'

interface NewDatabaseSearch {
  agent?: string
  host?: string
  port?: number
  dbname?: string
}

export const Route = createFileRoute('/_app/databases/new')({
  // Prefill from deep links: /databases/new?agent=<id> (agent pages) and
  // ?host=&port=&dbname= (DB Explorer "Back up this database").
  validateSearch: (s: Record<string, unknown>): NewDatabaseSearch => {
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 255) : undefined)
    const port = Number(s.port)
    return {
      agent: str(s.agent),
      host: str(s.host),
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined,
      dbname: str(s.dbname),
    }
  },
  component: NewDatabasePage,
})

const STEPS = [
  { label: 'Connection method', description: 'Direct or through an agent' },
  { label: 'Connection details', description: 'Name and credentials' },
  { label: 'Validate', description: 'Test the connection' },
  { label: 'Storage', description: 'Where backups go' },
  { label: 'Schedule', description: 'When backups run' },
  { label: 'Retention', description: 'How long to keep them' },
  { label: 'Notifications', description: 'Optional alerts', isOptional: true },
  { label: 'Review', description: 'Check and create' },
]

const PG_VERSIONS = [
  { value: 'latest', label: 'Auto-detect (recommended)' },
  ...['17', '16', '15', '14', '13', '12'].map((v) => ({ value: v, label: `PostgreSQL ${v}` })),
]

/** Which wizard step a server validation message belongs to. */
function stepForError(message: string): number {
  const m = message.toLowerCase()
  if (m.includes('schedule') || m.includes('time zone')) return 4
  if (m.includes('rotation')) return 5
  if (m.includes('storage')) return 3
  if (m.includes('notification')) return 6
  if (m.includes('agent_id') || m.includes('agent not found') || m.includes('revoked') || m.includes('execution_mode')) return 0
  return 1
}

function NewDatabasePage() {
  const navigate = useNavigate()
  const notify = useNotify()
  const { isDemo } = useSession()
  const isNarrow = useMediaQuery('(max-width: 960px)')
  const agents = useAgents()
  const storages = useStorages()
  const notifications = useNotifications()
  const save = useSaveDatabase()

  const [step, setStep] = useState(0)
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set())
  const [name, setName] = useState('')
  const search = Route.useSearch()
  const [conn, setConn] = useState<ConnectionState>(() => ({
    ...EMPTY_CONNECTION,
    ...(search.agent ? { mode: 'agent' as const, agentId: search.agent } : {}),
    ...(search.host ? { host: search.host } : {}),
    ...(search.port ? { port: search.port } : {}),
    ...(search.dbname ? { dbname: search.dbname } : {}),
  }))
  const [pgVersion, setPgVersion] = useState('latest')
  const [test, setTest] = useState<TestOutcome>({ state: 'idle' })
  const [skipTest, setSkipTest] = useState(false)
  const [storageId, setStorageId] = useState<string>('')
  const [schedule, setSchedule] = useState<ScheduleValue>({ cron: DEFAULT_CRON, timezone: browserTimeZone() })
  const [retention, setRetention] = useState<RotationPolicy>(DEFAULT_RETENTION)
  const [notificationId, setNotificationId] = useState<string | null>(null)

  const patchConn = (p: Partial<ConnectionState>) => {
    setConn((c) => ({ ...c, ...p }))
    setSkipTest(false)
  }

  // Default storage = the default destination (or the only one).
  const storageList = storages.data ?? []
  // Admins can see other users' destinations, so only preselect when the default is unambiguous.
  const defaults = storageList.filter((s) => s.is_default)
  const effectiveStorage = storageId || (defaults.length === 1 ? defaults[0].id : '') || (storageList.length === 1 ? storageList[0].id : '')
  const scheduleCheck = useScheduleCheck(schedule.cron, schedule.timezone)
  const agent = agents.data?.find((a) => a.id === conn.agentId)

  const errorsByStep = useMemo<Record<string, string>[]>(() => {
    const method: Record<string, string> = {}
    if (conn.mode === 'agent' && !conn.agentId) method.agentId = 'Choose the agent that will run backups.'
    const details: Record<string, string> = {}
    if (!name.trim()) details.name = 'Enter a name for this database.'
    else if (name.trim().length > 255) details.name = 'Use at most 255 characters.'
    Object.assign(details, validateConnection(conn, { passwordStored: false }))
    delete details.agentId
    const validate: Record<string, string> = {}
    if (!(test.state === 'done' && test.result.ok) && !skipTest)
      validate.test = 'Run a successful connection test, or confirm that you want to continue without one.'
    const storage: Record<string, string> = {}
    if (!effectiveStorage) storage.storage = 'Choose where backups are stored.'
    const sched: Record<string, string> = {}
    if (!scheduleCheck.valid) sched.schedule = scheduleCheck.isChecking ? 'Checking the schedule…' : scheduleCheck.error || 'Enter a valid schedule.'
    const ret: Record<string, string> = {}
    const re = validateRetention(retention)
    if (re) ret.retention = re
    return [method, details, validate, storage, sched, ret, {}, {}]
  }, [conn, name, test, skipTest, effectiveStorage, scheduleCheck.valid, scheduleCheck.isChecking, scheduleCheck.error, retention])

  const shown = (i: number) => (attempted.has(i) ? errorsByStep[i] : {})
  const markAttempted = (i: number) => setAttempted((p) => new Set(p).add(i))

  const buildInput = (): DatabaseInput => ({
    name: name.trim(),
    ...connectionInput(conn),
    schedule: schedule.cron.trim(),
    timezone: schedule.timezone,
    storage_id: effectiveStorage,
    notification_id: notificationId,
    postgres_version: pgVersion,
    rotation_policy: retention,
  })

  const create = async () => {
    const firstBroken = errorsByStep.findIndex((e) => Object.keys(e).length > 0)
    if (firstBroken !== -1) {
      markAttempted(firstBroken)
      setStep(firstBroken)
      return
    }
    try {
      const db = await save.mutateAsync(buildInput())
      notify.success(`${db.name} added`)
      navigate({ to: '/databases/$id', params: { id: db.id }, search: { created: 1 } })
    } catch {
      /* shown on the review step */
    }
  }

  const goNext = () => {
    markAttempted(step)
    if (Object.keys(errorsByStep[step]).length > 0) return
    if (step === STEPS.length - 1) return void create()
    setStep((s) => s + 1)
  }

  const goTo = (i: number) => {
    if (i > step) markAttempted(step)
    setStep(i)
  }

  const isLast = step === STEPS.length - 1
  const cur = shown(step)
  const saveError = save.error ? errorMessage(save.error) : undefined

  const storageOptions = storageList.map((s) => ({
    value: s.id,
    label: s.is_default ? `${s.name} (default)` : s.name,
    description: `${PROVIDER_LABEL[s.provider] ?? s.provider}${s.bucket ? ` · ${s.bucket}` : ''}`,
  }))
  const storageName = storageList.find((s) => s.id === effectiveStorage)?.name
  const notificationName = notifications.data?.find((n) => n.id === notificationId)?.name

  const stepper = (
    <Stepper
      activeStep={step}
      orientation={isNarrow ? 'horizontal' : 'vertical'}
      onStepClick={goTo}
      label="Add database progress"
      density={isNarrow ? 'balanced' : 'compact'}
      horizontalOptions={{ minimumStepWidth: 112, collapsedVariant: 'withLabel' }}
    >
      {STEPS.map((s, i) => (
        <Step
          key={s.label}
          step={i}
          label={s.label}
          description={isNarrow ? undefined : s.description}
          isOptional={s.isOptional}
          status={Object.keys(shown(i)).length > 0 ? 'error' : undefined}
        />
      ))}
    </Stepper>
  )

  const panel = (i: number, title: string, description: ReactNode, body: ReactNode) => (
    <div hidden={step !== i}>
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={2}>{title}</Heading>
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        </VStack>
        {body}
      </VStack>
    </div>
  )

  const content = (
    <VStack gap={5}>
      {isDemo && <Banner status="info" title="Demo accounts are read-only" description="You can walk through the wizard, but creating a database is disabled." />}

      {panel(
        0,
        'How should DumpStation reach this database?',
        'Pick where the backup runs. You can change this later.',
        <VStack gap={4}>
          <ExecutionModePicker value={conn.mode} onChange={(mode) => patchConn({ mode })} />
          {conn.mode === 'agent' && <AgentPicker value={conn.agentId} onChange={(agentId) => patchConn({ agentId })} error={cur.agentId} />}
        </VStack>,
      )}

      {panel(
        1,
        'Identify and connect',
        conn.mode === 'agent'
          ? `Connection details as seen from ${agent ? `the agent "${agent.name}"` : 'the agent'}.`
          : 'Connection details as seen from the DumpStation server.',
        <VStack gap={4}>
          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. orders-production"
            description="Shown across DumpStation and used in backup file names."
            status={cur.name ? { type: 'error', message: cur.name } : undefined}
            autoComplete="off"
          />
          <ConnectionFields value={conn} onChange={patchConn} errors={cur} />
          <Collapsible trigger={<Text weight="medium">Advanced</Text>} defaultIsOpen={false}>
            <VStack gap={3} paddingBlock={2}>
              <Selector
                label="PostgreSQL version"
                options={PG_VERSIONS}
                value={pgVersion}
                onChange={(v) => v && setPgVersion(v)}
                description="Which pg_dump major version to use. Auto-detect picks one that matches the server."
              />
            </VStack>
          </Collapsible>
        </VStack>,
      )}

      {panel(
        2,
        'Validate the connection',
        conn.mode === 'agent'
          ? 'The agent connects to the database and reports back. This can take a few seconds while it picks up the job.'
          : 'DumpStation connects to the database and checks the server and pg_dump versions.',
        <VStack gap={4}>
          <ConnectionTest value={conn} onOutcome={setTest} />
          {!(test.state === 'done' && test.result.ok) && (
            <CheckboxInput
              label="Skip the test and continue anyway"
              description="Backups will fail until the connection works. You can test it again from the database page."
              value={skipTest}
              onChange={setSkipTest}
              status={cur.test ? { type: 'error', message: cur.test } : undefined}
            />
          )}
        </VStack>,
      )}

      {panel(
        3,
        'Where should backups be stored?',
        'Backups are uploaded to this S3-compatible destination.',
        storages.isLoading ? (
          <Text color="secondary">Loading storage destinations…</Text>
        ) : storageList.length === 0 ? (
          <Banner
            status="warning"
            title="No storage destinations yet"
            description="Add an S3, R2, MinIO or other S3-compatible destination first."
            endContent={<Button label="Add storage" size="sm" href="/storage" />}
          />
        ) : (
          <VStack gap={2}>
            <Selector
              label="Storage destination"
              options={storageOptions}
              value={effectiveStorage || undefined}
              placeholder="Choose a destination"
              onChange={(v) => v && setStorageId(v)}
              status={cur.storage ? { type: 'error', message: cur.storage } : undefined}
            />
            <Text type="supporting" color="secondary">
              Manage destinations on the <Link href="/storage" type="inherit">Storage</Link> page.
            </Text>
          </VStack>
        ),
      )}

      {panel(
        4,
        'When should backups run?',
        'Pick a preset or write a cron expression. The next run times are calculated by the server.',
        <ScheduleEditor value={schedule} onChange={setSchedule} error={attempted.has(4) && !scheduleCheck.isChecking ? cur.schedule : undefined} />,
      )}

      {panel(5, 'How long should backups be kept?', 'Older backups are removed automatically so storage does not grow forever.', <RetentionEditor value={retention} onChange={setRetention} />)}

      {panel(
        6,
        'Notifications',
        'Optionally send backup results to a Discord or Telegram channel.',
        <VStack gap={2}>
          <Selector
            label="Notification channel"
            options={(notifications.data ?? []).map((n) => ({
              value: n.id,
              label: n.name,
              description: [n.has_discord && 'Discord', n.has_telegram && 'Telegram'].filter(Boolean).join(' · ') || undefined,
            }))}
            value={notificationId}
            hasClear
            placeholder="No notifications"
            emptyText="No channels yet"
            isLoading={notifications.isLoading}
            onChange={setNotificationId}
            isOptional
          />
          <Text type="supporting" color="secondary">
            Manage channels on the <Link href="/notifications" type="inherit">Notifications</Link> page.
          </Text>
        </VStack>,
      )}

      {panel(
        7,
        'Review and create',
        'Check the details. Nothing is saved until you create the database.',
        <VStack gap={4}>
          <Card>
            <Facts
              items={[
                { label: 'Name', value: name || '—' },
                {
                  label: 'Execution',
                  value: conn.mode === 'agent' ? `Agent · ${agent?.name ?? '—'}` : 'Direct (DumpStation server)',
                },
                {
                  label: 'Connection',
                  value: (
                    <Text className="ds-mono">
                      {usesAgentConnection(conn)
                        ? `Agent connection "${conn.agentConnection}"`
                        : `${conn.user}@${conn.host}:${conn.port}/${conn.dbname}`}
                    </Text>
                  ),
                },
                ...(conn.mode === 'agent'
                  ? [{ label: 'Credentials', value: usesAgentConnection(conn) ? 'Stay on the agent' : 'Stored encrypted by DumpStation' }]
                  : []),
                {
                  label: 'Connection test',
                  value: test.state === 'done' && test.result.ok ? `Passed${test.result.server_version ? ` · ${test.result.server_version}` : ''}` : 'Skipped',
                },
                { label: 'PostgreSQL version', value: pgVersion === 'latest' ? 'Auto-detect' : pgVersion },
                { label: 'Storage', value: storageName ?? '—' },
                { label: 'Schedule', value: `${describeSchedule(schedule.cron)} · ${schedule.timezone || 'server time zone'}` },
                { label: 'Retention', value: describeRetention(retention) },
                { label: 'Notifications', value: notificationName ?? 'None' },
              ]}
            />
          </Card>
          {saveError && (
            <Banner
              status="error"
              title="Could not create the database"
              description={saveError}
              endContent={<Button label="Fix it" size="sm" onClick={() => setStep(stepForError(saveError))} />}
            />
          )}
        </VStack>,
      )}

      <Divider />
      <HStack gap={3} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Text type="supporting" color="secondary">
            Step {step + 1} of {STEPS.length}
          </Text>
        </StackItem>
        <HStack gap={2}>
          {step > 0 && <Button label="Back" onClick={() => setStep((s) => s - 1)} />}
          <Button
            label={isLast ? 'Create database' : 'Next'}
            variant="primary"
            onClick={goNext}
            isLoading={save.isPending}
            isDisabled={isLast && isDemo}
          />
        </HStack>
      </HStack>
    </VStack>
  )

  return (
    <Page width="wide">
      <PageHeader
        title="Add database"
        crumbs={[{ label: 'Databases', href: '/databases' }, { label: 'Add database' }]}
        actions={<Button label="Cancel" variant="ghost" href="/databases" />}
      />
      {isNarrow ? (
        <VStack gap={5}>
          {stepper}
          {content}
        </VStack>
      ) : (
        <HStack gap={8} vAlign="start">
          <StackItem size="static" style={{ width: 230 }}>
            {stepper}
          </StackItem>
          <StackItem size="fill" style={{ minWidth: 0, maxWidth: 760 }}>
            {content}
          </StackItem>
        </HStack>
      )}
    </Page>
  )
}
