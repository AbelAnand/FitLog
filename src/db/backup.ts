import type { BackupFile, SharedMarker, StoredExercise, StoredSet, StoredSplit, StoredWorkout, StoredWorkoutExercise } from './types'
import { BACKUP_FORMAT, DEFAULT_PROFILE } from './types'
import { cleanProfile, isId } from './clean'
import { isMetricKey, defaultMetricsFor, type MetricKey } from '../data/cardio-metrics'

/** Reading and writing the files people keep their log in. Everything read here is untrusted. */

export class UnreadableFile extends Error {}

/** Far more than a lifetime of training, and small enough to stay responsive. */
export const MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_RECORDS = 400_000

export function backupFilename(now = new Date()): string {
  return `fitlog-backup-${now.toISOString().slice(0, 10)}.json`
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1)
}

function list(v: unknown, what: string): unknown[] {
  if (v == null) return []
  if (!Array.isArray(v)) throw new UnreadableFile(`This backup is damaged: its ${what} are not a list.`)
  if (v.length > MAX_RECORDS) throw new UnreadableFile(`This backup has too many ${what} to be a SplitLog backup.`)
  return v
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new UnreadableFile('This file is not a SplitLog backup. It could not be read.')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UnreadableFile('This file is not a SplitLog backup.')
  const r = raw as Record<string, unknown>
  if (r.app !== 'FitLog') throw new UnreadableFile('This file is not a SplitLog backup.')
  // Format 1 (before splits) is the same file without `splits`; anything newer is refused.
  if (r.format !== 1 && r.format !== BACKUP_FORMAT) throw new UnreadableFile('This backup was made by a newer version of SplitLog. Update the app, then try again.')
  // Records are checked one by one when they are imported; here only the outline is.
  return {
    app: 'FitLog',
    format: BACKUP_FORMAT,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
    profile: r.profile ? cleanProfile(r.profile) : DEFAULT_PROFILE,
    exercises: list(r.exercises, 'exercises') as StoredExercise[],
    workouts: list(r.workouts, 'workouts') as StoredWorkout[],
    workout_exercises: list(r.workout_exercises, 'exercise entries') as StoredWorkoutExercise[],
    sets: list(r.sets, 'sets') as StoredSet[],
    splits: r.format === 1 ? [] : (list(r.splits, 'splits') as StoredSplit[]),
    ...(sharedMarker(r.shared) ? { shared: sharedMarker(r.shared)! } : {}),
  }
}

/** The marker a shared-workout file carries; anything that is not exactly that is ignored. */
function sharedMarker(v: unknown): SharedMarker | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  return r.kind === 'workout' && isId(r.workout_id) ? { kind: 'workout', workout_id: r.workout_id } : null
}

/* ---------- Spreadsheet (CSV) files made by "Export to CSV" ---------- */

/** Split CSV text into rows of cells. Handles quoted cells, doubled quotes and line breaks inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

/** The same text always gives the same id, so importing one file twice does not double the log. */
export function stableId(text: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** A formula-safe cell was written with a leading apostrophe; take it off again. */
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s)

const EXTRA_COLUMNS: Record<string, MetricKey> = { speed: 'speed', level: 'level', calories: 'calories', heart_rate: 'hr', floors: 'floors', watts: 'watts', rpm: 'rpm' }

