import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Card } from '@astryxdesign/core/Card'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Link } from '@astryxdesign/core/Link'
import { Plus, HardDrive, Pencil, Star, Trash2 } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, useNotify } from '@/components/common'
import { Empty, QueryBoundary, TableSkeleton } from '@/components/states'
import { useDeleteStorage, useSetDefaultStorage, useStorages, useTestStorage } from '@/lib/api/hooks'
import type { StorageConfig, StorageTestResult } from '@/lib/api/types'
import { PROVIDER_LABEL, bytes } from '@/lib/format'
import { useSession } from '@/lib/auth/session'
import { StorageDialog } from '@/components/storage/StorageDialog'
import { StorageTestInline, stageLabel } from '@/components/storage/StorageTestResult'

export const Route = createFileRoute('/_app/storage')({ component: StoragePage })

type Row = StorageConfig & Record<string, unknown>

function StoragePage() {
  const q = useStorages()
  const { isDemo } = useSession()
  const [editing, setEditing] = useState<StorageConfig | 'new' | null>(null)
  const add = <Button label="Add storage" variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')} isDisabled={isDemo} />
  return (
    <Page>
      <PageHeader
        title="Storage"
        description="S3-compatible buckets where backup files are uploaded. Agents upload directly with short-lived signed URLs or through the server."
        actions={q.data && q.data.length > 0 ? add : undefined}
      />
      <QueryBoundary query={q} loading={<TableSkeleton rows={3} />}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <Empty
                icon={<HardDrive size={28} />}
                title="No storage configured"
                description="Add an S3, Cloudflare R2, MinIO or other S3-compatible bucket. Every database backs up to one storage destination."
                actions={add}
              />
            </Card>
          ) : (
            <StorageTable list={list} onEdit={setEditing} />
          )
        }
      </QueryBoundary>
      <StorageDialog
        storage={editing && editing !== 'new' ? editing : undefined}
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Page>
  )
}

function StorageTable({ list, onEdit }: { list: StorageConfig[]; onEdit: (s: StorageConfig) => void }) {
  const { isDemo } = useSession()
  const notify = useNotify()
  const setDefault = useSetDefaultStorage()
  const del = useDeleteStorage()
  const [deleting, setDeleting] = useState<StorageConfig | null>(null)
  const rows = [...list].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)) as Row[]

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 1040 }}>
          <Table<Row>
            data={rows}
            idKey="id"
            density="compact"
            hasHover
            verticalAlign="middle"
            columns={[
              {
                key: 'name',
                header: 'Name',
                renderCell: (s) => (
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text weight="medium">{s.name}</Text>
                    {s.is_default && <Token label="Default" size="sm" color="blue" />}
                  </HStack>
                ),
              },
              { key: 'provider', header: 'Provider', renderCell: (s) => <Text>{PROVIDER_LABEL[s.provider] ?? s.provider}</Text> },
              { key: 'bucket', header: 'Bucket', renderCell: (s) => <span className="ds-mono">{s.bucket}</span> },
              {
                key: 'endpoint',
                header: 'Region / endpoint',
                renderCell: (s) => (
                  <VStack gap={0} style={{ minWidth: 0 }}>
                    <Text>{s.region || (s.provider === 'r2' ? 'auto' : '—')}</Text>
                    {s.endpoint && (
                      <Text type="supporting" color="secondary" maxLines={1}>
                        <span className="ds-mono" title={s.endpoint}>
                          {s.endpoint.replace(/^https?:\/\//, '')}
                        </span>
                      </Text>
                    )}
                  </VStack>
                ),
              },
              {
                key: 'database_count',
                header: 'Databases',
                align: 'end',
                renderCell: (s) => <Text hasTabularNumbers color={s.database_count ? undefined : 'secondary'}>{s.database_count}</Text>,
              },
              {
                key: 'backup_count',
                header: 'Stored',
                align: 'end',
                renderCell: (s) =>
                  s.backup_count > 0 ? (
                    <VStack gap={0} hAlign="end">
                      <Text hasTabularNumbers>{bytes(s.used_bytes)}</Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {s.backup_count} {s.backup_count === 1 ? 'backup' : 'backups'}
                      </Text>
                    </VStack>
                  ) : (
                    <Text color="secondary">Empty</Text>
                  ),
              },
              { key: 'test', header: 'Connectivity', renderCell: (s) => <TestCell storage={s} /> },
              {
                key: 'actions',
                header: '',
                width: { type: 'proportional', value: 0.56, minWidth: 56 },
                align: 'end',
                renderCell: (s) => (
                  <MoreMenu
                    label={`Actions for ${s.name}`}
                    isDisabled={isDemo}
                    alignment="end"
                    items={[
                      {
                        label: 'Set as default',
                        icon: <Star size={16} />,
                        isDisabled: s.is_default,
                        onClick: () =>
                          setDefault.mutate(s.id, {
                            onSuccess: () => notify.success(`${s.name} is now the default storage`),
                            onError: (e) => notify.error(e, 'Could not set the default'),
                          }),
                      },
                      { label: 'Edit…', icon: <Pencil size={16} />, onClick: () => onEdit(s) },
                      { type: 'divider' },
                      {
                        label: 'Delete…',
                        icon: <Trash2 size={16} />,
                        variant: 'destructive',
                        onClick: () => {
                          del.reset()
                          setDeleting(s)
                        },
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'storage'}?`}
        description={
          deleting && (deleting.database_count > 0 || deleting.backup_count > 0) ? (
            <>
              This storage is used by {deleting.database_count} {deleting.database_count === 1 ? 'database' : 'databases'} and holds{' '}
              {deleting.backup_count} {deleting.backup_count === 1 ? 'backup' : 'backups'}. DumpStation refuses to delete storage that is still in use;
              move the databases to another storage first (<Link href="/databases">Databases</Link>).
            </>
          ) : (
            'The configuration and its stored credentials are removed. Files already in the bucket are not touched.'
          )
        }
        actionLabel="Delete storage"
        isLoading={del.isPending}
        error={del.error}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              notify.success(`Storage ${deleting.name} deleted`)
              setDeleting(null)
            },
          })
        }
      />
    </>
  )
}

function TestCell({ storage }: { storage: StorageConfig }) {
  const test = useTestStorage()
  const notify = useNotify()
  const [last, setLast] = useState<{ result: StorageTestResult; at: Date } | null>(null)
  const run = () =>
    test.mutate(
      { id: storage.id },
      {
        onSuccess: (r) => {
          setLast({ result: r, at: new Date() })
          if (r.ok) notify.success(`${storage.name}: reachable in ${r.latency_ms} ms`)
          else notify.error(new Error(r.stage ? `${stageLabel(r.stage)}: ${r.message}` : r.message), `${storage.name} check failed`)
        },
        onError: (e) => notify.error(e, `Could not test ${storage.name}`),
      },
    )
  return (
    <HStack gap={2} vAlign="center">
      <Button label="Test" size="sm" onClick={run} isDisabled={test.isPending} icon={test.isPending ? <Spinner size="sm" shade="inherit" /> : undefined} />
      {last && !test.isPending && <StorageTestInline result={last.result} at={last.at} />}
    </HStack>
  )
}
