import { describe, expect, it } from 'vitest'
import { accentInk, contrast, contrastWarnings, deriveTokens, mix, normalizeHex, sameColours, type CustomTheme } from '../lib/theme-color'
import { MAX_THEME_CODE, MAX_THEME_NAME, THEME_CODE_PREFIX, cleanCustomTheme, cleanThemeName, decodeThemeCode, encodeThemeCode, findThemeCode } from '../lib/theme-code'

const sunset: CustomTheme = { id: 'c_12345678', name: 'Sunset', light: false, bg: '#1a0f14', surface: '#26171e', accent: '#ff8a3d', text: '#fff1e8' }
const paper: CustomTheme = { id: 'c_abcdef01', name: 'Paper', light: true, bg: '#f7f3ea', surface: '#ffffff', accent: '#2b6cb0', text: '#1c1a17' }

describe('colour helpers', () => {
  it('normalises hex in any of its spellings', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('aabbcc')).toBe('#aabbcc')
    expect(normalizeHex(' #AaBbCc ')).toBe('#aabbcc')
    expect(normalizeHex('#abcd')).toBeNull()
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('#gggggg')).toBeNull()
    expect(normalizeHex('')).toBeNull()
  })

  it('mixes in sRGB', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#0b0d10', '#f2f4f7')).toBeGreaterThan(17)
  })

  it('picks the ink the built-in themes use', () => {
    // Lime, blue, green and pink take a dark ink; red-orange and black take white.
    expect(accentInk({ bg: '#0b0d10', text: '#f2f4f7', accent: '#c6f135' })).not.toBe('#ffffff')
    expect(accentInk({ bg: '#0b1220', text: '#eef2f8', accent: '#3fb6ff' })).not.toBe('#ffffff')
    expect(accentInk({ bg: '#0a100d', text: '#eef5f0', accent: '#4ade80' })).not.toBe('#ffffff')
    expect(accentInk({ bg: '#120b10', text: '#f7eef3', accent: '#ff5c8a' })).not.toBe('#ffffff')
    expect(accentInk({ bg: '#f4f1ea', text: '#1a1714', accent: '#e2451f' })).toBe('#ffffff')
    expect(accentInk({ bg: '#f6f7f9', text: '#111418', accent: '#111418' })).toBe('#ffffff')
  })

  it('derives every token a theme block sets, readable in both modes', () => {
    for (const t of [sunset, paper]) {
      const tokens = deriveTokens(t)
      for (const k of ['--color-bg', '--color-surface', '--color-surface-2', '--color-surface-3', '--color-border', '--color-text', '--color-muted', '--color-faint', '--color-accent', '--color-accent-ink', '--color-accent-dim', '--color-danger', '--color-pr', '--color-pr-dim', '--title-transform', '--title-tracking', '--title-weight', 'color-scheme']) {
        expect(tokens[k], k).toBeTruthy()
      }
      expect(tokens['color-scheme']).toBe(t.light ? 'light' : 'dark')
      expect(contrast(tokens['--color-muted'], t.bg)).toBeGreaterThan(4)
      expect(contrast(tokens['--color-accent-ink'], t.accent)).toBeGreaterThan(3)
      // Surfaces step away from the card colour towards the text, so cards stay distinct.
      expect(tokens['--color-surface-2']).not.toBe(t.surface)
      expect(tokens['--color-surface-3']).not.toBe(tokens['--color-surface-2'])
      expect(contrastWarnings(t)).toEqual([])
    }
  })

  it('warns about unreadable combinations without blocking', () => {
    const grey = { ...sunset, text: '#555555' }
    expect(contrastWarnings(grey).map((w) => w.about)).toContain('text')
    const hidden = { ...sunset, accent: '#1f1218' }
    expect(contrastWarnings(hidden).map((w) => w.message)).toContain('The accent fades into the background.')
    const flat = { ...sunset, surface: sunset.bg }
    expect(contrastWarnings(flat).map((w) => w.message)).toContain('Cards look the same as the background.')
    const wrongMode = { ...sunset, light: true }
    expect(contrastWarnings(wrongMode).map((w) => w.about)).toContain('mode')
    // Still a complete token set: a warning is advice, not a refusal.
    expect(Object.keys(deriveTokens(grey)).length).toBe(Object.keys(deriveTokens(sunset)).length)
  })

  it('compares themes by colour, not by name or id', () => {
    expect(sameColours(sunset, { ...sunset, id: 'c_other', name: 'Dusk' })).toBe(true)
    expect(sameColours(sunset, { ...sunset, accent: '#ff8a3e' })).toBe(false)
    expect(sameColours(sunset, { ...sunset, light: true })).toBe(false)
  })
})

