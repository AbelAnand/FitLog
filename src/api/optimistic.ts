import type { SetRow } from '../lib/prs'
import type { Drop, SetDetail, SetPatch, WorkoutDetail, WorkoutExerciseDetail, WorkoutSummary } from './types'
import type { DistanceUnit, Unit } from '../lib/units'
import type { MetricKey } from '../data/cardio-metrics'

/**
 * Pure cache transforms. The editor shows a change the moment it is made; these functions apply
 * that change to the cached workout, and derive the history-wide caches (workout list, all sets)
 * from it, so every screen agrees without waiting for the server.
 */

export interface NewSet {
  /** Client-generated id; filled in automatically when omitted. */
  id?: string
  set_number: number
  weight: number
  reps: number
  unit: Unit
  set_type?: SetDetail['set_type']
  duration_seconds?: number | null
  distance?: number | null
  distance_unit?: DistanceUnit | null
  drops?: Drop[]
  incline?: number | null
  extra?: Partial<Record<MetricKey, number>>
}

export type NewSetWithId = NewSet & { id: string }

export function setDetailFrom(s: NewSetWithId, createdAt: string): SetDetail {
  return {
    id: s.id,
    set_number: s.set_number,
    set_type: s.set_type ?? 'working',
    weight: s.weight,
    unit: s.unit,
    reps: s.reps,
    duration_seconds: s.duration_seconds ?? null,
    distance: s.distance ?? null,
    distance_unit: s.distance_unit ?? null,
    drops: s.drops ?? [],
    incline: s.incline ?? null,
    extra: s.extra ?? {},
    created_at: createdAt,
  }
}

const mapExercise = (w: WorkoutDetail, weId: string, fn: (we: WorkoutExerciseDetail) => WorkoutExerciseDetail): WorkoutDetail => ({
  ...w,
  exercises: w.exercises.map((we) => (we.id === weId ? fn(we) : we)),
})

export function addExercise(w: WorkoutDetail, we: WorkoutExerciseDetail): WorkoutDetail {
  if (w.exercises.some((x) => x.id === we.id)) return w
  return { ...w, exercises: [...w.exercises, we].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) }
}

export function removeExercise(w: WorkoutDetail, weId: string): WorkoutDetail {
  return { ...w, exercises: w.exercises.filter((we) => we.id !== weId) }
}

export function patchExercise(w: WorkoutDetail, weId: string, patch: Partial<Pick<WorkoutExerciseDetail, 'notes' | 'completed_at'>>): WorkoutDetail {
  return mapExercise(w, weId, (we) => ({ ...we, ...patch }))
}

/** Exercise-level settings apply to every card showing that exercise. */
export function patchExerciseSettings(w: WorkoutDetail, exerciseId: string, patch: { track_incline?: boolean; metrics?: MetricKey[] }): WorkoutDetail {
  return { ...w, exercises: w.exercises.map((we) => (we.exercise_id === exerciseId ? { ...we, ...patch } : we)) }
}

export function addSets(w: WorkoutDetail, weId: string, sets: SetDetail[]): WorkoutDetail {
  return mapExercise(w, weId, (we) => {
    const known = new Set(we.sets.map((s) => s.id))
    return { ...we, sets: [...we.sets, ...sets.filter((s) => !known.has(s.id))] }
  })
}

export function replaceSets(w: WorkoutDetail, weId: string, sets: SetDetail[]): WorkoutDetail {
  return mapExercise(w, weId, (we) => ({ ...we, sets }))
}

export function removeSet(w: WorkoutDetail, setId: string): WorkoutDetail {
  return { ...w, exercises: w.exercises.map((we) => (we.sets.some((s) => s.id === setId) ? { ...we, sets: we.sets.filter((s) => s.id !== setId) } : we)) }
}

export function patchSets(w: WorkoutDetail, updates: { setId: string; patch: SetPatch }[]): WorkoutDetail {
  const byId = new Map(updates.map((u) => [u.setId, u.patch]))
  return {
    ...w,
    exercises: w.exercises.map((we) => (we.sets.some((s) => byId.has(s.id)) ? { ...we, sets: we.sets.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s)) } : we)),
  }
}

/* ---------- Derived caches ---------- */

export function summaryOf(w: WorkoutDetail): WorkoutSummary {
  const planned = w.exercises.filter((we) => we.planned)
  return {
    id: w.id,
    title: w.title,
    date: w.date,
    notes: w.notes,
    created_at: w.created_at,
    started_at: w.started_at,
    finished_at: w.finished_at,
    paused_at: w.paused_at,
    paused_seconds: w.paused_seconds,
    is_plan: w.is_plan,
    exerciseNames: w.exercises.map((we) => we.name).filter(Boolean),
    setCount: w.exercises.reduce((n, we) => n + we.sets.length, 0),
    plannedCount: planned.length,
    completedCount: planned.filter((we) => we.completed_at).length,
  }
}

/** Newest first: by date, then by creation time. Matches the server's ordering. */
const byRecency = (a: WorkoutSummary, b: WorkoutSummary) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date))

export function upsertSummary(list: WorkoutSummary[], w: WorkoutDetail): WorkoutSummary[] {
  return [...list.filter((x) => x.id !== w.id), summaryOf(w)].sort(byRecency)
}

export function rowsOf(w: WorkoutDetail): SetRow[] {
  if (w.is_plan) return []
  return w.exercises.flatMap((we) =>
    we.sets.map((s) => ({
      id: s.id,
      weight: s.weight,
      unit: s.unit,
      reps: s.reps,
      set_number: s.set_number,
      set_type: s.set_type,
      duration_seconds: s.duration_seconds,
      distance: s.distance,
      distance_unit: s.distance_unit,
      drops: s.drops,
      incline: s.incline,
      extra: s.extra,
      created_at: s.created_at,
      workout_exercise_id: we.id,
      exercise_id: we.exercise_id,
      exercise_name: we.name,
      exercise_kind: we.kind,
      workout_id: w.id,
      workout_title: w.title,
      date: w.date,
    })),
  )
}

/** Swap one workout's rows inside the all-sets list. */
export function replaceWorkoutRows(rows: SetRow[], w: WorkoutDetail): SetRow[] {
  return [...rows.filter((r) => r.workout_id !== w.id), ...rowsOf(w)]
}
