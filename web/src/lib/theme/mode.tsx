import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DefinedTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { dumpstationBlackTheme } from '@/theme/built/dumpstation-black'

/**
 * User-facing appearance. `black` is the pitch-black dark theme
 * (src/theme/black.ts); the others use Astryx Neutral.
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'black'
const KEY = 'ds.theme'
const MODES: readonly ThemeMode[] = ['system', 'light', 'dark', 'black']

/** The Astryx theme object and color mode to render for a ThemeMode. */
export function resolveTheme(mode: ThemeMode): { theme: DefinedTheme; colorMode: 'system' | 'light' | 'dark' } {
  if (mode === 'black') return { theme: dumpstationBlackTheme, colorMode: 'dark' }
  return { theme: neutralTheme, colorMode: mode }
}

const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: 'system', setMode: () => {} })

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY) as ThemeMode | null
    if (v && MODES.includes(v)) return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function ThemeModeProvider({ children }: { children: (mode: ThemeMode) => ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(read)
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme')
  }, [mode])
  return <Ctx.Provider value={{ mode, setMode }}>{children(mode)}</Ctx.Provider>
}

export const useThemeMode = () => useContext(Ctx)