describe('theme codes', () => {
  it('round-trips a theme through a code', () => {
    for (const t of [sunset, paper]) {
      const code = encodeThemeCode(t)
      expect(code.startsWith(THEME_CODE_PREFIX)).toBe(true)
      expect(code).toMatch(/^splitlog-theme:[A-Za-z0-9_-]+$/)
      expect(code.length).toBeLessThanOrEqual(MAX_THEME_CODE)
      const { id: _id, ...rest } = t
      expect(decodeThemeCode(code)).toEqual(rest)
    }
  })

  it('keeps names with accents and emoji', () => {
    const named = { ...sunset, name: 'Café ☀️ Ünïcode' }
    expect(decodeThemeCode(encodeThemeCode(named))?.name).toBe('Café ☀️ Ünïcode')
  })

  it('clamps and cleans the name on both sides', () => {
    expect(cleanThemeName('  Two   words \n here ')).toBe('Two words here')
    expect(cleanThemeName('bad\u0000chars​')).toBe('badchars')
    expect(cleanThemeName('')).toBe('My theme')
    expect(cleanThemeName('   ', 'Shared theme')).toBe('Shared theme')
    const long = 'x'.repeat(MAX_THEME_NAME + 30)
    expect(cleanThemeName(long).length).toBe(MAX_THEME_NAME)
    expect(decodeThemeCode(encodeThemeCode({ ...sunset, name: long }))?.name.length).toBe(MAX_THEME_NAME)
    // Counted in characters, not bytes: 40 emoji survive whole.
    const emoji = '🔥'.repeat(MAX_THEME_NAME)
    expect(Array.from(decodeThemeCode(encodeThemeCode({ ...sunset, name: emoji }))!.name).length).toBe(MAX_THEME_NAME)
  })

  it('finds the code inside a pasted message, in any case, and nowhere else', () => {
    const code = encodeThemeCode(sunset)
    expect(findThemeCode(`Try my theme!\n${code}\nOpen SplitLog → Settings.`)).toBe(code)
    expect(findThemeCode(`SPLITLOG-THEME:${code.slice(THEME_CODE_PREFIX.length)}`)).toBe(code)
    expect(findThemeCode('nothing here')).toBeNull()
    expect(findThemeCode('splitlog-theme:short')).toBeNull()
    expect(findThemeCode('x'.repeat(30_000))).toBeNull()
  })

  it('rejects malformed codes', () => {
    const code = encodeThemeCode(sunset)
    const body = code.slice(THEME_CODE_PREFIX.length)
    expect(decodeThemeCode('')).toBeNull()
    expect(decodeThemeCode('hello')).toBeNull()
    expect(decodeThemeCode(THEME_CODE_PREFIX)).toBeNull()
    expect(decodeThemeCode(`fitlog-theme:${body}`)).toBeNull()
    expect(decodeThemeCode(`${THEME_CODE_PREFIX}${body}!!`)).toBeNull()
    expect(decodeThemeCode(`${THEME_CODE_PREFIX}${body.slice(0, 8)}`)).toBeNull()
    expect(decodeThemeCode(`${THEME_CODE_PREFIX}${body}${'A'.repeat(400)}`)).toBeNull()
    expect(decodeThemeCode(123 as unknown as string)).toBeNull()
    // Version byte 2 is from the future; flag bits we do not know are refused too.
    const bytes = Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4)), (c) => c.charCodeAt(0))
    const reencode = (b: Uint8Array) => THEME_CODE_PREFIX + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const v2 = bytes.slice(); v2[0] = 2
    expect(decodeThemeCode(reencode(v2))).toBeNull()
    const flags = bytes.slice(); flags[1] = 0x82
    expect(decodeThemeCode(reencode(flags))).toBeNull()
    // A name that is not UTF-8 is refused rather than guessed at.
    const badName = new Uint8Array([...bytes.slice(0, 14), 0xff, 0xfe])
    expect(decodeThemeCode(reencode(badName))).toBeNull()
    // Just the header with no name is fine and gets a fallback name.
    expect(decodeThemeCode(reencode(bytes.slice(0, 14)))?.name).toBe('Shared theme')
  })

  it('checks stored themes before trusting them', () => {
    expect(cleanCustomTheme(sunset)).toEqual(sunset)
    expect(cleanCustomTheme({ ...sunset, bg: '#ABC' })).toEqual({ ...sunset, bg: '#aabbcc' })
    expect(cleanCustomTheme({ ...sunset, name: '  Sun  set  ' })?.name).toBe('Sun set')
    expect(cleanCustomTheme({ ...sunset, id: 'volt' })).toBeNull()
    expect(cleanCustomTheme({ ...sunset, accent: 'orange' })).toBeNull()
    expect(cleanCustomTheme({ ...sunset, light: 'yes' })).toBeNull()
    expect(cleanCustomTheme(null)).toBeNull()
    expect(cleanCustomTheme('sunset')).toBeNull()
    expect(cleanCustomTheme({})).toBeNull()
  })
})
