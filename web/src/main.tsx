import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { routeTree } from './routeTree.gen'
import { ThemeModeProvider } from './lib/theme/mode'
import { SessionProvider } from './lib/auth/session'
import { ApiError } from './lib/api/client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        {(mode) => (
          <Theme theme={neutralTheme} mode={mode}>
            <SessionProvider>
              <RouterProvider router={router} />
            </SessionProvider>
          </Theme>
        )}
      </ThemeModeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
