import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, proportional, pixel, useTableSortable, useTableSortableState, type TableColumn } from '@astryxdesign/core/Table'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Plus, Trash2, PlugZap, Pencil, Check, Minus } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, useNotify } from '@/components/common'
import { ErrorState, BlockSkeleton, TableSkeleton, Empty } from '@/components/states'
import { useSession } from '@/lib/auth/session'
import {
  explorerPaths,
  formatLatency,
  useDropServerDatabase,
  useDropServerRole,
  useServer,
  useServerDatabases,
  useServerRoles,
  useTestServer,
  type ServerDatabase,
  type ServerRole,
} from '@/components/explorer/api'
import { LastTest, MetaRow, RemoteError } from '@/components/explorer/parts'
import { ServerDialog } from '@/components/explorer/ServerDialog'
import { CreateDatabaseDialog, CreateRoleDialog } from '@/components/explorer/AdminDialogs'

type Tab = 'databases' | 'roles'

export const Route = createFileRoute('/_app/explorer/$id/')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; q?: string } => ({
    tab: s.tab === 'roles' ? 'roles' : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
  }),
  component: ServerPage,
})

function ServerPage() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab: Tab = search.tab ?? 'databases'
  const q = search.q ?? ''
  const { isDemo } = useSession()
  const server = useServer(id)
  const test = useTestServer()
  const notify = useNotify()
  const [editOpen, setEditOpen] = useState(false)

  const setSearch = (patch: { tab?: Tab; q?: string }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, tab: (patch.tab ?? prev.tab) === 'roles' ? 'roles' : undefined }), replace: true })

  if (server.isLoading)
    return (
      <Page>
        <BlockSkeleton height={96} />
        <TableSkeleton />
      </Page>
    )
  if (server.error || !server.data)
    return (
      <Page>
        <PageHeader title="Server" crumbs={[{ label: 'DB Explorer', href: '/explorer' }, { label: 'Not found' }]} />
        <ErrorState error={server.error ?? new Error('Server connection not found')} onRetry={() => server.refetch()} title="Could not load this server" />
      </Page>
    )
  const s = server.data

  return (
    <Page>
      <PageHeader
        title={s.name}
        crumbs={[{ label: 'DB Explorer', href: '/explorer' }, { label: s.name }]}
        actions={
          <>
            <Button label="Edit" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)} isDisabled={isDemo} />
            <Button
              label="Test connection"
              icon={<PlugZap size={14} />}
              isLoading={test.isPending}
              isDisabled={isDemo}
              onClick={async () => {
                try {
                  const r = await test.mutateAsync(s.id)
                  if (r.ok) notify.success(`Connected (SSL ${r.ssl_mode}${r.latency ? `, ${formatLatency(r.latency)}` : ''})`)
                  else notify.error(new Error(r.message || 'Connection failed'), 'Connection failed')
                } catch (e) {
                  notify.error(e, 'Test failed')
                }
              }}
            />
          </>
        }
        meta={
          <MetaRow
            items={[
              { label: 'Host', value: `${s.host}:${s.port}` },
              { label: 'User', value: s.user },
              { label: 'SSL mode', value: s.ssl_mode },
              { label: 'Last test', value: <LastTest server={s} /> },
            ]}
          />
        }
      />
      <TabList value={tab} onChange={(v) => setSearch({ tab: v as Tab, q: undefined })} hasDivider>
        <Tab value="databases" label="Databases" />
        <Tab value="roles" label="Roles" />
      </TabList>
      {tab === 'databases' ? (
        <DatabasesTab serverId={id} q={q} onQ={(v) => setSearch({ q: v || undefined })} />
      ) : (
        <RolesTab serverId={id} q={q} onQ={(v) => setSearch({ q: v || undefined })} />
      )}
      <ServerDialog isOpen={editOpen} onOpenChange={setEditOpen} server={s} />
    </Page>
  )
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <TextInput label={label} isLabelHidden placeholder={label} startIcon="search" value={value} onChange={onChange} hasClear width={280} />
}

