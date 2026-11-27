import type { ApiErrorBody } from './types'

export const API_BASE = (typeof window !== 'undefined' && window.APP_CONFIG?.API_BASE_URL) || '/api/v1'

const TOKEN_KEY = 'ds.token'
const TOKEN_EXP_KEY = 'ds.token_exp'
const SESSION_EXP_KEY = 'ds.session_exp'
const TFA_KEY = 'ds.2fa_token'

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function safeSet(store: Storage, key: string, value: string | null) {
  try {
    if (value === null) store.removeItem(key)
    else store.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

export const session = {
  token: () => (__DEMO__ ? 'demo' : safeGet(localStorage, TOKEN_KEY)),
  tokenExpiresAt: () => {
    const v = safeGet(localStorage, TOKEN_EXP_KEY)
    return v ? new Date(v) : null
  },
  sessionExpiresAt: () => {
    const v = safeGet(localStorage, SESSION_EXP_KEY)
    return v ? new Date(v) : null
  },
  set(token: string, expiresAt?: string, sessionExpiresAt?: string) {
    safeSet(localStorage, TOKEN_KEY, token)
    safeSet(localStorage, TOKEN_EXP_KEY, expiresAt ?? null)
    if (sessionExpiresAt) safeSet(localStorage, SESSION_EXP_KEY, sessionExpiresAt)
    safeSet(sessionStorage, TFA_KEY, null)
  },
  clear() {
    safeSet(localStorage, TOKEN_KEY, null)
    safeSet(localStorage, TOKEN_EXP_KEY, null)
    safeSet(localStorage, SESSION_EXP_KEY, null)
    safeSet(sessionStorage, TFA_KEY, null)
  },
  twoFactorToken: () => safeGet(sessionStorage, TFA_KEY),
  setTwoFactorToken: (t: string | null) => safeSet(sessionStorage, TFA_KEY, t),
}

export class ApiError extends Error {
  status: number
  body?: ApiErrorBody & Record<string, unknown>
  constructor(status: number, message: string, body?: ApiErrorBody & Record<string, unknown>) {
    super(message)
    this.status = status
    this.body = body
  }
  /** First field-level validation message, if any. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const e of this.body?.errors ?? []) out[e.field] = e.message
    return out
  }
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn
}

export interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** Use the pending 2FA token instead of the session token. */
  twoFactor?: boolean
  /** Do not treat 401 as session expiry (login endpoints). */
  anonymous?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

export function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(API_BASE + path, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (__DEMO__) {
    const { demoApi } = await import('@/demo/api')
    return demoApi<T>(path, opts)
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.twoFactor) {
    const t = session.twoFactorToken()
    if (t) headers['X-2FA-Token'] = t
  } else if (!opts.anonymous) {
    const t = session.token()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000)
  if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') throw new ApiError(0, 'The request timed out or was cancelled')
    throw new ApiError(0, 'Could not reach the DumpStation server')
  }
  clearTimeout(timer)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as ApiErrorBody & Record<string, unknown>
    if (res.status === 401 && !opts.anonymous && !opts.twoFactor) {
      session.clear()
      onUnauthorized?.()
    }
    throw new ApiError(res.status, body.message || res.statusText || 'Request failed', body)
  }
  return data as T
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong'
}
