import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { Download, RotateCcw, Square } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, CopyValue, Facts, Panel, When, useNotify } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel } from '@/components/status'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { ExecutionLog, FailureExplanation, LifecycleStepper } from '@/components/backups/lifecycle'
import { DownloadDialog } from '@/components/backups/DownloadDialog'
import { RestoreList } from '@/components/backups/RestoreList'
import { RestoreDialog } from '@/components/restore'
import { useBackup, useBackupEvents, useCancelBackup, useRestores, isTerminal } from '@/lib/api/hooks'
import type { Backup } from '@/lib/api/types'
import { bytes, dateTimeSeconds, duration } from '@/lib/format'
import { useSession } from '@/lib/auth/session'
import { ApiError } from '@/lib/api/client'

export const Route = createFileRoute('/_app/backups/$id')({
  validateSearch: (s: Record<string, unknown>): { restore?: 1 } => (s.restore === 1 || s.restore === '1' || s.restore === true ? { restore: 1 } : {}),
  component: BackupDetailPage,
})

function BackupDetailPage() {
  const { id } = Route.useParams()
  const backup = useBackup(id)

  if (backup.isLoading)
    return (
      <Page>
        <BlockSkeleton height={64} />
        <BlockSkeleton height={96} />
        <BlockSkeleton height={320} />
      </Page>
    )
  if (backup.error || !backup.data) {
    const notFound = backup.error instanceof ApiError && backup.error.status === 404
    return (
      <Page>
        <PageHeader title="Backup" crumbs={[{ label: 'Backups', href: '/backups' }, { label: 'Not found' }]} />
        {notFound ? (
          <Banner status="warning" title="Backup not found" description="It may have been deleted, or it belongs to another account." endContent={<Button label="All backups" size="sm" href="/backups" />} />
        ) : (
          <ErrorState error={backup.error} onRetry={() => backup.refetch()} title="Could not load this backup" />
        )}
      </Page>
    )
  }
  return <BackupDetail b={backup.data} />
}

