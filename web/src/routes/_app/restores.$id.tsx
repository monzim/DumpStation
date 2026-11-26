import { createFileRoute } from '@tanstack/react-router'
import { HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { CopyValue, Facts, Panel } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel } from '@/components/status'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { ExecutionLog, FailureExplanation, LifecycleStepper } from '@/components/backups/lifecycle'
import { restoreDurationMs } from '@/components/backups/RestoreList'
import { TARGET_KIND_LABEL, restoreTargetLabel } from '@/components/restore/describe'
import { useRestore, useRestoreEvents, isTerminal } from '@/lib/api/hooks'
import type { RestoreJob } from '@/lib/api/types'
import { dateTimeSeconds, duration, shortId } from '@/lib/format'
import { ApiError } from '@/lib/api/client'

export const Route = createFileRoute('/_app/restores/$id')({ component: RestoreDetailPage })

function RestoreDetailPage() {
  const { id } = Route.useParams()
  const restore = useRestore(id)
  if (restore.isLoading)
    return (
      <Page>
        <BlockSkeleton height={64} />
        <BlockSkeleton height={96} />
        <BlockSkeleton height={320} />
      </Page>
    )
  if (restore.error || !restore.data) {
    const notFound = restore.error instanceof ApiError && restore.error.status === 404
    return (
      <Page>
        <PageHeader title="Restore" crumbs={[{ label: 'Restores', href: '/restores' }, { label: 'Not found' }]} />
        {notFound ? (
          <Banner status="warning" title="Restore not found" endContent={<Button label="All restores" size="sm" href="/restores" />} />
        ) : (
          <ErrorState error={restore.error} onRetry={() => restore.refetch()} title="Could not load this restore" />
        )}
      </Page>
    )
  }
  return <RestoreDetail r={restore.data} />
}

function RestoreDetail({ r }: { r: RestoreJob }) {
  const live = !isTerminal(r.status)
  const events = useRestoreEvents(r.id, live)
  const title = `Restore ${shortId(r.id)}`
  return (
    <Page>
      <PageHeader
        title={title}
        crumbs={[{ label: 'Restores', href: '/restores' }, { label: title }]}
        meta={
          <HStack gap={3} vAlign="center" wrap="wrap">
            <BackupStatusBadge status={r.status} stage={r.stage} />
            <Text type="supporting" color="secondary">
              From <Link href={`/backups/${r.backup_id}`}>{r.backup_name ?? shortId(r.backup_id)}</Link>
            </Text>
            <ExecutorLabel mode={r.executor} agentName={r.agent_name} />
            {r.clean_target && <Badge variant="warning" label="Dropped existing objects (--clean)" />}
          </HStack>
        }
      />

      <Panel title="Lifecycle" description={live ? 'Updates live while the restore runs.' : undefined}>
        <LifecycleStepper kind="restore" status={r.status} stage={r.stage} events={events.data} />
      </Panel>

      {r.status === 'failed' && <FailureExplanation kind="restore" code={r.error_code} message={r.error_message} agentId={r.agent_id} />}
      {r.status === 'success' && <Banner status="success" title="Restore completed" description={r.target === 'custom' && !r.agent_connection ? 'The backup was restored into the custom target.' : `The backup was restored into ${restoreTargetLabel(r)}.`} />}

      <Grid columns={{ minWidth: 420, max: 2 }} gap={5}>
        <Panel title="Source and target">
          <Facts
            items={[
              { label: 'Restore ID', value: <CopyValue value={r.id} label="Copy ID" /> },
              { label: 'Source backup', value: <Link href={`/backups/${r.backup_id}`}>{r.backup_name ?? r.backup_id}</Link> },
              { label: 'Source database', value: r.database_id ? <Link href={`/databases/${r.database_id}`}>{r.database_name ?? 'Database'}</Link> : r.database_name ?? '—' },
              { label: 'Target type', value: TARGET_KIND_LABEL[r.target] },
              {
                label: 'Target',
                value:
                  r.target !== 'custom' && r.target_database_id ? (
                    <Link href={`/databases/${r.target_database_id}`}>{restoreTargetLabel(r)}</Link>
                  ) : (
                    <Text className={r.agent_connection ? undefined : 'ds-mono'}>{restoreTargetLabel(r)}</Text>
                  ),
              },
              { label: 'Drop existing', value: r.clean_target ? 'Yes (--clean --if-exists)' : 'No' },
            ]}
          />
        </Panel>
        <Panel title="Execution">
          <Facts
            items={[
              {
                label: 'Executor',
                value: (
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <ExecutorLabel mode={r.executor} agentName={r.agent_name} />
                    {r.agent_id && <Link href={`/agents/${r.agent_id}`}>View agent</Link>}
                  </HStack>
                ),
              },
              ...(r.agent_connection ? [{ label: 'Agent connection', value: <span className="ds-mono">{r.agent_connection}</span> }] : []),
              { label: 'Started', value: dateTimeSeconds(r.started_at) },
              { label: 'Completed', value: dateTimeSeconds(r.completed_at) },
              { label: 'Duration', value: live ? 'Running…' : duration(restoreDurationMs(r)) },
            ]}
          />
        </Panel>
      </Grid>

      <Panel title="Execution log" description={live ? 'Live: new entries appear as the restore progresses.' : `${events.data?.length ?? 0} entries from the server and agent.`} padding={3}>
        {events.error && !events.data ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} title="Could not load the log" />
        ) : (
          <ExecutionLog events={events.data} live={live} isLoading={events.isLoading} />
        )}
      </Panel>
    </Page>
  )
}
