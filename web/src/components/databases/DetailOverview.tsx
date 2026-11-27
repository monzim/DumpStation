import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Button } from '@astryxdesign/core/Button'
import { Facts, Panel, When } from '@/components/common'
import { BackupStatusBadge, ExecutorLabel, FailureCause, HealthBadge } from '@/components/status'
import { useAgents, useNotifications, useStorages, useSystemHealth } from '@/lib/api/hooks'
import type { Database } from '@/lib/api/types'
import { bytes, describeCron } from '@/lib/format'
import { describeRetention, explainRetention, zoneLabel } from './schedule'
import { labelColor, pgVersionLabel } from './display'
import { AgentConnectivityBadge } from '@/components/status'

const HEALTH_TEXT: Record<string, string> = {
  healthy: 'Backups are running on schedule.',
  running: 'A backup is running right now.',
  failing: 'The most recent backup failed. Check the failure cause below.',
  stale: 'No successful backup within the expected window.',
  never_backed_up: 'This database has not been backed up yet.',
  paused: 'Scheduled backups are paused. Manual backups still work.',
}

export function DetailOverview({ db, onTab }: { db: Database; onTab: (tab: string) => void }) {
  const agents = useAgents()
  const storages = useStorages()
  const notifications = useNotifications()
  const health = useSystemHealth()
  const agent = agents.data?.find((a) => a.id === db.agent_id)
  const storage = storages.data?.find((s) => s.id === db.storage_id)
  const notification = notifications.data?.find((n) => n.id === db.notification_id)
  const last = db.last_backup

  return (
    <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
      <Panel title="Health">
        <HStack gap={2} vAlign="center" wrap="wrap">
          <HealthBadge health={db.health} />
          <Text type="supporting" color="secondary">
            {HEALTH_TEXT[db.health ?? ''] ?? ''}
          </Text>
        </HStack>
        <Facts
          items={[
            { label: 'Last success', value: <When value={db.last_success_at} empty="Never" /> },
            {
              label: 'Next scheduled',
              value: db.paused ? <Text color="secondary">Paused</Text> : <When value={db.next_run_at} empty="Not scheduled" />,
            },
            {
              label: 'Last backup',
              value: last ? (
                <VStack gap={0.5} hAlign="start">
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <BackupStatusBadge status={last.status} stage={last.stage} />
                    <Link href={`/backups/${last.id}`}>{last.name}</Link>
                  </HStack>
                  <HStack gap={2} wrap="wrap">
                    <When value={last.completed_at ?? last.started_at} />
                    {last.size_bytes ? (
                      <Text type="supporting" color="secondary">
                        {bytes(last.size_bytes)}
                      </Text>
                    ) : null}
                  </HStack>
                  {last.status === 'failed' && <FailureCause code={last.error_code} />}
                </VStack>
              ) : (
                <Text color="secondary">None yet</Text>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Connection" actions={<Button label="Edit" size="sm" variant="ghost" onClick={() => onTab('connection')} />}>
        <Facts
          items={[
            { label: 'Execution', value: <ExecutorLabel mode={db.execution_mode} agentName={agent?.name} /> },
            ...(db.execution_mode === 'agent'
              ? [
                  {
                    label: 'Agent',
                    value: agent ? (
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                        <AgentConnectivityBadge status={agent.status} connectivity={agent.connectivity} />
                      </HStack>
                    ) : (
                      '—'
                    ),
                  },
                ]
              : []),
            ...(db.execution_mode === 'agent' && db.agent_connection
              ? [
                  { label: 'Agent connection', value: <Text className="ds-mono">{db.agent_connection}</Text> },
                  { label: 'Credentials', value: 'Stay on the agent' },
                ]
              : [
                  { label: 'Host', value: <Text className="ds-mono">{db.host || '—'}</Text> },
                  { label: 'Database', value: <Text className="ds-mono">{db.dbname || '—'}</Text> },
                  { label: 'User', value: <Text className="ds-mono">{db.user || '—'}</Text> },
                  { label: 'Credentials', value: 'Stored encrypted by DumpStation' },
                ]),
            { label: 'PostgreSQL', value: pgVersionLabel(db) === 'Auto' ? 'Auto-detect' : pgVersionLabel(db) },
          ]}
        />
      </Panel>

      <Panel title="Schedule and retention" actions={<Button label="Edit" size="sm" variant="ghost" onClick={() => onTab('schedule')} />}>
        <Facts
          items={[
            {
              label: 'Schedule',
              value: (
                <VStack gap={0}>
                  <Text>{describeCron(db.schedule)}</Text>
                  <Text type="supporting" color="secondary" className="ds-mono">
                    {db.schedule}
                  </Text>
                </VStack>
              ),
            },
            { label: 'Time zone', value: zoneLabel(db.timezone, health.data?.timezone) },
            { label: 'State', value: db.paused ? 'Paused' : 'Active' },
            {
              label: 'Retention',
              value: (
                <VStack gap={0}>
                  <Text>{describeRetention(db.rotation_policy)}</Text>
                  <Text type="supporting" color="secondary">
                    {explainRetention(db.rotation_policy)}
                  </Text>
                </VStack>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Storage and notifications" actions={<Button label="Edit" size="sm" variant="ghost" onClick={() => onTab('storage')} />}>
        <Facts
          items={[
            { label: 'Storage', value: storage ? <Link href="/storage">{storage.name}</Link> : '—' },
            { label: 'Notifications', value: notification ? <Link href="/notifications">{notification.name}</Link> : <Text color="secondary">None</Text> },
            {
              label: 'Labels',
              value:
                db.labels && db.labels.length > 0 ? (
                  <HStack gap={1} wrap="wrap">
                    {db.labels.map((l) => (
                      <Token key={l.id} label={l.name} size="sm" color={labelColor(l.color)} />
                    ))}
                  </HStack>
                ) : (
                  <Text color="secondary">None</Text>
                ),
            },
          ]}
        />
      </Panel>
    </Grid>
  )
}
