import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, proportional, pixel, useTableSortable, useTableSortableState, type TableColumn } from '@astryxdesign/core/Table'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Network, KeyRound, HardDriveDownload } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { TableSkeleton, Empty } from '@/components/states'
import { useSession } from '@/lib/auth/session'
import { bytes } from '@/lib/format'
import { explorerPaths, isMasked, useServer, useServerTables, type ServerTable } from '@/components/explorer/api'
import { MetaRow, RemoteError, formatRowEstimate } from '@/components/explorer/parts'
import { GrantDialog } from '@/components/explorer/AdminDialogs'

interface Row extends ServerTable {
  key: string
}

export const Route = createFileRoute('/_app/explorer/$id/$dbname/')({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({ q: typeof s.q === 'string' && s.q ? s.q : undefined }),
  component: DatabasePage,
})

function DatabasePage() {
  const { id, dbname } = Route.useParams()
  const { q = '' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const server = useServer(id)
  const tables = useServerTables(id, dbname)
  const [grantOpen, setGrantOpen] = useState(false)
  const paths = explorerPaths(id)

  const rows = useMemo<Row[]>(
    () =>
      (tables.data ?? [])
        .filter((t) => !q || `${t.schema}.${t.name}`.toLowerCase().includes(q.toLowerCase()))
        .map((t) => ({ ...t, key: `${t.schema}.${t.name}` })),
    [tables.data, q],
  )
  const { sortedData, sortConfig } = useTableSortableState<Row>({ data: rows, defaultSort: [{ sortKey: 'key', direction: 'ascending' }] })
  const sort = useTableSortable<Row>(sortConfig)

  const totals = useMemo(() => {
    const list = tables.data ?? []
    return { count: list.length, size: list.reduce((a, t) => a + (t.size_bytes || 0), 0), schemas: new Set(list.map((t) => t.schema)).size }
  }, [tables.data])

  const backupHref = useMemo(() => {
    const p = new URLSearchParams()
    const s = server.data
    // The API masks hosts; only pass a real one so the form is not prefilled with "***".
    if (s && !isMasked(s.host)) p.set('host', s.host)
    if (s) p.set('port', String(s.port))
    p.set('dbname', dbname)
    return `/databases/new?${p}`
  }, [server.data, dbname])

  const columns: TableColumn<Row>[] = [
    { key: 'schema', header: 'Schema', sortable: true, width: proportional(1, { minWidth: 100 }), renderCell: (t) => <Text className="ds-mono">{t.schema}</Text> },
    {
      key: 'key',
      header: 'Table',
      sortable: true,
      width: proportional(2, { minWidth: 180 }),
      renderCell: (t) => <Link href={paths.table(dbname, t.schema, t.name)}>{t.name}</Link>,
    },
    {
      key: 'row_count',
      header: 'Rows (est.)',
      sortable: true,
      align: 'end',
      width: pixel(120),
      renderCell: (t) => <Text hasTabularNumbers>{formatRowEstimate(t.row_count)}</Text>,
    },
    { key: 'size_bytes', header: 'Size', sortable: true, align: 'end', width: pixel(110), renderCell: (t) => <Text hasTabularNumbers>{t.size_human}</Text> },
  ]

  const serverName = server.data?.name ?? 'Server'

  return (
    <Page>
      <PageHeader
        title={dbname}
        crumbs={[{ label: 'DB Explorer', href: '/explorer' }, { label: serverName, href: paths.server }, { label: dbname }]}
        actions={
          <>
            <Button label="Grant access" icon={<KeyRound size={14} />} onClick={() => setGrantOpen(true)} isDisabled={isDemo} />
            <Button label="Schema diagram" icon={<Network size={14} />} href={paths.erd(dbname)} />
            <Button label="Back up this database" variant="primary" icon={<HardDriveDownload size={14} />} href={backupHref} isDisabled={isDemo} />
          </>
        }
        meta={
          tables.data ? (
            <MetaRow
              items={[
                { label: 'Tables', value: totals.count },
                { label: 'Schemas', value: totals.schemas },
                { label: 'Table data', value: bytes(totals.size) },
                { label: 'Server', value: server.data ? `${server.data.host}:${server.data.port}` : '—' },
              ]}
            />
          ) : undefined
        }
      />
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <TextInput
              label="Filter tables"
              isLabelHidden
              placeholder="Filter tables"
              startIcon="search"
              value={q}
              onChange={(v) => navigate({ search: { q: v || undefined }, replace: true })}
              hasClear
              width={280}
            />
          </StackItem>
          <Text type="supporting" color="secondary">
            Row counts are planner estimates and may lag behind recent writes.
          </Text>
        </HStack>
        {tables.isLoading ? (
          <TableSkeleton />
        ) : tables.error ? (
          <RemoteError error={tables.error} onRetry={() => tables.refetch()} what="tables" />
        ) : (
          <Card padding={0} style={{ overflowX: 'auto' }}>
            <Table<Row>
              data={sortedData}
              columns={columns}
              idKey="key"
              density="compact"
              hasHover
              plugins={{ sort }}
              emptyState={<Empty title={q ? 'No tables match' : 'No tables'} description={q ? 'Try a different filter.' : 'This database has no user tables yet.'} />}
            />
          </Card>
        )}
      </VStack>
      <GrantDialog serverId={id} dbname={dbname} isOpen={grantOpen} onOpenChange={setGrantOpen} />
    </Page>
  )
}
