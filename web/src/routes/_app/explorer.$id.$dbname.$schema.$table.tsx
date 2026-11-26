import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, type TableColumn } from '@astryxdesign/core/Table'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Pagination } from '@astryxdesign/core/Pagination'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Eraser, KeyRound, RefreshCw } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, useNotify } from '@/components/common'
import { TableSkeleton, Empty } from '@/components/states'
import { useSession } from '@/lib/auth/session'
import { explorerPaths, useServer, useServerTableRows, useTruncateTable, type ServerColumn } from '@/components/explorer/api'
import { RemoteError, formatRowEstimate } from '@/components/explorer/parts'

const PAGE_SIZES = [25, 50, 100, 200]

export const Route = createFileRoute('/_app/explorer/$id/$dbname/$schema/$table')({
  validateSearch: (s: Record<string, unknown>): { offset?: number; limit?: number } => {
    const offset = Number(s.offset)
    const limit = Number(s.limit)
    return {
      offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : undefined,
      limit: PAGE_SIZES.includes(limit) ? limit : undefined,
    }
  },
  component: TablePage,
})

type Cell = Record<string, unknown> & { __i: number }

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <Text type="supporting" color="disabled" className="ds-mono" style={{ fontStyle: 'italic' }}>
        NULL
      </Text>
    )
  }
  let text: string
  if (typeof value === 'object') text = JSON.stringify(value)
  else text = String(value)
  const long = text.length > 80
  const node = (
    <Text className="ds-mono ds-nowrap" style={{ display: 'inline-block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
      {text === '' ? <Text color="disabled">(empty)</Text> : text}
    </Text>
  )
  return long ? <Tooltip content={<span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text.slice(0, 2000)}</span>}>{node}</Tooltip> : node
}

function ColumnHeader({ col }: { col: ServerColumn }) {
  return (
    <VStack gap={0}>
      <HStack gap={1} vAlign="center">
        {col.is_primary_key && <KeyRound size={12} aria-label="Primary key" />}
        <span className="ds-mono ds-nowrap">{col.name}</span>
      </HStack>
      <Text type="supporting" color="secondary" className="ds-nowrap">
        {col.data_type}
        {col.is_nullable ? '' : ' · not null'}
      </Text>
    </VStack>
  )
}

function TablePage() {
  const { id, dbname, schema, table } = Route.useParams()
  const search = Route.useSearch()
  const limit = search.limit ?? 50
  const offset = search.offset ?? 0
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const notify = useNotify()
  const server = useServer(id)
  const rows = useServerTableRows(id, dbname, schema, table, offset, limit)
  const truncate = useTruncateTable(id, dbname)
  const [truncOpen, setTruncOpen] = useState(false)
  const paths = explorerPaths(id)
  const qualified = `${schema}.${table}`

  const data = rows.data
  const cols = data?.columns ?? []
  const items = useMemo<Cell[]>(
    () =>
      (data?.rows ?? []).map((r, i) => {
        const o: Cell = { __i: offset + i }
        r.forEach((v, ci) => (o[`c${ci}`] = v))
        return o
      }),
    [data, offset],
  )
  const columns = useMemo<TableColumn<Cell>[]>(
    () => [
      {
        key: '__i',
        header: '#',
        width: { type: 'pixel', value: 56 },
        align: 'end',
        renderCell: (r) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {r.__i + 1}
          </Text>
        ),
      },
      ...cols.map<TableColumn<Cell>>((c, ci) => ({
        key: `c${ci}`,
        header: <ColumnHeader col={c} />,
        width: { type: 'proportional', value: 1, minWidth: 120 },
        renderCell: (r) => <CellValue value={r[`c${ci}`]} />,
      })),
    ],
    [cols],
  )

  const page = Math.floor(offset / limit) + 1
  const fetched = data?.rows?.length ?? 0
  const est = data?.estimated_total ?? 0
  // Estimates can be stale (or 0 for never-analyzed tables); a full page means there may be more.
  const hasMore = fetched === limit
  const seen = offset + fetched
  const estConsistent = hasMore ? est > seen : est === seen
  const totalItems = est > 0 && estConsistent ? est : !hasMore && seen > 0 ? seen : undefined

  const goto = (p: number, size = limit) =>
    navigate({ search: { offset: (p - 1) * size || undefined, limit: size === 50 ? undefined : size }, replace: false })

  return (
    <Page>
      <PageHeader
        title={<span className="ds-mono">{qualified}</span>}
        crumbs={[
          { label: 'DB Explorer', href: '/explorer' },
          { label: server.data?.name ?? 'Server', href: paths.server },
          { label: dbname, href: paths.db(dbname) },
          { label: qualified },
        ]}
        description={data ? `${cols.length} columns · about ${formatRowEstimate(est)} rows · ordered by primary key (or first column)` : undefined}
        actions={
          <>
            <Button label="Refresh" icon={<RefreshCw size={14} />} onClick={() => rows.refetch()} isLoading={rows.isFetching && !rows.isLoading} />
            <Button label="Truncate table" variant="destructive" icon={<Eraser size={14} />} onClick={() => setTruncOpen(true)} isDisabled={isDemo} />
          </>
        }
      />
      {rows.isLoading ? (
        <TableSkeleton rows={10} />
      ) : rows.error && !data ? (
        <RemoteError error={rows.error} onRetry={() => rows.refetch()} what="rows" />
      ) : (
        <VStack gap={3}>
          <Card padding={0} style={{ overflowX: 'auto', position: 'relative' }}>
            <Table<Cell>
              data={items}
              columns={columns}
              idKey="__i"
              density="compact"
              dividers="grid"
              verticalAlign="top"
              hasHover
              emptyState={<Empty title={offset > 0 ? 'No rows on this page' : 'This table is empty'} description={offset > 0 ? 'Go back to the first page.' : undefined} />}
            />
          </Card>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <HStack gap={2} vAlign="center">
                <Text type="supporting" color="secondary">
                  {fetched > 0 ? `Rows ${(offset + 1).toLocaleString()}–${(offset + fetched).toLocaleString()}` : 'No rows'}
                  {totalItems ? ` of about ${totalItems.toLocaleString()}` : ''}
                </Text>
                {rows.isFetching && <Spinner size="sm" label="Loading rows" />}
              </HStack>
            </StackItem>
            <Pagination
              page={page}
              onChange={(p) => goto(p)}
              pageSize={limit}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(s) => goto(1, s)}
              {...(totalItems ? { totalItems } : { hasMore })}
              variant="compact"
              size="sm"
            />
          </HStack>
        </VStack>
      )}
      <ConfirmDialog
        isOpen={truncOpen}
        onOpenChange={(o) => {
          setTruncOpen(o)
          if (!o) truncate.reset()
        }}
        title="Truncate table"
        description={
          <>
            This runs <span className="ds-mono">TRUNCATE TABLE {qualified}</span> on <strong>{dbname}</strong> and permanently deletes every row (about{' '}
            {formatRowEstimate(est)}). The table structure stays. This cannot be undone: the only way back is restoring a backup. PostgreSQL refuses if other tables
            reference this one.
          </>
        }
        confirmText={qualified}
        actionLabel="Delete all rows"
        isLoading={truncate.isPending}
        error={truncate.error}
        onConfirm={async () => {
          try {
            await truncate.mutateAsync({ schema, table })
            notify.success(`Truncated ${qualified}`)
            setTruncOpen(false)
            if (offset) goto(1)
          } catch {
            /* inline */
          }
        }}
      />
    </Page>
  )
}
