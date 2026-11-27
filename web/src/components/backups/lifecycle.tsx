// Lifecycle presentation shared by backup and restore detail pages:
// stage stepper, failure explanation and the execution log.
import { useEffect, useRef, type ReactNode } from 'react'
import { Stepper, Step } from '@astryxdesign/core/Stepper'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Layout'
import type { BackupStage, BackupStatus, JobEvent } from '@/lib/api/types'
import { STAGE_LABEL, errorCodeLabel, timeOnly, dateTimeSeconds } from '@/lib/format'
import { Empty } from '@/components/states'
import { CircleSlash, XCircle } from 'lucide-react'

export type JobKind = 'backup' | 'restore'

const BACKUP_STAGES: BackupStage[] = ['queued', 'preparing', 'dumping', 'uploading', 'verifying']
const RESTORE_STAGES: BackupStage[] = ['queued', 'preparing', 'downloading', 'restoring']

function stageIndex(stages: BackupStage[], stage?: string): number {
  if (!stage) return -1
  if (stage === 'waiting_for_agent') return 0
  return stages.indexOf(stage as BackupStage)
}

/**
 * Stage stepper derived from the job status, its current stage and the stage
 * field of its events. No percentages: only which stage is current, done or failed.
 */
export function LifecycleStepper({
  kind,
  status,
  stage,
  events,
}: {
  kind: JobKind
  status: BackupStatus
  stage?: BackupStage
  events: JobEvent[] | undefined
}) {
  const stages = kind === 'backup' ? BACKUP_STAGES : RESTORE_STAGES
  const waited = stage === 'waiting_for_agent' || !!events?.some((e) => e.stage === 'waiting_for_agent')
  // Furthest stage reached according to the log (events are chronological).
  let reached = -1
  for (const e of events ?? []) reached = Math.max(reached, stageIndex(stages, e.stage))
  const live = status === 'pending' || status === 'running'
  // A finished job keeps the stage it stopped in; use it when the log is
  // missing (e.g. pruned events) so a failure is not blamed on "Queued".
  const current = live ? Math.max(stageIndex(stages, stage), reached, 0) : Math.max(stageIndex(stages, stage), reached)

  const labels = stages.map((s) => (s === 'queued' && waited ? 'Queued / waiting for agent' : STAGE_LABEL[s as Exclude<BackupStage, ''>]))
  const doneLabel = kind === 'backup' ? 'Completed' : 'Restored'
  const all = [...labels, doneLabel]

  let active: number
  let statusAt: { index: number; status: 'accent' | 'error' | 'warning' | 'success' } | null = null
  if (status === 'success' || status === 'deleted') {
    active = all.length - 1
    statusAt = { index: all.length - 1, status: 'success' }
  } else if (live) {
    active = current
    statusAt = { index: current, status: stage === 'waiting_for_agent' ? 'warning' : 'accent' }
  } else {
    // failed / cancelled: stop where the job stopped
    active = Math.max(current, 0)
    statusAt = { index: active, status: status === 'failed' ? 'error' : 'warning' }
  }

  const description = (i: number): string | undefined => {
    if (!statusAt || statusAt.index !== i) return undefined
    if (status === 'failed') return 'Failed here'
    if (status === 'cancelled') return 'Cancelled here'
    if (live) return stage === 'waiting_for_agent' ? 'Waiting for agent' : 'In progress'
    if (status === 'deleted') return 'Artifact expired'
    return undefined
  }

  return (
    <Stepper activeStep={active} density="compact" label={`${kind === 'backup' ? 'Backup' : 'Restore'} lifecycle`}>
      {all.map((label, i) => (
        <Step
          key={label}
          step={i}
          label={label}
          description={description(i)}
          status={statusAt && statusAt.index === i ? statusAt.status : i < active ? 'success' : undefined}
          indicator={
            statusAt?.index === i && status === 'failed' ? (
              <XCircle size={16} aria-hidden style={{ color: 'var(--color-text-error)' }} />
            ) : statusAt?.index === i && status === 'cancelled' ? (
              <CircleSlash size={16} aria-hidden style={{ color: 'var(--color-text-warning)' }} />
            ) : undefined
          }
        />
      ))}
    </Stepper>
  )
}

