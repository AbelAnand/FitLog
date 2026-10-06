import { describe, expect, it } from 'vitest'
import { heldCount, holdWrite, holdWrites, isHolding, releaseHeld, stopHolding } from '../api/hold'

describe('held writes', () => {
  it('keeps writes in order while holding and hands them back on release', async () => {
    const log: string[] = []
    const write = (s: string) => () => { log.push(s); return Promise.resolve() }
    expect(isHolding('w')).toBe(false)
    holdWrites('w')
    holdWrites('w')
    expect(isHolding('w')).toBe(true)
    await holdWrite('w', write('a'))
    await holdWrite('w', write('b'))
    await holdWrite('w', write('c'))
    expect(log).toEqual([])
    expect(heldCount('w')).toBe(3)
    const writes = releaseHeld('w')
    expect(heldCount('w')).toBe(0)
    expect(isHolding('w')).toBe(true)
    for (const run of writes) await run()
    expect(log).toEqual(['a', 'b', 'c'])
  })

  it('stopHolding returns what was still held and holds nothing afterwards', async () => {
    holdWrites('x')
    await holdWrite('x', () => Promise.resolve())
    expect(stopHolding('x')).toHaveLength(1)
    expect(isHolding('x')).toBe(false)
    expect(heldCount('x')).toBe(0)
    expect(stopHolding('x')).toEqual([])
    expect(releaseHeld('never')).toEqual([])
  })
})
