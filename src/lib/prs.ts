import { toKg, type Unit } from './units'

/** A single logged set, flattened with its workout and exercise context. */
export interface SetRow {
  id: string
  weight: number
  unit: Unit
  reps: number
  set_number: number
  created_at: string
  workout_exercise_id: string
  exercise_id: string
  exercise_name: string
  workout_id: string
  workout_title: string
  date: string // yyyy-MM-dd
}

export interface Session {
  workout_id: string
  workout_title: string
  date: string
  topKg: number
  topReps: number
  volumeKg: number
  sets: SetRow[]
}

/** Group an exercise's sets by workout, ordered oldest → newest. */
export function sessionsFor(rows: SetRow[], exerciseId: string): Session[] {
  const byWorkout = new Map<string, Session>()
  for (const r of rows) {
    if (r.exercise_id !== exerciseId) continue
    let s = byWorkout.get(r.workout_id)
    if (!s) {
      s = { workout_id: r.workout_id, workout_title: r.workout_title, date: r.date, topKg: 0, topReps: 0, volumeKg: 0, sets: [] }
      byWorkout.set(r.workout_id, s)
    }
    const kg = toKg(r.weight, r.unit)
    s.sets.push(r)
    s.volumeKg += kg * r.reps
    if (kg > s.topKg || (kg === s.topKg && r.reps > s.topReps)) {
      s.topKg = kg
      s.topReps = r.reps
    }
  }
  return [...byWorkout.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sets[0].created_at.localeCompare(b.sets[0].created_at)))
}

/**
 * Best weight (kg) per exercise, optionally excluding one workout so the
 * editor can compare the current session against everything before it.
 */
export function bestByExercise(rows: SetRow[], excludeWorkoutId?: string): Map<string, number> {
  const best = new Map<string, number>()
  for (const r of rows) {
    if (r.workout_id === excludeWorkoutId) continue
    if (r.reps <= 0) continue
    const kg = toKg(r.weight, r.unit)
    if (kg > (best.get(r.exercise_id) ?? 0)) best.set(r.exercise_id, kg)
  }
  return best
}

/** Best weight per exercise considering only workouts strictly before `date` (or same date, earlier workout). */
export function bestBefore(rows: SetRow[], exerciseId: string, workoutId: string, date: string): number {
  let best = 0
  for (const r of rows) {
    if (r.exercise_id !== exerciseId || r.workout_id === workoutId || r.reps <= 0) continue
    if (r.date > date) continue
    const kg = toKg(r.weight, r.unit)
    if (kg > best) best = kg
  }
  return best
}

export interface PrEvent {
  date: string
  workout_id: string
  kg: number
  reps: number
  prevKg: number
}

/** Every session where the top weight beat all prior sessions. */
export function prTimeline(sessions: Session[]): PrEvent[] {
  const events: PrEvent[] = []
  let best = 0
  for (const s of sessions) {
    if (s.topKg > best && s.topReps > 0) {
      events.push({ date: s.date, workout_id: s.workout_id, kg: s.topKg, reps: s.topReps, prevKg: best })
      best = s.topKg
    }
  }
  return events
}

/** Set ids that are PRs: the first set in a session reaching a weight above all previous sessions. */
export function prSetIds(rows: SetRow[]): Set<string> {
  const ids = new Set<string>()
  const exerciseIds = new Set(rows.map((r) => r.exercise_id))
  for (const ex of exerciseIds) {
    const sessions = sessionsFor(rows, ex)
    let best = 0
    for (const s of sessions) {
      if (s.topKg > best && s.topReps > 0) {
        const first = s.sets.find((r) => toKg(r.weight, r.unit) === s.topKg)
        if (first) ids.add(first.id)
        best = s.topKg
      }
    }
  }
  return ids
}
