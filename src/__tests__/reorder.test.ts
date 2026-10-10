import { describe, expect, it } from 'vitest'
import * as opt from '../api/optimistic'
import type { SetDetail, WorkoutDetail, WorkoutExerciseDetail } from '../api/types'
import { LocalDb } from '../db/db'
import { memoryPersistence } from '../db/persistence'
import type { StoredSet, StoredWorkout, StoredWorkoutExercise } from '../db/types'
import { blankSet, isBlank } from '../lib/sets'

const at = '2026-10-09T10:00:00.000Z'
const set = (id: string, n: number, weight = 0, reps = 0, extra: Partial<SetDetail> = {}): SetDetail => ({
  id, set_number: n, set_type: 'working', weight, unit: 'lb', reps, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {}, created_at: at, ...extra,
})
const exercise = (id: string, sets: SetDetail[], extra: Partial<WorkoutExerciseDetail> = {}): WorkoutExerciseDetail => ({
  id, exercise_id: `ex-${id}`, name: `Exercise ${id}`, kind: 'strength', track_incline: false, metrics: [], position: 0, notes: '', planned: false, completed_at: null, sets, ...extra,
})
const workout = (exercises: WorkoutExerciseDetail[]): WorkoutDetail => ({
  id: 'w1', title: 'Push', date: '2026-10-09', notes: '', created_at: at, started_at: at, finished_at: null, paused_at: null, paused_seconds: 0, is_plan: false, exercises,
})
const ids = (w: WorkoutDetail, weId = 'a') => w.exercises.find((we) => we.id === weId)!.sets.map((s) => s.id)
const numbers = (w: WorkoutDetail, weId = 'a') => w.exercises.find((we) => we.id === weId)!.sets.map((s) => s.set_number)

