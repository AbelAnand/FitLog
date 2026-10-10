import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LocalDb } from '../db/db'
import { memoryPersistence } from '../db/persistence'
import { parseBackup, readImportFile, serializeBackup } from '../db/backup'
import { sharedAsImport, sharedFilename, sharedWorkoutFile, sharedWorkoutOf } from '../db/share'
import type { SplitDay, StoredSet, StoredSplit, StoredWorkout, StoredWorkoutExercise } from '../db/types'
import { LIMITS } from '../data/limits'
import { cyclePosition, expandCycle, fillEnd, MAX_FILL_DAYS, nextFillDate, planFromWorkout, plansForSplit, templateFromWorkout, type PlanIds } from '../lib/splits'
import { workoutSummaryText } from '../lib/share-workout'

const at = '2026-09-24T10:00:00.000Z'
const workout = (id: string, extra: Partial<StoredWorkout> = {}): StoredWorkout => ({ id, title: 'Push', date: '2026-09-24', notes: '', created_at: at, started_at: at, finished_at: at, paused_at: null, paused_seconds: 0, is_plan: false, ...extra })
const entry = (id: string, workoutId: string, exerciseId: string, position = 0): StoredWorkoutExercise => ({ id, workout_id: workoutId, exercise_id: exerciseId, position, notes: '', planned: false, completed_at: null, created_at: at })
const set = (id: string, entryId: string, n: number, weight = 0, reps = 0, extra: Partial<StoredSet> = {}): StoredSet => ({ id, workout_exercise_id: entryId, set_number: n, set_type: 'working', weight, unit: 'lb', reps, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {}, created_at: at, ...extra })

/** Predictable ids, so tests can say what was made. */
function counter(prefix: string): PlanIds {
  let n = 0
  const next = () => `${prefix}-${++n}`
  return { workout: next, entry: next, set: next }
}

async function fresh() {
  const store = memoryPersistence()
  const db = new LocalDb(store)
  await db.open()
  return { db, store }
}

/** A finished Push day: bench with a warm-up and a drop set, overhead press, and a run. */
async function withPush() {
  const ctx = await fresh()
  const { db } = ctx
  await db.addWorkout(workout('w1', { notes: 'felt strong' }))
  await db.addEntry({
    entry: entry('e1', 'w1', 'x-bench'),
    exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false },
    sets: [set('s1', 'e1', 1, 135, 10, { set_type: 'warmup' }), set('s2', 'e1', 2, 185, 5), set('s3', 'e1', 3, 185, 5), set('s4', 'e1', 4, 185, 8, { set_type: 'drop', drops: [{ weight: 155, reps: 8 }, { weight: 135, reps: 8 }] })],
  })
  await db.addEntry({ entry: { ...entry('e2', 'w1', 'x-ohp', 1), notes: 'paused reps' }, exercise: { name: 'Overhead Press', kind: 'strength', trackIncline: false }, sets: [set('s5', 'e2', 1, 95, 8), set('s6', 'e2', 2, 95, 8)] })
  await db.addEntry({ entry: entry('e3', 'w1', 'x-run', 2), exercise: { name: 'Running', kind: 'cardio', trackIncline: false }, sets: [set('s7', 'e3', 1, 0, 0, { duration_seconds: 1500, distance: 3, distance_unit: 'mi', extra: { hr: 150 } })] })
  return ctx
}

const ppl: SplitDay[] = [
  { rest: false, title: 'Push', exercises: [{ exercise_id: 'x-bench', sets: [{ set_number: 1, set_type: 'working', weight: 185, unit: 'lb', reps: 5, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {} }] }] },
  { rest: false, title: 'Pull', exercises: [] },
  { rest: false, title: 'Legs', exercises: [] },
  { rest: true },
]

