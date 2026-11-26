import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, useTableSortable } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { Token } from '@astryxdesign/core/Token'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Database as DatabaseIcon, FilterX, PauseCircle, Plus } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { When } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, HealthBadge } from '@/components/status'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { DeleteDatabaseDialog, ScheduleDialog, useBackupNow, usePauseToggle } from '@/components/databases/actions'
import { describeSchedule } from '@/components/databases/schedule'
import { HEALTH_OPTIONS, labelColor, pgVersionLabel } from '@/components/databases/display'
import { useAgents, useDatabases, useStorages } from '@/lib/api/hooks'
import type { Database, DatabaseHealth, ExecutionMode } from '@/lib/api/types'
import { useSession } from '@/lib/auth/session'

interface DatabasesSearch {
  q?: string
  health?: DatabaseHealth
  executor?: ExecutionMode
  agent?: string
  storage?: string
  sort?: string
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const HEALTH_VALUES = HEALTH_OPTIONS.map((h) => h.value)
const SORTS = ['name', 'health', 'version', 'last_success', 'next_run']

function parseSearch(s: Record<string, unknown>): DatabasesSearch {
  const health = str(s.health) as DatabaseHealth | undefined
  const executor = str(s.executor)
  const sort = str(s.sort)
  return {
    q: str(s.q),
    health: health && HEALTH_VALUES.includes(health) ? health : undefined,
    executor: executor === 'direct' || executor === 'agent' ? executor : undefined,
    agent: str(s.agent),
    storage: str(s.storage),
    sort: sort && SORTS.includes(sort.replace(/^-/, '')) ? sort : undefined,
  }
}

export const Route = createFileRoute('/_app/databases/')({
  validateSearch: (s: Record<string, unknown>): DatabasesSearch => parseSearch(s),
  component: DatabasesPage,
})

type Row = Database & Record<string, unknown>

// Severity order for sorting by health (worst first when ascending).
const HEALTH_RANK: Record<string, number> = { failing: 0, stale: 1, never_backed_up: 2, running: 3, paused: 4, healthy: 5 }

const time = (v?: string) => (v ? new Date(v).getTime() : Number.NaN)

function compare(a: Database, b: Database, key: string): number {
  const nullsLast = (x: number, y: number) => (Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : Number.isNaN(y) ? -1 : x - y)
  switch (key) {
    case 'health':
      return (HEALTH_RANK[a.health ?? ''] ?? 9) - (HEALTH_RANK[b.health ?? ''] ?? 9)
    case 'version':
      return pgVersionLabel(a).localeCompare(pgVersionLabel(b), undefined, { numeric: true })
    case 'last_success':
      return nullsLast(time(a.last_success_at), time(b.last_success_at))
    case 'next_run':
      return nullsLast(a.paused ? Number.NaN : time(a.next_run_at), b.paused ? Number.NaN : time(b.next_run_at))
    default:
      return a.name.localeCompare(b.name)
  }
}

function DatabasesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const databases = useDatabases()
  const agents = useAgents()
  const storages = useStorages()
  const backupNow = useBackupNow()
  const pause = usePauseToggle()
  const [deleteOf, setDeleteOf] = useState<Database | null>(null)
  const [scheduleOf, setScheduleOf] = useState<string | null>(null)

  const setSearch = (patch: Partial<DatabasesSearch>) => navigate({ search: (prev) => parseSearch({ ...prev, ...patch }), replace: true })

