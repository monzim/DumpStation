import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export const Route = createFileRoute('/_app/users')({ component: RouteComponent })

function RouteComponent() {
  return (
    <Page>
      <PageHeader title="Users" />
    </Page>
  )
}