describe('a split as a rolling cycle', () => {
  it('walks the days in order, skips rest days and wraps around, whatever the weekday', () => {
    const out = expandCycle(ppl, '2026-11-01', '2026-11-09')
    expect(out.map((e) => `${e.date}:${e.index}`)).toEqual(['2026-11-01:0', '2026-11-02:1', '2026-11-03:2', '2026-11-05:0', '2026-11-06:1', '2026-11-07:2', '2026-11-09:0'])
  })

  it('can begin part-way through the cycle', () => {
    expect(expandCycle(ppl, '2026-11-01', '2026-11-04', 2).map((e) => e.index)).toEqual([2, 0, 1]) // Legs, Rest, Push, Pull
  })

  it('stops at the cap and refuses an empty or backwards range', () => {
    const everyDay: SplitDay[] = [{ rest: false, title: 'Daily', exercises: [] }]
    expect(expandCycle(everyDay, '2026-01-01', '2030-01-01')).toHaveLength(MAX_FILL_DAYS)
    expect(MAX_FILL_DAYS).toBe(LIMITS.splitFillWeeks * 7)
    expect(expandCycle(everyDay, '2026-01-10', '2026-01-01')).toEqual([])
    expect(expandCycle([], '2026-01-01', '2026-01-10')).toEqual([])
    expect(expandCycle([{ rest: true }], '2026-01-01', '2026-01-10')).toEqual([])
  })

  it('knows where the cycle stands when extending', () => {
    const split: Pick<StoredSplit, 'days' | 'applied_from' | 'applied_through'> = { days: ppl, applied_from: '2026-11-01', applied_through: '2026-11-14' }
    expect(nextFillDate(split, '2026-11-03')).toBe('2026-11-15')
    expect(nextFillDate({ applied_through: '2026-10-01' }, '2026-11-03')).toBe('2026-11-03')
    expect(nextFillDate({ applied_through: null }, '2026-11-03')).toBe('2026-11-03')
    expect(cyclePosition(split, '2026-11-15')).toBe(2) // 1 Nov Push, 2 Pull, 3 Legs, 4 Rest, 5 Push … 15 Legs
    expect(cyclePosition(split, '2026-11-05')).toBe(0)
    expect(cyclePosition({ days: ppl, applied_from: null }, '2026-11-05')).toBe(0)
    expect(fillEnd('2026-11-01', 2)).toBe('2026-11-14')
  })

  it('makes one plan per workout day, with copies of the target sets and nothing from the session', () => {
    const plans = plansForSplit({ days: ppl }, '2026-11-01', '2026-11-04', 0, counter('p'), at)
    expect(plans.map((p) => `${p.workout.date} ${p.workout.title}`)).toEqual(['2026-11-01 Push', '2026-11-02 Pull', '2026-11-03 Legs'])
    const push = plans[0]
    expect(push.workout).toMatchObject({ is_plan: true, finished_at: null, paused_at: null, paused_seconds: 0, notes: '' })
    expect(push.entries).toHaveLength(1)
    expect(push.entries[0]).toMatchObject({ exercise_id: 'x-bench', planned: true, completed_at: null, workout_id: push.workout.id })
    expect(push.sets).toHaveLength(1)
    expect(push.sets[0]).toMatchObject({ weight: 185, reps: 5, workout_exercise_id: push.entries[0].id, set_number: 1 })
  })
})

