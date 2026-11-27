// Table of restore jobs, used by the restores page and the backup detail page.
import { useMemo, type ReactNode } from 'react'
import { Table } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { RotateCcw } from 'lucide-react'
import { When } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, FailureCause } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { restoreTargetLabel } from '@/components/restore/describe'
import type { RestoreJob } from '@/lib/api/types'
import { duration, shortId, toDate } from '@/lib/format'

type Row = RestoreJob & Record<string, unknown>

export function restoreDurationMs(r: RestoreJob): number | undefined {
  const s = toDate(r.started_at)
  const e = toDate(r.completed_at)
  return s && e ? e.getTime() - s.getTime() : undefined
}

export function RestoreList({
  query,
  rows,
  compact,
  empty,
}: {
  query: { isLoading: boolean; error: unknown; data: RestoreJob[] | undefined; refetch: () => unknown }
  rows?: RestoreJob[]
  compact?: boolean
  empty?: { title: string; description?: string; actions?: ReactNode }
}) {
  const columns = useMemo<TableColumn<Row>[]>(() => {
    const cols: TableColumn<Row>[] = [
      {
        key: 'id',
        header: 'Restore',
        width: { type: 'proportional', value: 1.3, minWidth: 130 },
        renderCell: (r) => (
          <VStack gap={0}>
            <Link href={`/restores/${r.id}`}>
              <Text weight="medium" className="ds-mono">
                {shortId(r.id)}
              </Text>
            </Link>
            <Text type="supporting" color="secondary">
              <When value={r.started_at} />
            </Text>
          </VStack>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: { type: 'proportional', value: 1.8, minWidth: 180 },
        renderCell: (r) => (
          <VStack gap={0.5} hAlign="start">
            <BackupStatusBadge status={r.status} stage={r.stage} />
            {r.status === 'failed' && <FailureCause code={r.error_code} message={r.error_message} />}
          </VStack>
        ),
      },
    ]
    if (!compact)
      cols.push({
        key: 'backup',
        header: 'Source backup',
        width: { type: 'proportional', value: 1.7, minWidth: 170 },
        renderCell: (r) => (
          <VStack gap={0}>
            <Link href={`/backups/${r.backup_id}`}>{r.backup_name ?? shortId(r.backup_id)}</Link>
            {r.database_name && (
              <Text type="supporting" color="secondary">
                {r.database_name}
              </Text>
            )}
          </VStack>
        ),
      })
    cols.push(
      {
        key: 'target',
        header: 'Target',
        width: { type: 'proportional', value: 1.8, minWidth: 180 },
        renderCell: (r) =>
          r.target !== 'custom' && r.target_database_id ? (
            <Link href={`/databases/${r.target_database_id}`}>{restoreTargetLabel(r)}</Link>
          ) : (
            <Text className={r.agent_connection ? undefined : 'ds-mono'}>{restoreTargetLabel(r)}</Text>
          ),
      },
      {
        key: 'executor',
        header: 'Executor',
        width: { type: 'proportional', value: 1.6, minWidth: 160 },
        renderCell: (r) => <ExecutorLabel mode={r.executor} agentName={r.agent_name} />,
      },
      {
        key: 'clean',
        header: 'Clean',
        width: { type: 'proportional', value: 0.9, minWidth: 90 },
        renderCell: (r) => (r.clean_target ? <Badge variant="warning" label="--clean" /> : <Text color="secondary">No</Text>),
      },
      {
        key: 'duration',
        header: 'Duration',
        align: 'end',
        width: { type: 'proportional', value: 0.9, minWidth: 90 },
        renderCell: (r) => <Text hasTabularNumbers>{duration(restoreDurationMs(r))}</Text>,
      },
    )
    return cols
  }, [compact])

  if (query.isLoading) return <TableSkeleton rows={compact ? 3 : 8} />
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load restores" />
  const data = (rows ?? query.data ?? []) as Row[]
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: compact ? 800 : 1060 }}>
        <Table<Row>
          data={data}
          columns={columns}
          idKey="id"
          density="compact"
          hasHover
          verticalAlign="middle"
          emptyState={<Empty title={empty?.title ?? 'No restores'} description={empty?.description} icon={<RotateCcw size={20} />} actions={empty?.actions} />}
        />
      </div>
    </div>
  )
}
