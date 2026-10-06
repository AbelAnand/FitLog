import { addDays, format, startOfWeek } from 'date-fns'
import { serializeBackup } from './backup'
import { setsToCsv } from '../lib/csv'
import type { QueryClient } from '@tanstack/react-query'
import { uuid } from '../lib/uuid'
import { readImportFile } from './backup'
import type { LocalDb } from './db'
import type { BackupFile, StoredExercise, StoredSet, StoredWorkout, StoredWorkoutExercise } from './types'

/**
 * Development and simulator helpers. Loaded only by development and `simtest` builds;
 * release builds do not contain this file.
 */

const PLAN: Record<string, [string, 'strength' | 'cardio', number][]> = {
  Push: [['Bench Press', 'strength', 135], ['Overhead Press', 'strength', 85], ['Incline Dumbbell Press', 'strength', 50], ['Tricep Pushdown', 'strength', 60]],
  Pull: [['Deadlift', 'strength', 225], ['Lat Pulldown', 'strength', 120], ['Barbell Row', 'strength', 135], ['Hammer Curl', 'strength', 30]],
  Legs: [['Squat', 'strength', 185], ['Leg Press', 'strength', 270], ['Romanian Deadlift', 'strength', 155], ['Running', 'cardio', 0]],
}

/** Eight weeks of Push / Pull / Legs, plus a session in progress today with a new record. */
export function demoBackup(today = new Date()): BackupFile {
  const exercises = new Map<string, StoredExercise>()
  const workouts: StoredWorkout[] = []
  const entries: StoredWorkoutExercise[] = []
  const sets: StoredSet[] = []
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  const exercise = (name: string, kind: 'strength' | 'cardio', at: string) => {
    if (!exercises.has(name)) exercises.set(name, { id: uuid(), name, kind, track_incline: false, metrics: kind === 'cardio' ? ['time', 'distance'] : null, created_at: at })
    return exercises.get(name)!
  }
  const blank: Pick<StoredSet, 'duration_seconds' | 'distance' | 'distance_unit' | 'drops' | 'incline' | 'extra'> = { duration_seconds: null, distance: null, distance_unit: null, drops: [], incline: null, extra: {} }

  for (let week = 8; week >= 1; week--) {
    ;[['Push', 0], ['Pull', 1], ['Legs', 3], ['Push', 4]].forEach(([title, offset]) => {
      const day = addDays(monday, -7 * week + (offset as number))
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0)
      const w: StoredWorkout = { id: uuid(), title: title as string, date: format(day, 'yyyy-MM-dd'), notes: '', created_at: start.toISOString(), started_at: start.toISOString(), finished_at: new Date(start.getTime() + 65 * 60_000).toISOString(), paused_at: null, paused_seconds: 0, is_plan: false }
      workouts.push(w)
      PLAN[title as string].forEach(([name, kind, base], position) => {
        const ex = exercise(name, kind, w.created_at)
        const e: StoredWorkoutExercise = { id: uuid(), workout_id: w.id, exercise_id: ex.id, position, notes: '', planned: false, completed_at: null, created_at: w.created_at }
        entries.push(e)
        const stamp = (n: number) => new Date(start.getTime() + (position * 15 + n) * 60_000).toISOString()
        if (kind === 'cardio') {
          sets.push({ id: uuid(), workout_exercise_id: e.id, set_number: 1, set_type: 'working', weight: 0, unit: 'lb', reps: 0, ...blank, duration_seconds: 1500 - (8 - week) * 20, distance: 3, distance_unit: 'mi', created_at: stamp(1) })
          return
        }
        const weight = base + (8 - week) * 5
        sets.push({ id: uuid(), workout_exercise_id: e.id, set_number: 1, set_type: 'warmup', weight: Math.round((weight * 0.5) / 5) * 5, unit: 'lb', reps: 10, ...blank, created_at: stamp(1) })
        for (let n = 1; n <= 3; n++) {
          // The last two working sets are drop sets, so last-session hints are as long as a real log's.
          const drop = n >= 2 ? { set_type: 'drop' as const, drops: [{ weight: weight - 30, reps: 10 }, { weight: weight - 60, reps: 10 }] } : {}
          sets.push({ id: uuid(), workout_exercise_id: e.id, set_number: n + 1, set_type: 'working', weight, unit: 'lb', reps: 9 - n, ...blank, created_at: stamp(n + 1), ...drop })
        }
      })
    })
  }

  const start = new Date(today.getTime() - 42 * 60_000)
  const live: StoredWorkout = { id: 'demo-live-workout', title: 'Push', date: format(today, 'yyyy-MM-dd'), notes: '', created_at: start.toISOString(), started_at: start.toISOString(), finished_at: null, paused_at: null, paused_seconds: 0, is_plan: false }
  workouts.push(live)
  const lift = (name: string, position: number, rows: [StoredSet['set_type'], number, number][]) => {
    const e: StoredWorkoutExercise = { id: uuid(), workout_id: live.id, exercise_id: exercise(name, 'strength', live.created_at).id, position, notes: '', planned: false, completed_at: null, created_at: live.created_at }
    entries.push(e)
    rows.forEach(([set_type, weight, reps], i) => sets.push({ id: uuid(), workout_exercise_id: e.id, set_number: i + 1, set_type, weight, unit: 'lb', reps, ...blank, created_at: new Date(start.getTime() + (position * 15 + i) * 60_000).toISOString() }))
  }
  lift('Bench Press', 0, [['warmup', 95, 10], ['working', 175, 8], ['working', 175, 7], ['working', 175, 6]])
  lift('Overhead Press', 1, [['working', 120, 8], ['working', 120, 7], ['working', 120, 6]])

  return { app: 'FitLog', format: 1, exportedAt: today.toISOString(), profile: { unit: 'lb', distance_unit: 'mi', weekly_goal: 4 }, exercises: [...exercises.values()], workouts, workout_exercises: entries, sets }
}