describe('applying a split and duplicating a workout', () => {
  it('a template copies the workout and does not change when the plan does', async () => {
    const { db } = await withPush()
    const day = templateFromWorkout(db.getWorkout('w1'))
    expect(day).toMatchObject({ rest: false, title: 'Push' })
    if (day.rest) throw new Error('unreachable')
    expect(day.exercises.map((e) => e.exercise_id)).toEqual(['x-bench', 'x-ohp', 'x-run'])
    expect(day.exercises[0].sets.map((s) => `${s.set_type} ${s.weight}x${s.reps}`)).toEqual(['warmup 135x10', 'working 185x5', 'working 185x5', 'drop 185x8'])
    expect(day.exercises[0].sets[3].drops).toEqual([{ weight: 155, reps: 8 }, { weight: 135, reps: 8 }])
    // Editing the source afterwards leaves the template alone.
    await db.patchSets([{ setId: 's2', patch: { weight: 500 } }])
    expect(day.exercises[0].sets[1].weight).toBe(185)
  })

  it('fills the calendar once: a second apply skips every day already planned', async () => {
    const { db } = await withPush()
    const split: StoredSplit = { id: 'sp1', name: 'PPL', days: [templateFromWorkout(db.getWorkout('w1')), { rest: false, title: 'Pull', exercises: [{ exercise_id: 'x-ohp', sets: [{ set_number: 1, set_type: 'working', weight: 100, unit: 'lb', reps: 5, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {} }] }] }, { rest: true }], created_at: at, applied_from: null, applied_through: null }
    await db.putSplit(split)
    expect(db.listSplits().map((s) => s.name)).toEqual(['PPL'])

    const first = await db.addPlans(plansForSplit(split, '2026-11-01', '2026-11-07', 0, counter('a'), at))
    expect(first).toEqual({ added: 5, skipped: 0 }) // Push Pull Rest Push Pull Rest Push
    const plans = db.listWorkouts().filter((w) => w.is_plan)
    expect(plans.map((w) => `${w.date} ${w.title}`).sort()).toEqual(['2026-11-01 Push', '2026-11-02 Pull', '2026-11-04 Push', '2026-11-05 Pull', '2026-11-07 Push'])
    expect(plans.find((w) => w.title === 'Push')).toMatchObject({ exerciseNames: ['Bench Press', 'Overhead Press', 'Running'], setCount: 7 })

    // Overlapping range (Push Pull Rest Push Pull Rest Push from the 4th): only the new days get plans.
    const second = await db.addPlans(plansForSplit(split, '2026-11-04', '2026-11-10', 0, counter('b'), at))
    expect(second).toEqual({ added: 2, skipped: 3 })
    expect(db.listWorkouts().filter((w) => w.is_plan).map((w) => `${w.date} ${w.title}`).sort()).toEqual(['2026-11-01 Push', '2026-11-02 Pull', '2026-11-04 Push', '2026-11-05 Pull', '2026-11-07 Push', '2026-11-08 Pull', '2026-11-10 Push'])
    await db.markSplitApplied('sp1', '2026-11-01', '2026-11-10')
    expect(db.getSplit('sp1')).toMatchObject({ applied_from: '2026-11-01', applied_through: '2026-11-10' })

    // Plans are ordinary afterwards: deleting one leaves the split alone, and the plans stay out of history.
    await db.removeWorkout(plans[0].id)
    expect(db.listSplits()).toHaveLength(1)
    expect(db.allSets().every((r) => r.workout_id === 'w1')).toBe(true)
  })

  it('duplicate to days creates plans and skips a day that already has the identical plan', async () => {
    const { db } = await withPush()
    const source = db.getWorkout('w1')
    const dates = ['2026-10-10', '2026-10-12', '2026-10-14']
    const first = await db.addPlans(dates.map((d) => planFromWorkout(source, d, counter(`d${d}`), at)))
    expect(first).toEqual({ added: 3, skipped: 0 })
    const copy = db.listWorkouts().find((w) => w.is_plan && w.date === '2026-10-12')!
    expect(copy).toMatchObject({ title: 'Push', exerciseNames: ['Bench Press', 'Overhead Press', 'Running'], setCount: 7, plannedCount: 3, completedCount: 0, finished_at: null })
    const detail = db.getWorkout(copy.id)
    expect(detail.notes).toBe('')
    expect(detail.exercises.map((e) => e.notes)).toEqual(['', '', ''])
    expect(detail.exercises[0].sets.map((s) => `${s.set_type} ${s.weight}x${s.reps}`)).toEqual(['warmup 135x10', 'working 185x5', 'working 185x5', 'drop 185x8'])
    // No new library entries.
    expect(db.listExercises()).toHaveLength(3)

    const again = await db.addPlans([...dates, '2026-10-16'].map((d) => planFromWorkout(source, d, counter(`e${d}`), at)))
    expect(again).toEqual({ added: 1, skipped: 3 })
    expect(db.listWorkouts().filter((w) => w.is_plan)).toHaveLength(4)
    expect(db.hasSamePlan(planFromWorkout(source, '2026-10-16', counter('x'), at))).toBe(true)
    expect(db.hasSamePlan(planFromWorkout(source, '2026-10-17', counter('x'), at))).toBe(false)
  })

  it('a split whose exercise was deleted keeps its other exercises', async () => {
    const { db } = await withPush()
    const day = templateFromWorkout(db.getWorkout('w1'))
    await db.removeExercise('x-ohp')
    await db.putSplit({ id: 'sp', name: 'X', days: [day], created_at: at, applied_from: null, applied_through: null })
    const kept = db.getSplit('sp').days[0]
    expect(kept.rest ? [] : kept.exercises.map((e) => e.exercise_id)).toEqual(['x-bench', 'x-run'])
  })
})

