import { useCallback, useState } from 'react'
import { createFileRoute, useBlocker, useNavigate } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { Pause, Play, Upload } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, HealthBadge } from '@/components/status'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { DeleteDatabaseDialog, ScheduleRetentionForm, useBackupNow, usePauseToggle } from '@/components/databases/actions'
import { DetailOverview } from '@/components/databases/DetailOverview'
import { DetailBackups } from '@/components/databases/DetailBackups'
import { DetailConnection } from '@/components/databases/DetailConnection'
import { DetailStorage } from '@/components/databases/DetailStorage'
import { DetailActivity } from '@/components/databases/DetailActivity'
import { needsConnectionView } from '@/components/databases/connection'
import { describeSchedule } from '@/components/databases/schedule'
import { useAgents, useDatabase, useDatabaseConnection } from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { Database } from '@/lib/api/types'
import { relativeTime } from '@/lib/format'
import { useSession } from '@/lib/auth/session'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'backups', label: 'Backups' },
  { value: 'schedule', label: 'Schedule & retention' },
  { value: 'connection', label: 'Connection' },
  { value: 'storage', label: 'Storage & notifications' },
  { value: 'activity', label: 'Activity' },
] as const
type TabValue = (typeof TABS)[number]['value']

interface DetailSearch {
  tab?: TabValue
  created?: 1
}

export const Route = createFileRoute('/_app/databases/$id')({
  validateSearch: (s: Record<string, unknown>): DetailSearch => ({
    tab: TABS.some((t) => t.value === s.tab) ? (s.tab as TabValue) : undefined,
    created: s.created === 1 || s.created === '1' ? 1 : undefined,
  }),
  component: DatabaseDetailPage,
})

function DatabaseDetailPage() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  const db = useDatabase(id)

  if (db.isLoading)
    return (
      <Page>
        <BlockSkeleton height={72} />
        <BlockSkeleton height={320} />
      </Page>
    )
  if (db.error && !db.data) {
    const notFound = db.error instanceof ApiError && db.error.status === 404
    return (
      <Page>
        <PageHeader title={notFound ? 'Database not found' : 'Database'} crumbs={[{ label: 'Databases', href: '/databases' }, { label: 'Not found' }]} />
        {notFound ? (
          <Banner status="warning" title="This database does not exist or was deleted." endContent={<Button label="All databases" size="sm" href="/databases" />} />
        ) : (
          <ErrorState error={db.error} onRetry={() => db.refetch()} />
        )}
      </Page>
    )
  }
  if (!db.data) return null
  return <Detail db={db.data} tab={search.tab ?? 'overview'} created={!!search.created} />
}

