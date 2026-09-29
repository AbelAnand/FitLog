import type { Drop, ExerciseKind, SetType } from '../api/types'
import { isMetricKey, type MetricKey } from '../data/cardio-metrics'
import { LIMITS } from '../data/limits'
import type { DistanceUnit, Unit } from '../lib/units'
import type { StoredExercise, StoredProfile, StoredSet, StoredWorkout, StoredWorkoutExercise } from './types'
import { DEFAULT_PROFILE } from './types'

/**
 * Every record passes through here on its way in: from storage, from a backup file, from the app
 * itself. A file chosen by the user is untrusted input, so nothing is taken at face value. A record
 * that cannot be made sense of is dropped (`null`) rather than allowed to break the app.
 */

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null)

const ID = /^[0-9a-zA-Z][0-9a-zA-Z_-]{0,63}$/
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, min: number, max: number, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const int = (v: unknown, min: number, max: number, fallback = 0) => Math.round(num(v, min, max, fallback))
const numOrNull = (v: unknown, min: number, max: number): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? num(v, min, max) : null)
const bool = (v: unknown): boolean => v === true
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
const stamp = (v: unknown, fallback: string): string => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback)
const stampOrNull = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)

const UNITS = ['lb', 'kg'] as const satisfies readonly Unit[]
const DISTANCE_UNITS = ['mi', 'km'] as const satisfies readonly DistanceUnit[]
const KINDS = ['strength', 'cardio'] as const satisfies readonly ExerciseKind[]
const SET_TYPES = ['working', 'warmup', 'drop', 'failure'] as const satisfies readonly SetType[]

const WEEK = 7 * 24 * 60 * 60

export function cleanProfile(v: unknown): StoredProfile {
  const r = obj(v) ?? {}
  return {
    unit: oneOf(r.unit, UNITS, DEFAULT_PROFILE.unit),
    distance_unit: oneOf(r.distance_unit, DISTANCE_UNITS, DEFAULT_PROFILE.distance_unit),
    weekly_goal: int(r.weekly_goal, 1, 14, DEFAULT_PROFILE.weekly_goal),
  }
}

export function cleanWorkout(v: unknown): StoredWorkout | null {
  const r = obj(v)
  if (!r || !isId(r.id) || !isDate(r.date)) return null
  const created = stamp(r.created_at, `${r.date}T12:00:00.000Z`)
  return {
    id: r.id,
    title: text(r.title, LIMITS.workoutTitle),
    date: r.date,
    notes: text(r.notes, LIMITS.workoutNotes),
    created_at: created,
    started_at: stamp(r.started_at, created),
    finished_at: stampOrNull(r.finished_at),
    paused_at: stampOrNull(r.paused_at),
    paused_seconds: int(r.paused_seconds, 0, WEEK),
    is_plan: bool(r.is_plan),
  }
}

export function cleanMetrics(v: unknown): MetricKey[] | null {
  if (!Array.isArray(v)) return null
  const keys = [...new Set(v.filter((k): k is MetricKey => typeof k === 'string' && isMetricKey(k)))].slice(0, 4)
  return keys.length ? keys : null
}

export function cleanExercise(v: unknown): StoredExercise | null {
  const r = obj(v)
  if (!r || !isId(r.id)) return null
  const name = text(r.name, LIMITS.exerciseName).trim()
  if (!name) return null
  const kind = oneOf(r.kind, KINDS, 'strength')
  const metrics = kind === 'cardio' ? cleanMetrics(r.metrics) : null
  return { id: r.id, name, kind, track_incline: kind === 'cardio' && (metrics ? metrics.includes('incline') : bool(r.track_incline)), metrics, created_at: stamp(r.created_at, new Date(0).toISOString()) }
}

export function cleanWorkoutExercise(v: unknown): StoredWorkoutExercise | null {
  const r = obj(v)
  if (!r || !isId(r.id) || !isId(r.workout_id) || !isId(r.exercise_id)) return null
  return {
    id: r.id,
    workout_id: r.workout_id,
    exercise_id: r.exercise_id,
    position: int(r.position, 0, 1000),
    notes: text(r.notes, LIMITS.exerciseNotes),
    planned: bool(r.planned),
    completed_at: stampOrNull(r.completed_at),
    created_at: stamp(r.created_at, new Date(0).toISOString()),
  }
}

export function cleanDrops(v: unknown): Drop[] {
  if (!Array.isArray(v)) return []
  return v
    .map(obj)
    .filter((d): d is Raw => !!d)
    .slice(0, LIMITS.drops)
    .map((d) => ({ weight: num(d.weight, 0, 99999), reps: int(d.reps, 0, LIMITS.reps) }))
}

export function cleanExtra(v: unknown): Partial<Record<MetricKey, number>> {
  const r = obj(v)
  if (!r) return {}
  const out: Partial<Record<MetricKey, number>> = {}
  for (const [k, raw] of Object.entries(r)) {
    const n = Number(raw)
    if (isMetricKey(k) && Number.isFinite(n) && n > 0) out[k] = Math.min(n, 1_000_000)
  }
  return out
}

export function cleanSet(v: unknown): StoredSet | null {
  const r = obj(v)
  if (!r || !isId(r.id) || !isId(r.workout_exercise_id)) return null
  return {
    id: r.id,
    workout_exercise_id: r.workout_exercise_id,
    set_number: int(r.set_number, 0, 1000, 1),
    set_type: oneOf(r.set_type, SET_TYPES, 'working'),
    weight: num(r.weight, 0, 99999),
    unit: oneOf(r.unit, UNITS, 'lb'),
    reps: int(r.reps, 0, LIMITS.reps),
    duration_seconds: r.duration_seconds == null ? null : int(r.duration_seconds, 0, WEEK),
    distance: numOrNull(r.distance, 0, 99999),
    distance_unit: r.distance_unit == null ? null : oneOf(r.distance_unit, DISTANCE_UNITS, 'mi'),
    drops: cleanDrops(r.drops),
    incline: numOrNull(r.incline, 0, 100),
    extra: cleanExtra(r.extra),
    created_at: stamp(r.created_at, new Date(0).toISOString()),
  }
}