/** Every native plugin call since the app loaded, with where it came from (simulator tests read it). */
const nativeCalls: string[] = []
{
  const cap = (window as unknown as { Capacitor?: { nativePromise?: (...args: unknown[]) => unknown } }).Capacitor
  if (cap?.nativePromise) {
    const original = cap.nativePromise
    cap.nativePromise = function (this: unknown, ...args: unknown[]) {
      nativeCalls.push(`${String(args[0])}.${String(args[1])} ${(new Error().stack ?? '').split('\n').slice(1, 7).join(' <- ').replace(/https?:\/\/[^ )]*\//g, '')}`)
      return original.apply(this, args)
    }
  }
}

export function installDevtools(db: LocalDb, qc: QueryClient) {
  const refresh = () => qc.invalidateQueries()
  const tools = {
    db,
    qc,
    nativeCalls,
    /** Replace whatever is stored with the demo log. */
    async seedDemo() {
      await db.open()
      await db.eraseEverything()
      const summary = await db.importAll(demoBackup(), { takeProfile: true })
      await db.markBackedUp(new Date().toISOString())
      await refresh()
      return summary
    },
    /** Restore a file that was placed in the app's Documents folder (simulator tests). */
    async restoreFromDocuments(name: string, options: { erase?: boolean } = {}) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const { data } = await Filesystem.readFile({ path: name, directory: Directory.Documents, encoding: Encoding.UTF8 })
      await db.open()
      if (options.erase) await db.eraseEverything()
      const read = readImportFile(String(data))
      const summary = await db.importAll(read.file, { takeProfile: read.kind === 'backup', kind: read.kind })
      await refresh()
      return summary
    },
    /** The log as the backup file and spreadsheet the user would save (simulator tests restore them). */
    backupText: () => serializeBackup(db.exportAll(new Date())),
    csvText: () => setsToCsv(db.allSets()),
    demoFile: () => serializeBackup(demoBackup()),
    /** Write a text file into the app's Documents folder (simulator tests read it back with simctl). */
    async writeDocument(name: string, text: string) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({ path: name, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 })
    },
    /** Paint a line of text over the app so a screenshot can show a result. */
    show(text: string) {
      const el = document.createElement('div')
      el.textContent = text
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:110px;z-index:9999;padding:12px 14px;border-radius:14px;background:#111;color:#c6f135;font:600 13px/1.4 ui-monospace,monospace;white-space:pre-wrap;border:1px solid #c6f135'
      document.body.appendChild(el)
    },
  }
  Object.assign(window, { __fitlog: tools, __qc: qc, __db: db })
}