describe('sharing a workout', () => {
  it('writes a one-workout backup file with a marker and a readable name', async () => {
    const { db } = await withPush()
    const file = sharedWorkoutFile(db, 'w1', new Date('2026-10-08T12:00:00Z'))
    expect(file).toMatchObject({ app: 'FitLog', format: 2, shared: { kind: 'workout', workout_id: 'w1' }, splits: [] })
    expect(file.workouts.map((w) => w.id)).toEqual(['w1'])
    expect(file.workout_exercises).toHaveLength(3)
    expect(file.sets).toHaveLength(7)
    expect(file.exercises.map((e) => e.name).sort()).toEqual(['Bench Press', 'Overhead Press', 'Running'])
    expect(sharedFilename('Push', '2026-10-08')).toBe('SplitLog - Push - 2026-10-08.json')
    expect(sharedFilename('  Legs / "heavy"  ', '2026-10-08')).toBe('SplitLog - Legs heavy - 2026-10-08.json')
    expect(sharedFilename('', '2026-10-08')).toBe('SplitLog - Workout - 2026-10-08.json')
    // The ordinary file reader recognises it.
    const read = readImportFile(serializeBackup(file))
    expect(read.kind).toBe('shared')
    expect(sharedWorkoutOf(read.file)?.title).toBe('Push')
  })

  it('imports as a plan for today, matching exercises by name, and does not double on a second import', async () => {
    const { db: sender } = await withPush()
    const text = serializeBackup(sharedWorkoutFile(sender, 'w1'))

    const { db } = await fresh()
    await db.addWorkout(workout('mine', { date: '2026-10-01' }))
    await db.addEntry({ entry: entry('me1', 'mine', 'local-bench'), exercise: { name: 'bench press', kind: 'strength', trackIncline: false }, sets: [set('ms1', 'me1', 1, 200, 3)] })

    const read = readImportFile(text)
    const toImport = sharedAsImport(read.file, 'plan', '2026-10-09', at)
    const { summary } = db.planImport(toImport, read.kind)
    expect(summary).toMatchObject({ workouts: 1, exercises: 2, sets: 7, sameWorkouts: 0, skipped: 0 })
    await db.importAll(toImport, { kind: read.kind })

    const plan = db.listWorkouts().find((w) => w.is_plan)!
    // The recipient's own spelling of the exercise stays.
    expect(plan).toMatchObject({ title: 'Push', date: '2026-10-09', exerciseNames: ['bench press', 'Overhead Press', 'Running'], setCount: 7, plannedCount: 3, finished_at: null })
    expect(plan.id).not.toBe('w1')
    const detail = db.getWorkout(plan.id)
    expect(detail.exercises[0].exercise_id).toBe('local-bench') // matched by name, not duplicated
    expect(detail.exercises.map((e) => e.planned)).toEqual([true, true, true])
    expect(detail.exercises[0].sets.map((s) => s.id)).not.toContain('s1')
    expect(db.listExercises().map((e) => e.name).sort()).toEqual(['Overhead Press', 'Running', 'bench press'])
    expect(db.allSets()).toHaveLength(1) // a plan is not history

    // The same file again, same day: nothing new.
    const again = sharedAsImport(readImportFile(text).file, 'plan', '2026-10-09', at)
    expect(db.planImport(again, 'shared').summary).toMatchObject({ workouts: 0, sameWorkouts: 1, sets: 0 })
    await db.importAll(again, { kind: 'shared' })
    expect(db.listWorkouts()).toHaveLength(2)
    expect(db.listExercises()).toHaveLength(3)
  })

  it('a shared plan for a day still to come keeps its date; anything else lands on today', () => {
    const plan = { ...workout('p', { is_plan: true, date: '2026-12-01', finished_at: null }) }
    const file = { app: 'FitLog' as const, format: 2 as const, exportedAt: '', profile: { unit: 'lb' as const, distance_unit: 'mi' as const, weekly_goal: 4 }, exercises: [], workouts: [plan], workout_exercises: [], sets: [], splits: [], shared: { kind: 'workout' as const, workout_id: 'p' } }
    expect(sharedAsImport(file, 'plan', '2026-10-09').workouts[0].date).toBe('2026-12-01')
    expect(sharedAsImport({ ...file, workouts: [{ ...plan, date: '2026-01-01' }] }, 'plan', '2026-10-09').workouts[0].date).toBe('2026-10-09')
    expect(sharedAsImport({ ...file, workouts: [{ ...plan, is_plan: false, date: '2026-12-01' }] }, 'plan', '2026-10-09').workouts[0].date).toBe('2026-10-09')
  })

  it('can be kept as the completed workout on its original date instead', async () => {
    const { db: sender } = await withPush()
    const read = readImportFile(serializeBackup(sharedWorkoutFile(sender, 'w1')))
    const { db } = await fresh()
    await db.importAll(sharedAsImport(read.file, 'original', '2026-10-09'), { kind: 'shared' })
    const w = db.listWorkouts()[0]
    expect(w).toMatchObject({ title: 'Push', date: '2026-09-24', is_plan: false, notes: 'felt strong', finished_at: at })
    expect(db.allSets()).toHaveLength(7)
    // And again: the twin is recognised and left alone.
    const second = await db.importAll(sharedAsImport(read.file, 'original', '2026-10-09'), { kind: 'shared' })
    expect(second).toMatchObject({ workouts: 0, sameWorkouts: 1 })
    expect(db.listWorkouts()).toHaveLength(1)
  })

  it('never changes an exercise already in the recipient library', async () => {
    const { db: sender } = await withPush()
    await sender.patchExercise('x-run', { metrics: ['time', 'calories'] })
    const read = readImportFile(serializeBackup(sharedWorkoutFile(sender, 'w1')))
    const { db } = await fresh()
    await db.addWorkout(workout('mine'))
    await db.addEntry({ entry: entry('me', 'mine', 'local-run'), exercise: { name: 'Running', kind: 'cardio', trackIncline: false }, sets: [] })
    await db.patchExercise('local-run', { metrics: ['time', 'distance', 'incline'] })
    await db.importAll(sharedAsImport(read.file, 'plan', '2026-10-09'), { kind: 'shared' })
    expect(db.listExercises().find((e) => e.name === 'Running')).toMatchObject({ id: 'local-run', metrics: ['time', 'distance', 'incline'] })
    expect(db.listExercises()).toHaveLength(3)
  })

  it('the text summary reads like a message', async () => {
    const { db } = await withPush()
    const text = workoutSummaryText(db.getWorkout('w1'))
    expect(text).toBe(
      [
        'Push — Thu, Sep 24, 2026',
        'Bench Press (lb): 135 × 10 warm-up, 185 × 5, 185 × 5, 185 → 155 → 135 × 8',
        'Overhead Press (lb): 95 × 8, 95 × 8',
        '  (paused reps)',
        'Running: 25:00, 3 mi, 150 bpm',
        '',
        'Notes: felt strong',
        '',
        'Logged with SplitLog',
        'https://abelanand.github.io/SplitLog/',
      ].join('\n'),
    )
  })

  it('the summary handles plans, uneven drops, bodyweight and treadmill figures', async () => {
    const { db } = await fresh()
    await db.addWorkout(workout('p', { title: 'Legs', is_plan: true, date: '2026-10-20', finished_at: null }))
    await db.addEntry({ entry: entry('e1', 'p', 'x-squat'), exercise: { name: 'Squat', kind: 'strength', trackIncline: false }, sets: [set('s1', 'e1', 1, 225, 5, { set_type: 'drop', drops: [{ weight: 185, reps: 8 }] }), set('s2', 'e1', 2, 100, 5, { unit: 'kg', set_type: 'failure' })] })
    await db.addEntry({ entry: entry('e2', 'p', 'x-pullup', 1), exercise: { name: 'Pull-up', kind: 'strength', trackIncline: false }, sets: [set('s3', 'e2', 1, 0, 12)] })
    await db.addEntry({ entry: entry('e3', 'p', 'x-tread', 2), exercise: { name: 'Treadmill', kind: 'cardio', trackIncline: true }, sets: [set('s4', 'e3', 1, 0, 0, { duration_seconds: 1200, incline: 5, distance_unit: 'mi', extra: { speed: 6 } })] })
    const lines = workoutSummaryText(db.getWorkout('p')).split('\n')
    expect(lines[0]).toBe('Legs — planned for Tue, Oct 20, 2026')
    expect(lines[1]).toBe('Squat: 225 lb × 5 → 185 lb × 8, 100 kg × 5 to failure')
    expect(lines[2]).toBe('Pull-up: BW × 12')
    expect(lines[3]).toBe('Treadmill: 20:00, 6 mph, 5% incline')
    expect(lines.at(-2)).toBe('Logged with SplitLog')
  })
})

