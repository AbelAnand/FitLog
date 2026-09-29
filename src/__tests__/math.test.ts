import { describe, expect, it } from 'vitest'
import { bestByExercise, cardioKm, prTimeline, sessionsFor, type SetRow } from '../lib/prs'
import { computeStreak } from '../lib/streak'
import { convert, formatDuration, formatPace, formatWeight, parseDuration, toKg } from '../lib/units'
import { activeSeconds, formatClock, formatSessionLength } from '../lib/duration'
import { uuid } from '../lib/uuid'
import { explainSaveError } from '../data/limits'
import { esc } from '../lib/csv'
import { enqueue, isTransient } from '../api/queue'

const row = (p: Partial<SetRow>): SetRow => ({
  id: 'r', weight: 100, unit: 'lb', reps: 5, set_number: 1, set_type: 'working', duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {},
  created_at: '2026-09-01T10:00:00Z', workout_exercise_id: 'we', exercise_id: 'bench', exercise_name: 'Bench', exercise_kind: 'strength', workout_id: 'w1', workout_title: 'Push', date: '2026-09-01', ...p,
})

describe('personal records', () => {
  const rows = [
    row({ id: 'a', workout_id: 'w1', date: '2026-09-01', weight: 60, reps: 8 }),
    row({ id: 'b', workout_id: 'w1', date: '2026-09-01', weight: 200, reps: 5, set_type: 'warmup' }),
    row({ id: 'c', workout_id: 'w2', date: '2026-09-08', weight: 65, reps: 7 }),
    row({ id: 'd', workout_id: 'w2', date: '2026-09-08', weight: 300, reps: 0 }),
    row({ id: 'e', workout_id: 'w3', date: '2026-09-15', weight: 30, unit: 'kg', reps: 5 }),
  ]

  it('ignores warm-ups and sets with no reps', () => {
    expect(bestByExercise(rows).get('bench')).toBeCloseTo(toKg(30, 'kg'))
    expect(bestByExercise(rows, 'w3').get('bench')).toBeCloseTo(toKg(65, 'lb'))
  })

  it('compares across units', () => {
    // 30 kg is 66.1 lb, so it beats 65 lb.
    const events = prTimeline(sessionsFor(rows, 'bench'))
    expect(events.map((e) => e.workout_id)).toEqual(['w1', 'w2', 'w3'])
  })

  it('counts drop sets toward volume but not the top weight', () => {
    const s = sessionsFor([row({ weight: 100, reps: 10, drops: [{ weight: 80, reps: 8 }] })], 'bench')[0]
    expect(s.topKg).toBeCloseTo(toKg(100, 'lb'))
    expect(s.volumeKg).toBeCloseTo(toKg(100, 'lb') * 10 + toKg(80, 'lb') * 8)
  })

  it('derives cardio distance from speed and time', () => {
    expect(cardioKm({ distance: 5, distance_unit: 'km', duration_seconds: 1800, extra: {} })).toBe(5)
    expect(cardioKm({ distance: null, distance_unit: 'km', duration_seconds: 1800, extra: { speed: 10 } })).toBe(5)
    expect(cardioKm({ distance: null, distance_unit: null, duration_seconds: null, extra: {} })).toBe(0)
  })
})

describe('weekly streak', () => {
  // Wednesday 23 September 2026. Weeks run Monday to Sunday.
  const today = new Date(2026, 8, 23, 12)
  const week = (mondayDay: number, month: number, n: number) => Array.from({ length: n }, (_, i) => `2026-${String(month).padStart(2, '0')}-${String(mondayDay + i).padStart(2, '0')}`)

  it('counts last week while this week is still in progress', () => {
    const s = computeStreak([...week(14, 9, 4), ...week(7, 9, 4), '2026-09-21'], 4, today)
    expect(s).toMatchObject({ streak: 2, thisWeekCount: 1, thisWeekDone: false })
  })

  it('adds this week as soon as the goal is met', () => {
    const s = computeStreak([...week(14, 9, 4), '2026-09-21', '2026-09-22', '2026-09-23'], 3, today)
    expect(s).toMatchObject({ streak: 2, thisWeekDone: true })
  })

  it('breaks on a missed week and counts a day once', () => {
    expect(computeStreak([...week(7, 9, 4)], 4, today).streak).toBe(0)
    expect(computeStreak(['2026-09-21', '2026-09-21', '2026-09-21'], 2, today).thisWeekCount).toBe(1)
  })

  it('marks the days of the current week', () => {
    const s = computeStreak(['2026-09-21'], 4, today)
    expect(s.week.map((d) => d.trained)).toEqual([true, false, false, false, false, false, false])
    expect(s.week.findIndex((d) => d.isToday)).toBe(2)
  })
})

