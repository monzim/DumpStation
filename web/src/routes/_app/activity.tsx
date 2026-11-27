import { createFileRoute } from '@tanstack/react-router'
import { endOfDay, parseISO, startOfDay } from 'date-fns'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Text } from '@astryxdesign/core/Text'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, TableSkeleton } from '@/components/states'
import { useActivity } from '@/lib/api/hooks'
import { ActivityFilters, type ActivityFilterValues } from '@/components/activity/ActivityFilters'
import { ActivityTable } from '@/components/activity/ActivityTable'

interface ActivitySearch extends ActivityFilterValues {
  page?: number
  size?: number
}

const PAGE_SIZES = [25, 50, 100]
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export const Route = createFileRoute('/_app/activity')({
  validateSearch: (s: Record<string, unknown>): ActivitySearch => {
    const page = Number(s.page)
    const size = Number(s.size)
    return {
      level: str(s.level),
      action: str(s.action),
      entity_type: str(s.entity_type),
      from: isDate(s.from) ? s.from : undefined,
      to: isDate(s.to) ? s.to : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
      size: PAGE_SIZES.includes(size) ? size : undefined,
    }
  },
  component: ActivityPage,
})

function ActivityPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const page = search.page ?? 1
  const size = search.size ?? PAGE_SIZES[0]

  const q = useActivity({
    level: search.level,
    action: search.action,
    entity_type: search.entity_type,
    // Dates are picked in the viewer's zone; the API expects RFC3339.
    start_date: search.from ? startOfDay(parseISO(search.from)).toISOString() : undefined,
    end_date: search.to ? endOfDay(parseISO(search.to)).toISOString() : undefined,
    limit: size,
    offset: (page - 1) * size,
  })

  const hasFilters = Boolean(search.level || search.action || search.entity_type || search.from || search.to)
  const total = q.data?.total ?? 0

  const setFilters = (patch: Partial<ActivityFilterValues>) =>
    navigate({ search: (prev: ActivitySearch) => ({ ...prev, ...patch, page: undefined }), replace: true })

  return (
    <Page>
      <PageHeader
        title="Activity"
        description="Audit log of sign-ins, backups, restores, agents and configuration changes."
      />
      <ActivityFilters value={search} onChange={setFilters} />
      {q.isLoading ? (
        <TableSkeleton rows={10} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load activity" />
      ) : (
        <VStack gap={3}>
          <div style={{ opacity: q.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }} aria-busy={q.isFetching}>
            <ActivityTable logs={q.data?.logs ?? []} hasFilters={hasFilters} />
          </div>
          {total > 0 && (
            <HStack gap={3} vAlign="center" wrap="wrap" hAlign="between">
              <Text type="supporting" color="secondary">
                {`${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total} entries`}
              </Text>
              <Pagination
                page={page}
                totalItems={total}
                pageSize={size}
                pageSizeOptions={PAGE_SIZES}
                onPageSizeChange={(n) => navigate({ search: (prev: ActivitySearch) => ({ ...prev, size: n === PAGE_SIZES[0] ? undefined : n, page: undefined }) })}
                onChange={(p) => navigate({ search: (prev: ActivitySearch) => ({ ...prev, page: p > 1 ? p : undefined }) })}
                size="sm"
                label="Activity pages"
              />
            </HStack>
          )}
        </VStack>
      )}
    </Page>
  )
}