export function parseCsv(text: string): BackupFile {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new UnreadableFile('This spreadsheet has no workouts in it.')
  if (rows.length > MAX_RECORDS) throw new UnreadableFile('This spreadsheet is too large to be a SplitLog export.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  for (const needed of ['date', 'workout', 'exercise', 'set']) {
    if (col(needed) < 0) throw new UnreadableFile(`This spreadsheet is not a SplitLog export: the "${needed}" column is missing.`)
  }
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
  const number = (s: string) => (s === '' || !Number.isFinite(Number(s)) ? null : Number(s))

  const exercises = new Map<string, StoredExercise>()
  const workouts = new Map<string, StoredWorkout>()
  const entries = new Map<string, StoredWorkoutExercise>()
  const sets: StoredSet[] = []
  const lastSet = new Map<string, StoredSet>() // entry id + set number -> the set a drop line belongs to
  const seen = new Map<string, number>()

  rows.slice(1).forEach((r, index) => {
    const date = get(r, 'date')
    const exerciseName = unguard(get(r, 'exercise'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !exerciseName) return
    const title = unguard(get(r, 'workout'))
    const kind = get(r, 'kind') === 'cardio' ? 'cardio' : 'strength'
    const at = new Date(Date.parse(`${date}T12:00:00Z`) + index * 1000).toISOString()

    const exKey = exerciseName.toLowerCase()
    let exercise = exercises.get(exKey)
    if (!exercise) {
      exercise = { id: stableId(`exercise|${exKey}`), name: exerciseName, kind, track_incline: false, metrics: kind === 'cardio' ? defaultMetricsFor(exerciseName) : null, created_at: at }
      exercises.set(exKey, exercise)
    }

    const wKey = `${date}|${title.toLowerCase()}`
    let workout = workouts.get(wKey)
    if (!workout) {
      workout = { id: stableId(`workout|${wKey}`), title, date, notes: '', created_at: at, started_at: at, finished_at: at, paused_at: null, paused_seconds: 0, is_plan: false }
      workouts.set(wKey, workout)
    }

    const eKey = `${workout.id}|${exercise.id}`
    let entry = entries.get(eKey)
    if (!entry) {
      const position = [...entries.values()].filter((e) => e.workout_id === workout.id).length
      entry = { id: stableId(`entry|${eKey}`), workout_id: workout.id, exercise_id: exercise.id, position, notes: '', planned: false, completed_at: null, created_at: at }
      entries.set(eKey, entry)
    }

    const setLabel = get(r, 'set')
    const weight = number(get(r, 'weight')) ?? 0
    const reps = number(get(r, 'reps')) ?? 0

    // "2.1" is the first weight-drop of set 2.
    const drop = setLabel.match(/^(\d+)\.(\d+)$/)
    if (drop) {
      lastSet.get(`${entry.id}|${drop[1]}`)?.drops.push({ weight, reps })
      return
    }

    const setNumber = Number.parseInt(setLabel, 10) || 1
    const occurrence = (seen.get(`${entry.id}|${setNumber}`) ?? 0) + 1
    seen.set(`${entry.id}|${setNumber}`, occurrence)
    const extra: Partial<Record<MetricKey, number>> = {}
    for (const [column, key] of Object.entries(EXTRA_COLUMNS)) {
      const n = number(get(r, column))
      if (n && isMetricKey(key)) extra[key] = n
    }
    const distanceUnit = get(r, 'distance_unit')
    const type = get(r, 'type')
    const set: StoredSet = {
      id: stableId(`set|${entry.id}|${setNumber}|${occurrence}`),
      workout_exercise_id: entry.id,
      set_number: setNumber,
      set_type: type === 'warmup' || type === 'drop' || type === 'failure' ? type : 'working',
      weight,
      unit: get(r, 'unit') === 'kg' ? 'kg' : 'lb',
      reps,
      duration_seconds: number(get(r, 'duration_seconds')),
      distance: number(get(r, 'distance')),
      distance_unit: distanceUnit === 'km' || distanceUnit === 'mi' ? distanceUnit : null,
      drops: [],
      incline: number(get(r, 'incline_pct')),
      extra,
      created_at: at,
    }
    sets.push(set)
    lastSet.set(`${entry.id}|${setNumber}`, set)
  })

  if (!sets.length) throw new UnreadableFile('This spreadsheet has no sets in it.')
  // Cardio exercises that logged incline or other figures should show those columns.
  const byId = new Map([...entries.values()].map((e) => [e.id, e]))
  for (const exercise of exercises.values()) {
    if (exercise.kind !== 'cardio') continue
    const used = new Set<MetricKey>(exercise.metrics ?? [])
    for (const s of sets) {
      if (byId.get(s.workout_exercise_id)?.exercise_id !== exercise.id) continue
      if (s.incline) used.add('incline')
      for (const k of Object.keys(s.extra)) if (isMetricKey(k)) used.add(k)
    }
    exercise.metrics = [...used].slice(0, 4)
    exercise.track_incline = exercise.metrics.includes('incline')
  }

  return { app: 'FitLog', format: BACKUP_FORMAT, exportedAt: '', profile: DEFAULT_PROFILE, exercises: [...exercises.values()], workouts: [...workouts.values()], workout_exercises: [...entries.values()], sets, splits: [] }
}

/**
 * What a file knows. A backup holds everything; a spreadsheet holds sets only; a shared file is
 * one workout from someone else's log, which must not change anything already here.
 */
export type ImportKind = 'backup' | 'spreadsheet' | 'shared'

export interface ReadFile {
  file: BackupFile
  kind: ImportKind
}

/** Work out what kind of file this is from its contents, not its name. */
export function readImportFile(text: string): ReadFile {
  if (text.length > MAX_FILE_BYTES) throw new UnreadableFile('This file is too large to be a SplitLog backup.')
  const start = text.replace(/^﻿/, '').trimStart()
  if (start.startsWith('{')) {
    const file = parseBackup(text)
    return { file, kind: file.shared ? 'shared' : 'backup' }
  }
  if (/^"?date"?\s*,/i.test(start)) return { file: parseCsv(text), kind: 'spreadsheet' }
  throw new UnreadableFile('This file is not a SplitLog backup or a SplitLog spreadsheet export.')
}
