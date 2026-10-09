/**
 * Colour maths for custom themes. A person picks four colours (background, surface, accent, text)
 * and whether the theme is light or dark; everything else a theme needs is derived here so the
 * result always hangs together. Pure functions, so they run in tests as well as on the phone.
 */

/** A theme a person made. Colours are `#rrggbb` lower-case. */
export interface CustomTheme {
  id: string
  name: string
  light: boolean
  bg: string
  surface: string
  accent: string
  text: string
}

export type Rgb = [number, number, number]

/** Accepts `#abc`, `#aabbcc`, `aabbcc` in any case and returns `#aabbcc`, or null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s.split('').map((c) => c + c).join('')}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toLowerCase()
  return null
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex) ?? '#000000'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** `t` of the way from `a` to `b`, in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The colour written on top of the accent: white where it reads, otherwise a very dark tint of the theme. */
export function accentInk(t: Pick<CustomTheme, 'bg' | 'text' | 'accent'>): string {
  if (contrast(t.accent, '#ffffff') >= 3) return '#ffffff'
  const darker = luminance(t.bg) <= luminance(t.text) ? t.bg : t.text
  return mix(darker, '#000000', 0.4)
}

/** Every CSS custom property a theme sets, derived from the four chosen colours. */
export function deriveTokens(t: CustomTheme): Record<string, string> {
  const ink = accentInk(t)
  return {
    '--color-bg': t.bg,
    '--color-surface': t.surface,
    '--color-surface-2': mix(t.surface, t.text, 0.06),
    '--color-surface-3': mix(t.surface, t.text, 0.12),
    '--color-border': mix(t.surface, t.text, 0.11),
    '--color-text': t.text,
    '--color-muted': mix(t.text, t.bg, 0.42),
    '--color-faint': mix(t.text, t.bg, 0.65),
    '--color-accent': t.accent,
    '--color-accent-ink': ink,
    '--color-accent-dim': rgba(t.accent, t.light ? 0.12 : 0.15),
    '--color-danger': t.light ? '#d1352b' : '#ff5c5c',
    '--color-pr': t.light ? '#c77d00' : '#ffb020',
    '--color-pr-dim': t.light ? 'rgba(199, 125, 0, 0.14)' : 'rgba(255, 176, 32, 0.16)',
    '--title-transform': 'none',
    '--title-tracking': '-0.02em',
    '--title-weight': '700',
    'color-scheme': t.light ? 'light' : 'dark',
  }
}

export interface ContrastWarning {
  /** Which pair is at fault, for highlighting the relevant picker. */
  about: 'text' | 'accent' | 'surface' | 'mode'
  message: string
}

/** Readability problems worth telling the person about. None of them stops a save. */
export function contrastWarnings(t: CustomTheme): ContrastWarning[] {
  const out: ContrastWarning[] = []
  if (contrast(t.text, t.bg) < 4.5) out.push({ about: 'text', message: 'Text is hard to read on the background.' })
  else if (contrast(t.text, t.surface) < 4.5) out.push({ about: 'surface', message: 'Text is hard to read on cards.' })
  if (contrast(t.accent, t.bg) < 2.5) out.push({ about: 'accent', message: 'The accent fades into the background.' })
  if (contrast(accentInk(t), t.accent) < 3) out.push({ about: 'accent', message: 'Button labels are hard to read on the accent.' })
  if (contrast(t.surface, t.bg) < 1.08) out.push({ about: 'surface', message: 'Cards look the same as the background.' })
  const darkBg = luminance(t.bg) < 0.3
  if (t.light === darkBg) out.push({ about: 'mode', message: t.light ? 'A light theme usually has a light background.' : 'A dark theme usually has a dark background.' })
  return out
}

/** Colours for the picker tile: background, surface, accent, text. */
export function swatchOf(t: CustomTheme): [string, string, string, string] {
  return [t.bg, t.surface, t.accent, t.text]
}

/** Same colours and mode, whatever the name or id. */
export function sameColours(a: CustomTheme, b: CustomTheme): boolean {
  return a.light === b.light && a.bg === b.bg && a.surface === b.surface && a.accent === b.accent && a.text === b.text
}
