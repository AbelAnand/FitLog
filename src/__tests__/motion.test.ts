import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Motion must stay cheap. These rules are what keeps it that way; see the Motion section of app.css.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')

const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)].map((m) => ({ name: m[1], body: m[2] }))
const animations = [...css.matchAll(/\.([\w-]+)\s*\{[^}]*animation:\s*([\w-]+)\s+(\d+)ms([^;]*);/g)].map((m) => ({ cls: m[1], name: m[2], ms: Number(m[3]), rest: m[4] }))

describe('motion', () => {
  it('has animations to check', () => {
    expect(keyframes.length).toBeGreaterThan(8)
    expect(animations.length).toBeGreaterThan(8)
  })

  it('animates only transform and opacity', () => {
    for (const k of keyframes) {
      const properties = [...k.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(properties.filter((p) => p !== 'transform' && p !== 'opacity'), `@keyframes ${k.name}`).toEqual([])
    }
  })

  it('finishes quickly and never loops', () => {
    for (const a of animations) {
      expect(a.ms, `.${a.cls}`).toBeLessThanOrEqual(520)
      expect(a.rest, `.${a.cls}`).not.toMatch(/infinite/)
    }
    expect(css).not.toMatch(/animation[^;]*infinite/)
  })

  it('is switched off by Reduce Motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced.length).toBeGreaterThan(50)
    for (const a of animations) expect(reduced, `.${a.cls} is missing from the Reduce Motion rule`).toContain(`.${a.cls}`)
    expect(reduced).toContain('.press')
    expect(reduced).toContain('.collapsible')
  })

  it('does not ask the phone to keep layers ready', () => {
    expect(css).not.toMatch(/will-change/)
  })
})
