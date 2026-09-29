import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LocalDb, NotFound } from '../db/db'
import { memoryPersistence } from '../db/persistence'
import { UnreadableFile, parseBackup, parseCsv, parseCsvRows, readImportFile, serializeBackup, stableId } from '../db/backup'
import { setsToCsv } from '../lib/csv'
import { bestByExercise } from '../lib/prs'
import type { StoredSet, StoredWorkout, StoredWorkoutExercise } from '../db/types'

const at = '2026-09-24T10:00:00.000Z'
const workout = (id: string, extra: Partial<StoredWorkout> = {}): StoredWorkout => ({ id, title: 'Push', date: '2026-09-24', notes: '', created_at: at, started_at: at, finished_at: null, paused_at: null, paused_seconds: 0, is_plan: false, ...extra })
const entry = (id: string, workoutId: string, exerciseId: string, position = 0): StoredWorkoutExercise => ({ id, workout_id: workoutId, exercise_id: exerciseId, position, notes: '', planned: false, completed_at: null, created_at: at })
const set = (id: string, entryId: string, n: number, weight = 0, reps = 0, extra: Partial<StoredSet> = {}): StoredSet => ({ id, workout_exercise_id: entryId, set_number: n, set_type: 'working', weight, unit: 'lb', reps, duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {}, created_at: at, ...extra })

async function fresh() {
  const store = memoryPersistence()
  const db = new LocalDb(store)
  await db.open()
  return { db, store }
}

async function withBench() {
  const ctx = await fresh()
  await ctx.db.addWorkout(workout('w1'))
  await ctx.db.addEntry({ entry: entry('e1', 'w1', 'x-bench'), exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false }, sets: [set('s1', 'e1', 1, 65, 7)] })
  return ctx
}

