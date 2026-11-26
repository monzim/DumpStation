import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export const Route = createFileRoute('/_app/backups/')({ component: RouteComponent })

function RouteComponent() {
  return (
    <Page>
      <PageHeader title="Backups" />
    </Page>
  )
}
