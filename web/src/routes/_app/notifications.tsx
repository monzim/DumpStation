import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Link } from '@astryxdesign/core/Link'
import { Plus, Bell, Pencil, Trash2 } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, Panel, useNotify } from '@/components/common'
import { Empty, QueryBoundary, TableSkeleton } from '@/components/states'
import { useDatabases, useDeleteNotification, useNotifications, useTestNotification } from '@/lib/api/hooks'
import type { NotificationConfig } from '@/lib/api/types'
import { useSession } from '@/lib/auth/session'
import { NotificationDialog } from '@/components/notifications/NotificationDialog'

export const Route = createFileRoute('/_app/notifications')({ component: NotificationsPage })

type Row = NotificationConfig & Record<string, unknown> & { used_by: { id: string; name: string }[] | null }

const EVENTS: { title: string; detail: string }[] = [
  { title: 'Backups', detail: 'Each completed or failed backup, with size, duration or the failure cause.' },
  { title: 'Restores', detail: 'Each completed or failed restore and its target.' },
  { title: 'Agents', detail: 'An agent going offline or coming back online, sent to channels of the databases it runs.' },
  { title: 'Missed schedules', detail: 'A scheduled backup that did not start on time.' },
  { title: 'Download codes', detail: 'One-time codes to approve downloading a backup file.' },
]

function NotificationsPage() {
  const q = useNotifications()
  const { isDemo } = useSession()
  const [editing, setEditing] = useState<NotificationConfig | 'new' | null>(null)
  const add = <Button label="Add channel" variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')} isDisabled={isDemo} />
  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Discord and Telegram channels. Pick a channel per database to receive its alerts."
        actions={q.data && q.data.length > 0 ? add : undefined}
      />
      <QueryBoundary query={q} loading={<TableSkeleton rows={3} />}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <Empty
                icon={<Bell size={28} />}
                title="No notification channels"
                description="Add a Discord webhook or a Telegram bot to hear about failed backups, restores and offline agents without opening DumpStation."
                actions={add}
              />
            </Card>
          ) : (
            <ChannelTable list={list} onEdit={setEditing} />
          )
        }
      </QueryBoundary>
      <Panel title="What gets delivered" description="Messages go to the channel selected on each database.">
        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, max-content) 1fr', gap: 'var(--spacing-2) var(--spacing-4)', margin: 0 }}>
          {EVENTS.map((e) => (
            <div key={e.title} style={{ display: 'contents' }}>
              <dt>
                <Text weight="medium">{e.title}</Text>
              </dt>
              <dd style={{ margin: 0 }}>
                <Text color="secondary">{e.detail}</Text>
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
      <NotificationDialog channel={editing && editing !== 'new' ? editing : undefined} isOpen={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
    </Page>
  )
}

function ChannelTable({ list, onEdit }: { list: NotificationConfig[]; onEdit: (n: NotificationConfig) => void }) {
  const { isDemo } = useSession()
  const notify = useNotify()
  const dbs = useDatabases()
  const del = useDeleteNotification()
  const [deleting, setDeleting] = useState<Row | null>(null)

  const rows = useMemo(() => {
    return [...list]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({
        ...n,
        used_by: dbs.data ? dbs.data.filter((d) => d.notification_id === n.id).map((d) => ({ id: d.id, name: d.name })) : null,
      })) as Row[]
  }, [list, dbs.data])

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <Table<Row>
            data={rows}
            idKey="id"
            density="compact"
            hasHover
            verticalAlign="middle"
            columns={[
              { key: 'name', header: 'Name', renderCell: (n) => <Text weight="medium">{n.name}</Text> },
              {
                key: 'discord',
                header: 'Discord',
                renderCell: (n) => <ChannelState on={n.has_discord} detail={n.discord_webhook_url} />,
              },
              {
                key: 'telegram',
                header: 'Telegram',
                renderCell: (n) => (
                  <ChannelState on={n.has_telegram} detail={n.has_telegram ? `chat ${n.telegram_chat_id ?? '***'}` : undefined} />
                ),
              },
              {
                key: 'used_by',
                header: 'Used by',
                renderCell: (n) =>
                  n.used_by === null ? (
                    <Text color="secondary">—</Text>
                  ) : n.used_by.length === 0 ? (
                    <Text color="secondary">No databases</Text>
                  ) : (
                    <Tooltip content={n.used_by.map((d) => d.name).join(', ')}>
                      <Text>
                        {n.used_by.length} {n.used_by.length === 1 ? 'database' : 'databases'}
                      </Text>
                    </Tooltip>
                  ),
              },
              { key: 'test', header: 'Test', renderCell: (n) => <SendTest channel={n} /> },
              {
                key: 'actions',
                header: '',
                width: { type: 'proportional', value: 0.56, minWidth: 56 },
                align: 'end',
                renderCell: (n) => (
                  <MoreMenu
                    label={`Actions for ${n.name}`}
                    isDisabled={isDemo}
                    alignment="end"
                    items={[
                      { label: 'Edit…', icon: <Pencil size={16} />, onClick: () => onEdit(n) },
                      { type: 'divider' },
                      {
                        label: 'Delete…',
                        icon: <Trash2 size={16} />,
                        variant: 'destructive',
                        onClick: () => {
                          del.reset()
                          setDeleting(n)
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
        title={`Delete ${deleting?.name ?? 'channel'}?`}
        description={
          deleting?.used_by && deleting.used_by.length > 0 ? (
            <>
              {deleting.used_by.length} {deleting.used_by.length === 1 ? 'database uses' : 'databases use'} this channel (
              {deleting.used_by.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <Link href={`/databases/${d.id}`}>{d.name}</Link>
                </span>
              ))}
              ). They stop sending alerts until you pick another channel.
            </>
          ) : (
            'The channel and its stored webhook / bot credentials are removed.'
          )
        }
        actionLabel="Delete channel"
        isLoading={del.isPending}
        error={del.error}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              notify.success(`Channel ${deleting.name} deleted`)
              setDeleting(null)
            },
          })
        }
      />
    </>
  )
}

function ChannelState({ on, detail }: { on: boolean; detail?: string }) {
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={on ? 'success' : 'neutral'} label={on ? 'On' : 'Off'} />
      <VStack gap={0}>
        <Text>{on ? 'On' : 'Off'}</Text>
        {on && detail && (
          <Text type="supporting" color="secondary" className="ds-mono ds-truncate">
            {detail}
          </Text>
        )}
      </VStack>
    </HStack>
  )
}

function SendTest({ channel }: { channel: NotificationConfig }) {
  const test = useTestNotification()
  const notify = useNotify()
  const r = test.data
  return (
    <HStack gap={2} vAlign="center">
      <Button
        label="Send test"
        size="sm"
        isDisabled={test.isPending}
        icon={test.isPending ? <Spinner size="sm" shade="inherit" /> : undefined}
        onClick={() =>
          test.mutate(channel.id, {
            onSuccess: (res) =>
              res.ok ? notify.success(`Test message sent to ${channel.name}`) : notify.error(new Error(res.message), `${channel.name} test failed`),
            onError: (e) => notify.error(e, 'Could not send the test'),
          })
        }
      />
      {r && !test.isPending && (
        <Tooltip content={r.message}>
          <HStack gap={1} vAlign="center">
            <StatusDot variant={r.ok ? 'success' : 'error'} label={r.ok ? 'Delivered' : 'Failed'} />
            <Text type="supporting" color="secondary" className="ds-nowrap">
              {r.ok ? 'Delivered' : 'Failed'}
            </Text>
          </HStack>
        </Tooltip>
      )}
    </HStack>
  )
}
