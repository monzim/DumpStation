import { useMemo, useState } from 'react'
import { Table } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Archive } from 'lucide-react'
import { When } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, FailureCause } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useBackups } from '@/lib/api/hooks'
import type { Backup } from '@/lib/api/types'
import { bytes, duration } from '@/lib/format'
import { useSession } from '@/lib/auth/session'

type Row = Backup & Record<string, unknown>
const PAGE = 20

export function DetailBackups({ databaseId, onBackupNow }: { databaseId: string; onBackupNow?: () => void }) {
  const { isDemo } = useSession()
  const [page, setPage] = useState(1)
  const backups = useBackups({ database_id: databaseId, limit: PAGE, offset: (page - 1) * PAGE })
  const total = backups.data?.total ?? 0

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Backup',
        width: { type: 'proportional', value: 2, minWidth: 200 },
        renderCell: (b) => (
          <Link href={`/backups/${b.id}`}>
            <Text weight="medium">{b.name}</Text>
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: { type: 'proportional', value: 1.8, minWidth: 180 },
        renderCell: (b) => (
          <VStack gap={0.5} hAlign="start">
            <BackupStatusBadge status={b.status} stage={b.stage} />
            {b.status === 'failed' && <FailureCause code={b.error_code} message={b.error_message} />}
          </VStack>
        ),
      },
      {
        key: 'trigger',
        header: 'Trigger',
        width: { type: 'proportional', value: 1, minWidth: 100 },
        renderCell: (b) => <Text type="supporting">{b.trigger === 'manual' ? 'Manual' : 'Scheduled'}</Text>,
      },
      { key: 'started', header: 'Started', width: { type: 'proportional', value: 1.2, minWidth: 120 }, renderCell: (b) => <When value={b.run_started_at ?? b.timestamp} /> },
      {
        key: 'duration',
        header: 'Duration',
        align: 'end',
        width: { type: 'proportional', value: 0.9, minWidth: 90 },
        renderCell: (b) => <Text hasTabularNumbers>{duration(b.duration_ms)}</Text>,
      },
      {
        key: 'size',
        header: 'Size',
        align: 'end',
        width: { type: 'proportional', value: 0.9, minWidth: 90 },
        renderCell: (b) => <Text hasTabularNumbers>{bytes(b.size_bytes)}</Text>,
      },
      {
        key: 'executor',
        header: 'Executor',
        width: { type: 'proportional', value: 1.2, minWidth: 120 },
        renderCell: (b) => <ExecutorLabel mode={b.executor} agentName={b.agent_name} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'end',
        width: { type: 'proportional', value: 0.56, minWidth: 56 },
        renderCell: (b) => (
          <MoreMenu
            label={`Actions for ${b.name}`}
            alignment="end"
            items={[
              { label: 'View details', href: `/backups/${b.id}` },
              ...(b.restorable ? [{ label: 'Restore…', href: `/backups/${b.id}?restore=1`, isDisabled: isDemo }] : []),
            ]}
          />
        ),
      },
    ],
    [isDemo],
  )

  if (backups.error && !backups.data) return <ErrorState error={backups.error} onRetry={() => backups.refetch()} title="Could not load backups" />
  if (backups.isLoading) return <TableSkeleton rows={6} />
  if (total === 0)
    return (
      <Card>
        <Empty
          title="No backups yet"
          description="Backups appear here after the first scheduled or manual run."
          icon={<Archive size={20} />}
          actions={onBackupNow ? <Button label="Back up now" onClick={onBackupNow} isDisabled={isDemo} /> : undefined}
        />
      </Card>
    )

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Text type="supporting" color="secondary">
            {total.toLocaleString()} {total === 1 ? 'backup' : 'backups'}
          </Text>
        </StackItem>
        <Link href={`/backups?db=${databaseId}`} type="supporting">
          Open in Backups with filters
        </Link>
      </HStack>
      <Card padding={0}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 960 }}>
            <Table<Row>
              data={(backups.data?.items ?? []) as Row[]}
              columns={columns}
              idKey="id"
              density="compact"
              hasHover
              rowCount={total}
              rowIndexStart={(page - 1) * PAGE + 1}
            />
          </div>
        </div>
      </Card>
      {total > PAGE && <Pagination page={page} onChange={setPage} totalItems={total} pageSize={PAGE} variant="pages" size="sm" />}
    </VStack>
  )
}
