import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export const Route = createFileRoute('/_app/activity')({ component: RouteComponent })

function RouteComponent() {
  return (
    <Page>
      <PageHeader title="Activity" />
    </Page>
  )
}