describe('moving a set within its exercise', () => {
  it('moveItem puts the item at the new index and leaves bad indices alone', () => {
    expect(opt.moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(opt.moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(opt.moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(opt.moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    const list = ['a', 'b']
    expect(opt.moveItem(list, 0, 1)).not.toBe(list)
  })

  it('renumbers every set in the exercise 1..n in the new order', () => {
    const w = workout([exercise('a', [set('s1', 1, 100, 5), set('s2', 2, 110, 4), set('s3', 3, 120, 3)]), exercise('b', [set('t1', 1), set('t2', 2)])])
    const next = opt.reorderSets(w, 'a', opt.moveItem(ids(w), 2, 0))
    expect(ids(next)).toEqual(['s3', 's1', 's2'])
    expect(numbers(next)).toEqual([1, 2, 3])
    expect(next.exercises[0].sets.map((s) => s.weight)).toEqual([120, 100, 110])
    // The other exercise is untouched (same object), and so is the input.
    expect(next.exercises[1]).toBe(w.exercises[1])
    expect(ids(w)).toEqual(['s1', 's2', 's3'])
  })

  it('moves the first set to last', () => {
    const w = workout([exercise('a', [set('s1', 1), set('s2', 2), set('s3', 3), set('s4', 4)])])
    const next = opt.reorderSets(w, 'a', opt.moveItem(ids(w), 0, 3))
    expect(ids(next)).toEqual(['s2', 's3', 's4', 's1'])
    expect(numbers(next)).toEqual([1, 2, 3, 4])
  })

  it('closes gaps left by deleted sets while it is at it', () => {
    const w = workout([exercise('a', [set('s1', 1), set('s3', 3), set('s4', 7)])])
    const next = opt.reorderSets(w, 'a', opt.moveItem(ids(w), 1, 2))
    expect(ids(next)).toEqual(['s1', 's4', 's3'])
    expect(numbers(next)).toEqual([1, 2, 3])
  })

  it('moves a drop set as one unit, drops included', () => {
    const drop = set('d', 2, 100, 8, { set_type: 'drop', drops: [{ weight: 80, reps: 8 }, { weight: 60, reps: 10 }] })
    const w = workout([exercise('a', [set('s1', 1, 100, 10), drop, set('s3', 3, 100, 6)])])
    const next = opt.reorderSets(w, 'a', opt.moveItem(ids(w), 1, 2))
    expect(ids(next)).toEqual(['s1', 's3', 'd'])
    expect(numbers(next)).toEqual([1, 2, 3])
    const moved = next.exercises[0].sets[2]
    expect(moved.set_type).toBe('drop')
    expect(moved.drops).toEqual([{ weight: 80, reps: 8 }, { weight: 60, reps: 10 }])
    expect(moved.drops).toBe(drop.drops)
  })

  it('keeps a set the order does not mention, after the others', () => {
    const w = workout([exercise('a', [set('s1', 1), set('s2', 2), set('s3', 3)])])
    const next = opt.reorderSets(w, 'a', ['s2', 's1'])
    expect(ids(next)).toEqual(['s2', 's1', 's3'])
    expect(numbers(next)).toEqual([1, 2, 3])
  })

  it('keeps the derived set list in step', () => {
    const w = workout([exercise('a', [set('s1', 1, 100, 5), set('s2', 2, 110, 4)])])
    const next = opt.reorderSets(w, 'a', ['s2', 's1'])
    expect(opt.rowsOf(next).map((r) => [r.id, r.set_number])).toEqual([['s2', 1], ['s1', 2]])
  })

  it('tells the database the new numbers, one patch per set', () => {
    expect(opt.renumbering(['s3', 's1', 's2'])).toEqual([
      { setId: 's3', patch: { set_number: 1 } },
      { setId: 's1', patch: { set_number: 2 } },
      { setId: 's2', patch: { set_number: 3 } },
    ])
  })
})

describe('the new order in storage', () => {
  const stored = (id: string, entryId: string, n: number, weight: number): StoredSet => ({ ...set(id, n, weight, 5), workout_exercise_id: entryId })

  it('comes back from the database in set_number order after patchSets', async () => {
    const db = new LocalDb(memoryPersistence())
    await db.open()
    const w: StoredWorkout = { id: 'w1', title: 'Push', date: '2026-10-09', notes: '', created_at: at, started_at: at, finished_at: null, paused_at: null, paused_seconds: 0, is_plan: false }
    const e: StoredWorkoutExercise = { id: 'e1', workout_id: 'w1', exercise_id: 'x', position: 0, notes: '', planned: false, completed_at: null, created_at: at }
    await db.addWorkout(w)
    await db.addEntry({ entry: e, exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false }, sets: [stored('s1', 'e1', 1, 100), stored('s2', 'e1', 2, 110), stored('s3', 'e1', 3, 120)] })
    await db.patchSets(opt.renumbering(['s3', 's1', 's2']))
    const sets = db.getWorkout('w1').exercises[0].sets
    expect(sets.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
    expect(sets.map((s) => s.set_number)).toEqual([1, 2, 3])
    expect(sets.map((s) => s.weight)).toEqual([120, 100, 110])
  })
})

describe('Add set creates an empty set', () => {
  it('is blank by the same rule the rows use, whatever the set above held', () => {
    const above = set('s1', 3, 185, 8, { set_type: 'drop', drops: [{ weight: 150, reps: 8 }], unit: 'kg' })
    const s = blankSet({ after: above, unit: 'lb', distanceUnit: 'mi', cardio: false })
    expect(s).toMatchObject({ set_number: 4, weight: 0, reps: 0, set_type: 'working', drops: [], duration_seconds: null, distance: null, distance_unit: null, incline: null, extra: {} })
    expect(s.unit).toBe('kg') // the unit is the only thing carried down
    expect(isBlank(opt.setDetailFrom({ ...s, id: 'n' }, at), false)).toBe(true)
    expect(isBlank(above, false)).toBe(false)
  })

  it('is empty for a cardio interval too, keeping the distance unit', () => {
    const above = set('c1', 2, 0, 0, { duration_seconds: 1500, distance: 5, distance_unit: 'km', incline: 2, extra: { speed: 12 } })
    const s = blankSet({ after: above, unit: 'lb', distanceUnit: 'mi', cardio: true })
    expect(s).toMatchObject({ set_number: 3, duration_seconds: null, distance: null, distance_unit: 'km', incline: null, extra: {} })
    expect(isBlank(opt.setDetailFrom({ ...s, id: 'n' }, at), true)).toBe(true)
    expect(isBlank(above, true)).toBe(false)
  })

  it('starts from 1 with the profile units when the exercise has no sets', () => {
    expect(blankSet({ after: null, unit: 'kg', distanceUnit: 'km', cardio: true })).toMatchObject({ set_number: 1, unit: 'kg', distance_unit: 'km' })
    expect(blankSet({ after: undefined, unit: 'lb', distanceUnit: 'mi', cardio: false })).toMatchObject({ set_number: 1, unit: 'lb', distance_unit: null })
  })

  it('gives a new warm-up or drop set its type, with one empty drop to type into', () => {
    expect(blankSet({ after: set('s1', 1, 100, 5), type: 'warmup', unit: 'lb', distanceUnit: 'mi', cardio: false })).toMatchObject({ set_type: 'warmup', weight: 0, reps: 0, drops: [] })
    expect(blankSet({ after: set('s1', 1, 100, 5), type: 'drop', unit: 'lb', distanceUnit: 'mi', cardio: false })).toMatchObject({ set_type: 'drop', weight: 0, reps: 0, drops: [{ weight: 0, reps: 0 }] })
  })
})