describe('the log on the device', () => {
  it('starts empty with sensible settings', async () => {
    const { db } = await fresh()
    expect(db.listWorkouts()).toEqual([])
    expect(db.profile()).toEqual({ unit: 'lb', distance_unit: 'mi', weekly_goal: 4 })
  })

  it('keeps a workout with its exercises and sets', async () => {
    const { db } = await withBench()
    await db.addSets('e1', [set('s2', 'e1', 2, 65, 6)])
    const w = db.getWorkout('w1')
    expect(w.exercises.map((e) => e.name)).toEqual(['Bench Press'])
    expect(w.exercises[0].sets.map((s) => `${s.weight}x${s.reps}`)).toEqual(['65x7', '65x6'])
    expect(db.listWorkouts()[0]).toMatchObject({ id: 'w1', exerciseNames: ['Bench Press'], setCount: 2 })
    expect(db.allSets().map((r) => r.exercise_name)).toEqual(['Bench Press', 'Bench Press'])
  })

  it('survives closing and reopening the app', async () => {
    const { db, store } = await withBench()
    await db.patchSets([{ setId: 's1', patch: { weight: 70 } }])
    await db.setProfile({ unit: 'kg' })
    const reopened = new LocalDb(store)
    await reopened.open()
    expect(reopened.getWorkout('w1').exercises[0].sets[0].weight).toBe(70)
    expect(reopened.profile().unit).toBe('kg')
  })

  it('uses the existing exercise when the name is already in the library', async () => {
    const { db } = await withBench()
    await db.addWorkout(workout('w2', { date: '2026-09-25' }))
    await db.addEntry({ entry: entry('e2', 'w2', 'some-new-id'), exercise: { name: '  bench press ', kind: 'strength', trackIncline: false }, sets: [] })
    expect(db.listExercises()).toHaveLength(1)
    expect(db.getWorkout('w2').exercises[0].exercise_id).toBe('x-bench')
  })

  it('removes everything that belongs to a deleted workout, and nothing else', async () => {
    const { db, store } = await withBench()
    await db.addWorkout(workout('w2'))
    await db.addEntry({ entry: entry('e2', 'w2', 'x-bench'), exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false }, sets: [set('s9', 'e2', 1, 50, 5)] })
    await db.removeWorkout('w1')
    expect(() => db.getWorkout('w1')).toThrow(NotFound)
    expect(db.allSets().map((s) => s.id)).toEqual(['s9'])
    expect([...store.records.keys()].sort()).toEqual(['exercises/x-bench', 'sets/s9', 'workout_exercises/e2', 'workouts/w2'])
  })

  it('deleting an exercise from the library removes its logged uses', async () => {
    const { db } = await withBench()
    await db.removeExercise('x-bench')
    expect(db.getWorkout('w1').exercises).toEqual([])
    expect(db.allSets()).toEqual([])
  })

  it('replaces sets and renumbers them', async () => {
    const { db } = await withBench()
    await db.replaceSets('e1', [set('n1', 'e1', 5, 80, 5), set('n2', 'e1', 9, 80, 4)])
    expect(db.getWorkout('w1').exercises[0].sets.map((s) => [s.id, s.set_number])).toEqual([['n1', 1], ['n2', 2]])
  })

  it('clears out workouts that never got an exercise, except the one in use', async () => {
    const { db } = await withBench()
    await db.addWorkout(workout('empty-old', { created_at: '2026-09-01T00:00:00.000Z' }))
    await db.addWorkout(workout('empty-open', { created_at: '2026-09-01T00:00:00.000Z' }))
    await db.removeEmptyWorkouts('empty-open', 60_000)
    expect(db.listWorkouts().map((w) => w.id).sort()).toEqual(['empty-open', 'w1'])
  })

  it('leaves plans out of history and records', async () => {
    const { db } = await withBench()
    await db.addWorkout(workout('plan', { is_plan: true, date: '2026-10-01' }))
    await db.addEntry({ entry: entry('ep', 'plan', 'x-bench'), exercise: { name: 'Bench Press', kind: 'strength', trackIncline: false }, sets: [set('sp', 'ep', 1, 500, 1)] })
    expect(db.allSets().map((s) => s.id)).toEqual(['s1'])
    expect(db.listExercises()[0].lastUsed).toBe('2026-09-24')
  })

  it('never stores values outside the limits', async () => {
    const { db } = await withBench()
    await db.patchWorkout('w1', { title: 'x'.repeat(500), notes: 'n'.repeat(9000) })
    await db.patchSets([{ setId: 's1', patch: { reps: 999999, weight: -5 } }])
    const w = db.getWorkout('w1')
    expect(w.title).toHaveLength(120)
    expect(w.notes).toHaveLength(4000)
    expect(w.exercises[0].sets[0]).toMatchObject({ reps: 10000, weight: 0 })
  })

  it('shows only what was really kept when a save fails', async () => {
    const { db, store } = await withBench()
    store.failNext = 1
    await expect(db.patchSets([{ setId: 's1', patch: { weight: 999 } }])).rejects.toThrow('disk full')
    expect(db.getWorkout('w1').exercises[0].sets[0].weight).toBe(65)
    // and keeps working afterwards
    await db.patchSets([{ setId: 's1', patch: { weight: 70 } }])
    expect(db.getWorkout('w1').exercises[0].sets[0].weight).toBe(70)
  })

  it('saves changes in the order they were made', async () => {
    const { db, store } = await withBench()
    await Promise.all([db.patchSets([{ setId: 's1', patch: { reps: 1 } }]), db.patchSets([{ setId: 's1', patch: { reps: 2 } }]), db.patchSets([{ setId: 's1', patch: { reps: 3 } }])])
    expect((store.records.get('sets/s1')!.v as StoredSet).reps).toBe(3)
  })

  it('ignores damaged records instead of failing to open', async () => {
    const store = memoryPersistence([
      { t: 'workouts', id: 'w1', v: workout('w1') },
      { t: 'workouts', id: 'bad', v: { id: 'bad', date: 'not a date' } },
      { t: 'sets', id: 'orphan', v: 'garbage' },
    ])
    const db = new LocalDb(store)
    await db.open()
    expect(db.listWorkouts().map((w) => w.id)).toEqual(['w1'])
  })

  it('erases everything', async () => {
    const { db, store } = await withBench()
    await db.eraseEverything()
    expect(db.listWorkouts()).toEqual([])
    expect(db.listExercises()).toEqual([])
    expect(store.records.size).toBe(0)
  })
})

