import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/Layout'
import { session } from '@/lib/api/client'
import { useSession } from '@/lib/auth/session'

// The server redirects here with the session (or a pending 2FA token) in the
// URL fragment, which is never sent to servers or logged.
export const Route = createFileRoute('/auth/github/return')({ component: GitHubReturn })

function GitHubReturn() {
  const navigate = useNavigate()
  const { signIn } = useSession()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    // Drop the fragment from history immediately.
    window.history.replaceState(null, '', window.location.pathname)
    const token = params.get('token')
    const tfa = params.get('two_factor_token')
    if (token) {
      signIn(token, params.get('exp') ?? undefined)
      navigate({ to: '/', replace: true })
    } else if (tfa) {
      session.setTwoFactorToken(tfa)
      navigate({ to: '/login', search: { step: '2fa' } as never, replace: true })
    } else {
      setFailed(true)
    }
  }, [navigate, signIn])

  return (
    <Center style={{ minHeight: '100dvh' }}>
      {failed ? (
        <VStack gap={3} maxWidth={420}>
          <Banner status="error" title="GitHub sign-in did not return a session." />
          <Button label="Back to sign in" href="/login" />
        </VStack>
      ) : (
        <Spinner size="lg" label="Signing you in" />
      )}
    </Center>
  )
}
