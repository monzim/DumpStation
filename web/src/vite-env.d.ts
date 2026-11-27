/// <reference types="vite/client" />

/** True in the public demo build (`vite build --mode demo`). */
declare const __DEMO__: boolean

interface Window {
  APP_CONFIG?: {
    API_BASE_URL?: string
    TURNSTILE_SITE_KEY?: string
    VERSION?: string
  }
}
