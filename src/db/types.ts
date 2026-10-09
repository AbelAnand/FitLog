import type { Drop, ExerciseKind, SetType } from '../api/types'
import type { MetricKey } from '../data/cardio-metrics'
import type { DistanceUnit, Unit } from '../lib/units'

/** What is kept on the device. One record per row, grouped by table. */
export type Table = 'workouts' | 'exercises' | 'workout_exercises' | 'sets' | 'splits' | 'meta'
export const TABLES: Table[] = ['workouts', 'exercises', 'workout_exercises', 'sets', 'splits', 'meta']

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

/** A target set inside a split's day template: a set without the row bookkeeping. */
export type TemplateSet = Omit<StoredSet, 'id' | 'workout_exercise_id' | 'created_at'>

/** One exercise of a day template, with its own copy of the target sets. */
export interface TemplateExercise {
  exercise_id: string
  sets: TemplateSet[]
}

/** One day of a split's cycle: a workout to plan, or a rest day. */
export type SplitDay = { rest: true } | { rest: false; title: string; exercises: TemplateExercise[] }

/**
 * A split: a named cycle of days applied to the calendar in order, whatever the weekday.
 * Templates keep their own sets, so editing a plan made from a split does not change the split.
 */
export interface StoredSplit {
  id: string
  name: string
  days: SplitDay[]
  created_at: string
  /** The first date the split was last applied from, and the last date it filled (for Extend). */
  applied_from: string | null
  applied_through: string | null
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

/** Says a file holds one workout handed to someone, not a whole log. */
export interface SharedMarker {
  kind: 'workout'
  /** The id of the shared workout inside the file. */
  workout_id: string
}

/**
 * The file written by "Save a backup" and read by "Restore". Format 2 added `splits`; format 1
 * files are still read (they simply have none). A shared workout is the same file with `shared`.
 */
export interface BackupFile {
  app: 'FitLog'
  format: 2
  exportedAt: string
  profile: StoredProfile
  exercises: StoredExercise[]
  workouts: StoredWorkout[]
  workout_exercises: StoredWorkoutExercise[]
  sets: StoredSet[]
  splits: StoredSplit[]
  shared?: SharedMarker
}

export const BACKUP_FORMAT = 2