function DatabasesTab({ serverId, q, onQ }: { serverId: string; q: string; onQ: (v: string) => void }) {
  const { isDemo } = useSession()
  const notify = useNotify()
  const dbs = useServerDatabases(serverId)
  const drop = useDropServerDatabase(serverId)
  const [createOpen, setCreateOpen] = useState(false)
  const [dropping, setDropping] = useState<string | null>(null)
  const paths = explorerPaths(serverId)

  const filtered = useMemo(() => (dbs.data ?? []).filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase())), [dbs.data, q])
  const { sortedData, sortConfig } = useTableSortableState<ServerDatabase>({
    data: filtered,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  })
  const sort = useTableSortable<ServerDatabase>(sortConfig)

  const columns: TableColumn<ServerDatabase>[] = [
    {
      key: 'name',
      header: 'Database',
      sortable: true,
      width: proportional(2, { minWidth: 180 }),
      renderCell: (d) => <Link href={paths.db(d.name)}>{d.name}</Link>,
    },
    { key: 'owner', header: 'Owner', sortable: true, width: proportional(1, { minWidth: 110 }), renderCell: (d) => <Text className="ds-mono">{d.owner}</Text> },
    { key: 'encoding', header: 'Encoding', width: pixel(110), renderCell: (d) => <Text>{d.encoding}</Text> },
    {
      key: 'size_bytes',
      header: 'Size',
      sortable: true,
      align: 'end',
      width: pixel(110),
      renderCell: (d) => <Text hasTabularNumbers>{d.size_human}</Text>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: pixel(64),
      renderCell: (d) => (
        <IconButton
          label={`Drop database ${d.name}`}
          icon={<Trash2 size={14} />}
          size="sm"
          variant="ghost"
          isDisabled={isDemo}
          onClick={() => setDropping(d.name)}
        />
      ),
    },
  ]

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <SearchBox value={q} onChange={onQ} label="Filter databases" />
        </StackItem>
        <Button label="Create database" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)} isDisabled={isDemo} />
      </HStack>
      {dbs.isLoading ? (
        <TableSkeleton />
      ) : dbs.error ? (
        <RemoteError error={dbs.error} onRetry={() => dbs.refetch()} what="databases" />
      ) : (
        <Card padding={0} style={{ overflowX: 'auto' }}>
          <Table<ServerDatabase>
            data={sortedData}
            columns={columns}
            idKey="name"
            density="compact"
            hasHover
            plugins={{ sort }}
            emptyState={<Empty title={q ? 'No databases match' : 'No databases'} description={q ? 'Try a different filter.' : 'Create one to get started.'} />}
          />
        </Card>
      )}
      <CreateDatabaseDialog serverId={serverId} isOpen={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        isOpen={!!dropping}
        onOpenChange={(o) => {
          if (!o) {
            setDropping(null)
            drop.reset()
          }
        }}
        title="Drop database"
        description={
          <>
            This runs <span className="ds-mono">DROP DATABASE</span> on the remote server and permanently deletes <strong>{dropping}</strong> with all of its schemas,
            tables and data. It cannot be undone from DumpStation. Make sure you have a verified backup first.
          </>
        }
        confirmText={dropping ?? undefined}
        actionLabel="Drop database permanently"
        isLoading={drop.isPending}
        error={drop.error}
        onConfirm={async () => {
          if (!dropping) return
          try {
            await drop.mutateAsync(dropping)
            notify.success(`Dropped database ${dropping}`)
            setDropping(null)
          } catch {
            /* inline */
          }
        }}
      />
    </VStack>
  )
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return on ? <Check size={15} aria-label={`${label}: yes`} /> : <Minus size={15} aria-label={`${label}: no`} style={{ color: 'var(--color-text-disabled)' }} />
}

function RolesTab({ serverId, q, onQ }: { serverId: string; q: string; onQ: (v: string) => void }) {
  const { isDemo } = useSession()
  const notify = useNotify()
  const roles = useServerRoles(serverId)
  const drop = useDropServerRole(serverId)
  const [createOpen, setCreateOpen] = useState(false)
  const [dropping, setDropping] = useState<string | null>(null)

  const filtered = useMemo(() => (roles.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [roles.data, q])
  const { sortedData, sortConfig } = useTableSortableState<ServerRole>({ data: filtered, defaultSort: [{ sortKey: 'name', direction: 'ascending' }] })
  const sort = useTableSortable<ServerRole>(sortConfig)

  const columns: TableColumn<ServerRole>[] = [
    {
      key: 'name',
      header: 'Role',
      sortable: true,
      width: proportional(2, { minWidth: 180 }),
      renderCell: (r) => (
        <HStack gap={2} vAlign="center">
          <Text className="ds-mono">{r.name}</Text>
          {r.is_superuser && <Badge variant="warning" label="Superuser" />}
        </HStack>
      ),
    },
    { key: 'can_login', header: 'Login', align: 'center', width: pixel(80), renderCell: (r) => <Flag on={r.can_login} label="Login" /> },
    { key: 'create_db', header: 'Create DB', align: 'center', width: pixel(100), renderCell: (r) => <Flag on={r.create_db} label="Create DB" /> },
    { key: 'create_role', header: 'Create role', align: 'center', width: pixel(100), renderCell: (r) => <Flag on={r.create_role} label="Create role" /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: pixel(64),
      renderCell: (r) => (
        <IconButton label={`Drop role ${r.name}`} icon={<Trash2 size={14} />} size="sm" variant="ghost" isDisabled={isDemo} onClick={() => setDropping(r.name)} />
      ),
    },
  ]

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <SearchBox value={q} onChange={onQ} label="Filter roles" />
        </StackItem>
        <Button label="Create role" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)} isDisabled={isDemo} />
      </HStack>
      <Text type="supporting" color="secondary">
        System roles (pg_*) are hidden. Grant a role access to a database from that database's page.
      </Text>
      {roles.isLoading ? (
        <TableSkeleton />
      ) : roles.error ? (
        <RemoteError error={roles.error} onRetry={() => roles.refetch()} what="roles" />
      ) : (
        <Card padding={0} style={{ overflowX: 'auto' }}>
          <Table<ServerRole>
            data={sortedData}
            columns={columns}
            idKey="name"
            density="compact"
            hasHover
            plugins={{ sort }}
            emptyState={<Empty title={q ? 'No roles match' : 'No roles'} />}
          />
        </Card>
      )}
      <CreateRoleDialog serverId={serverId} isOpen={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        isOpen={!!dropping}
        onOpenChange={(o) => {
          if (!o) {
            setDropping(null)
            drop.reset()
          }
        }}
        title="Drop role"
        description={
          <>
            This runs <span className="ds-mono">DROP ROLE</span> for <strong>{dropping}</strong> on the remote server. Applications that log in with this role will stop
            working. PostgreSQL refuses if the role still owns objects or holds privileges.
          </>
        }
        confirmText={dropping ?? undefined}
        actionLabel="Drop role"
        isLoading={drop.isPending}
        error={drop.error}
        onConfirm={async () => {
          if (!dropping) return
          try {
            await drop.mutateAsync(dropping)
            notify.success(`Dropped role ${dropping}`)
            setDropping(null)
          } catch {
            /* inline */
          }
        }}
      />
    </VStack>
  )
}
