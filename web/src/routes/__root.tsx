import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { LinkProvider } from '@astryxdesign/core/Link'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { RouterLink } from '@/components/RouterLink'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => (
    <Center style={{ minHeight: '60vh' }}>
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist or was moved."
        actions={<Button label="Go to overview" variant="primary" href="/" />}
      />
    </Center>
  ),
})

function Root() {
  return (
    <LinkProvider component={RouterLink}>
      <Outlet />
      <ToastViewport />
    </LinkProvider>
  )
}