describe('backup and restore', () => {
  it('restores a backup onto an empty phone exactly', async () => {
    const { db } = await withBench()
    await db.addSets('e1', [set('s2', 'e1', 2, 65, 6, { set_type: 'drop', drops: [{ weight: 50, reps: 8 }] })])
    await db.patchEntry('e1', { notes: 'felt strong' })
    await db.setProfile({ unit: 'kg', weekly_goal: 5 })
    const text = serializeBackup(db.exportAll(new Date('2026-09-29T00:00:00Z')))

    const phone = await fresh()
    const read = readImportFile(text)
    expect(read.kind).toBe('backup')
    const summary = await phone.db.importAll(read.file, { takeProfile: true })
    expect(summary).toMatchObject({ workouts: 1, exercises: 1, sets: 2, alreadyHere: 0, sameWorkouts: 0, skipped: 0 })
    expect(phone.db.getWorkout('w1')).toEqual(db.getWorkout('w1'))
    expect(phone.db.profile()).toEqual(db.profile())
    expect(serializeBackup(phone.db.exportAll(new Date('2026-09-29T00:00:00Z')))).toBe(text)
  })

  it('restoring twice changes nothing', async () => {
    const { db } = await withBench()
    const file = db.exportAll()
    const first = db.exportAll(new Date(0))
    const summary = await db.importAll(file)
    expect(summary.alreadyHere).toBe(4)
    expect(db.exportAll(new Date(0))).toEqual(first)
  })

  it('adds to what is on the phone without removing anything', async () => {
    const old = await withBench()
    const file = old.db.exportAll()
    const phone = await fresh()
    await phone.db.addWorkout(workout('today', { date: '2026-09-29' }))
    await phone.db.addEntry({ entry: entry('e-today', 'today', 'x-local'), exercise: { name: 'bench press', kind: 'strength', trackIncline: false }, sets: [set('s-today', 'e-today', 1, 80, 5)] })
    await phone.db.importAll(file)
    expect(phone.db.listWorkouts().map((w) => w.id)).toEqual(['today', 'w1'])
    // Same exercise under two ids becomes one, so records and charts stay in one place.
    expect(phone.db.listExercises()).toHaveLength(1)
    expect(bestByExercise(phone.db.allSets()).size).toBe(1)
  })

  it('leaves out records that point at nothing', async () => {
    const { db } = await fresh()
    const summary = await db.importAll(parseBackup(JSON.stringify({ app: 'FitLog', format: 1, workouts: [workout('w1')], exercises: [], workout_exercises: [entry('e1', 'w1', 'missing-exercise')], sets: [set('s1', 'nowhere', 1)] })))
    expect(summary).toMatchObject({ workouts: 1, sets: 0, skipped: 2 })
  })

  it('refuses files that are not FitLog backups', () => {
    expect(() => readImportFile('hello')).toThrow(UnreadableFile)
    expect(() => readImportFile('{"app":"Other"}')).toThrow(/not a FitLog backup/)
    expect(() => readImportFile('{"app":"FitLog","format":2}')).toThrow(/newer version/)
    expect(() => readImportFile('{"app":"FitLog","format":1,"sets":{}}')).toThrow(/damaged/)
    expect(() => readImportFile('{not json')).toThrow(UnreadableFile)
  })

  it('cannot be used to smuggle in oversized or malformed values', async () => {
    const { db } = await fresh()
    const hostile = { app: 'FitLog', format: 1, profile: { unit: 'stone', weekly_goal: 9999 }, exercises: [{ id: 'x', name: 'A'.repeat(5000), kind: 'magic', metrics: ['time', '__proto__', 'speed', 'hr', 'rpm', 'watts'] }], workouts: [{ id: 'w', date: '2026-01-01', title: { evil: true }, paused_seconds: -50 }, { id: '../../etc', date: '2026-01-01' }], workout_exercises: [{ id: 'e', workout_id: 'w', exercise_id: 'x', position: 1e9 }], sets: [{ id: 's', workout_exercise_id: 'e', weight: 'NaN', reps: 1e12, drops: Array.from({ length: 500 }, () => ({ weight: 1, reps: 1 })), extra: { speed: 5, constructor: 1 } }] }
    await db.importAll(parseBackup(JSON.stringify(hostile)), { takeProfile: true })
    expect(db.profile()).toEqual({ unit: 'lb', distance_unit: 'mi', weekly_goal: 14 })
    expect(db.listWorkouts().map((w) => w.id)).toEqual(['w'])
    const w = db.getWorkout('w')
    expect(w).toMatchObject({ title: '', paused_seconds: 0 })
    expect(w.exercises[0]).toMatchObject({ kind: 'strength', position: 1000, metrics: [] })
    expect(w.exercises[0].name).toHaveLength(80)
    expect(w.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 10000, extra: { speed: 5 } })
    expect(w.exercises[0].sets[0].drops).toHaveLength(20)
  })
})

