import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, session, setUnauthorizedHandler } from '../api/client'
import type { RefreshResponse, UserProfile } from '../api/types'
import { useMe } from '../api/hooks'

interface SessionContextValue {
  isAuthenticated: boolean
  user: UserProfile | undefined
  isAdmin: boolean
  isDemo: boolean
  signIn: (token: string, expiresAt?: string, sessionExpiresAt?: string) => void
  signOut: (reason?: 'expired' | 'manual') => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

/** Navigate to login without depending on the router instance. */
function goToLogin(reason: 'expired' | 'manual') {
  const here = window.location.pathname + window.location.search
  const params = new URLSearchParams()
  if (reason === 'expired') params.set('expired', '1')
  if (here && !here.startsWith('/login')) params.set('redirect', here)
  window.location.assign(`/login${params.toString() ? `?${params}` : ''}`)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [token, setToken] = useState<string | null>(() => session.token())
  const me = useMe(!!token)
  const lastActivity = useRef(Date.now())

  const signIn = useCallback(
    (t: string, exp?: string, sessExp?: string) => {
      session.set(t, exp, sessExp)
      setToken(t)
      qc.invalidateQueries()
    },
    [qc],
  )

  const signOut = useCallback(
    async (reason: 'expired' | 'manual' = 'manual') => {
      if (reason === 'manual') {
        try {
          await api('/auth/logout', { method: 'POST' })
        } catch {
          /* token may already be invalid */
        }
      }
      session.clear()
      setToken(null)
      qc.clear()
      goToLogin(reason)
    },
    [qc],
  )

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      qc.clear()
      goToLogin('expired')
    })
    return () => setUnauthorizedHandler(null)
  }, [qc])

  // Track activity so idle sessions are not silently extended forever.
  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, mark))
  }, [])

  // Sliding session: refresh shortly before expiry while the user is active.
  useEffect(() => {
    if (!token) return
    const tick = async () => {
      const exp = session.tokenExpiresAt()
      if (!exp) return
      const left = exp.getTime() - Date.now()
      const active = Date.now() - lastActivity.current < 10 * 60_000
      if (left <= 0) {
        void signOut('expired')
        return
      }
      if (left < 5 * 60_000 && active) {
        try {
          const r = await api<RefreshResponse>('/auth/refresh', { method: 'POST' })
          session.set(r.token, r.expires_at, r.session_expires_at)
          setToken(r.token)
        } catch {
          /* 401 handler signs out */
        }
      }
    }
    void tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [token, signOut])

  const value = useMemo<SessionContextValue>(
    () => ({
      isAuthenticated: !!token,
      user: me.data,
      isAdmin: !!me.data?.is_admin,
      isDemo: !!me.data?.is_demo,
      signIn,
      signOut,
    }),
    [token, me.data, signIn, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

export function displayName(u?: UserProfile) {
  if (!u) return ''
  return u.github_login || u.discord_username || u.email || 'User'
}