describe('units and time', () => {
  it('converts and formats weight', () => {
    expect(formatWeight(convert(100, 'kg', 'lb'))).toBe('220.5')
    expect(formatWeight(convert(225, 'lb', 'lb'))).toBe('225')
    expect(formatWeight(62.5)).toBe('62.5')
  })

  it('parses what people type for a duration', () => {
    expect(parseDuration('30')).toBe(1800)
    expect(parseDuration('30:15')).toBe(1815)
    expect(parseDuration('1:05:00')).toBe(3900)
    expect(parseDuration('1h10m')).toBe(4200)
    expect(parseDuration('90s')).toBe(90)
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
  })

  it('formats durations and pace', () => {
    expect(formatDuration(1815)).toBe('30:15')
    expect(formatDuration(3900)).toBe('1:05:00')
    expect(formatPace(1800, 5, 'km')).toBe('6:00 /km')
    expect(formatPace(0, 5, 'km')).toBe('–')
  })

  it('leaves pauses out of the session length', () => {
    const t = { started_at: '2026-09-24T10:00:00Z', finished_at: '2026-09-24T11:10:00Z', paused_at: null, paused_seconds: 600 }
    expect(activeSeconds(t)).toBe(3600)
    expect(formatSessionLength(t)).toBe('1 h')
    expect(formatClock(3725)).toBe('1:02:05')
    const paused = { started_at: '2026-09-24T10:00:00Z', finished_at: null, paused_at: '2026-09-24T10:20:00Z', paused_seconds: 0 }
    expect(activeSeconds(paused, Date.parse('2026-09-24T12:00:00Z'))).toBe(1200)
  })
})

const quick = { delay: () => 1, maxTries: 4 }

describe('saving', () => {
  it('makes well-formed, distinct ids', () => {
    const ids = new Set(Array.from({ length: 200 }, uuid))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('sends writes in order, even when an earlier one is slow', async () => {
    const seen: string[] = []
    const slow = enqueue('w', async () => { await new Promise((r) => setTimeout(r, 30)); seen.push('insert') })
    const fast = enqueue('w', async () => { seen.push('update') })
    const other = enqueue('other', async () => { seen.push('elsewhere') })
    await Promise.all([slow, fast, other])
    expect(seen).toEqual(['elsewhere', 'insert', 'update'])
  })

  it('retries a dropped connection in place, holding the line', async () => {
    const seen: string[] = []
    let tries = 0
    const flaky = enqueue('r', async () => { tries++; if (tries < 3) throw new TypeError('Load failed'); seen.push('insert') }, quick)
    const next = enqueue('r', async () => { seen.push('update') }, quick)
    await Promise.all([flaky, next])
    expect(tries).toBe(3)
    expect(seen).toEqual(['insert', 'update'])
  })

  it('gives up on a rejection without blocking what follows', async () => {
    let tries = 0
    const refused = enqueue('x', async () => { tries++; throw Object.assign(new Error('violates row-level security'), { code: '42501' }) }, quick)
    const next = enqueue('x', async () => 'ok', quick)
    await expect(refused).rejects.toThrow('row-level security')
    await expect(next).resolves.toBe('ok')
    expect(tries).toBe(1)
  })

  it('gives up after the last try', async () => {
    let tries = 0
    await expect(enqueue('y', async () => { tries++; throw new TypeError('Failed to fetch') }, { delay: () => 1, maxTries: 3 })).rejects.toThrow('Failed to fetch')
    expect(tries).toBe(3)
  })

  it('retries a dropped connection but not a rejection', () => {
    expect(isTransient({ message: 'TypeError: Load failed', code: '' })).toBe(true)
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransient({ message: 'duplicate key value', code: '23505' })).toBe(false)
    expect(isTransient({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false)
    expect(isTransient(null)).toBe(false)
  })
})

describe('failed saves', () => {
  it('explains the cause in plain words', () => {
    expect(explainSaveError(new Error('disk full'))).toMatch(/out of storage space/)
    expect(explainSaveError(new Error('Workout not found'))).toMatch(/no longer exists/)
    expect(explainSaveError(null)).toMatch(/Close FitLog/)
  })
})

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(esc('Push, heavy')).toBe('"Push, heavy"')
    expect(esc('6" box jump')).toBe('"6"" box jump"')
    expect(esc('line\nbreak')).toBe('"line\nbreak"')
    expect(esc(null)).toBe('')
  })

  it('never lets a name run as a spreadsheet formula', () => {
    expect(esc('=HYPERLINK("http://x","Bench")')).toBe('"\'=HYPERLINK(""http://x"",""Bench"")"')
    expect(esc('+cmd')).toBe("'+cmd")
    expect(esc('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(esc('-2+3')).toBe("'-2+3")
  })

  it('leaves numbers and ordinary text alone', () => {
    expect(esc(175)).toBe('175')
    expect(esc(62.5)).toBe('62.5')
    expect(esc('Bench Press')).toBe('Bench Press')
  })
})