describe('backup format 2', () => {
  it('still restores a format-1 file completely', async () => {
    const text = readFileSync(new URL('./fixtures/backup-format-1.json', import.meta.url), 'utf8')
    const read = readImportFile(text)
    expect(read.kind).toBe('backup')
    expect(read.file.format).toBe(2)
    expect(read.file.splits).toEqual([])
    const { db } = await fresh()
    const summary = await db.importAll(read.file, { takeProfile: true })
    expect(summary).toMatchObject({ workouts: 2, exercises: 2, sets: 4, splits: 0, skipped: 0 })
    expect(db.getWorkout('f1-w1')).toMatchObject({ title: 'Push', notes: 'good session', paused_seconds: 120 })
    expect(db.getWorkout('f1-w1').exercises[0].sets[1].drops).toEqual([{ weight: 155, reps: 8 }, { weight: 135, reps: 8 }])
    expect(db.getWorkout('f1-w2')).toMatchObject({ is_plan: true, date: '2026-10-20' })
    expect(db.listSplits()).toEqual([])
    // What it writes now is format 2 and reads back the same.
    const again = await fresh()
    await again.db.importAll(parseBackup(serializeBackup(db.exportAll(new Date(0)))), { takeProfile: true })
    expect(again.db.exportAll(new Date(0))).toEqual(db.exportAll(new Date(0)))
  })

  it('carries splits through a backup and restore, matching their exercises by name', async () => {
    const { db } = await withPush()
    await db.putSplit({ id: 'sp1', name: 'PPL', days: [templateFromWorkout(db.getWorkout('w1')), { rest: true }], created_at: at, applied_from: '2026-11-01', applied_through: '2026-11-14' })
    const file = db.exportAll(new Date(0))
    expect(file.format).toBe(2)
    expect(file.splits).toHaveLength(1)
    const text = serializeBackup(file)

    const phone = await fresh()
    await phone.db.addWorkout(workout('mine'))
    await phone.db.addEntry({ entry: entry('me', 'mine', 'their-bench'), exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false }, sets: [] })
    const summary = await phone.db.importAll(readImportFile(text).file)
    expect(summary.splits).toBe(1)
    const split = phone.db.getSplit('sp1')
    expect(split).toMatchObject({ name: 'PPL', applied_from: '2026-11-01', applied_through: '2026-11-14' })
    const day = split.days[0]
    expect(day.rest ? [] : day.exercises.map((e) => e.exercise_id)).toEqual(['their-bench', 'x-ohp', 'x-run'])
    expect(split.days[1]).toEqual({ rest: true })
    // Restoring twice changes nothing.
    await phone.db.importAll(readImportFile(text).file)
    expect(phone.db.listSplits()).toHaveLength(1)
  })

  it('cleans splits like everything else', async () => {
    const { db } = await withPush()
    const hostile = { app: 'FitLog', format: 2, exercises: [], workouts: [], workout_exercises: [], sets: [], splits: [{ id: 'bad', name: 'N'.repeat(500), days: [...Array.from({ length: 50 }, () => ({ rest: true })), { rest: false, title: 7, exercises: [{ exercise_id: 'x-bench', sets: Array.from({ length: 100 }, () => ({ weight: -5, reps: 'lots' })) }, { exercise_id: 'nope', sets: [] }] }, 'junk'], applied_from: '2026-01-01', applied_through: 'never' }, { name: 'no id' }] }
    const summary = await db.importAll(parseBackup(JSON.stringify(hostile)))
    expect(summary).toMatchObject({ splits: 1, skipped: 1 })
    const s = db.getSplit('bad')
    expect(s.name).toHaveLength(LIMITS.splitName)
    expect(s.days).toHaveLength(LIMITS.splitDays)
    expect(s.applied_from).toBeNull()
    expect(s.applied_through).toBeNull()
    const text = JSON.stringify({ app: 'FitLog', format: 2, splits: [{ id: 'ok', name: 'X', days: [{ rest: false, title: 7, exercises: [{ exercise_id: 'x-bench', sets: Array.from({ length: 100 }, () => ({ weight: -5, reps: 'lots' })) }, { exercise_id: 'nope', sets: [] }] }] }] })
    await db.importAll(parseBackup(text))
    const day = db.getSplit('ok').days[0]
    if (day.rest) throw new Error('unreachable')
    expect(day.title).toBe('')
    expect(day.exercises.map((e) => e.exercise_id)).toEqual(['x-bench']) // the unknown exercise is dropped
    expect(day.exercises[0].sets).toHaveLength(LIMITS.splitTemplateSets)
    expect(day.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 0, set_number: 1 })
    // Reopening keeps them.
    const reopened = new LocalDb((db as unknown as { store: ReturnType<typeof memoryPersistence> }).store)
    await reopened.open()
    expect(reopened.listSplits().map((x) => x.id).sort()).toEqual(['bad', 'ok'])
  })
})
