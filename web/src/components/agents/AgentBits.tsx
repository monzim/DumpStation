// Small agent presentation helpers shared by the agent list, detail and onboarding pages.
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { Agent } from '@/lib/api/types'

/** The API may send null for list fields of agents that never enrolled. */
export function normalizeAgent(a: Agent): Agent {
  return {
    ...a,
    pg_versions: a.pg_versions ?? [],
    connections: a.connections ?? [],
    labels: a.labels ?? [],
    upload_modes: a.upload_modes ?? [],
  }
}

export type RestoreState = 'allowed' | 'server_only' | 'agent_only' | 'blocked'

export function restoreState(a: Pick<Agent, 'allow_restore' | 'agent_allow_restore'>): RestoreState {
  if (a.allow_restore && a.agent_allow_restore) return 'allowed'
  if (a.allow_restore) return 'server_only'
  if (a.agent_allow_restore) return 'agent_only'
  return 'blocked'
}

export const RESTORE_TEXT: Record<RestoreState, string> = {
  allowed: 'Restores allowed (server and agent)',
  server_only: 'Allowed on the server, but the agent does not set DUMPSTATION_ALLOW_RESTORE=true',
  agent_only: 'The agent allows restores, but they are turned off here',
  blocked: 'Restores are off on both sides',
}

/** "PG 12–18" for a contiguous run, otherwise "PG 13, 15, 17". */
export function pgVersionsText(v?: string[]): string {
  if (!v || v.length === 0) return '—'
  const n = [...new Set(v.map(Number))].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b)
  if (n.length === 0) return 'PG ' + v.join(', ')
  if (n.length > 2 && n[n.length - 1] - n[0] === n.length - 1) return `PG ${n[0]}–${n[n.length - 1]}`
  return 'PG ' + n.join(', ')
}

export function LabelTokens({ labels, max = 3 }: { labels?: string[]; max?: number }) {
  if (!labels || labels.length === 0) return <Text color="secondary">—</Text>
  const shown = labels.slice(0, max)
  const rest = labels.length - shown.length
  return (
    <HStack gap={1} wrap="wrap">
      {shown.map((l) => (
        <Token key={l} label={l} size="sm" />
      ))}
      {rest > 0 && (
        <Tooltip content={labels.slice(max).join(', ')}>
          <Text type="supporting" color="secondary">
            +{rest}
          </Text>
        </Tooltip>
      )}
    </HStack>
  )
}

/** Compact capability summary: client versions, restore state, transfer modes. */
export function Capabilities({ agent }: { agent: Agent }) {
  if (!agent.enrolled_at && agent.pg_versions.length === 0) return <Text color="secondary">Not reported yet</Text>
  const rs = restoreState(agent)
  return (
    <VStack gap={0}>
      <Tooltip content={agent.pg_versions.length ? `PostgreSQL client tools: ${[...agent.pg_versions].sort((a, b) => Number(a) - Number(b)).join(', ')}` : 'No PostgreSQL client tools reported'}>
        <Text className="ds-nowrap">{pgVersionsText(agent.pg_versions)}</Text>
      </Tooltip>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Tooltip content={RESTORE_TEXT[rs]}>
          <Text type="supporting" color="secondary" className="ds-nowrap">
            {rs === 'allowed' ? 'Restore on' : 'Restore off'}
          </Text>
        </Tooltip>
        {agent.upload_modes.length > 0 && (
          <Tooltip content="Transfer modes: direct uploads to object storage, or proxied through the server">
            <Text type="supporting" color="secondary" className="ds-nowrap">
              · {agent.upload_modes.join(' / ')}
            </Text>
          </Tooltip>
        )}
      </HStack>
    </VStack>
  )
}
