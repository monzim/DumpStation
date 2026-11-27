import { createFileRoute } from '@tanstack/react-router'
import { VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Link } from '@astryxdesign/core/Link'
import { Card } from '@astryxdesign/core/Card'
import { Plus, Cpu } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { When } from '@/components/common'
import { AgentConnectivityBadge } from '@/components/status'
import { Empty, QueryBoundary, TableSkeleton } from '@/components/states'
import { useAgents } from '@/lib/api/hooks'
import type { Agent } from '@/lib/api/types'
import { useSession } from '@/lib/auth/session'
import { Capabilities, LabelTokens, normalizeAgent } from '@/components/agents/AgentBits'

export const Route = createFileRoute('/_app/agents/')({ component: AgentsPage })

type Row = Agent & Record<string, unknown>

function AgentsPage() {
  const q = useAgents()
  const { isDemo } = useSession()
  const add = <Button label="Add agent" variant="primary" icon={<Plus size={16} />} href="/agents/new" isDisabled={isDemo} />
  return (
    <Page>
      <PageHeader
        title="Backup Agents"
        description="Outbound-only workers that back up databases in private networks."
        actions={q.data && q.data.length > 0 ? add : undefined}
      />
      <QueryBoundary query={q} loading={<TableSkeleton rows={4} />}>
        {(agents) =>
          agents.length === 0 ? (
            <Card>
              <Empty
                icon={<Cpu size={28} />}
                title="No agents yet"
                description="An agent is a small container you run next to a private database. It connects out to DumpStation over HTTPS, so you do not need inbound ports, a VPN or a public database. Backups run on the agent and upload straight to your storage."
                actions={add}
              />
            </Card>
          ) : (
            <AgentsTable agents={agents} />
          )
        }
      </QueryBoundary>
    </Page>
  )
}

function AgentsTable({ agents }: { agents: Agent[] }) {
  const rows = agents.map(normalizeAgent).sort((a, b) => a.name.localeCompare(b.name)) as Row[]
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: rows.length ? 1000 : undefined }}>
        <Table<Row>
          data={rows}
          idKey="id"
          density="compact"
          hasHover
          verticalAlign="top"
          columns={[
            {
              key: 'name',
              header: 'Agent',
              width: { type: 'proportional', value: 2, minWidth: 200 },
              renderCell: (a) => (
                <VStack gap={0.5}>
                  <Link href={`/agents/${a.id}`}>
                    <Text weight="medium">{a.name}</Text>
                  </Link>
                  {a.description && (
                    <Text type="supporting" color="secondary" maxLines={1}>
                      {a.description}
                    </Text>
                  )}
                </VStack>
              ),
            },
            {
              key: 'connectivity',
              header: 'Status',
              width: { type: 'proportional', value: 1.7, minWidth: 170 },
              renderCell: (a) => (
                <VStack gap={0.5}>
                  <AgentConnectivityBadge status={a.status} connectivity={a.connectivity} />
                  <When value={a.last_seen_at} empty={a.enrolled_at ? 'No heartbeat' : 'Not enrolled'} />
                </VStack>
              ),
            },
            { key: 'version', header: 'Version', width: { type: 'proportional', value: 0.8, minWidth: 80 }, renderCell: (a) => <Text className="ds-mono">{a.version || '—'}</Text> },
            {
              key: 'database_count',
              width: { type: 'proportional', value: 0.9, minWidth: 90 },
              header: 'Databases',
              align: 'end',
              renderCell: (a) => <Text hasTabularNumbers>{a.database_count}</Text>,
            },
            {
              key: 'running_jobs',
              width: { type: 'proportional', value: 0.8, minWidth: 80 },
              header: 'Running',
              align: 'end',
              renderCell: (a) => (
                <Text hasTabularNumbers color={a.running_jobs ? undefined : 'secondary'}>
                  {a.running_jobs}
                  {a.max_concurrency ? ` / ${a.max_concurrency}` : ''}
                </Text>
              ),
            },
            {
              key: 'recent_failures',
              width: { type: 'proportional', value: 1, minWidth: 100 },
              header: 'Failures (7d)',
              align: 'end',
              renderCell: (a) =>
                a.recent_failures > 0 ? (
                  <Link href={`/backups?agent_id=${a.id}&status=failed`}>
                    <Text hasTabularNumbers>{a.recent_failures}</Text>
                  </Link>
                ) : (
                  <Text hasTabularNumbers color="secondary">
                    0
                  </Text>
                ),
            },
            { key: 'capabilities', header: 'Capabilities', width: { type: 'proportional', value: 1.5, minWidth: 150 }, renderCell: (a) => <Capabilities agent={a} /> },
            { key: 'labels', header: 'Labels', width: { type: 'proportional', value: 1.3, minWidth: 130 }, renderCell: (a) => <LabelTokens labels={a.labels} /> },
          ]}
        />
      </div>
    </div>
  )
}