function BackupDetail({ b }: { b: Backup }) {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const notify = useNotify()
  const live = !isTerminal(b.status)
  const events = useBackupEvents(b.id, live)
  const restores = useRestores({ backup_id: b.id })
  const cancel = useCancelBackup()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const setRestoreOpen = (open: boolean) => navigate({ search: open ? { restore: 1 } : {}, replace: !open })

  return (
    <Page>
      <PageHeader
        title={b.name}
        crumbs={[{ label: 'Backups', href: '/backups' }, { label: b.name }]}
        meta={
          <HStack gap={3} vAlign="center" wrap="wrap">
            <BackupStatusBadge status={b.status} stage={b.stage} />
            <Text type="supporting" color="secondary">
              Database <Link href={`/databases/${b.database_id}`}>{b.database_name}</Link>
            </Text>
            <ExecutorLabel mode={b.executor} agentName={b.agent_name} />
            <Text type="supporting" color="secondary">
              {b.trigger === 'scheduled' ? 'Scheduled run' : 'Manual run'}
            </Text>
          </HStack>
        }
        actions={
          <>
            {live && (
              <Button
                label={b.cancel_requested ? 'Cancelling…' : 'Cancel backup'}
                icon={<Square size={14} />}
                isDisabled={isDemo || b.cancel_requested}
                tooltip={isDemo ? 'Demo accounts are read-only' : undefined}
                onClick={() => setConfirmCancel(true)}
              />
            )}
            {b.restorable && (
              <>
                <Button label="Download" icon={<Download size={16} />} isDisabled={isDemo} tooltip={isDemo ? 'Demo accounts are read-only' : undefined} onClick={() => setDownloadOpen(true)} />
                <Button label="Restore…" variant="primary" icon={<RotateCcw size={16} />} isDisabled={isDemo} tooltip={isDemo ? 'Demo accounts are read-only' : undefined} onClick={() => setRestoreOpen(true)} />
              </>
            )}
          </>
        }
      />

      <Panel title="Lifecycle" description={live ? 'Updates live while the backup runs.' : undefined}>
        <LifecycleStepper kind="backup" status={b.status} stage={b.stage} events={events.data} />
      </Panel>

      {b.status === 'failed' && <FailureExplanation kind="backup" code={b.error_code} message={b.error_message} agentId={b.agent_id} />}
      {b.status === 'deleted' && (
        <Banner status="info" title="Artifact expired" description="The retention policy removed this backup's artifact from storage. Its record and log are kept for history." />
      )}

      <Grid columns={{ minWidth: 420, max: 2 }} gap={5}>
        <Panel title="Details">
          <Facts
            items={[
              { label: 'Backup ID', value: <CopyValue value={b.id} label="Copy ID" /> },
              { label: 'Database', value: <Link href={`/databases/${b.database_id}`}>{b.database_name}</Link> },
              { label: 'Queued', value: <Text>{dateTimeSeconds(b.timestamp)}</Text> },
              { label: 'Run started', value: <Text>{dateTimeSeconds(b.run_started_at)}</Text> },
              { label: 'Completed', value: <Text>{dateTimeSeconds(b.completed_at)}</Text> },
              { label: 'Duration', value: duration(b.duration_ms) },
              { label: 'Size', value: bytes(b.size_bytes) },
              { label: 'Format', value: b.dump_format === 'custom' ? 'Custom (pg_dump -Fc)' : 'Plain SQL' },
              { label: 'PostgreSQL', value: b.postgres_version || '—' },
              {
                label: 'SHA-256',
                value: b.checksum_sha256 ? <CopyValue value={b.checksum_sha256} label="Copy checksum" display={`${b.checksum_sha256.slice(0, 16)}…${b.checksum_sha256.slice(-8)}`} /> : '—',
              },
            ]}
          />
        </Panel>
        <Panel title="Execution & storage">
          <Facts
            items={[
              {
                label: 'Executor',
                value: (
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <ExecutorLabel mode={b.executor} agentName={b.agent_name} />
                    {b.agent_id && <Link href={`/agents/${b.agent_id}`}>View agent</Link>}
                  </HStack>
                ),
              },
              ...(b.executor === 'agent' ? [{ label: 'Attempts', value: b.agent_attempts ? String(b.agent_attempts) : '—' }] : []),
              { label: 'Trigger', value: b.trigger === 'scheduled' ? 'Scheduled' : 'Manual' },
              {
                label: 'Storage',
                value: b.storage_id ? <Link href="/storage">{b.storage_name ?? 'Storage destination'}</Link> : <Text color="secondary">—</Text>,
              },
              { label: 'Object key', value: b.storage_path ? <CopyValue value={b.storage_path} label="Copy object key" /> : <Text color="secondary">Not uploaded</Text> },
              { label: 'Restorable', value: b.restorable ? 'Yes' : 'No' },
              { label: 'Started', value: <When value={b.run_started_at ?? b.timestamp} /> },
            ]}
          />
        </Panel>
      </Grid>

      <Panel title="Execution log" description={live ? 'Live: new entries appear as the job progresses.' : `${events.data?.length ?? 0} entries from the server and agent.`} padding={3}>
        {events.error && !events.data ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} title="Could not load the log" />
        ) : (
          <ExecutionLog events={events.data} live={live} isLoading={events.isLoading} />
        )}
      </Panel>

      <Panel title="Restores of this backup" padding={0}>
        <RestoreList
          query={restores}
          compact
          empty={
            b.restorable
              ? { title: 'Not restored yet', description: 'Use Restore… to copy this backup into a database.' }
              : { title: 'No restores', description: 'Only completed backups can be restored.' }
          }
        />
      </Panel>

      {b.restorable && <RestoreDialog backup={b} isOpen={!!search.restore && !isDemo} onOpenChange={setRestoreOpen} />}
      <DownloadDialog backup={b} isOpen={downloadOpen} onOpenChange={setDownloadOpen} />
      <ConfirmDialog
        isOpen={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel backup?"
        description={`The running backup of ${b.database_name} will be stopped and any partial artifact discarded.`}
        actionLabel="Cancel backup"
        isLoading={cancel.isPending}
        error={cancel.error}
        onConfirm={() =>
          cancel.mutate(b.id, {
            onSuccess: () => {
              notify.success('Cancellation requested')
              setConfirmCancel(false)
            },
          })
        }
      />
    </Page>
  )
}
