import { describe, expect, it } from 'vitest'
import * as opt from '../api/optimistic'
import type { SetDetail, WorkoutDetail, WorkoutExerciseDetail, WorkoutSummary } from '../api/types'
import type { SetRow } from '../lib/prs'

const set = (id: string, n: number, weight = 0, reps = 0): SetDetail => ({
  id, set_number: n, set_type: 'working', weight, unit: 'lb', reps, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {}, created_at: '2026-09-24T10:00:00.000Z',
})
const exercise = (id: string, position: number, sets: SetDetail[], extra: Partial<WorkoutExerciseDetail> = {}): WorkoutExerciseDetail => ({
  id, exercise_id: `ex-${id}`, name: `Exercise ${id}`, kind: 'strength', track_incline: false, metrics: [], position, notes: '', planned: false, completed_at: null, sets, ...extra,
})
const workout = (exercises: WorkoutExerciseDetail[], extra: Partial<WorkoutDetail> = {}): WorkoutDetail => ({
  id: 'w1', title: 'Push', date: '2026-09-24', notes: '', created_at: '2026-09-24T10:00:00.000Z', started_at: '2026-09-24T10:00:00.000Z', finished_at: null, paused_at: null, paused_seconds: 0, is_plan: false, exercises, ...extra,
})

describe('editing the cached workout', () => {
  it('adds an exercise once, in position order', () => {
    const w = workout([exercise('b', 1, [])])
    const next = opt.addExercise(w, exercise('a', 0, [set('s1', 1)]))
    expect(next.exercises.map((e) => e.id)).toEqual(['a', 'b'])
    expect(opt.addExercise(next, exercise('a', 0, [])).exercises).toHaveLength(2)
    expect(w.exercises).toHaveLength(1) // input untouched
  })

  it('appends sets and ignores ones already present', () => {
    const w = workout([exercise('a', 0, [set('s1', 1, 50, 5)])])
    const next = opt.addSets(w, 'a', [set('s1', 1), set('s2', 2, 65, 7)])
    expect(next.exercises[0].sets.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(next.exercises[0].sets[0].weight).toBe(50)
  })

  it('patches several sets at once and leaves the rest alone', () => {
    const w = workout([exercise('a', 0, [set('s1', 1), set('s2', 2), set('s3', 3, 40, 8)])])
    const next = opt.patchSets(w, [{ setId: 's1', patch: { weight: 65 } }, { setId: 's2', patch: { weight: 65 } }])
    expect(next.exercises[0].sets.map((s) => s.weight)).toEqual([65, 65, 40])
  })

  it('removes and replaces sets', () => {
    const w = workout([exercise('a', 0, [set('s1', 1), set('s2', 2)]), exercise('b', 1, [set('s3', 1)])])
    expect(opt.removeSet(w, 's2').exercises[0].sets.map((s) => s.id)).toEqual(['s1'])
    expect(opt.removeSet(w, 's2').exercises[1]).toBe(w.exercises[1])
    expect(opt.replaceSets(w, 'a', [set('n1', 1)]).exercises[0].sets.map((s) => s.id)).toEqual(['n1'])
    expect(opt.removeExercise(w, 'a').exercises.map((e) => e.id)).toEqual(['b'])
  })

  it('applies exercise settings to every card for that exercise', () => {
    const w = workout([exercise('a', 0, [], { exercise_id: 'run', kind: 'cardio' }), exercise('b', 1, [], { exercise_id: 'run', kind: 'cardio' }), exercise('c', 2, [])])
    const next = opt.patchExerciseSettings(w, 'run', { metrics: ['time', 'speed'] })
    expect(next.exercises.map((e) => e.metrics)).toEqual([['time', 'speed'], ['time', 'speed'], []])
  })

  it('fills defaults when turning a new set into a row', () => {
    const s = opt.setDetailFrom({ id: 'x', set_number: 2, weight: 65, reps: 7, unit: 'lb' }, 'now')
    expect(s).toMatchObject({ id: 'x', set_type: 'working', drops: [], extra: {}, distance: null, incline: null, created_at: 'now' })
  })
})

describe('lists derived from the workout', () => {
  const w = workout([
    exercise('a', 0, [set('s1', 1, 50, 5), set('s2', 2, 65, 7)], { planned: true, completed_at: '2026-09-24T10:30:00.000Z' }),
    exercise('b', 1, [set('s3', 1, 20, 12)], { planned: true }),
  ])

  it('summarises a workout for the list', () => {
    expect(opt.summaryOf(w)).toMatchObject({ id: 'w1', exerciseNames: ['Exercise a', 'Exercise b'], setCount: 3, plannedCount: 2, completedCount: 1 })
  })

  it('keeps the list newest first and never duplicates', () => {
    const older: WorkoutSummary = { ...opt.summaryOf(w), id: 'old', date: '2026-09-20' }
    const sameDayEarlier: WorkoutSummary = { ...opt.summaryOf(w), id: 'early', created_at: '2026-09-24T06:00:00.000Z' }
    const list = opt.upsertSummary([older, sameDayEarlier], w)
    expect(list.map((x) => x.id)).toEqual(['w1', 'early', 'old'])
    expect(opt.upsertSummary(list, { ...w, title: 'Renamed' }).map((x) => x.title)).toEqual(['Renamed', 'Push', 'Push'])
  })

  it('flattens sets with their context, and leaves plans out of history', () => {
    const rows = opt.rowsOf(w)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ id: 's2', exercise_id: 'ex-a', workout_id: 'w1', workout_title: 'Push', date: '2026-09-24', weight: 65 })
    expect(opt.rowsOf({ ...w, is_plan: true })).toEqual([])
  })

  it("swaps only this workout's rows in the full history", () => {
    const other = { ...opt.rowsOf(w)[0], id: 'other', workout_id: 'w0' } as SetRow
    const stale = { ...opt.rowsOf(w)[0], id: 'gone' } as SetRow
    const next = opt.replaceWorkoutRows([other, stale], w)
    expect(next.map((r) => r.id).sort()).toEqual(['other', 's1', 's2', 's3'])
  })
})

