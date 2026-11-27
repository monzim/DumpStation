import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table, proportional, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { Button } from '@astryxdesign/core/Button'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Link } from '@astryxdesign/core/Link'
import { HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { Banner } from '@astryxdesign/core/Banner'
import { Plus, Pencil, Trash2, PlugZap, DatabaseZap } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, useNotify } from '@/components/common'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useSession } from '@/lib/auth/session'
import { useDeleteServer, useServers, useTestServer, explorerPaths, formatLatency, type ServerConnection } from '@/components/explorer/api'
import { ServerDialog } from '@/components/explorer/ServerDialog'
import { LastTest } from '@/components/explorer/parts'

export const Route = createFileRoute('/_app/explorer/')({ component: ExplorerPage })

function ExplorerPage() {
  const { isDemo } = useSession()
  const servers = useServers()
  const notify = useNotify()
  const test = useTestServer()
  const del = useDeleteServer()
  const [editing, setEditing] = useState<ServerConnection | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<ServerConnection | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const openAdd = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }

  const runTest = async (s: ServerConnection) => {
    setTestingId(s.id)
    try {
      const r = await test.mutateAsync(s.id)
      if (r.ok) notify.success(`${s.name}: connected (SSL ${r.ssl_mode}${r.latency ? `, ${formatLatency(r.latency)}` : ''})`)
      else notify.error(new Error(r.message || 'Connection failed'), `${s.name}`)
    } catch (e) {
      notify.error(e, `Test ${s.name}`)
    } finally {
      setTestingId(null)
    }
  }

  const columns = useMemo<TableColumn<ServerConnection>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        width: proportional(2, { minWidth: 160 }),
        renderCell: (s) => <Link href={explorerPaths(s.id).server}>{s.name}</Link>,
      },
      {
        key: 'host',
        header: 'Host',
        width: proportional(2, { minWidth: 160 }),
        renderCell: (s) => (
          <Text className="ds-mono">
            {s.host}:{s.port}
          </Text>
        ),
      },
      { key: 'user', header: 'User', width: proportional(1, { minWidth: 90 }), renderCell: (s) => <Text className="ds-mono">{s.user}</Text> },
      {
        key: 'ssl_mode',
        header: 'SSL',
        width: pixel(90),
        renderCell: (s) => <Text>{s.last_test_ssl_mode && s.last_test_ssl_mode !== s.ssl_mode ? `${s.ssl_mode} → ${s.last_test_ssl_mode}` : s.ssl_mode}</Text>,
      },
      { key: 'last', header: 'Last test', width: proportional(2, { minWidth: 170 }), renderCell: (s) => <LastTest server={s} /> },
      {
        key: 'actions',
        header: '',
        width: pixel(130),
        align: 'end',
        renderCell: (s) => (
          <HStack gap={1} hAlign="end" vAlign="center">
            <Button
              label="Test"
              size="sm"
              icon={<PlugZap size={14} />}
              isLoading={testingId === s.id}
              isDisabled={isDemo}
              onClick={() => runTest(s)}
            />
            <MoreMenu
              label={`Actions for ${s.name}`}
              size="sm"
              isDisabled={isDemo}
              items={[
                {
                  label: 'Edit',
                  icon: <Pencil size={14} />,
                  onClick: () => {
                    setEditing(s)
                    setDialogOpen(true)
                  },
                },
                { type: 'divider' },
                { label: 'Delete connection', icon: <Trash2 size={14} />, variant: 'destructive', onClick: () => setDeleting(s) },
              ]}
            />
          </HStack>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDemo, testingId],
  )

  return (
    <Page>
      <PageHeader
        title="DB Explorer"
        description="Inspect PostgreSQL servers directly: list databases and roles, browse table rows, view schema diagrams and run admin tasks. These connections are separate from backup sources."
        actions={
          <Button label="Add server" variant="primary" icon={<Plus size={16} />} onClick={openAdd} isDisabled={isDemo} tooltip={isDemo ? 'The demo account is read-only' : undefined} />
        }
      />
      {isDemo && <Banner status="info" title="Read-only demo" description="You can browse existing connections, but adding, editing, testing and admin actions are disabled." />}
      {servers.isLoading ? (
        <TableSkeleton rows={4} />
      ) : servers.error ? (
        <ErrorState error={servers.error} onRetry={() => servers.refetch()} />
      ) : !servers.data?.length ? (
        <Card>
          <Empty
            title="No server connections"
            description="Add an administrative login for a PostgreSQL server to browse its databases, roles and tables."
            icon={<DatabaseZap size={28} />}
            actions={!isDemo ? <Button label="Add server" variant="primary" icon={<Plus size={16} />} onClick={openAdd} /> : undefined}
          />
        </Card>
      ) : (
        <Card padding={0} style={{ overflowX: 'auto' }}>
          <Table<ServerConnection> data={servers.data} columns={columns} idKey="id" density="compact" hasHover />
        </Card>
      )}

      <ServerDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} server={editing} />
      <ConfirmDialog
        isOpen={!!deleting}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null)
            del.reset()
          }
        }}
        title="Delete server connection"
        description={
          <>
            Remove the saved login for <strong>{deleting?.name}</strong> from DumpStation. Nothing on the PostgreSQL server is changed: databases, roles and data stay as they are.
          </>
        }
        actionLabel="Delete connection"
        isLoading={del.isPending}
        error={del.error}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await del.mutateAsync(deleting.id)
            notify.success(`Deleted ${deleting.name}`)
            setDeleting(null)
          } catch {
            /* inline */
          }
        }}
      />
    </Page>
  )
}
