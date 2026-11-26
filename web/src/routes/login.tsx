import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Turnstile } from '@marsidev/react-turnstile'
import { Card } from '@astryxdesign/core/Card'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Banner } from '@astryxdesign/core/Banner'
import { Divider } from '@astryxdesign/core/Divider'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Github } from 'lucide-react'
import { API_BASE, api, errorMessage, session } from '@/lib/api/client'
import { useAuthConfig } from '@/lib/api/hooks'
import { useSession } from '@/lib/auth/session'
import type { AuthResponse } from '@/lib/api/types'
import { Wordmark } from '@/components/Wordmark'

interface LoginSearch {
  redirect?: string
  expired?: string
  github_error?: string
  step?: '2fa'
}

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    expired: typeof s.expired === 'string' ? s.expired : undefined,
    github_error: typeof s.github_error === 'string' ? s.github_error : undefined,
    step: s.step === '2fa' ? '2fa' : undefined,
  }),
  component: LoginPage,
})

const GITHUB_ERRORS: Record<string, string> = {
  not_allowed: 'This GitHub account is not allowed to sign in to this DumpStation server.',
  state_mismatch: 'The sign-in request expired. Please try again.',
  upsert_failed: 'Could not create your account. Check the server logs.',
  token_failed: 'Could not issue a session. Check the server logs.',
}

type Step = 'start' | 'otp' | '2fa'

function safeRedirect(r?: string) {
  return r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/login') ? r : '/'
}

function LoginPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { signIn, isAuthenticated } = useSession()
  const cfg = useAuthConfig()
  const siteKey = window.APP_CONFIG?.TURNSTILE_SITE_KEY || ''
  const [step, setStep] = useState<Step>(search.step === '2fa' && session.twoFactorToken() ? '2fa' : 'start')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  const [code, setCode] = useState('')
  const [turnstile, setTurnstile] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const dest = safeRedirect(search.redirect)

  useEffect(() => {
    if (isAuthenticated && step === 'start') navigate({ to: dest as never, replace: true })
  }, [isAuthenticated, step, dest, navigate])

  const finish = (r: AuthResponse) => {
    if (r.requires_2fa && r.two_factor_token) {
      session.setTwoFactorToken(r.two_factor_token)
      setStep('2fa')
      setError(null)
      return
    }
    if (r.token) {
      signIn(r.token, r.expires_at)
      navigate({ to: dest as never, replace: true })
    }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const requestCode = () =>
    run(async () => {
      if (!username.trim()) throw new Error('Enter your username or email')
      if (siteKey && !turnstile) throw new Error('Complete the verification challenge')
      await api('/auth/login', { body: { username: username.trim(), turnstile_token: turnstile || undefined }, anonymous: true })
      setStep('otp')
      setInfo(
        cfg.data?.discord_enabled
          ? 'A 6-digit sign-in code was sent to the configured Discord channel.'
          : 'No Discord webhook is configured: the sign-in code was written to the DumpStation server log.',
      )
      // Turnstile tokens are single-use; reset for a potential resend.
      setTurnstile('')
      setTurnstileKey((k) => k + 1)
    })

  const verifyOtp = () =>
    run(async () => {
      if (!/^\d{6}$/.test(otp)) throw new Error('The code has 6 digits')
      finish(await api<AuthResponse>('/auth/verify', { body: { username: username.trim(), otp }, anonymous: true }))
    })

  const verify2fa = () =>
    run(async () => {
      const c = code.trim().replace(/\s+/g, '')
      if (!c) throw new Error('Enter the code from your authenticator app or a backup code')
      finish(await api<AuthResponse>('/auth/2fa/verify', { body: { code: c }, twoFactor: true, anonymous: true }))
    })

  const demo = () => run(async () => finish(await api<AuthResponse>('/auth/demo-login', { method: 'POST', anonymous: true })))

  const showOtpForm = cfg.data ? cfg.data.discord_enabled || !cfg.data.github_enabled : false

  return (
    <div className="ds-auth-wrap">
      <VStack gap={5} width="100%" maxWidth={400}>
        <HStack hAlign="center">
          <Wordmark size={18} />
        </HStack>
        <Card padding={6} elevation="low">
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={1}>{step === '2fa' ? 'Two-factor authentication' : step === 'otp' ? 'Enter sign-in code' : 'Sign in'}</Heading>
              <Text type="supporting" color="secondary">
                {step === '2fa'
                  ? 'Enter the 8-digit code from your authenticator app, or one of your backup codes.'
                  : step === 'otp'
                    ? `Code for ${username}`
                    : 'PostgreSQL backup management'}
              </Text>
            </VStack>

            {search.expired && step === 'start' && <Banner status="warning" title="Your session expired. Sign in again to continue." />}
            {search.github_error && step === 'start' && (
              <Banner status="error" title={GITHUB_ERRORS[search.github_error] ?? 'GitHub sign-in failed.'} />
            )}
            {error && <Banner status="error" title={error} />}
            {info && step === 'otp' && <Banner status="info" title={info} />}

            {cfg.isLoading && (
              <HStack hAlign="center">
                <Spinner />
              </HStack>
            )}
            {cfg.error && <Banner status="error" title="Cannot reach the DumpStation server" description={errorMessage(cfg.error)} />}

            {step === 'start' && cfg.data && (
              <VStack gap={3}>
                {cfg.data.github_enabled && (
                  <Button
                    label="Continue with GitHub"
                    variant={showOtpForm ? 'secondary' : 'primary'}
                    width="100%"
                    icon={<Github size={16} />}
                    onClick={() => {
                      // Nonce binds the returned session to this browser tab (login-CSRF guard).
                      const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
                      try {
                        sessionStorage.setItem('ds.gh_nonce', nonce)
                      } catch {
                        /* ignore */
                      }
                      window.location.assign(`${API_BASE}/auth/github/login?nonce=${nonce}`)
                    }}
                  />
                )}
                {cfg.data.github_enabled && showOtpForm && <Divider label="or" />}
                {showOtpForm && (
                  <VStack gap={3}>
                    <TextInput
                      label="Username or email"
                      value={username}
                      onChange={setUsername}
                      onEnter={requestCode}
                      autoComplete="username"
                      hasAutoFocus
                    />
                    {siteKey && (
                      <Turnstile
                        key={turnstileKey}
                        siteKey={siteKey}
                        onSuccess={setTurnstile}
                        onExpire={() => setTurnstile('')}
                        options={{ theme: 'auto', size: 'flexible' }}
                      />
                    )}
                    <Button label="Send sign-in code" variant="primary" width="100%" isLoading={busy} onClick={requestCode} />
                  </VStack>
                )}
                {cfg.data.demo_enabled && (
                  <Button label="Explore the read-only demo" variant="ghost" width="100%" isDisabled={busy} onClick={demo} />
                )}
              </VStack>
            )}

            {step === 'otp' && (
              <VStack gap={3}>
                <TextInput
                  label="Sign-in code"
                  value={otp}
                  onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                  onEnter={verifyOtp}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  hasAutoFocus
                />
                <Button label="Verify" variant="primary" width="100%" isLoading={busy} onClick={verifyOtp} />
                <HStack gap={2} hAlign="between">
                  <Button label="Use a different account" variant="ghost" size="sm" onClick={() => { setStep('start'); setOtp(''); setInfo(null) }} />
                  <Button label="Resend code" variant="ghost" size="sm" isDisabled={busy || (!!siteKey && !turnstile)} onClick={requestCode} />
                </HStack>
                {siteKey && (
                  <Turnstile key={turnstileKey} siteKey={siteKey} onSuccess={setTurnstile} onExpire={() => setTurnstile('')} options={{ theme: 'auto', size: 'flexible' }} />
                )}
              </VStack>
            )}

            {step === '2fa' && (
              <VStack gap={3}>
                <TextInput
                  label="Authentication code"
                  value={code}
                  onChange={setCode}
                  onEnter={verify2fa}
                  autoComplete="one-time-code"
                  hasAutoFocus
                />
                <Button label="Verify" variant="primary" width="100%" isLoading={busy} onClick={verify2fa} />
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    session.setTwoFactorToken(null)
                    setStep('start')
                    setCode('')
                  }}
                />
              </VStack>
            )}
          </VStack>
        </Card>
        <Text type="supporting" color="secondary" style={{ textAlign: 'center' }}>
          Self-hosted · open source
        </Text>
      </VStack>
    </div>
  )
}