describe('repeatExercises', () => {
  it('copies the exercises with one empty set each, keeping units and order', () => {
    const cardioSet: SetDetail = { ...set('c1', 1), unit: 'kg', duration_seconds: 1500, distance: 5, distance_unit: 'km' }
    const source = workout([
      exercise('a', 1, [set('a1', 1, 135, 8), { ...set('a2', 2, 135, 6), set_type: 'drop', drops: [{ weight: 100, reps: 10 }] }], { notes: 'felt heavy', completed_at: '2026-09-24T11:00:00.000Z', planned: true }),
      exercise('b', 0, [cardioSet], { kind: 'cardio', metrics: ['time', 'distance'] }),
      exercise('c', 2, []),
    ])
    let n = 0
    const copies = opt.repeatExercises(source, { entry: () => `e${++n}`, set: () => `s${++n}` }, { planned: false, createdAt: '2026-10-05T10:00:00.000Z', unit: 'lb', distanceUnit: 'mi' })
    expect(copies.map((we) => we.exercise_id)).toEqual(['ex-a', 'ex-b', 'ex-c'])
    expect(copies.map((we) => we.position)).toEqual([1, 0, 2])
    for (const we of copies) {
      expect(we.sets).toHaveLength(1)
      expect(we.notes).toBe('')
      expect(we.completed_at).toBeNull()
      expect(we.planned).toBe(false)
      expect(we.sets[0]).toMatchObject({ set_number: 1, set_type: 'working', weight: 0, reps: 0, drops: [], duration_seconds: null, distance: null, created_at: '2026-10-05T10:00:00.000Z' })
    }
    expect(copies[0].sets[0].unit).toBe('lb')
    expect(copies[1].sets[0]).toMatchObject({ unit: 'kg', distance_unit: 'km' })
    expect(copies[2].sets[0]).toMatchObject({ unit: 'lb', distance_unit: null })
    const ids = copies.flatMap((we) => [we.id, we.sets[0].id])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('a')
  })

  it('marks every exercise planned when basing a plan on last time', () => {
    const copies = opt.repeatExercises(workout([exercise('a', 0, [set('a1', 1, 100, 5)])]), { entry: () => 'e', set: () => 's' }, { planned: true, createdAt: 'now', unit: 'kg', distanceUnit: 'km' })
    expect(copies[0].planned).toBe(true)
  })
})
