import { useEffect, useState } from 'react'
import { isNative } from './native'

export type ThemeId = 'volt' | 'tide' | 'ember' | 'slate' | 'rose' | 'forest'

export interface ThemeMeta {
  id: ThemeId
  name: string
  tagline: string
  light: boolean
  /** Swatches for the picker: background, surface, accent, text. */
  swatch: [string, string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: 'volt', name: 'Volt', tagline: 'Black with electric lime', light: false, swatch: ['#0b0d10', '#15181d', '#c6f135', '#f2f4f7'] },
  { id: 'tide', name: 'Tide', tagline: 'Deep navy, cool blue', light: false, swatch: ['#0b1220', '#121a2b', '#3fb6ff', '#eef2f8'] },
  { id: 'forest', name: 'Forest', tagline: 'Dark green, mint accent', light: false, swatch: ['#0a100d', '#111a15', '#4ade80', '#eef5f0'] },
  { id: 'rose', name: 'Rose', tagline: 'Plum black, hot pink', light: false, swatch: ['#120b10', '#1c1219', '#ff5c8a', '#f7eef3'] },
  { id: 'ember', name: 'Ember', tagline: 'Warm cream, red-orange, bold caps', light: true, swatch: ['#f4f1ea', '#ffffff', '#e2451f', '#1a1714'] },
  { id: 'slate', name: 'Slate', tagline: 'Clean light, black accent', light: true, swatch: ['#f6f7f9', '#ffffff', '#111418', '#111418'] },
]

const KEY = 'fitlog.theme'
const listeners = new Set<(t: ThemeId) => void>()
let current: ThemeId = 'volt'

function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}

/** Apply a theme to the document and the native status bar. */
export function applyTheme(id: ThemeId): void {
  current = id
  const root = document.documentElement
  if (id === 'volt') delete root.dataset.theme
  else root.dataset.theme = id
  const meta = THEMES.find((t) => t.id === id)!
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta.swatch[0])
  if (isNative) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: meta.light ? Style.Light : Style.Dark })).catch(() => {})
  }
  listeners.forEach((l) => l(id))
}

export async function loadTheme(): Promise<ThemeId> {
  let raw: string | null = null
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      raw = (await Preferences.get({ key: KEY })).value
    } else {
      raw = localStorage.getItem(KEY)
    }
  } catch {
    raw = null
  }
  return isThemeId(raw) ? raw : 'volt'
}

export async function saveTheme(id: ThemeId): Promise<void> {
  applyTheme(id)
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: KEY, value: id })
    } else {
      localStorage.setItem(KEY, id)
    }
  } catch {
    /* ignore */
  }
}

/** Current theme id, re-rendering when it changes. */
export function useTheme(): ThemeId {
  const [t, setT] = useState<ThemeId>(current)
  useEffect(() => {
    listeners.add(setT)
    return () => { listeners.delete(setT) }
  }, [])
  return t
}

/** Resolved token colors for canvases and charts that can't use CSS variables directly. */
export function useThemeTokens() {
  const theme = useTheme()
  const [tokens, setTokens] = useState(readTokens)
  useEffect(() => { setTokens(readTokens()) }, [theme])
  return tokens
}

function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    accent: get('--color-accent', '#c6f135'),
    surface: get('--color-surface', '#15181d'),
    grid: get('--color-border', '#262b33'),
    muted: get('--color-muted', '#8b93a1'),
    pr: get('--color-pr', '#ffb020'),
  }
}
