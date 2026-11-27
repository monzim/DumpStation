// Overview dashboard panels. Each takes a slice of the /overview payload.
import type { ReactNode } from 'react'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Link } from '@astryxdesign/core/Link'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { CheckCircle2 } from 'lucide-react'
import { Panel, When } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, FailureCause, HealthBadge } from '@/components/status'
import { actionLabel, entityHref, LevelBadge } from '@/components/activity/meta'
import { bytes, dateTime, relativeTime } from '@/lib/format'
import type { ActivityLog, Backup, Database, Overview, UpcomingRun } from '@/lib/api/types'
import './overview.css'

function List({ children }: { children: ReactNode }) {
  return <ul className="ds-ov-list">{children}</ul>
}

function Calm({ children }: { children: ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" paddingInline={4} paddingBlock={3}>
      <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-text-success)', flex: 'none' }} />
      <Text color="secondary">{children}</Text>
    </HStack>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
      <Text color="secondary">{children}</Text>
    </div>
  )
}

function attentionReason(db: Database): ReactNode {
  if (db.health === 'failing') {
    return <FailureCause code={db.last_backup?.error_code} message={db.last_backup?.error_code ? undefined : 'Last backup failed'} />
  }
  if (db.health === 'never_backed_up') {
    return (
      <Text type="supporting" color="secondary">
        No successful backup yet
      </Text>
    )
  }
  return (
    <Text type="supporting" color="secondary">
      Last success {db.last_success_at ? relativeTime(db.last_success_at) : 'unknown'}
    </Text>
  )
}

export function AttentionPanel({ items, total }: { items: Database[]; total: number }) {
  return (
    <Panel
      title="Needs attention"
      description="Databases that are failing, outdated or never backed up"
      padding={0}
      actions={
        <Link href="/databases" type="supporting">
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <Calm>{total === 1 ? 'The database is' : `All ${total} databases are`} backed up on schedule.</Calm>
      ) : (
        <List>
          {items.map((db) => (
            <li key={db.id}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill" style={{ minWidth: 180 }}>
                  <VStack gap={0.5}>
                    <Link href={`/databases/${db.id}`} weight="medium">
                      {db.name}
                    </Link>
                    {attentionReason(db)}
                  </VStack>
                </StackItem>
                <ExecutorLabel mode={db.execution_mode} />
                <div style={{ minWidth: 104 }}>
                  <HealthBadge health={db.health} />
                </div>
              </HStack>
            </li>
          ))}
        </List>
      )}
    </Panel>
  )
}

export function ActivePanel({ items }: { items: Backup[] }) {
  return (
    <Panel
      title="Running now"
      padding={0}
      actions={
        <Link href="/backups?status=pending,running" type="supporting">
          Queue
        </Link>
      }
    >
      {items.length === 0 ? (
        <Muted>No backups running or queued.</Muted>
      ) : (
        <List>
          {items.map((b) => (
            <li key={b.id}>
              <VStack gap={1}>
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill" style={{ minWidth: 0 }}>
                    <Link href={`/backups/${b.id}`} weight="medium" maxLines={1}>
                      {b.database_name}
                    </Link>
                  </StackItem>
                  <BackupStatusBadge status={b.status} stage={b.stage} />
                </HStack>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <ExecutorLabel mode={b.executor} agentName={b.agent_name} />
                  <Text type="supporting" color="secondary">
                    · {b.run_started_at ? `started ${relativeTime(b.run_started_at)}` : `queued ${relativeTime(b.timestamp)}`}
                  </Text>
                </HStack>
              </VStack>
            </li>
          ))}
        </List>
      )}
    </Panel>
  )
}

export function UpcomingPanel({ items }: { items: UpcomingRun[] }) {
  return (
    <Panel
      title="Upcoming"
      description="Next scheduled backups"
      padding={0}
      actions={
        <Link href="/schedules" type="supporting">
          Schedules
        </Link>
      }
    >
      {items.length === 0 ? (
        <Muted>No scheduled backups. Schedules are set per database.</Muted>
      ) : (
        <List>
          {items.map((u) => (
            <li key={`${u.database_id}-${u.at}`}>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill" style={{ minWidth: 0 }}>
                  <VStack gap={0.5}>
                    <Link href={`/databases/${u.database_id}`} maxLines={1}>
                      {u.database_name}
                    </Link>
                    <ExecutorLabel mode={u.executor} />
                  </VStack>
                </StackItem>
                <Tooltip content={dateTime(u.at)}>
                  <Text type="supporting" className="ds-nowrap">
                    {relativeTime(u.at)}
                  </Text>
                </Tooltip>
              </HStack>
            </li>
          ))}
        </List>
      )}
    </Panel>
  )
}

