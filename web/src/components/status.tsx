// Status presentation shared by every page so states look identical everywhere.
import { Badge } from '@astryxdesign/core/Badge'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/Layout'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { CheckCircle2, CircleSlash, Clock, Cpu, PauseCircle, Server, XCircle, AlertTriangle, CircleDashed, Archive } from 'lucide-react'
import type { AgentConnectivity, AgentStatus, BackupStage, BackupStatus, DatabaseHealth, ExecutionMode } from '@/lib/api/types'
import { errorCodeLabel, lifecycleLabel } from '@/lib/format'

const iconSize = 13

export function BackupStatusBadge({ status, stage }: { status: BackupStatus; stage?: BackupStage }) {
  const label = lifecycleLabel(status, stage)
  switch (status) {
    case 'success':
      return <Badge variant="success" label={label} icon={<CheckCircle2 size={iconSize} />} />
    case 'failed':
      return <Badge variant="error" label={label} icon={<XCircle size={iconSize} />} />
    case 'cancelled':
      return <Badge variant="neutral" label={label} icon={<CircleSlash size={iconSize} />} />
    case 'deleted':
      return <Badge variant="neutral" label={label} icon={<Archive size={iconSize} />} />
    case 'running':
      return <Badge variant="info" label={label} icon={<Spinner size="sm" shade="inherit" />} />
    default:
      return (
        <Badge
          variant={stage === 'waiting_for_agent' ? 'warning' : 'neutral'}
          label={label}
          icon={stage === 'waiting_for_agent' ? <AlertTriangle size={iconSize} /> : <Clock size={iconSize} />}
        />
      )
  }
}

const HEALTH: Record<DatabaseHealth, { label: string; variant: 'success' | 'error' | 'warning' | 'neutral' | 'info' }> = {
  healthy: { label: 'Healthy', variant: 'success' },
  running: { label: 'Backing up', variant: 'info' },
  failing: { label: 'Failing', variant: 'error' },
  stale: { label: 'Outdated', variant: 'warning' },
  never_backed_up: { label: 'No backups', variant: 'warning' },
  paused: { label: 'Paused', variant: 'neutral' },
}

export function HealthBadge({ health }: { health?: DatabaseHealth }) {
  if (!health) return null
  const h = HEALTH[health]
  const icon =
    health === 'paused' ? <PauseCircle size={iconSize} /> : health === 'running' ? <Spinner size="sm" shade="inherit" /> : undefined
  return <Badge variant={h.variant} label={h.label} icon={icon} />
}

export function ExecutorLabel({ mode, agentName }: { mode: ExecutionMode; agentName?: string }) {
  return (
    <HStack gap={1} vAlign="center">
      {mode === 'agent' ? <Cpu size={14} aria-hidden /> : <Server size={14} aria-hidden />}
      <Text type="supporting">{mode === 'agent' ? (agentName ? `Agent · ${agentName}` : 'Agent') : 'Direct'}</Text>
    </HStack>
  )
}

export function AgentConnectivityBadge({ status, connectivity }: { status: AgentStatus; connectivity: AgentConnectivity }) {
  if (status === 'revoked') return <Badge variant="error" label="Revoked" icon={<XCircle size={iconSize} />} />
  if (status === 'disabled') return <Badge variant="neutral" label="Disabled" icon={<PauseCircle size={iconSize} />} />
  if (status === 'pending') return <Badge variant="warning" label="Awaiting enrollment" icon={<CircleDashed size={iconSize} />} />
  if (connectivity === 'online') return <Badge variant="success" label="Online" icon={<CheckCircle2 size={iconSize} />} />
  if (connectivity === 'never_connected') return <Badge variant="warning" label="Never connected" icon={<CircleDashed size={iconSize} />} />
  return <Badge variant="error" label="Offline" icon={<AlertTriangle size={iconSize} />} />
}

/** Short failure cause with the full message in a tooltip. */
export function FailureCause({ code, message }: { code?: string; message?: string }) {
  if (!code && !message) return null
  const label = errorCodeLabel(code) || message?.split('\n')[0] || 'Failed'
  return (
    <Tooltip content={message ?? label}>
      <Text type="supporting" color="secondary" maxLines={1}>
        {label}
      </Text>
    </Tooltip>
  )
}
