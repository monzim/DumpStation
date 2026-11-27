import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { CalendarClock, Plus } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { When } from '@/components/common'
import { ExecutorLabel } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { ScheduleDialog, usePauseToggle } from '@/components/databases/actions'
import { describeRetention, describeSchedule, realZone, zoneLabel } from '@/components/databases/schedule'
import { useAgents, useDatabases, useSystemHealth } from '@/lib/api/hooks'
import type { Database } from '@/lib/api/types'
import { useSession } from '@/lib/auth/session'

export const Route = createFileRoute('/_app/schedules')({ component: SchedulesPage })

type Row = Database & Record<string, unknown>

function nextRun(d: Database) {
  if (d.paused || !d.next_run_at) return Number.POSITIVE_INFINITY
  return new Date(d.next_run_at).getTime()
}

function SchedulesPage() {
  const { isDemo } = useSession()
  const databases = useDatabases()
  const agents = useAgents()
  const health = useSystemHealth()
  const pause = usePauseToggle()
  const [editing, setEditing] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const serverZone = realZone(health.data?.timezone)

  const agentName = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a.name])), [agents.data])
  const all = databases.data ?? []
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((d) => !needle || d.name.toLowerCase().includes(needle))
      .sort((a, b) => nextRun(a) - nextRun(b) || a.name.localeCompare(b.name)) as Row[]
  }, [all, q])

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Database',
        width: { type: 'proportional', value: 1.6, minWidth: 160 },
        renderCell: (d) => (
          <Link href={`/databases/${d.id}?tab=schedule`}>
            <Text weight="medium">{d.name}</Text>
          </Link>
        ),
      },
      {
        key: 'schedule',
        header: 'Schedule',
        width: { type: 'proportional', value: 2, minWidth: 200 },
        renderCell: (d) => (
          <VStack gap={0}>
            <Text maxLines={1}>{describeSchedule(d.schedule)}</Text>
            <Text type="supporting" color="secondary" className="ds-mono">
              {d.schedule}
            </Text>
          </VStack>
        ),
      },
      {
        key: 'timezone',
        header: 'Time zone',
        width: { type: 'proportional', value: 1.4, minWidth: 140 },
        renderCell: (d) => (
          <Text type="supporting" color={d.timezone ? undefined : 'secondary'}>
            {zoneLabel(d.timezone, serverZone)}
          </Text>
        ),
      },
      {
        key: 'next',
        header: 'Next run',
        width: { type: 'proportional', value: 1.2, minWidth: 120 },
        renderCell: (d) => (d.paused ? <Text color="secondary">Paused</Text> : <When value={d.next_run_at} />),
      },
      {
        key: 'active',
        header: 'Active',
        width: { type: 'proportional', value: 0.9, minWidth: 90 },
        renderCell: (d) => (
          <Switch
            label={d.paused ? `Resume scheduled backups for ${d.name}` : `Pause scheduled backups for ${d.name}`}
            isLabelHidden
            value={!d.paused}
            size="sm"
            isLoading={pause.pendingId === d.id}
            isDisabled={isDemo}
            onChange={() => pause.toggle(d)}
          />
        ),
      },
      {
        key: 'retention',
        header: 'Retention',
        width: { type: 'proportional', value: 1.3, minWidth: 130 },
        renderCell: (d) => <Text type="supporting">{describeRetention(d.rotation_policy)}</Text>,
      },
      {
        key: 'executor',
        header: 'Execution',
        width: { type: 'proportional', value: 1.8, minWidth: 180 },
        renderCell: (d) => <ExecutorLabel mode={d.execution_mode} agentName={d.agent_id ? agentName.get(d.agent_id) : undefined} />,
      },
      {
        key: 'edit',
        header: '',
        align: 'end',
        width: { type: 'proportional', value: 0.8, minWidth: 80 },
        renderCell: (d) => <Button label="Edit" size="sm" variant="ghost" onClick={() => setEditing(d.id)} isDisabled={isDemo} />,
      },
    ],
    [agentName, serverZone, isDemo, pause],
  )

  const pausedCount = all.filter((d) => d.paused).length

  return (
    <Page>
      <PageHeader
        title="Schedules"
        description="When each database is backed up, ordered by the next run. Each schedule runs in its own time zone, so a daily 02:00 backup stays at 02:00 local time across daylight saving changes; schedules without a zone use the server's."
      />
      {databases.error && !databases.data ? (
        <ErrorState error={databases.error} onRetry={() => databases.refetch()} title="Could not load schedules" />
      ) : databases.isLoading ? (
        <TableSkeleton rows={6} />
      ) : all.length === 0 ? (
        <Card>
          <Empty
            title="No schedules yet"
            description="Every database gets a backup schedule when you add it."
            icon={<CalendarClock size={20} />}
            actions={<Button label="Add database" variant="primary" icon={<Plus size={16} />} href="/databases/new" isDisabled={isDemo} />}
          />
        </Card>
      ) : (
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <StackItem size="fill" style={{ minWidth: 200, maxWidth: 360 }}>
              <TextInput label="Search" isLabelHidden startIcon="search" placeholder="Search databases" value={q} onChange={setQ} hasClear size="sm" />
            </StackItem>
            <StackItem size="fill">
              <Text type="supporting" color="secondary">
                {all.length} {all.length === 1 ? 'schedule' : 'schedules'}
                {pausedCount ? ` · ${pausedCount} paused` : ''}
                {serverZone ? ` · server time zone ${serverZone}` : ''}
              </Text>
            </StackItem>
          </HStack>
          <Card padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1040 }}>
                <Table<Row>
                  data={rows}
                  columns={columns}
                  idKey="id"
                  density="compact"
                  hasHover
                  emptyState={<Empty title="No databases match" description="Try a different search." />}
                />
              </div>
            </div>
          </Card>
        </VStack>
      )}
      <ScheduleDialog databaseId={editing} isOpen={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </Page>
  )
}
