import type { Unit } from '../lib/units'

export interface Profile {
  id: string
  unit: Unit
  weekly_goal: number
}

export interface WorkoutSummary {
  id: string
  title: string
  date: string
  notes: string
  created_at: string
  exerciseNames: string[]
  setCount: number
}

export interface SetDetail {
  id: string
  set_number: number
  weight: number
  unit: Unit
  reps: number
  created_at: string
}

export interface WorkoutExerciseDetail {
  id: string
  exercise_id: string
  name: string
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
  exercises: WorkoutExerciseDetail[]
}

export interface Exercise {
  id: string
  name: string
  /** Most recent date this exercise was logged, if ever. */
  lastUsed?: string
}