function Detail({
  db,
  tab,
  created,
}: {
  db: Database
  tab: TabValue
  created: boolean
}) {
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const agents = useAgents()
  const backupNow = useBackupNow()
  const pause = usePauseToggle()
  const [deleting, setDeleting] = useState(false)
  const [dirty, setDirtyState] = useState(false)
  const setDirty = useCallback((d: boolean) => setDirtyState(d), [])
  const agentName = agents.data?.find((a) => a.id === db.agent_id)?.name

  // Guard unsaved edits when switching tabs or leaving the page.
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true, enableBeforeUnload: () => dirty })

  const setTab = (t: string) =>
    navigate({ search: (prev) => ({ ...prev, created: undefined, tab: t === 'overview' ? undefined : (t as TabValue) }), replace: true })

  const active = db.active_backup
  const actions = (
    <>
      <Button
        label="Back up now"
        variant="primary"
        icon={<Upload size={16} />}
        onClick={() => backupNow.run(db)}
        isLoading={backupNow.isPending}
        isDisabled={isDemo || !!active}
        tooltip={active ? 'A backup is already running' : undefined}
      />
      <Button
        label={db.paused ? 'Resume schedule' : 'Pause schedule'}
        icon={db.paused ? <Play size={16} /> : <Pause size={16} />}
        onClick={() => pause.toggle(db)}
        isLoading={pause.isPending}
        isDisabled={isDemo}
      />
      <MoreMenu
        label="More actions"
        alignment="end"
        items={[
          { label: 'Edit connection', onClick: () => setTab('connection') },
          { label: 'Edit schedule & retention', onClick: () => setTab('schedule') },
          { label: 'View all backups', href: `/backups?db=${db.id}` },
          { type: 'divider' },
          { label: 'Delete database…', variant: 'destructive', isDisabled: isDemo, onClick: () => setDeleting(true) },
        ]}
      />
    </>
  )

  return (
    <Page>
      <PageHeader
        title={db.name}
        crumbs={[{ label: 'Databases', href: '/databases' }, { label: db.name }]}
        actions={actions}
        meta={
          <HStack gap={3} vAlign="center" wrap="wrap">
            <HealthBadge health={db.health} />
            <ExecutorLabel mode={db.execution_mode} agentName={agentName} />
            <Text type="supporting" color="secondary">
              {db.paused ? 'Schedule paused' : `${describeSchedule(db.schedule)}${db.next_run_at ? ` · next ${relativeTime(db.next_run_at)}` : ''}`}
            </Text>
          </HStack>
        }
      />

      {created && !db.last_backup && !active && (
        <Banner
          status="success"
          title="Database added"
          description="The schedule is active. Run a first backup now to confirm everything works end to end."
          endContent={<Button label="Run first backup" size="sm" variant="primary" onClick={() => backupNow.run(db)} isLoading={backupNow.isPending} isDisabled={isDemo} />}
        />
      )}

      {active && (
        <Banner
          status="info"
          title={
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text weight="semibold">Backup in progress</Text>
              <BackupStatusBadge status={active.status} stage={active.stage} />
            </HStack>
          }
          description={`${active.name} · started ${relativeTime(active.started_at)}. This page updates automatically.`}
          endContent={<Button label="View progress" size="sm" href={`/backups/${active.id}`} />}
        />
      )}

      <VStack gap={4}>
        <TabList value={tab} onChange={setTab} hasDivider>
          {TABS.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </TabList>

        {tab === 'overview' && <DetailOverview db={db} onTab={setTab} />}
        {tab === 'backups' && <DetailBackups databaseId={db.id} onBackupNow={() => backupNow.run(db)} />}
        {tab === 'schedule' && <ScheduleTab db={db} onDirtyChange={setDirty} isDisabled={isDemo} />}
        {tab === 'connection' && <DetailConnection db={db} onDirtyChange={setDirty} isDisabled={isDemo} />}
        {tab === 'storage' && <DetailStorage db={db} onDirtyChange={setDirty} isDisabled={isDemo} />}
        {tab === 'activity' && <DetailActivity databaseId={db.id} />}
      </VStack>

      <DeleteDatabaseDialog
        database={db}
        isOpen={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => {
          setDirtyState(false)
          navigate({ to: '/databases' })
        }}
      />

      <ConfirmDialog
        isOpen={blocker.status === 'blocked'}
        onOpenChange={(o) => !o && blocker.reset?.()}
        title="Discard unsaved changes?"
        description="You have edits on this tab that have not been saved. Leaving will discard them."
        actionLabel="Discard changes"
        onConfirm={() => {
          setDirtyState(false)
          blocker.proceed?.()
        }}
      />
    </Page>
  )
}

function ScheduleTab({ db, onDirtyChange, isDisabled }: { db: Database; onDirtyChange: (d: boolean) => void; isDisabled?: boolean }) {
  const needConn = needsConnectionView(db)
  const conn = useDatabaseConnection(db.id, needConn && !isDisabled)
  if (needConn && !isDisabled && conn.isLoading) return <BlockSkeleton height={360} />
  if (needConn && conn.error)
    return <Banner status="error" title="Could not load the database configuration" description={errorMessage(conn.error)} />
  return (
    <VStack gap={4} maxWidth={760}>
      <Text type="supporting" color="secondary">
        Times are interpreted in the selected time zone, so a daily 02:00 backup stays at 02:00 local time across daylight saving changes.
        See every database on the <Link href="/schedules" type="inherit">Schedules</Link> page.
      </Text>
      <ScheduleRetentionForm
        key={db.updated_at}
        database={db}
        connection={conn.data}
        layout="page"
        onDirtyChange={onDirtyChange}
        isDisabled={isDisabled}
      />
    </VStack>
  )
}
