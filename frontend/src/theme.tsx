import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'

type ThemeState = {
  dark: boolean
  compact: boolean
  toggleDark: () => void
  toggleCompact: () => void
}

const KEY_DARK = 'momo:dark'
const KEY_COMPACT = 'momo:compact'

const ThemeCtx = createContext<ThemeState | null>(null)

export function useThemeSettings() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useThemeSettings must be used within ThemeProviderWrapper')
  return ctx
}

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_DARK) === '1'
    } catch {
      return false
    }
  })
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_COMPACT) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY_DARK, dark ? '1' : '0') } catch {}
  }, [dark])
  useEffect(() => {
    try { localStorage.setItem(KEY_COMPACT, compact ? '1' : '0') } catch {}
  }, [compact])

  const toggleDark = () => setDark((d) => !d)
  const toggleCompact = () => setCompact((c) => !c)

  const theme = useMemo(() => createTheme({ palette: { mode: dark ? 'dark' : 'light' }, components: { MuiListItem: { styleOverrides: { root: { paddingTop: compact ? 4 : undefined, paddingBottom: compact ? 4 : undefined } } } } }), [dark, compact])

  const value = useMemo(() => ({ dark, compact, toggleDark, toggleCompact }), [dark, compact])

  return (
    <ThemeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeCtx.Provider>
  )
}