/** A log with exercise ids replaced by names, for comparing two phones that numbered their exercises differently. */
function byName(db: LocalDb) {
  const file = db.exportAll(new Date(0))
  const name = new Map(file.exercises.map((e) => [e.id, e.name]))
  return {
    profile: file.profile,
    exercises: file.exercises.map(({ id: _id, created_at: _at, ...e }) => e).sort((a, b) => a.name.localeCompare(b.name)),
    workouts: file.workouts,
    workout_exercises: file.workout_exercises.map((e) => ({ ...e, exercise_id: name.get(e.exercise_id) })),
    sets: file.sets,
  }
}

describe('the same workouts from two kinds of file', () => {
  async function logged() {
    const { db } = await withBench()
    await db.patchWorkout('w1', { notes: 'good session', finished_at: '2026-09-24T11:05:00.000Z' })
    await db.patchEntry('e1', { notes: 'paused reps' })
    await db.addSets('e1', [set('s2', 'e1', 2, 65, 6, { set_type: 'drop', drops: [{ weight: 50, reps: 8 }], created_at: '2026-09-24T10:05:00.000Z' })])
    await db.addWorkout(workout('w2', { title: 'Legs', date: '2026-09-25' }))
    await db.addEntry({ entry: entry('e3', 'w2', 'x-squat'), exercise: { name: 'Squat', kind: 'strength', trackIncline: false }, sets: [set('q1', 'e3', 1, 100, 5, { unit: 'kg' })] })
    await db.addEntry({ entry: entry('lib', 'w2', 'x-unused'), exercise: { name: 'Never Logged', kind: 'strength', trackIncline: false }, sets: [] })
    await db.removeEntry('lib')
    return db
  }

  it('a backup restored over a spreadsheet upgrades the workouts in place', async () => {
    const source = await logged()
    const phone = await fresh()
    await phone.db.importAll(readImportFile(setsToCsv(source.allSets())).file, { kind: 'spreadsheet' })
    expect(phone.db.listWorkouts()).toHaveLength(2)
    expect(phone.db.exportAll().workouts.every((w) => w.notes === '')).toBe(true)

    const summary = await phone.db.importAll(source.exportAll(), { kind: 'backup', takeProfile: true })
    expect(summary).toMatchObject({ workouts: 2, sameWorkouts: 2, skipped: 0 })
    // Nothing doubled, and the detail a spreadsheet cannot hold is back.
    expect(phone.db.counts()).toEqual(source.counts())
    expect(byName(phone.db)).toEqual(byName(source))
    expect(phone.db.getWorkout('w1')).toMatchObject({ notes: 'good session', finished_at: '2026-09-24T11:05:00.000Z' })
    expect(phone.db.getWorkout('w1').exercises[0].notes).toBe('paused reps')
    expect(phone.db.listExercises().map((e) => e.name)).toContain('Never Logged')
  })

  it('a spreadsheet restored over a backup changes nothing', async () => {
    const source = await logged()
    const before = source.exportAll(new Date(0))
    const summary = await source.importAll(readImportFile(setsToCsv(source.allSets())).file, { kind: 'spreadsheet' })
    expect(summary).toMatchObject({ workouts: 0, sets: 0, sameWorkouts: 2, skipped: 0 })
    expect(source.exportAll(new Date(0))).toEqual(before)
  })

  it('keeps a workout that was changed after the spreadsheet was restored', async () => {
    const source = await logged()
    const phone = await fresh()
    await phone.db.importAll(readImportFile(setsToCsv(source.allSets())).file, { kind: 'spreadsheet' })
    const legs = phone.db.listWorkouts().find((w) => w.title === 'Legs')!
    const edited = phone.db.getWorkout(legs.id).exercises[0].sets[0]
    await phone.db.patchSets([{ setId: edited.id, patch: { reps: 6 } }])
    const summary = await phone.db.importAll(source.exportAll(), { kind: 'backup' })
    // The edited one no longer matches, so both versions are kept rather than one being lost.
    expect(summary.sameWorkouts).toBe(1)
    expect(phone.db.listWorkouts().filter((w) => w.title === 'Legs')).toHaveLength(2)
    expect(phone.db.listWorkouts().filter((w) => w.title === 'Push')).toHaveLength(1)
  })

  it('does not treat two separate, identical sessions as one', async () => {
    const { db } = await fresh()
    const twice = { app: 'FitLog', format: 1, exportedAt: '', profile: { unit: 'lb', distance_unit: 'mi', weekly_goal: 4 }, exercises: [{ id: 'x', name: 'Bench', kind: 'strength', track_incline: false, metrics: null, created_at: at }], workouts: [workout('a'), workout('b')], workout_exercises: [entry('ea', 'a', 'x'), entry('eb', 'b', 'x')], sets: [set('sa', 'ea', 1, 100, 5), set('sb', 'eb', 1, 100, 5)] } as const
    const summary = await db.importAll(parseBackup(JSON.stringify(twice)))
    expect(summary).toMatchObject({ workouts: 2, sameWorkouts: 0 })
    expect(db.listWorkouts()).toHaveLength(2)
  })
})

