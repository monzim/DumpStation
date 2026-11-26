import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { session } from '@/lib/api/client'
import { AppLayout } from '@/components/shell/AppLayout'

// Every authenticated page lives under this pathless layout route.
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ location }) => {
    if (!session.token()) {
      throw redirect({ to: '/login', search: { redirect: location.href } as never })
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})