/** Actionable next step per error code. */
function hintFor(code: string | undefined, ctx: { agentId?: string; kind: JobKind }): ReactNode {
  switch (code) {
    case 'auth_failed':
      return 'Check the username and password stored for this connection (or on the agent), then retry.'
    case 'host_unreachable':
      return 'The server running the job could not reach the database host. Check network rules and DNS, or run the job from an agent placed inside the database network.'
    case 'agent_unavailable':
    case 'agent_lost':
      return ctx.agentId ? (
        <>
          Check that the agent process is running and can reach DumpStation.{' '}
          <Link href={`/agents/${ctx.agentId}`}>Open the agent</Link>
        </>
      ) : (
        'Check that the agent process is running and can reach DumpStation on the Agents page.'
      )
    case 'version_mismatch':
      return 'Install PostgreSQL client tools (pg_dump / pg_restore) at least as new as the database server on the machine running the job.'
    case 'tool_missing':
      return 'Install the PostgreSQL client tools on the machine running the job.'
    case 'insufficient_disk':
      return 'Free up temporary disk space on the machine running the job (or point its temp directory at a larger volume).'
    case 'upload_failed':
    case 'download_failed':
    case 'storage_error':
      return (
        <>
          Verify the storage destination credentials and bucket. <Link href="/storage">Test storage</Link>
        </>
      )
    case 'permission_denied':
      return ctx.kind === 'restore'
        ? 'The target user lacks privileges to create or replace objects. Use an owner or superuser role.'
        : 'Grant the backup user read access to every schema and table (or use the database owner).'
    case 'database_not_found':
      return 'Check the database name; it must exist before the job runs.'
    case 'ssl_error':
      return 'Check the server SSL configuration and the connection SSL settings.'
    case 'timeout':
      return 'The job exceeded the execution timeout. Check database load or raise the server job timeout.'
    case 'restore_failed':
      return 'pg_restore reported errors. Objects that already exist commonly cause this; restore into an empty database or enable “Drop existing objects”.'
    default:
      return undefined
  }
}

/** Failure banner: label for the error code, first line as title, rest as detail. */
export function FailureExplanation({
  code,
  message,
  agentId,
  kind,
}: {
  code?: string
  message?: string
  agentId?: string
  kind: JobKind
}) {
  if (!code && !message) return null
  const [first, ...rest] = (message ?? '').split('\n')
  const label = errorCodeLabel(code)
  const title = label || first || 'Failed'
  const detail = (label && first && first !== label ? [first, ...rest] : rest).join('\n').trim()
  const hint = hintFor(code, { agentId, kind })
  return (
    <Banner status="error" title={title} description={hint} collapsible={false}>
      {detail ? (
        <pre className="ds-mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflow: 'auto', fontSize: 'var(--font-size-sm, 0.8125rem)' }}>
          {detail}
        </pre>
      ) : null}
    </Banner>
  )
}

/** The job execution log (server + agent events). Keeps the newest line in view while live. */
export function ExecutionLog({ events, live, isLoading }: { events: JobEvent[] | undefined; live: boolean; isLoading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const count = events?.length ?? 0
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [count, live])
  if (isLoading) return <Text color="secondary">Loading log…</Text>
  if (!events || events.length === 0)
    return <Empty title="No log entries yet" description={live ? 'Entries appear here as the job runs.' : 'This job did not record any events.'} />
  return (
    <VStack gap={0}>
      <div ref={ref} style={{ maxHeight: 420, overflow: 'auto' }} role="log" aria-live={live ? 'polite' : 'off'} aria-label="Execution log">
        <ol className="ds-log">
          {events.map((e) => (
            <li key={e.id}>
              <span className="ds-log-time" title={dateTimeSeconds(e.created_at)}>
                {timeOnly(e.created_at)}
              </span>
              <span className="ds-log-src">{e.source}</span>
              <span className={e.level === 'info' ? undefined : `is-${e.level}`}>{e.message}</span>
            </li>
          ))}
        </ol>
      </div>
    </VStack>
  )
}
