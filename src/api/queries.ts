import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Unit } from '../lib/units'
import type { SetRow } from '../lib/prs'
import { keys } from './keys'
import type { Exercise, Profile, WorkoutDetail, WorkoutSummary } from './types'

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('id, unit, weekly_goal').single()
      if (error) throw error
      return { id: data.id, unit: data.unit as Unit, weekly_goal: data.weekly_goal }
    },
    staleTime: 5 * 60_000,
  })
}

export function useWorkouts() {
  return useQuery({
    queryKey: keys.workouts,
    queryFn: async (): Promise<WorkoutSummary[]> => {
      const { data, error } = await supabase
        .from('workouts')
        .select('id, title, date, notes, created_at, workout_exercises(position, exercises(name), sets(id))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map((w) => {
        const wes = [...w.workout_exercises].sort((a, b) => a.position - b.position)
        return {
          id: w.id,
          title: w.title,
          date: w.date,
          notes: w.notes,
          created_at: w.created_at,
          exerciseNames: wes.map((we) => we.exercises?.name ?? '').filter(Boolean),
          setCount: wes.reduce((n, we) => n + we.sets.length, 0),
        }
      })
    },
  })
}

export async function fetchWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, title, date, notes, created_at, workout_exercises(id, exercise_id, position, notes, exercises(name), sets(id, set_number, weight, unit, reps, created_at))')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    id: data.id,
    title: data.title,
    date: data.date,
    notes: data.notes,
    created_at: data.created_at,
    exercises: [...data.workout_exercises]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((we) => ({
        id: we.id,
        exercise_id: we.exercise_id,
        name: we.exercises?.name ?? '',
        position: we.position,
        notes: we.notes,
        sets: [...we.sets]
          .sort((a, b) => a.set_number - b.set_number || a.created_at.localeCompare(b.created_at))
          .map((s) => ({ ...s, unit: s.unit as Unit, weight: Number(s.weight) })),
      })),
  }
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    queryFn: () => fetchWorkout(id!),
    enabled: !!id,
  })
}

/** Every set the user has ever logged, flattened. Powers PRs, progress, and export. */
export function useAllSets() {
  return useQuery({
    queryKey: keys.sets,
    queryFn: async (): Promise<SetRow[]> => {
      const { data, error } = await supabase
        .from('sets')
        .select('id, weight, unit, reps, set_number, created_at, workout_exercise_id, workout_exercises!inner(exercise_id, workout_id, exercises!inner(name), workouts!inner(title, date))')
      if (error) throw error
      return data.map((s) => ({
        id: s.id,
        weight: Number(s.weight),
        unit: s.unit as Unit,
        reps: s.reps,
        set_number: s.set_number,
        created_at: s.created_at,
        workout_exercise_id: s.workout_exercise_id,
        exercise_id: s.workout_exercises.exercise_id,
        exercise_name: s.workout_exercises.exercises.name,
        workout_id: s.workout_exercises.workout_id,
        workout_title: s.workout_exercises.workouts.title,
        date: s.workout_exercises.workouts.date,
      }))
    },
  })
}

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises,
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, workout_exercises(workouts(date))')
        .order('name')
      if (error) throw error
      return data.map((e) => {
        const dates = e.workout_exercises.map((we) => we.workouts?.date ?? '').filter(Boolean)
        return { id: e.id, name: e.name, lastUsed: dates.length ? dates.sort().at(-1) : undefined }
      })
    },
  })
}