  const [q, setQ] = useState(search.q ?? '')
  useEffect(() => setQ(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === q.trim()) return
    const t = setTimeout(() => setSearch({ q: q.trim() || undefined }), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const agentName = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a.name])), [agents.data])
  const storageName = useMemo(() => new Map((storages.data ?? []).map((s) => [s.id, s.name])), [storages.data])

  const sortParam = search.sort ?? 'name'
  const sortKey = sortParam.replace(/^-/, '')
  const descending = sortParam.startsWith('-')
  const sort = useTableSortable<Row>({
    sort: [{ sortKey, direction: descending ? 'descending' : 'ascending' }],
    onSortChange: (s) => {
      const e = s[0]
      if (!e || (e.sortKey === 'name' && e.direction === 'ascending')) return setSearch({ sort: undefined })
      setSearch({ sort: (e.direction === 'descending' ? '-' : '') + e.sortKey })
    },
    allowUnsortedState: false,
  })

  const all = databases.data ?? []
  const rows = useMemo(() => {
    const needle = (search.q ?? '').toLowerCase()
    const out = all.filter(
      (d) =>
        (!needle || d.name.toLowerCase().includes(needle) || d.labels?.some((l) => l.name.toLowerCase().includes(needle))) &&
        (!search.health || d.health === search.health) &&
        (!search.executor || d.execution_mode === search.executor) &&
        (!search.agent || d.agent_id === search.agent) &&
        (!search.storage || d.storage_id === search.storage),
    )
    out.sort((a, b) => {
      const c = compare(a, b, sortKey)
      return (descending ? -c : c) || a.name.localeCompare(b.name)
    })
    return out as Row[]
  }, [all, search.q, search.health, search.executor, search.agent, search.storage, sortKey, descending])

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Database',
        sortable: true,
        width: { type: 'proportional', value: 1.6, minWidth: 170 },
        renderCell: (d) => (
          <VStack gap={0.5}>
            <Link href={`/databases/${d.id}`}>
              <Text weight="medium">{d.name}</Text>
            </Link>
            {d.labels && d.labels.length > 0 && (
              <HStack gap={1} wrap="wrap">
                {d.labels.map((l) => (
                  <Token key={l.id} label={l.name} size="sm" color={labelColor(l.color)} />
                ))}
              </HStack>
            )}
          </VStack>
        ),
      },
      {
        key: 'health',
        header: 'Health',
        sortable: true,
        width: { type: 'pixel', value: 160 },
        renderCell: (d) => (
          <VStack gap={0.5} hAlign="start">
            {d.active_backup ? <BackupStatusBadge status={d.active_backup.status} stage={d.active_backup.stage} /> : <HealthBadge health={d.health} />}
          </VStack>
        ),
      },
      {
        key: 'executor',
        header: 'Execution',
        width: { type: 'proportional', value: 1.2, minWidth: 180 },
        renderCell: (d) => <ExecutorLabel mode={d.execution_mode} agentName={d.agent_id ? agentName.get(d.agent_id) : undefined} />,
      },
      {
        key: 'version',
        header: 'PostgreSQL',
        sortable: true,
        width: { type: 'pixel', value: 110 },
        renderCell: (d) => <Text color={d.postgres_version && d.postgres_version !== 'latest' ? undefined : 'secondary'}>{pgVersionLabel(d)}</Text>,
      },
      {
        key: 'last_success',
        header: 'Last success',
        sortable: true,
        width: { type: 'pixel', value: 120 },
        renderCell: (d) => <When value={d.last_success_at} empty="Never" />,
      },
      {
        key: 'next_run',
        header: 'Next backup',
        sortable: true,
        width: { type: 'proportional', value: 1.3, minWidth: 160 },
        renderCell: (d) => (
          <VStack gap={0}>
            {d.paused ? (
              <HStack gap={1} vAlign="center">
                <PauseCircle size={13} aria-hidden />
                <Text color="secondary">Paused</Text>
              </HStack>
            ) : (
              <When value={d.next_run_at} />
            )}
            <Text type="supporting" color="secondary" maxLines={1}>
              {describeSchedule(d.schedule)}
            </Text>
          </VStack>
        ),
      },
      {
        key: 'storage',
        header: 'Storage',
        width: { type: 'proportional', value: 1, minWidth: 110 },
        renderCell: (d) => <Text maxLines={1}>{storageName.get(d.storage_id) ?? '—'}</Text>,
      },
      {
        key: 'actions',
        header: '',
        align: 'end',
        width: { type: 'pixel', value: 56 },
        renderCell: (d) => (
          <MoreMenu
            label={`Actions for ${d.name}`}
            alignment="end"
            items={[
              { label: 'Back up now', isDisabled: isDemo || !!d.active_backup, onClick: () => backupNow.run(d) },
              { label: d.paused ? 'Resume schedule' : 'Pause schedule', isDisabled: isDemo, onClick: () => pause.toggle(d) },
              { label: 'Edit schedule…', isDisabled: isDemo, onClick: () => setScheduleOf(d.id) },
              { label: 'Edit settings', href: `/databases/${d.id}?tab=connection` },
              { label: 'View backups', href: `/backups?db=${d.id}` },
              { type: 'divider' },
              { label: 'Delete…', variant: 'destructive', isDisabled: isDemo, onClick: () => setDeleteOf(d) },
            ]}
          />
        ),
      },
    ],
    [agentName, storageName, isDemo, backupNow, pause],
  )

  const filtered = !!(search.q || search.health || search.executor || search.agent || search.storage)
  const addButton = <Button label="Add database" variant="primary" icon={<Plus size={16} />} href="/databases/new" isDisabled={isDemo} />
  const running = all.filter((d) => d.active_backup).length

  return (
    <Page>
      <PageHeader
        title="Databases"
        description="PostgreSQL databases DumpStation backs up, with their health, schedule and where backups go."
        actions={addButton}
      />

      {databases.error && !databases.data ? (
        <ErrorState error={databases.error} onRetry={() => databases.refetch()} title="Could not load databases" />
      ) : databases.isLoading ? (
        <TableSkeleton rows={6} />
      ) : all.length === 0 ? (
        <Card>
          <Empty
            title="No databases yet"
            description="Add a PostgreSQL database to start taking scheduled backups. Connect directly, or through an agent inside a private network."
            icon={<DatabaseIcon size={20} />}
            actions={addButton}
          />
        </Card>
      ) : (
        <VStack gap={3}>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <StackItem size="fill" style={{ minWidth: 200 }}>
              <TextInput label="Search" isLabelHidden startIcon="search" placeholder="Search by name or label" value={q} onChange={setQ} hasClear size="sm" />
            </StackItem>
            <Selector
              label="Health"
              isLabelHidden
              placeholder="Any health"
              size="sm"
              width={150}
              hasClear
              value={search.health ?? null}
              onChange={(v) => setSearch({ health: (v as DatabaseHealth) ?? undefined })}
              options={HEALTH_OPTIONS}
            />
            <Selector
              label="Execution"
              isLabelHidden
              placeholder="Direct or agent"
              size="sm"
              width={150}
              hasClear
              value={search.executor ?? null}
              onChange={(v) => setSearch({ executor: (v as ExecutionMode) ?? undefined })}
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
              options={(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              emptyText="No agents"
              isLoading={agents.isLoading}
            />
            <Selector
              label="Storage"
              isLabelHidden
              placeholder="Any storage"
              size="sm"
              width={150}
              hasClear
              value={search.storage ?? null}
              onChange={(v) => setSearch({ storage: v ?? undefined })}
              options={(storages.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              emptyText="No storage"
              isLoading={storages.isLoading}
            />
          </HStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <Text type="supporting" color="secondary" aria-live="polite">
                {filtered ? `${rows.length} of ${all.length} databases` : `${all.length} ${all.length === 1 ? 'database' : 'databases'}`}
                {running > 0 ? ` · ${running} backing up now` : ''}
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
                  navigate({ search: { sort: search.sort }, replace: true })
                }}
              />
            )}
          </HStack>
          <Card padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1080 }}>
                <Table<Row>
                  data={rows}
                  columns={columns}
                  idKey="id"
                  density="compact"
                  hasHover
                  verticalAlign="middle"
                  plugins={{ sort }}
                  emptyState={
                    <Empty
                      title="No databases match these filters"
                      description="Try a different search or fewer filters."
                      icon={<FilterX size={20} />}
                      actions={
                        <Button
                          label="Clear filters"
                          size="sm"
                          onClick={() => {
                            setQ('')
                            navigate({ search: {}, replace: true })
                          }}
                        />
                      }
                    />
                  }
                />
              </div>
            </div>
          </Card>
        </VStack>
      )}

      <DeleteDatabaseDialog database={deleteOf} isOpen={!!deleteOf} onOpenChange={(o) => !o && setDeleteOf(null)} />
      <ScheduleDialog databaseId={scheduleOf} isOpen={!!scheduleOf} onOpenChange={(o) => !o && setScheduleOf(null)} />
    </Page>
  )
}
