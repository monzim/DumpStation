import { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Text } from '@astryxdesign/core/Text'
import { AlertTriangle, CheckCircle2, Info, ScrollText, XCircle } from 'lucide-react'
import { When } from '@/components/common'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useActivity } from '@/lib/api/hooks'
import type { LogLevel } from '@/lib/api/types'

const PAGE = 25

const ICON: Record<LogLevel, { icon: typeof Info; color: string; label: string }> = {
  info: { icon: Info, color: 'var(--color-text-secondary)', label: 'Info' },
  success: { icon: CheckCircle2, color: 'var(--color-success)', label: 'Success' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Warning' },
  error: { icon: XCircle, color: 'var(--color-error)', label: 'Error' },
}

/** Activity log entries for one database. */
export function DetailActivity({ databaseId }: { databaseId: string }) {
  const [page, setPage] = useState(1)
  const q = useActivity({ entity_id: databaseId, limit: PAGE, offset: (page - 1) * PAGE })
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load activity" />
  if (q.isLoading) return <TableSkeleton rows={5} />
  const logs = q.data?.logs ?? []
  const total = q.data?.total ?? 0
  if (logs.length === 0)
    return (
      <Card>
        <Empty title="No activity yet" description="Changes to this database and its manual backups are recorded here." icon={<ScrollText size={20} />} />
      </Card>
    )
  return (
    <VStack gap={3}>
      <Card padding={0}>
        <VStack gap={0}>
          {logs.map((l, i) => {
            const meta = ICON[l.level] ?? ICON.info
            const Icon = meta.icon
            return (
              <HStack
                key={l.id}
                gap={3}
                vAlign="start"
                paddingInline={4}
                paddingBlock={2}
                style={i > 0 ? { borderTop: 'var(--border-width) solid var(--color-border)' } : undefined}
              >
                <span style={{ color: meta.color, display: 'inline-flex', paddingTop: 'var(--spacing-0-5)' }} aria-label={meta.label}>
                  <Icon size={15} aria-hidden />
                </span>
                <StackItem size="fill" style={{ minWidth: 0 }}>
                  <VStack gap={0.5}>
                    <Text>{l.description}</Text>
                    <Text type="supporting" color="secondary" className="ds-mono">
                      {l.action}
                      {l.ip_address ? ` · ${l.ip_address}` : ''}
                    </Text>
                  </VStack>
                </StackItem>
                <When value={l.created_at} />
              </HStack>
            )
          })}
        </VStack>
      </Card>
      {total > PAGE && <Pagination page={page} onChange={setPage} totalItems={total} pageSize={PAGE} variant="pages" size="sm" />}
    </VStack>
  )
}