export function RecentFailuresPanel({ items }: { items: Backup[] }) {
  return (
    <Panel
      title="Recent failures"
      padding={0}
      actions={
        <Link href="/backups?status=failed" type="supporting">
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <Calm>No failed backups recently.</Calm>
      ) : (
        <List>
          {items.map((b) => (
            <li key={b.id}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill" style={{ minWidth: 200 }}>
                  <VStack gap={0.5}>
                    <HStack gap={2} vAlign="center">
                      <Link href={`/backups/${b.id}`} weight="medium">
                        {b.database_name}
                      </Link>
                      <Text type="supporting" color="secondary" className="ds-mono" maxLines={1}>
                        {b.name}
                      </Text>
                    </HStack>
                    <FailureCause code={b.error_code} message={b.error_message} />
                  </VStack>
                </StackItem>
                <ExecutorLabel mode={b.executor} agentName={b.agent_name} />
                <div style={{ minWidth: 88, textAlign: 'end' }}>
                  <When value={b.completed_at ?? b.timestamp} />
                </div>
              </HStack>
            </li>
          ))}
        </List>
      )}
    </Panel>
  )
}

function CountRow({ dot, label, value, href }: { dot: string; label: string; value: number; href: string }) {
  return (
    <HStack gap={2} vAlign="center">
      <span className={`ds-ov-dot ${value > 0 ? dot : ''}`} aria-hidden />
      <StackItem size="fill">
        <Link href={href} color="primary">
          {label}
        </Link>
      </StackItem>
      <Text hasTabularNumbers weight="medium">
        {value}
      </Text>
    </HStack>
  )
}

export function AgentsPanel({ agents }: { agents: Overview['agents'] }) {
  return (
    <Panel
      title="Backup agents"
      actions={
        <Link href="/agents" type="supporting">
          Manage
        </Link>
      }
    >
      {agents.total === 0 ? (
        <Text color="secondary">
          No agents. Add one to back up databases on private networks without opening inbound access.{' '}
          <Link href="/agents">Add an agent</Link>
        </Text>
      ) : (
        <VStack gap={2}>
          <CountRow dot="is-success" label="Online" value={agents.online} href="/agents" />
          <CountRow dot="is-error" label="Offline" value={agents.offline} href="/agents" />
          <CountRow dot="is-warning" label="Awaiting enrollment" value={agents.pending} href="/agents" />
          <CountRow dot="" label="Disabled" value={agents.disabled} href="/agents" />
        </VStack>
      )}
    </Panel>
  )
}

export function StoragePanel({ storage }: { storage: Overview['storage'] }) {
  return (
    <Panel
      title="Storage"
      actions={
        <Link href="/storage" type="supporting">
          Destinations
        </Link>
      }
    >
      <HStack gap={6} wrap="wrap">
        <VStack gap={0.5}>
          <Text type="supporting" color="secondary">
            Used by backups
          </Text>
          <span className="ds-metric-value">{bytes(storage.used_bytes)}</span>
        </VStack>
        <VStack gap={0.5}>
          <Text type="supporting" color="secondary">
            Artifacts
          </Text>
          <span className="ds-metric-value">{storage.artifact_count}</span>
        </VStack>
      </HStack>
      <Text type="supporting" color="secondary">
        {storage.destinations === 0
          ? 'No storage destination configured.'
          : `Across ${storage.destinations} destination${storage.destinations === 1 ? '' : 's'}.`}
      </Text>
    </Panel>
  )
}

export function ActivityPanel({ items }: { items: ActivityLog[] }) {
  return (
    <Panel
      title="Recent activity"
      padding={0}
      actions={
        <Link href="/activity" type="supporting">
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <Muted>No activity recorded yet.</Muted>
      ) : (
        <List>
          {items.slice(0, 8).map((log) => {
            const href = entityHref(log)
            return (
              <li key={log.id}>
                <VStack gap={0.5}>
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill" style={{ minWidth: 0 }}>
                      <Text type="supporting" weight="medium" maxLines={1}>
                        {actionLabel(log.action)}
                      </Text>
                    </StackItem>
                    {log.level !== 'info' && <LevelBadge level={log.level} />}
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill" style={{ minWidth: 0 }}>
                      {href && log.entity_name ? (
                        <Link href={href} type="supporting" maxLines={1}>
                          {log.entity_name}
                        </Link>
                      ) : (
                        <Text type="supporting" color="secondary" maxLines={1}>
                          {log.description || log.entity_name}
                        </Text>
                      )}
                    </StackItem>
                    <Tooltip content={dateTime(log.created_at)}>
                      <Text type="supporting" color="secondary" className="ds-nowrap">
                        {relativeTime(log.created_at)}
                      </Text>
                    </Tooltip>
                  </HStack>
                </VStack>
              </li>
            )
          })}
        </List>
      )}
    </Panel>
  )
}
