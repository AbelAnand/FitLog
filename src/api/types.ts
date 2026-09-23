import type { DistanceUnit, Unit } from '../lib/units'

export type ExerciseKind = 'strength' | 'cardio'
export type SetType = 'warmup' | 'working' | 'drop' | 'failure'

export interface Profile {
  id: string
  unit: Unit
  distance_unit: DistanceUnit
  weekly_goal: number
}

export interface SessionTiming {
  started_at: string
  finished_at: string | null
  paused_at: string | null
  paused_seconds: number
}

export interface WorkoutSummary extends SessionTiming {
  id: string
  title: string
  date: string
  notes: string
  created_at: string
  is_plan: boolean
  exerciseNames: string[]
  setCount: number
  completedCount: number
}

/** One weight-drop inside a drop set, in the parent set's unit. */
export interface Drop {
  weight: number
  reps: number
}

export interface SetDetail {
  id: string
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
  created_at: string
}

export interface WorkoutExerciseDetail {
  id: string
  exercise_id: string
  name: string
  kind: ExerciseKind
  track_incline: boolean
  position: number
  notes: string
  completed_at: string | null
  sets: SetDetail[]
}

export interface WorkoutDetail extends SessionTiming {
  id: string
  title: string
  date: string
  notes: string
  created_at: string
  is_plan: boolean
  exercises: WorkoutExerciseDetail[]
}

export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  track_incline: boolean
  /** Most recent date this exercise was logged, if ever. */
  lastUsed?: string
}

/** Fields a set row can change. */
export type SetPatch = Partial<Pick<SetDetail, 'weight' | 'reps' | 'unit' | 'set_type' | 'duration_seconds' | 'distance' | 'distance_unit' | 'drops' | 'incline'>>