describe('spreadsheet import', () => {
  it('reads quoted cells', () => {
    expect(parseCsvRows('a,b\r\n"x, y","say ""hi"""\n\n"two\nlines",z')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', 'z']])
  })

  it('gives the same id for the same text', () => {
    expect(stableId('workout|2026-09-24|push')).toBe(stableId('workout|2026-09-24|push'))
    expect(stableId('a')).not.toBe(stableId('b'))
    expect(stableId('a')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('brings back everything an export contained', async () => {
    const { db } = await withBench()
    await db.addSets('e1', [set('s2', 'e1', 2, 65, 6, { set_type: 'drop', drops: [{ weight: 50, reps: 8 }, { weight: 40, reps: 10 }] }), set('s0', 'e1', 0, 45, 10, { set_type: 'warmup' })])
    await db.addEntry({ entry: entry('e2', 'w1', 'x-run', 1), exercise: { name: 'Treadmill, incline', kind: 'cardio', trackIncline: true }, sets: [set('c1', 'e2', 1, 0, 0, { duration_seconds: 1800, distance: 2, distance_unit: 'mi', incline: 12, extra: { speed: 4 }, created_at: '2026-09-24T10:30:00.000Z' })] })
    await db.addWorkout(workout('w2', { title: '=Legs', date: '2026-09-25' }))
    await db.addEntry({ entry: entry('e3', 'w2', 'x-squat'), exercise: { name: 'Squat', kind: 'strength', trackIncline: false }, sets: [set('q1', 'e3', 1, 100, 5, { unit: 'kg' })] })
    const csv = setsToCsv(db.allSets())

    const phone = await fresh()
    const read = readImportFile(csv)
    expect(read.kind).toBe('spreadsheet')
    await phone.db.importAll(read.file, { kind: 'spreadsheet' })
    const list = phone.db.listWorkouts()
    expect(list.map((w) => [w.date, w.title, w.setCount])).toEqual([['2026-09-25', '=Legs', 1], ['2026-09-24', 'Push', 4]])
    const push = phone.db.getWorkout(list[1].id)
    expect(push.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Treadmill, incline'])
    expect(push.exercises[0].sets.map((s) => [s.set_type, s.weight, s.reps, s.drops.length])).toEqual([['warmup', 45, 10, 0], ['working', 65, 7, 0], ['drop', 65, 6, 2]])
    expect(push.exercises[1]).toMatchObject({ kind: 'cardio' })
    expect(push.exercises[1].metrics).toEqual(expect.arrayContaining(['time', 'incline', 'speed']))
    expect(push.exercises[1].sets[0]).toMatchObject({ duration_seconds: 1800, distance: 2, distance_unit: 'mi', incline: 12, extra: { speed: 4 } })
    expect(phone.db.getWorkout(list[0].id).exercises[0].sets[0]).toMatchObject({ weight: 100, unit: 'kg' })
    // Imported workouts are finished, not "in progress".
    expect(list.every((w) => w.finished_at)).toBe(true)

    // Importing the same spreadsheet again must not double anything.
    await phone.db.importAll(readImportFile(csv).file, { kind: 'spreadsheet' })
    expect(phone.db.allSets()).toHaveLength(5)
    expect(phone.db.listWorkouts()).toHaveLength(2)
  })

  it('refuses spreadsheets from elsewhere', () => {
    expect(() => readImportFile('date,name\n2026-01-01,x')).toThrow(/column is missing/)
    expect(() => parseCsv('date,workout,exercise,set\n')).toThrow(UnreadableFile)
  })
})

// The owner's real data, when the copy taken from the server is on this machine.
const backups = join(homedir(), 'Documents', 'FitLog Backups')
const serverCopies = existsSync(backups) ? readdirSync(backups).filter((f) => f.endsWith('server-copy.json')).sort() : []

describe.skipIf(serverCopies.length === 0)('the copy taken from the server', () => {
  it('restores completely, with nothing skipped', async () => {
    const text = readFileSync(join(backups, serverCopies.at(-1)!), 'utf8')
    const raw = JSON.parse(text)
    const { db } = await fresh()
    const summary = await db.importAll(readImportFile(text).file, { takeProfile: true })
    expect(summary.skipped).toBe(0)
    expect(summary.workouts).toBe(raw.workouts.length)
    expect(summary.sets).toBe(raw.sets.length)
    expect(db.counts()).toEqual({ workouts: raw.workouts.length, exercises: raw.exercises.length, sets: raw.sets.length })
    // Every set keeps its numbers.
    const kept = new Map(db.exportAll().sets.map((s) => [s.id, s]))
    for (const s of raw.sets) expect(kept.get(s.id)).toMatchObject({ weight: Number(s.weight), reps: s.reps, set_number: s.set_number, set_type: s.set_type, unit: s.unit })
    // Every workout opens.
    for (const w of raw.workouts) expect(db.getWorkout(w.id).title).toBe(w.title)
  })

  it('upgrades a phone that was restored from the spreadsheet export, without doubling anything', async () => {
    const text = readFileSync(join(backups, serverCopies.at(-1)!), 'utf8')
    const full = await fresh()
    await full.db.importAll(readImportFile(text).file, { takeProfile: true })

    const phone = await fresh()
    await phone.db.importAll(readImportFile(setsToCsv(full.db.allSets())).file, { kind: 'spreadsheet' })
    expect(phone.db.counts().sets).toBe(full.db.counts().sets)

    const summary = await phone.db.importAll(readImportFile(text).file, { kind: 'backup', takeProfile: true })
    expect(summary.skipped).toBe(0)
    expect(summary.sameWorkouts).toBe(full.db.counts().workouts)
    expect(phone.db.counts()).toEqual(full.db.counts())
    expect(byName(phone.db)).toEqual(byName(full.db))
  })
})
