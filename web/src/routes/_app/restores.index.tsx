import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { FilterX } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { JobsTabs } from '@/components/backups/JobsTabs'
import { RestoreList } from '@/components/backups/RestoreList'
import { PAGE_SIZES, STATUS_FILTERS } from '@/components/backups/filters'
import { useDatabases, useRestores } from '@/lib/api/hooks'

// The restores API returns the newest N jobs (no offset), so status filtering
// and paging happen on the loaded window.
const WINDOW = 200 // server caps limit at 200 (larger values fall back to 50)

interface RestoreSearch {
  db?: string
  status?: string
  page?: number
  size?: number
}

export const Route = createFileRoute('/_app/restores/')({
  validateSearch: (s: Record<string, unknown>): RestoreSearch => {
    const status = typeof s.status === 'string' ? s.status.split(',').filter((x) => STATUS_FILTERS.some((f) => f.value === x)).join(',') : ''
    const page = Number(s.page)
    const size = Number(s.size)
    return {
      db: typeof s.db === 'string' && s.db ? s.db : undefined,
      status: status || undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
      size: PAGE_SIZES.includes(size) && size !== 25 ? size : undefined,
    }
  },
  component: RestoresPage,
})

function RestoresPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const restores = useRestores({ database_id: search.db, limit: WINDOW })
  const databases = useDatabases()
  const setSearch = (patch: Partial<RestoreSearch>, keepPage = false) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, ...(keepPage ? {} : { page: undefined }) }), replace: true })

  const statuses = search.status ? search.status.split(',') : []
  const all = restores.data ?? []
  const filtered = statuses.length ? all.filter((r) => statuses.includes(r.status)) : all
  const pageSize = search.size ?? 25
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(search.page ?? 1, pageCount)
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const hasFilter = !!(search.db || search.status)

  return (
    <Page>
      <PageHeader title="Restores" description="Every restore started from a backup, with its target and outcome." />
      <JobsTabs value="restores" />
      <VStack gap={3}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Selector
            label="Source database"
            isLabelHidden
            placeholder="All source databases"
            size="sm"
            width={200}
            hasSearch
            hasClear
            value={search.db ?? null}
            onChange={(v) => setSearch({ db: v ?? undefined })}
            options={(databases.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            isLoading={databases.isLoading}
          />
          <MultiSelector
            label="Status"
            isLabelHidden
            placeholder="Any status"
            size="sm"
            width={160}
            value={statuses}
            onChange={(v) => setSearch({ status: v.length ? v.join(',') : undefined })}
            options={STATUS_FILTERS.filter((f) => f.value !== 'deleted')}
            formatValue={(items) => (items.length === 1 ? items[0].label : `${items.length} statuses`)}
            hasClear
          />
          <StackItem size="fill">
            <Text type="supporting" color="secondary" aria-live="polite">
              {restores.isLoading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'restore' : 'restores'}${hasFilter ? ' match these filters' : ''}`}
            </Text>
          </StackItem>
          {hasFilter && <Button label="Clear filters" size="sm" variant="ghost" icon={<FilterX size={14} />} onClick={() => navigate({ search: {}, replace: true })} />}
        </HStack>
        <Card padding={0}>
          <RestoreList
            query={restores}
            rows={rows}
            empty={
              hasFilter
                ? { title: 'No restores match these filters', actions: <Button label="Clear filters" size="sm" onClick={() => navigate({ search: {}, replace: true })} /> }
                : {
                    title: 'No restores yet',
                    description: 'Open a completed backup and choose Restore… to copy it into a database.',
                    actions: <Button label="Browse backups" size="sm" href="/backups?status=success" />,
                  }
            }
          />
        </Card>
        {filtered.length > 0 && (
          <HStack hAlign="end">
            <Pagination
              page={page}
              onChange={(p) => setSearch({ page: p }, true)}
              totalItems={filtered.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(s) => setSearch({ size: s === 25 ? undefined : s })}
              size="sm"
            />
          </HStack>
        )}
      </VStack>
    </Page>
  )
}
