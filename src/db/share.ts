import { uuid } from '../lib/uuid'
import { UnreadableFile } from './backup'
import { cleanSet, cleanWorkout, cleanWorkoutExercise } from './clean'
import type { LocalDb } from './db'
import { BACKUP_FORMAT, type BackupFile, type StoredExercise, type StoredSet, type StoredWorkout, type StoredWorkoutExercise } from './types'

/**
 * One workout handed to another SplitLog user. The file is a backup file holding exactly that
 * workout, its exercise entries and sets, and the library exercises they use, plus a `shared`
 * marker, so the ordinary Restore path reads it and the app can treat it differently: the
 * recipient usually wants it as a plan, and nothing already on their phone may change.
 */

export function sharedWorkoutFile(db: LocalDb, workoutId: string, now = new Date()): BackupFile {
  const w = db.getWorkout(workoutId)
  const workout: StoredWorkout = { id: w.id, title: w.title, date: w.date, notes: w.notes, created_at: w.created_at, started_at: w.started_at, finished_at: w.finished_at, paused_at: w.paused_at, paused_seconds: w.paused_seconds, is_plan: w.is_plan }
  const entries: StoredWorkoutExercise[] = []
  const sets: StoredSet[] = []
  const used = new Map<string, StoredExercise>()
  for (const we of w.exercises) {
    entries.push({ id: we.id, workout_id: w.id, exercise_id: we.exercise_id, position: we.position, notes: we.notes, planned: we.planned, completed_at: we.completed_at, created_at: w.created_at })
    for (const s of we.sets) sets.push({ ...s, workout_exercise_id: we.id })
    if (!used.has(we.exercise_id)) used.set(we.exercise_id, { id: we.exercise_id, name: we.name, kind: we.kind, track_incline: we.track_incline, metrics: we.kind === 'cardio' ? we.metrics : null, created_at: w.created_at })
  }
  return {
    app: 'FitLog',
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    profile: db.profile(),
    exercises: [...used.values()],
    workouts: [workout],
    workout_exercises: entries,
    sets,
    splits: [],
    shared: { kind: 'workout', workout_id: w.id },
  }
}

/** "SplitLog - Push - 2026-10-08.json": readable in Messages and Files, safe on every filesystem. */
export function sharedFilename(title: string, date: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return `SplitLog - ${clean || 'Workout'} - ${date}.json`
}

/** The workout a shared file carries, cleaned; null when the file does not hold the one it names. */
export function sharedWorkoutOf(file: BackupFile): StoredWorkout | null {
  if (!file.shared) return null
  for (const raw of file.workouts) {
    const w = cleanWorkout(raw)
    if (w && w.id === file.shared.workout_id) return w
  }
  return null
}

export type SharedImportMode = 'plan' | 'original'

/** The date a shared workout gets as a plan: its own when it is a plan for a day still to come, otherwise today. */
export function sharedPlanDate(w: Pick<StoredWorkout, 'is_plan' | 'date'>, today: string): string {
  return w.is_plan && w.date > today ? w.date : today
}

/**
 * The shared workout as it should go into this phone: under fresh ids (the sender's must not
 * collide with or overwrite anything here), and as a plan for `today` unless the recipient asked
 * to keep it as the completed workout it was. Exercises keep their ids here; the import matches
 * them to the library by name and creates only the unknown ones.
 */
export function sharedAsImport(file: BackupFile, mode: SharedImportMode, today: string, now = new Date().toISOString(), ids: () => string = uuid): BackupFile {
  const source = sharedWorkoutOf(file)
  if (!source) throw new UnreadableFile('This file does not hold a shared workout.')
  const workoutId = ids()
  const date = mode === 'plan' ? sharedPlanDate(source, today) : source.date
  const workout: StoredWorkout = mode === 'plan'
    ? { ...source, id: workoutId, date, created_at: now, started_at: now, finished_at: null, paused_at: null, paused_seconds: 0, is_plan: true }
    : { ...source, id: workoutId }
  const entryIds = new Map<string, string>()
  const entries: StoredWorkoutExercise[] = []
  for (const raw of file.workout_exercises) {
    const e = cleanWorkoutExercise(raw)
    if (!e || e.workout_id !== source.id) continue
    const id = ids()
    entryIds.set(e.id, id)
    entries.push(mode === 'plan' ? { ...e, id, workout_id: workoutId, planned: true, completed_at: null, created_at: now } : { ...e, id, workout_id: workoutId })
  }
  const sets: StoredSet[] = []
  for (const raw of file.sets) {
    const s = cleanSet(raw)
    const entry = s && entryIds.get(s.workout_exercise_id)
    if (!s || !entry) continue
    sets.push({ ...s, id: ids(), workout_exercise_id: entry, created_at: mode === 'plan' ? now : s.created_at })
  }
  const usedExercises = new Set(entries.map((e) => e.exercise_id))
  const exerciseIds = new Map<string, string>()
  const exercises = file.exercises.flatMap((raw) => {
    const r = raw as { id?: unknown }
    if (typeof r?.id !== 'string' || !usedExercises.has(r.id) || exerciseIds.has(r.id)) return []
    const id = ids()
    exerciseIds.set(r.id, id)
    return [{ ...raw, id, created_at: now }]
  })
  return {
    ...file,
    exercises,
    workouts: [workout],
    workout_exercises: entries.map((e) => ({ ...e, exercise_id: exerciseIds.get(e.exercise_id) ?? e.exercise_id })),
    sets,
    splits: [],
    shared: { kind: 'workout', workout_id: workoutId },
  }
}
