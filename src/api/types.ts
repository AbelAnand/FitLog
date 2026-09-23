import type { DistanceUnit, Unit } from '../lib/units'

export type ExerciseKind = 'strength' | 'cardio'
export type SetType = 'warmup' | 'working' | 'drop' | 'failure'

export interface Profile {
  id: string
  unit: Unit
  distance_unit: DistanceUnit
  weekly_goal: number
}

export interface WorkoutSummary {
  id: string
  title: string
  date: string
  notes: string
  created_at: string
  started_at: string
  finished_at: string | null
  exerciseNames: string[]
  setCount: number
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
  created_at: string
}

export interface WorkoutExerciseDetail {
  id: string
  exercise_id: string
  name: string
  kind: ExerciseKind
  position: number
  notes: string
  sets: SetDetail[]
}

export interface WorkoutDetail {
  id: string
  title: string
  date: string
  notes: string
  created_at: string
  started_at: string
  finished_at: string | null
  exercises: WorkoutExerciseDetail[]
}

export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  /** Most recent date this exercise was logged, if ever. */
  lastUsed?: string
}

/** Fields a set row can change. */
export type SetPatch = Partial<Pick<SetDetail, 'weight' | 'reps' | 'unit' | 'set_type' | 'duration_seconds' | 'distance' | 'distance_unit'>>
