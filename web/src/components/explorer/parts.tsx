import type { ReactNode } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Button } from '@astryxdesign/core/Button'
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import { relativeTime, dateTime } from '@/lib/format'
import { errorMessage } from '@/lib/api/client'
import type { ServerConnection } from './api'

/** Last connection test outcome for a saved server. */
export function LastTest({ server }: { server: ServerConnection }) {
  if (!server.last_tested_at || !server.last_test_status) {
    return <Badge variant="neutral" label="Not tested" icon={<CircleDashed size={13} />} />
  }
  const ok = server.last_test_status === 'ok'
  const badge = ok ? (
    <Badge variant="success" label="Reachable" icon={<CheckCircle2 size={13} />} />
  ) : (
    <Badge variant="error" label="Failed" icon={<XCircle size={13} />} />
  )
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {ok ? badge : <Tooltip content={server.last_test_error || 'Connection failed'}>{badge}</Tooltip>}
      <Tooltip content={dateTime(server.last_tested_at)}>
        <Text type="supporting" color="secondary" className="ds-nowrap">
          {relativeTime(server.last_tested_at)}
        </Text>
      </Tooltip>
    </HStack>
  )
}

/** Error from the remote PostgreSQL server (502 / 403 / timeouts) with retry. */
export function RemoteError({ error, onRetry, what }: { error: unknown; onRetry: () => void; what: string }) {
  return (
    <Banner
      status="error"
      title={`Could not load ${what} from the server`}
      description={errorMessage(error)}
      endContent={<Button label="Retry" size="sm" onClick={onRetry} />}
    />
  )
}

/** Small "label: value" pairs shown under page headers. */
export function MetaRow({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <HStack gap={5} wrap="wrap">
      {items.map((it) => (
        <VStack key={it.label} gap={0.5}>
          <Text type="supporting" color="secondary">
            {it.label}
          </Text>
          {typeof it.value === 'string' || typeof it.value === 'number' ? <Text className="ds-mono">{it.value}</Text> : it.value}
        </VStack>
      ))}
    </HStack>
  )
}

export function formatRowEstimate(n: number) {
  if (n < 0) return '—'
  return n.toLocaleString()
}
