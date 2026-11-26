import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, useTableSortable } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Archive, FilterX } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, When, useNotify } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, FailureCause } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { JobsTabs } from '@/components/backups/JobsTabs'
import { DownloadDialog } from '@/components/backups/DownloadDialog'
import { PAGE_SIZES, STATUS_FILTERS, hasFilters, parseBackupSearch, type BackupSearch } from '@/components/backups/filters'
import { useAgents, useBackups, useCancelBackup, useDatabases, isTerminal } from '@/lib/api/hooks'
import type { Backup, BackupListQuery } from '@/lib/api/types'
import { bytes, duration, shortId } from '@/lib/format'
import { useSession } from '@/lib/auth/session'

export const Route = createFileRoute('/_app/backups/')({
  validateSearch: (s: Record<string, unknown>): BackupSearch => parseBackupSearch(s),
  component: BackupsPage,
})

type Row = Backup & Record<string, unknown>

const SORT_KEY: Record<string, string> = { started: 'started_at', size: 'size', duration: 'duration' }

function BackupsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const notify = useNotify()
  const pageSize = search.size ?? 25
  const page = search.page ?? 1

  const setSearch = (patch: Partial<BackupSearch>, keepPage = false) =>
    navigate({ search: (prev) => parseBackupSearch({ ...prev, ...patch, ...(keepPage ? {} : { page: undefined }) }), replace: true })

  // Debounced free-text search.
  const [q, setQ] = useState(search.q ?? '')
  useEffect(() => setQ(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === q.trim()) return
    const t = setTimeout(() => setSearch({ q: q.trim() || undefined }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const query: BackupListQuery = {
    q: search.q,
    database_id: search.db,
    status: search.status,
    executor: search.executor,
    agent_id: search.agent,
    trigger: search.trigger,
    from: search.from,
    to: search.to,
    sort: search.sort,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }
  const backups = useBackups(query)
  const databases = useDatabases()
  const agents = useAgents()
  const cancel = useCancelBackup()

  const [downloadOf, setDownloadOf] = useState<Backup | null>(null)
  const [cancelOf, setCancelOf] = useState<Backup | null>(null)

  // Sort state <-> URL.
  const sortParam = search.sort ?? '-started_at'
  const sortField = sortParam.replace(/^-/, '')
  const sortCol = Object.entries(SORT_KEY).find(([, v]) => v === sortField)?.[0] ?? 'started'
  const sort = useTableSortable<Row>({
    sort: [{ sortKey: sortCol, direction: sortParam.startsWith('-') ? 'descending' : 'ascending' }],
    onSortChange: (s) => {
      const e = s[0]
      if (!e) return setSearch({ sort: undefined }, true)
      const field = SORT_KEY[e.sortKey] ?? 'started_at'
      setSearch({ sort: (e.direction === 'descending' ? '-' : '') + field }, true)
    },
    allowUnsortedState: false,
  })

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Backup',
        width: { type: 'proportional', value: 2, minWidth: 170 },
        renderCell: (b) => (
          <VStack gap={0}>
            <Link href={`/backups/${b.id}`}>
              <Text weight="medium">{b.name}</Text>
            </Link>
            <Text type="supporting" color="secondary" className="ds-mono">
              {shortId(b.id)}
            </Text>
          </VStack>
        ),
      },
      {
        key: 'database',
        header: 'Database',
        width: { type: 'proportional', value: 1.2, minWidth: 120 },
        renderCell: (b) => <Link href={`/databases/${b.database_id}`}>{b.database_name}</Link>,
      },
      {
        key: 'status',
        header: 'Status',
        width: { type: 'pixel', value: 190 },
        renderCell: (b) => (
          <VStack gap={0.5} hAlign="start">
            <BackupStatusBadge status={b.status} stage={b.stage} />
            {b.status === 'failed' && <FailureCause code={b.error_code} message={b.error_message} />}
          </VStack>
        ),
      },
      {
        key: 'executor',
        header: 'Executor',
        width: { type: 'proportional', value: 1.3, minWidth: 160 },
        renderCell: (b) => <ExecutorLabel mode={b.executor} agentName={b.agent_name} />,
      },
      { key: 'started', header: 'Started', sortable: true, width: { type: 'pixel', value: 115 }, renderCell: (b) => <When value={b.run_started_at ?? b.timestamp} /> },
      {
        key: 'duration',
        header: 'Duration',
        sortable: true,
        align: 'end',
        width: { type: 'pixel', value: 100 },
        renderCell: (b) => <Text hasTabularNumbers>{duration(b.duration_ms)}</Text>,
      },
      {
        key: 'size',
        header: 'Size',
        sortable: true,
        align: 'end',
        width: { type: 'pixel', value: 90 },
        renderCell: (b) => <Text hasTabularNumbers>{bytes(b.size_bytes)}</Text>,
      },
      {
        key: 'storage',
        header: 'Storage',
        width: { type: 'proportional', value: 1, minWidth: 90 },
        renderCell: (b) => <Text color={b.storage_name ? undefined : 'secondary'}>{b.storage_name ?? '—'}</Text>,
      },
      {
        key: 'actions',
        header: '',
        align: 'end',
        width: { type: 'pixel', value: 56 },
        renderCell: (b) => {
          const active = !isTerminal(b.status)
          return (
            <MoreMenu
              label={`Actions for ${b.name}`}
              alignment="end"
              items={[
                { label: 'View details', href: `/backups/${b.id}` },
                ...(b.restorable
                  ? [
                      { label: 'Restore…', isDisabled: isDemo, onClick: () => navigate({ to: '/backups/$id', params: { id: b.id }, search: { restore: 1 } }) },
                      { label: 'Download', isDisabled: isDemo, onClick: () => setDownloadOf(b) },
                    ]
                  : []),
                ...(active ? [{ type: 'divider' as const }, { label: 'Cancel backup', variant: 'destructive' as const, isDisabled: isDemo || b.cancel_requested, onClick: () => setCancelOf(b) }] : []),
              ]}
            />
          )
        },
      },
    ],
    [isDemo, navigate],
  )

  const statusValue = search.status ? search.status.split(',') : []
  const range: DateRange | null = search.from && search.to ? ({ start: search.from, end: search.to } as DateRange) : null
  const data = (backups.data?.items ?? []) as Row[]
  const total = backups.data?.total ?? 0
  const filtered = hasFilters(search)

  const dbOptions = (databases.data ?? []).map((d) => ({ value: d.id, label: d.name })).sort((a, b) => a.label.localeCompare(b.label))
  const agentOptions = (agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))

  return (
    <Page>
      <PageHeader title="Backups" description="Every backup run across your databases, newest first. Filters are kept in the URL." />
      <JobsTabs value="backups" />

      <VStack gap={3}>
        <HStack gap={2} wrap="wrap" vAlign="end">
          <StackItem size="fill" style={{ minWidth: 220 }}>
            <TextInput label="Search" isLabelHidden startIcon="search" placeholder="Search name, database or ID" value={q} onChange={setQ} hasClear size="sm" />
          </StackItem>
          <Selector
            label="Database"
            isLabelHidden
            placeholder="All databases"
            size="sm"
            width={170}
            hasSearch
            hasClear
            value={search.db ?? null}
            onChange={(v) => setSearch({ db: v ?? undefined })}
            options={dbOptions}
            isLoading={databases.isLoading}
          />
          <MultiSelector
            label="Status"
            isLabelHidden
            placeholder="Any status"
            size="sm"
            width={160}
            value={statusValue}
            onChange={(v) => setSearch({ status: v.length ? v.join(',') : undefined })}
            options={STATUS_FILTERS}
            formatValue={(items) => (items.length === 1 ? items[0].label : `${items.length} statuses`)}
            hasClear
          />
          <Selector
            label="Execution"
            isLabelHidden
            placeholder="Direct or agent"
            size="sm"
            width={150}
            hasClear
            value={search.executor ?? null}
            onChange={(v) => setSearch({ executor: (v as BackupSearch['executor']) ?? undefined })}
            options={[
              { value: 'direct', label: 'Direct' },
              { value: 'agent', label: 'Agent' },
            ]}
          />
          <Selector
            label="Agent"
            isLabelHidden
            placeholder="Any agent"
            size="sm"
            width={150}
            hasClear
            value={search.agent ?? null}
            onChange={(v) => setSearch({ agent: v ?? undefined })}
            options={agentOptions}
            emptyText="No agents"
            isLoading={agents.isLoading}
          />
          <Selector
            label="Trigger"
            isLabelHidden
            placeholder="Any trigger"
            size="sm"
            width={140}
            hasClear
            value={search.trigger ?? null}
            onChange={(v) => setSearch({ trigger: (v as BackupSearch['trigger']) ?? undefined })}
            options={[
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
          <DateRangeInput
            label="Date range"
            isLabelHidden
            size="sm"
            value={range}
            onChange={(r) => setSearch({ from: r?.start, to: r?.end })}
          />
        </HStack>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <Text type="supporting" color="secondary" aria-live="polite">
              {backups.isLoading
                ? 'Loading…'
                : `${total.toLocaleString()} ${total === 1 ? 'backup' : 'backups'}${filtered ? ' match these filters' : ''}${backups.isFetching && !backups.isLoading ? ' · refreshing' : ''}`}
            </Text>
          </StackItem>
          {filtered && (
            <Button
              label="Clear filters"
              size="sm"
              variant="ghost"
              icon={<FilterX size={14} />}
              onClick={() => {
                setQ('')
                navigate({ search: { sort: search.sort, size: search.size }, replace: true })
              }}
            />
          )}
        </HStack>

        {backups.error && !backups.data ? (
          <ErrorState error={backups.error} onRetry={() => backups.refetch()} title="Could not load backups" />
        ) : backups.isLoading ? (
          <TableSkeleton rows={8} />
        ) : (
          <Card padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1060 }}>
                <Table<Row>
                  data={data}
                  columns={columns}
                  idKey="id"
                  density="compact"
                  hasHover
                  verticalAlign="middle"
                  plugins={{ sort }}
                  rowCount={total}
                  rowIndexStart={(page - 1) * pageSize}
                  emptyState={
                    filtered ? (
                      <Empty
                        title="No backups match these filters"
                        description="Try a wider date range or fewer filters."
                        icon={<FilterX size={20} />}
                        actions={<Button label="Clear filters" size="sm" onClick={() => navigate({ search: {}, replace: true })} />}
                      />
                    ) : (
                      <Empty
                        title="No backups yet"
                        description="Backups appear here once a database runs on its schedule or you start one manually."
                        icon={<Archive size={20} />}
                        actions={<Button label="Go to databases" size="sm" href="/databases" />}
                      />
                    )
                  }
                />
              </div>
            </div>
          </Card>
        )}

        {total > 0 && (
          <HStack gap={3} vAlign="center" hAlign="end" wrap="wrap">
            <Pagination
              page={page}
              onChange={(p) => setSearch({ page: p }, true)}
              totalItems={total}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(s) => setSearch({ size: s })}
              size="sm"
            />
          </HStack>
        )}
      </VStack>

      {downloadOf && <DownloadDialog backup={downloadOf} isOpen onOpenChange={(o) => !o && setDownloadOf(null)} />}
      <ConfirmDialog
        isOpen={!!cancelOf}
        onOpenChange={(o) => !o && setCancelOf(null)}
        title="Cancel backup?"
        description={cancelOf ? `“${cancelOf.name}” of ${cancelOf.database_name} will be stopped. Partial artifacts are discarded.` : ''}
        actionLabel="Cancel backup"
        isLoading={cancel.isPending}
        error={cancel.error}
        onConfirm={() =>
          cancelOf &&
          cancel.mutate(cancelOf.id, {
            onSuccess: () => {
              notify.success('Cancellation requested')
              setCancelOf(null)
            },
          })
        }
      />
    </Page>
  )
}
