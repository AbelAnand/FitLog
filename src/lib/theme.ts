import { useEffect, useState } from 'react'
import { isNative } from './native'
import { deriveTokens, sameColours, swatchOf, type CustomTheme } from './theme-color'
import { cleanCustomTheme } from './theme-code'
import { uuid } from './uuid'

export type { CustomTheme } from './theme-color'

export type BuiltinThemeId = 'volt' | 'tide' | 'ember' | 'slate' | 'rose' | 'forest'
/** A built-in id, or the `c_…` id of a theme the person made. */
export type ThemeId = string

export interface ThemeMeta {
  id: ThemeId
  name: string
  tagline: string
  light: boolean
  /** Swatches for the picker: background, surface, accent, text. */
  swatch: [string, string, string, string]
  /** Set when this is a theme the person made. */
  custom?: CustomTheme
}

export const THEMES: ThemeMeta[] = [
  { id: 'volt', name: 'Volt', tagline: 'Black with electric lime', light: false, swatch: ['#0b0d10', '#15181d', '#c6f135', '#f2f4f7'] },
  { id: 'tide', name: 'Tide', tagline: 'Deep navy, cool blue', light: false, swatch: ['#0b1220', '#121a2b', '#3fb6ff', '#eef2f8'] },
  { id: 'forest', name: 'Forest', tagline: 'Dark green, mint accent', light: false, swatch: ['#0a100d', '#111a15', '#4ade80', '#eef5f0'] },
  { id: 'rose', name: 'Rose', tagline: 'Plum black, hot pink', light: false, swatch: ['#120b10', '#1c1219', '#ff5c8a', '#f7eef3'] },
  { id: 'ember', name: 'Ember', tagline: 'Warm cream, red-orange, bold caps', light: true, swatch: ['#f4f1ea', '#ffffff', '#e2451f', '#1a1714'] },
  { id: 'slate', name: 'Slate', tagline: 'Clean light, black accent', light: true, swatch: ['#f6f7f9', '#ffffff', '#111418', '#111418'] },
]

/** How many themes a person can keep. Plenty, and the picker stays a grid rather than a list. */
export const MAX_CUSTOM_THEMES = 20

const KEY = 'fitlog.theme'
const CUSTOM_KEY = 'fitlog.themes.custom'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let current: ThemeId = 'volt'
let custom: CustomTheme[] = []
/** Custom properties written to <html> by the current custom theme, removed when it changes. */
let appliedProps: string[] = []

export class ThemeLimitError extends Error {
  constructor() {
    super(`You can keep up to ${MAX_CUSTOM_THEMES} themes. Delete one first.`)
  }
}

async function prefGet(key: string): Promise<string | null> {
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      return (await Preferences.get({ key })).value
    }
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function prefSet(key: string, value: string): Promise<void> {
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key, value })
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    /* ignore: the theme still applies for this launch */
  }
}

/** The picker's view of a custom theme. */
export function customMeta(c: CustomTheme): ThemeMeta {
  return { id: c.id, name: c.name, tagline: c.light ? 'Light, made by you' : 'Dark, made by you', light: c.light, swatch: swatchOf(c), custom: c }
}

/** Built-in or custom; undefined when no such theme exists (a deleted custom one, say). */
export function themeMeta(id: ThemeId): ThemeMeta | undefined {
  const builtin = THEMES.find((t) => t.id === id)
  if (builtin) return builtin
  const c = custom.find((t) => t.id === id)
  return c ? customMeta(c) : undefined
}

/** The custom themes in the order they were made. */
export function customThemes(): CustomTheme[] {
  return custom
}

/** Apply a theme to the document and the native status bar. Unknown ids fall back to Volt. */
export function applyTheme(id: ThemeId): void {
  const meta = themeMeta(id) ?? THEMES[0]
  current = meta.id
  const root = document.documentElement
  for (const p of appliedProps) root.style.removeProperty(p)
  appliedProps = []
  if (meta.custom) {
    // No stylesheet block matches "custom", so the default tokens apply and these override them.
    root.dataset.theme = 'custom'
    const tokens = deriveTokens(meta.custom)
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v)
    appliedProps = Object.keys(tokens)
  } else if (meta.id === 'volt') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = meta.id
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta.swatch[0])
  if (isNative) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: meta.light ? Style.Light : Style.Dark })).catch(() => {})
  }
  emit()
}

