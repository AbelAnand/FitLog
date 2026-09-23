import type { Drop, ExerciseKind, SetType } from '../api/types'
import type { MetricKey } from '../data/cardio-metrics'
import { toKg, toKm, type DistanceUnit, type Unit } from './units'

/** A single logged set, flattened with its workout and exercise context. */
export interface SetRow {
  id: string
  weight: number
  unit: Unit
  reps: number
  set_number: number
  set_type: SetType
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  drops: Drop[]
  incline: number | null
  extra: Partial<Record<MetricKey, number>>
  created_at: string
  workout_exercise_id: string
  exercise_id: string
  exercise_name: string
  exercise_kind: ExerciseKind
  workout_id: string
  workout_title: string
  date: string // yyyy-MM-dd
}

/** Distance in km for a cardio set: logged distance, or speed × time when only those were logged. */
export function cardioKm(r: Pick<SetRow, 'distance' | 'distance_unit' | 'duration_seconds' | 'extra'>): number {
  const du = r.distance_unit ?? 'mi'
  if (r.distance) return toKm(r.distance, du)
  const speed = r.extra.speed
  if (speed && r.duration_seconds) return toKm(speed * (r.duration_seconds / 3600), du)
  return 0
}

/** Strength sets that count toward PRs and volume. */
export function counts(r: Pick<SetRow, 'reps' | 'set_type' | 'exercise_kind'>): boolean {
  return r.exercise_kind !== 'cardio' && r.set_type !== 'warmup' && r.reps > 0
}

export interface Session {
  workout_id: string
  workout_title: string
  date: string
  topKg: number
  topReps: number
  volumeKg: number
  /** Cardio totals */
  seconds: number
  km: number
  sets: SetRow[]
}

/** Group an exercise's sets by workout, ordered oldest → newest. */
export function sessionsFor(rows: SetRow[], exerciseId: string): Session[] {
  const byWorkout = new Map<string, Session>()
  for (const r of rows) {
    if (r.exercise_id !== exerciseId) continue
    let s = byWorkout.get(r.workout_id)
    if (!s) {
      s = { workout_id: r.workout_id, workout_title: r.workout_title, date: r.date, topKg: 0, topReps: 0, volumeKg: 0, seconds: 0, km: 0, sets: [] }
      byWorkout.set(r.workout_id, s)
    }
    s.sets.push(r)
    if (r.exercise_kind === 'cardio') {
      s.seconds += r.duration_seconds ?? 0
      s.km += cardioKm(r)
      continue
    }
    if (!counts(r)) continue
    const kg = toKg(r.weight, r.unit)
    s.volumeKg += kg * r.reps
    for (const d of r.drops) s.volumeKg += toKg(d.weight, r.unit) * d.reps
    if (kg > s.topKg || (kg === s.topKg && r.reps > s.topReps)) {
      s.topKg = kg
      s.topReps = r.reps
    }
  }
  for (const s of byWorkout.values()) s.sets.sort((a, b) => a.set_number - b.set_number)
  return [...byWorkout.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sets[0].created_at.localeCompare(b.sets[0].created_at)))
}

/** Best weight (kg) per strength exercise, optionally excluding one workout. */
export function bestByExercise(rows: SetRow[], excludeWorkoutId?: string): Map<string, number> {
  const best = new Map<string, number>()
  for (const r of rows) {
    if (r.workout_id === excludeWorkoutId || !counts(r)) continue
    const kg = toKg(r.weight, r.unit)
    if (kg > (best.get(r.exercise_id) ?? 0)) best.set(r.exercise_id, kg)
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
