import { normalizeHex, type CustomTheme } from './theme-color'

/**
 * A theme as a short piece of text, so it can be sent in a message and typed back in.
 *
 *   splitlog-theme:<base64url>
 *
 * The bytes are: version (1), flags (bit 0 = light), then background, surface, accent and text as
 * three bytes each, then the name in UTF-8. A new version byte lets the layout change later while
 * old codes keep decoding. Codes arrive from outside the app, so everything here is checked.
 */

export const THEME_CODE_PREFIX = 'splitlog-theme:'
export const THEME_CODE_VERSION = 1
/** Characters in a theme name. Long names do not fit the picker tile anyway. */
export const MAX_THEME_NAME = 40
/** Longest legitimate code: header, colours and a name of 40 four-byte characters, in base64. */
export const MAX_THEME_CODE = THEME_CODE_PREFIX.length + Math.ceil((14 + MAX_THEME_NAME * 4) / 3) * 4
const FLAG_LIGHT = 1
/** Control characters, zero-width marks, bidi overrides and the like: nothing a name needs. */
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu

/** A name a person typed or a code carried: one line, trimmed, no control characters, at most MAX_THEME_NAME. */
export function cleanThemeName(raw: string, fallback = 'My theme'): string {
  const s = raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(s).slice(0, MAX_THEME_NAME).join('').trim()
  return chars || fallback
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  try {
    const bin = atob(b64)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** The shareable text for a theme. The id is not part of it: the receiver makes their own. */
export function encodeThemeCode(t: Omit<CustomTheme, 'id'>): string {
  const name = new TextEncoder().encode(cleanThemeName(t.name))
  const bytes = new Uint8Array(14 + name.length)
  bytes[0] = THEME_CODE_VERSION
  bytes[1] = t.light ? FLAG_LIGHT : 0
  let i = 2
  for (const hex of [t.bg, t.surface, t.accent, t.text]) {
    const h = normalizeHex(hex)
    if (!h) throw new Error(`Not a colour: ${hex}`)
    bytes[i++] = parseInt(h.slice(1, 3), 16)
    bytes[i++] = parseInt(h.slice(3, 5), 16)
    bytes[i++] = parseInt(h.slice(5, 7), 16)
  }
  bytes.set(name, 14)
  return THEME_CODE_PREFIX + toBase64Url(bytes)
}

/** Pulls the code out of pasted text (a whole message is fine), or null when there is none. */
export function findThemeCode(text: string): string | null {
  if (typeof text !== 'string' || text.length > 20_000) return null
  const m = /splitlog-theme:\s*([A-Za-z0-9_-]{16,})/i.exec(text)
  return m ? THEME_CODE_PREFIX + m[1] : null
}

/**
 * Reads a code back into a theme (without an id). Returns null for anything malformed: wrong
 * prefix, bad characters, unknown version, too short, too long, or a name that is not valid text.
 */
export function decodeThemeCode(code: string): Omit<CustomTheme, 'id'> | null {
  if (typeof code !== 'string') return null
  const trimmed = code.trim()
  if (trimmed.length > MAX_THEME_CODE + 8) return null
  if (!trimmed.toLowerCase().startsWith(THEME_CODE_PREFIX)) return null
  const bytes = fromBase64Url(trimmed.slice(THEME_CODE_PREFIX.length))
  if (!bytes || bytes.length < 14 || bytes.length > 14 + MAX_THEME_NAME * 4) return null
  if (bytes[0] !== THEME_CODE_VERSION) return null
  if ((bytes[1] & ~FLAG_LIGHT) !== 0) return null
  let name: string
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(14))
  } catch {
    return null
  }
  const hex = (at: number) => `#${Array.from(bytes.subarray(at, at + 3), (b) => b.toString(16).padStart(2, '0')).join('')}`
  return {
    name: cleanThemeName(name, 'Shared theme'),
    light: (bytes[1] & FLAG_LIGHT) !== 0,
    bg: hex(2),
    surface: hex(5),
    accent: hex(8),
    text: hex(11),
  }
}

/**
 * Checks a theme read from storage or built by the editor. Returns a clean copy or null. Storage
 * is ours, but a damaged list must not take the whole app down with it.
 */
export function cleanCustomTheme(v: unknown): CustomTheme | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || !/^c_[0-9a-f-]{8,40}$/.test(o.id)) return null
  if (typeof o.name !== 'string' || typeof o.light !== 'boolean') return null
  const colours = ['bg', 'surface', 'accent', 'text'].map((k) => (typeof o[k] === 'string' ? normalizeHex(o[k] as string) : null))
  if (colours.some((c) => c === null)) return null
  const [bg, surface, accent, text] = colours as string[]
  return { id: o.id, name: cleanThemeName(o.name), light: o.light, bg, surface, accent, text }
}
