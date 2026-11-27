import { useMemo, useState } from 'react'
import { pixel, Table, useTableRowExpansion, type TableColumn } from '@astryxdesign/core/Table'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { VStack } from '@astryxdesign/core/Layout'
import { Facts } from '@/components/common'
import { Empty } from '@/components/states'
import { dateTimeSeconds, relativeTime } from '@/lib/format'
import type { ActivityLog } from '@/lib/api/types'
import { actionLabel, entityHref, LevelBadge, parseMetadata } from './meta'

/** The API also embeds the acting user on each entry. */
type LogUser = { email?: string; github_login?: string; discord_username?: string }
type Row = ActivityLog & { user?: LogUser } & Record<string, unknown>

function actorName(u?: LogUser): string | undefined {
  if (!u) return undefined
  return u.github_login || u.discord_username || u.email
}

function Detail({ log }: { log: Row }) {
  const meta = parseMetadata(log.metadata)
  return (
    <VStack gap={3} paddingBlock={2}>
      <Facts
        items={[
          { label: 'Time', value: dateTimeSeconds(log.created_at) },
          { label: 'Action', value: <span className="ds-mono">{log.action}</span> },
          { label: 'Description', value: log.description || '—' },
          { label: 'Actor', value: actorName(log.user) ?? (log.user_id ? log.user_id : 'System') },
          ...(log.entity_type
            ? [{ label: 'Resource', value: `${log.entity_type}${log.entity_name ? ` · ${log.entity_name}` : ''}` }]
            : []),
          ...(log.entity_id ? [{ label: 'Resource ID', value: <span className="ds-mono">{log.entity_id}</span> }] : []),
          { label: 'IP address', value: log.ip_address ? <span className="ds-mono">{log.ip_address}</span> : '—' },
        ]}
      />
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          Metadata
        </Text>
        {meta === null ? (
          <Text color="secondary">No metadata recorded.</Text>
        ) : (
          <pre
            className="ds-mono"
            style={{
              margin: 0,
              padding: 'var(--spacing-3)',
              background: 'var(--color-background-muted)',
              border: 'var(--border-width) solid var(--color-border)',
              borderRadius: 'var(--radius-container)',
              overflowX: 'auto',
              fontSize: '0.8125rem',
              whiteSpace: 'pre',
            }}
          >
            {typeof meta === 'string' ? meta : JSON.stringify(meta, null, 2)}
          </pre>
        )}
      </VStack>
    </VStack>
  )
}

export function ActivityTable({ logs, hasFilters }: { logs: ActivityLog[]; hasFilters: boolean }) {
  const rows = logs as Row[]
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const expansion = useTableRowExpansion<Row>({
    expandedKeys: expanded,
    onToggle: (key) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    getRowKey: (r) => r.id,
    getRowLabel: (r) => `${actionLabel(r.action)} at ${dateTimeSeconds(r.created_at)}`,
    renderExpanded: (r) => <Detail log={r} />,
    panelVariant: 'muted',
  })

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'created_at',
        header: 'Time',
        width: pixel(150),
        renderCell: (r) => (
          <Tooltip content={dateTimeSeconds(r.created_at)}>
            <Text className="ds-nowrap" type="supporting">
              {relativeTime(r.created_at)}
            </Text>
          </Tooltip>
        ),
      },
      { key: 'level', header: 'Level', width: pixel(100), renderCell: (r) => <LevelBadge level={r.level} /> },
      {
        key: 'action',
        header: 'Action',
        width: pixel(210),
        renderCell: (r) => <Text weight="medium">{actionLabel(r.action)}</Text>,
      },
      {
        key: 'entity',
        header: 'Resource',
        width: pixel(180),
        renderCell: (r) => {
          const href = entityHref(r)
          const name = r.entity_name || (r.entity_id ? r.entity_id.slice(0, 8) : '')
          if (!r.entity_type) return <Text color="secondary">—</Text>
          return (
            <VStack gap={0}>
              {href ? (
                <Link href={href} maxLines={1}>
                  {name || r.entity_type}
                </Link>
              ) : (
                <Text maxLines={1}>{name || r.entity_type}</Text>
              )}
              <Text type="supporting" color="secondary">
                {r.entity_type}
              </Text>
            </VStack>
          )
        },
      },
      {
        key: 'description',
        header: 'Description',
        renderCell: (r) => (
          <Text color="secondary" maxLines={2}>
            {r.description}
          </Text>
        ),
      },
      {
        key: 'ip_address',
        header: 'IP',
        width: pixel(130),
        renderCell: (r) =>
          r.ip_address ? (
            <span className="ds-mono ds-nowrap">{r.ip_address}</span>
          ) : (
            <Text color="secondary">—</Text>
          ),
      },
    ],
    [],
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 960 }}>
        <Table<Row>
          data={rows}
          columns={columns}
          idKey="id"
          density="compact"
          hasHover
          plugins={{ expansion }}
          emptyState={
            <Empty
              title={hasFilters ? 'No activity matches these filters' : 'No activity yet'}
              description={
                hasFilters ? 'Try a wider date range or clear the filters.' : 'Sign-ins, backups and configuration changes will appear here.'
              }
            />
          }
        />
      </div>
    </div>
  )
}
