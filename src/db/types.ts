import type { Drop, ExerciseKind, SetType } from '../api/types'
import type { MetricKey } from '../data/cardio-metrics'
import type { DistanceUnit, Unit } from '../lib/units'

/** What is kept on the device. One record per row, grouped by table. */
export type Table = 'workouts' | 'exercises' | 'workout_exercises' | 'sets' | 'meta'
export const TABLES: Table[] = ['workouts', 'exercises', 'workout_exercises', 'sets', 'meta']

export interface StoredWorkout {
  id: string
  title: string
  date: string // yyyy-MM-dd
  notes: string
  created_at: string
  started_at: string
  finished_at: string | null
  paused_at: string | null
  paused_seconds: number
  is_plan: boolean
}

export interface StoredExercise {
  id: string
  name: string
  kind: ExerciseKind
  track_incline: boolean
  metrics: MetricKey[] | null
  created_at: string
}

export interface StoredWorkoutExercise {
  id: string
  workout_id: string
  exercise_id: string
  position: number
  notes: string
  planned: boolean
  completed_at: string | null
  created_at: string
}

export interface StoredSet {
  id: string
  workout_exercise_id: string
  set_number: number
  set_type: SetType
  weight: number
  unit: Unit
  reps: number
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  drops: Drop[]
  incline: number | null
  extra: Partial<Record<MetricKey, number>>
  created_at: string
}

export interface StoredProfile {
  unit: Unit
  distance_unit: DistanceUnit
  weekly_goal: number
}

export const DEFAULT_PROFILE: StoredProfile = { unit: 'lb', distance_unit: 'mi', weekly_goal: 4 }

/** One change to the store. `v: null` removes the record. */
export interface Op {
  t: Table
  id: string
  v: unknown | null
}

export interface StoredRecord {
  t: Table
  id: string
  v: unknown
}

/** Where records are kept. The app never talks to storage except through this. */
export interface Persistence {
  load(): Promise<StoredRecord[]>
  /** All-or-nothing: either every change is saved or none is. */
  write(ops: Op[]): Promise<void>
  wipe(): Promise<void>
}

/** The file written by "Save a backup" and read by "Restore". */
export interface BackupFile {
  app: 'FitLog'
  format: 1
  exportedAt: string
  profile: StoredProfile
  exercises: StoredExercise[]
  workouts: StoredWorkout[]
  workout_exercises: StoredWorkoutExercise[]
  sets: StoredSet[]
}
