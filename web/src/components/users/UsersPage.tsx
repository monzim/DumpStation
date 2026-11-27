import { useMemo, useState } from 'react'
import { Table, proportional, pixel, useTableSortable, useTableSortableState, type TableColumn } from '@astryxdesign/core/Table'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ShieldCheck, ShieldOff, UserCog, Lock } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, When, useNotify } from '@/components/common'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useAdminUsers, useSetUserAdmin } from '@/lib/api/hooks'
import { useSession } from '@/lib/auth/session'
import type { AdminUser } from '@/lib/api/types'

type Row = AdminUser & Record<string, unknown>

function methods(u: AdminUser) {
  const m: string[] = []
  if (u.github_login) m.push('GitHub')
  if (u.discord_username) m.push('Discord')
  if (u.is_demo) m.push('Demo')
  return m
}

export function UsersPage() {
  const { user: me, isAdmin, isDemo } = useSession()
  const users = useAdminUsers(isAdmin)
  const setAdmin = useSetUserAdmin()
  const notify = useNotify()
  const [q, setQ] = useState('')
  const [target, setTarget] = useState<AdminUser | null>(null)

  const rows = useMemo(
    () =>
      ((users.data ?? []) as Row[]).filter(
        (u) => !q || [u.display_name, u.email, u.github_login, u.discord_username].some((v) => v?.toLowerCase().includes(q.toLowerCase())),
      ),
    [users.data, q],
  )
  const { sortedData, sortConfig } = useTableSortableState<Row>({ data: rows, defaultSort: [{ sortKey: 'created_at', direction: 'ascending' }] })
  const sort = useTableSortable<Row>(sortConfig)

  if (me && !isAdmin) {
    return (
      <Page>
        <PageHeader title="Users" />
        <Card>
          <Empty
            title="Administrator access required"
            description="Only administrators can view and manage users. Ask an administrator to grant you the role."
            icon={<Lock size={28} />}
            actions={<Button label="Go to overview" href="/" />}
          />
        </Card>
      </Page>
    )
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'display_name',
      header: 'User',
      sortable: true,
      width: proportional(2, { minWidth: 180 }),
      renderCell: (u) => (
        <VStack gap={0.5}>
          <HStack gap={2} vAlign="center">
            <Text weight="medium">{u.display_name || '—'}</Text>
            {u.id === me?.id && <Badge label="You" variant="neutral" />}
          </HStack>
          {u.email && (
            <Text type="supporting" color="secondary">
              {u.email}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'methods',
      header: 'Sign-in',
      width: proportional(1, { minWidth: 120 }),
      renderCell: (u) => {
        const m = methods(u)
        const handle = [u.github_login && `GitHub: ${u.github_login}`, u.discord_username && `Discord: ${u.discord_username}`].filter(Boolean).join(' · ')
        return handle ? (
          <Tooltip content={handle}>
            <Text>{m.join(', ')}</Text>
          </Tooltip>
        ) : (
          <Text color="secondary">{m.join(', ') || '—'}</Text>
        )
      },
    },
    {
      key: 'is_admin',
      header: 'Role',
      sortable: true,
      width: pixel(130),
      renderCell: (u) => (
        <HStack gap={1} wrap="wrap">
          <Badge label={u.is_admin ? 'Administrator' : 'Member'} variant={u.is_admin ? 'info' : 'neutral'} />
          {u.is_demo && <Badge label="Demo" variant="warning" />}
        </HStack>
      ),
    },
    {
      key: 'two_factor_enabled',
      header: '2FA',
      sortable: true,
      width: pixel(90),
      renderCell: (u) =>
        u.two_factor_enabled ? (
          <HStack gap={1} vAlign="center">
            <ShieldCheck size={14} aria-hidden />
            <Text>On</Text>
          </HStack>
        ) : (
          <Text color="secondary">Off</Text>
        ),
    },
    { key: 'created_at', header: 'Joined', sortable: true, width: pixel(120), renderCell: (u) => <When value={u.created_at} /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: pixel(170),
      renderCell: (u) => {
        const self = u.id === me?.id
        const reason = isDemo
          ? 'The demo account is read-only'
          : u.is_demo
            ? 'The demo account cannot be an administrator'
            : self && u.is_admin
              ? 'You cannot remove your own administrator role'
              : undefined
        return (
          <Button
            label={u.is_admin ? 'Remove admin' : 'Make admin'}
            size="sm"
            variant={u.is_admin ? 'ghost' : 'secondary'}
            icon={u.is_admin ? <ShieldOff size={14} /> : <UserCog size={14} />}
            isDisabled={!!reason}
            tooltip={reason}
            onClick={() => setTarget(u)}
          />
        )
      },
    },
  ]

  const promote = target && !target.is_admin
  const admins = (users.data ?? []).filter((u) => u.is_admin).length

  return (
    <Page>
      <PageHeader
        title="Users"
        description={
          <>
            People are added by signing in: GitHub accounts on the server's allow-list, or the Discord one-time-code system user. Administrators can manage every
            resource, users and instance maintenance; members manage their own resources.
          </>
        }
      />
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Text type="supporting" color="secondary">
            {users.data ? `${users.data.length} ${users.data.length === 1 ? 'user' : 'users'} · ${admins} ${admins === 1 ? 'administrator' : 'administrators'}` : ' '}
          </Text>
        </StackItem>
        <TextInput label="Search users" isLabelHidden placeholder="Search name, email or login" startIcon="search" value={q} onChange={setQ} hasClear width={280} />
      </HStack>
      {users.isLoading || !me ? (
        <TableSkeleton rows={4} />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <Card padding={0} style={{ overflowX: 'auto' }}>
          <Table<Row>
            data={sortedData}
            columns={columns}
            idKey="id"
            density="compact"
            hasHover
            plugins={{ sort }}
            emptyState={<Empty title={q ? 'No users match' : 'No users'} />}
          />
        </Card>
      )}
      <ConfirmDialog
        isOpen={!!target}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null)
            setAdmin.reset()
          }
        }}
        variant={promote ? 'primary' : 'destructive'}
        title={promote ? 'Make administrator' : 'Remove administrator'}
        description={
          promote ? (
            <>
              <strong>{target?.display_name}</strong> will be able to see and change every database, agent, storage target and notification, manage users and run maintenance.
              This takes effect immediately.
            </>
          ) : (
            <>
              <strong>{target?.display_name}</strong> loses access to other users' resources, user management and maintenance, and keeps only their own resources. This takes
              effect immediately.
            </>
          )
        }
        actionLabel={promote ? 'Make administrator' : 'Remove administrator'}
        isLoading={setAdmin.isPending}
        error={setAdmin.error}
        onConfirm={async () => {
          if (!target) return
          try {
            await setAdmin.mutateAsync({ id: target.id, isAdmin: !target.is_admin })
            notify.success(promote ? `${target.display_name} is now an administrator` : `${target.display_name} is no longer an administrator`)
            setTarget(null)
          } catch {
            /* inline */
          }
        }}
      />
    </Page>
  )
}
