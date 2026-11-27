// Loading, empty and error states with consistent layout.
import type { ReactNode } from 'react'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/Layout'
import { errorMessage } from '@/lib/api/client'

export function ErrorState({ error, onRetry, title = 'Could not load this page' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Banner
      status="error"
      title={title}
      description={errorMessage(error)}
      endContent={onRetry ? <Button label="Retry" size="sm" onClick={onRetry} /> : undefined}
    />
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <VStack gap={2} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={36} index={i} />
      ))}
    </VStack>
  )
}

export function BlockSkeleton({ height = 120 }: { height?: number }) {
  return <Skeleton height={height} />
}

export function Empty({ title, description, icon, actions }: { title: string; description?: string; icon?: ReactNode; actions?: ReactNode }) {
  return <EmptyState title={title} description={description} icon={icon} actions={actions} />
}

/**
 * Renders loading/error states for a query and the children when data exists.
 */
export function QueryBoundary<T>({
  query,
  children,
  loading,
}: {
  query: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }
  children: (data: T) => ReactNode
  loading?: ReactNode
}) {
  if (query.isLoading) return <>{loading ?? <TableSkeleton />}</>
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  return <>{children(query.data)}</>
}