function parseCustomList(raw: string | null): CustomTheme[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: CustomTheme[] = []
    for (const item of parsed) {
      const t = cleanCustomTheme(item)
      if (t && !seen.has(t.id)) {
        seen.add(t.id)
        out.push(t)
      }
      if (out.length >= MAX_CUSTOM_THEMES) break
    }
    return out
  } catch {
    return []
  }
}

/** Reads the saved theme choice and the custom themes. Called once at launch, before React renders. */
export async function loadTheme(): Promise<ThemeId> {
  const [id, list] = await Promise.all([prefGet(KEY), prefGet(CUSTOM_KEY)])
  custom = parseCustomList(list)
  return id && themeMeta(id) ? id : 'volt'
}

export async function saveTheme(id: ThemeId): Promise<void> {
  applyTheme(id)
  await prefSet(KEY, current)
}

async function persistCustom(): Promise<void> {
  await prefSet(CUSTOM_KEY, JSON.stringify(custom))
}

export function newCustomThemeId(): string {
  return `c_${uuid()}`
}

/** A starting point for a new theme: the colours of the theme in use, so there is something to tweak. */
export function draftTheme(seed: ThemeMeta): CustomTheme {
  return { id: newCustomThemeId(), name: '', light: seed.light, bg: seed.swatch[0], surface: seed.swatch[1], accent: seed.swatch[2], text: seed.swatch[3] }
}

/**
 * Adds a theme or replaces the one with the same id. Throws ThemeLimitError when the list is full.
 * If the theme is the one in use, the screen updates straight away.
 */
export async function saveCustomTheme(theme: CustomTheme): Promise<CustomTheme> {
  const clean = cleanCustomTheme(theme)
  if (!clean) throw new Error('That theme is not valid.')
  const at = custom.findIndex((t) => t.id === clean.id)
  if (at === -1) {
    if (custom.length >= MAX_CUSTOM_THEMES) throw new ThemeLimitError()
    custom = [...custom, clean]
  } else {
    custom = custom.map((t, i) => (i === at ? clean : t))
  }
  await persistCustom()
  if (current === clean.id) applyTheme(clean.id)
  else emit()
  return clean
}

/**
 * Takes a decoded code in: a theme already here with the same colours is renamed rather than
 * duplicated, otherwise a new one is added.
 */
export async function importCustomTheme(decoded: Omit<CustomTheme, 'id'>): Promise<{ theme: CustomTheme; updated: boolean }> {
  const probe: CustomTheme = { id: 'c_probe', ...decoded }
  const existing = custom.find((t) => sameColours(t, probe))
  const theme = await saveCustomTheme({ ...decoded, id: existing ? existing.id : newCustomThemeId() })
  return { theme, updated: !!existing }
}

/** Removes a custom theme. If it was in use, the nearest built-in takes over. */
export async function deleteCustomTheme(id: string): Promise<void> {
  const gone = custom.find((t) => t.id === id)
  custom = custom.filter((t) => t.id !== id)
  await persistCustom()
  if (current === id) await saveTheme(gone?.light ? 'slate' : 'volt')
  else emit()
}

/** Current theme id, re-rendering when it changes. */
export function useTheme(): ThemeId {
  const [t, setT] = useState<ThemeId>(current)
  useEffect(() => {
    const l = () => setT(current)
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
  return t
}

/** The person's own themes, re-rendering when they change. */
export function useCustomThemes(): CustomTheme[] {
  const [list, setList] = useState(custom)
  useEffect(() => {
    const l = () => setList(custom)
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
  return list
}

/** Resolved token colors for canvases and charts that can't use CSS variables directly. */
export function useThemeTokens() {
  const [tokens, setTokens] = useState(readTokens)
  useEffect(() => {
    // Any theme change, including edits to the custom theme in use, which keep the same id.
    const l = () => setTokens(readTokens())
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
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
