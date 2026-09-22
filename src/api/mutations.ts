import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUserId } from '../lib/auth'
import type { Unit } from '../lib/units'
import { keys } from './keys'
import { fetchWorkout } from './queries'
import type { Profile, SetDetail, WorkoutDetail } from './types'

function useInvalidateAll() {
  const qc = useQueryClient()
  return (workoutId?: string) => {
    qc.invalidateQueries({ queryKey: keys.workouts })
    qc.invalidateQueries({ queryKey: keys.sets })
    qc.invalidateQueries({ queryKey: keys.exercises })
    if (workoutId) qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
  }
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'unit' | 'weekly_goal'>>) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.profile })
      const prev = qc.getQueryData<Profile>(keys.profile)
      if (prev) qc.setQueryData<Profile>(keys.profile, { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.profile, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.profile }),
  })
}

export function useCreateWorkout() {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { title: string; date?: string }) => {
      const { data, error } = await supabase
        .from('workouts')
        .insert({ user_id: userId, title: input.title, date: input.date ?? format(new Date(), 'yyyy-MM-dd') })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateWorkout(workoutId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<WorkoutDetail, 'title' | 'date' | 'notes'>>) => {
      const { error } = await supabase.from('workouts').update(patch).eq('id', workoutId)
      if (error) throw error
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
      if (prev) qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev)
    },
    onSettled: () => invalidate(workoutId),
  })
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (workoutId: string) => {
      const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/** Find the user's exercise by name (case-insensitive) or create it. */
async function ensureExercise(userId: string, name: string): Promise<string> {
  const clean = name.trim()
  const { data: existing } = await supabase.from('exercises').select('id').ilike('name', clean).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('exercises').insert({ user_id: userId, name: clean }).select('id').single()
  if (error) throw error
  return data.id
}

export function useAddExercise(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { name: string; position: number; unit: Unit }) => {
      const exerciseId = await ensureExercise(userId, input.name)
      const { data: we, error } = await supabase
        .from('workout_exercises')
        .insert({ user_id: userId, workout_id: workoutId, exercise_id: exerciseId, position: input.position })
        .select('id')
        .single()
      if (error) throw error
      // Start every exercise with one empty set so the user can type immediately.
      const { error: setErr } = await supabase
        .from('sets')
        .insert({ user_id: userId, workout_exercise_id: we.id, set_number: 1, weight: 0, reps: 0, unit: input.unit })
      if (setErr) throw setErr
      return we.id
    },
    onSuccess: () => invalidate(workoutId),
  })
}

export function useRemoveExercise(workoutId: string) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (workoutExerciseId: string) => {
      const { error } = await supabase.from('workout_exercises').delete().eq('id', workoutExerciseId)
      if (error) throw error
    },
    onSuccess: () => invalidate(workoutId),
  })
}

export function useAddSet(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { workoutExerciseId: string; set_number: number; weight: number; reps: number; unit: Unit }) => {
      const { error } = await supabase.from('sets').insert({
        user_id: userId,
        workout_exercise_id: input.workoutExerciseId,
        set_number: input.set_number,
        weight: input.weight,
        reps: input.reps,
        unit: input.unit,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate(workoutId),
  })
}

export function useUpdateSet(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { setId: string; patch: Partial<Pick<SetDetail, 'weight' | 'reps' | 'unit'>> }) => {
      const { error } = await supabase.from('sets').update(input.patch).eq('id', input.setId)
      if (error) throw error
    },
    onMutate: async ({ setId, patch }) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
      if (prev) {
        qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
          ...prev,
          exercises: prev.exercises.map((we) => ({
            ...we,
            sets: we.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
          })),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.sets })
      qc.invalidateQueries({ queryKey: keys.workouts })
    },
  })
}

export function useDeleteSet(workoutId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (setId: string) => {
      const { error } = await supabase.from('sets').delete().eq('id', setId)
      if (error) throw error
    },
    onMutate: async (setId) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
      if (prev) {
        qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
          ...prev,
          exercises: prev.exercises.map((we) => ({ ...we, sets: we.sets.filter((s) => s.id !== setId) })),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev)
    },
    onSettled: () => invalidate(workoutId),
  })
}

/**
 * Copy the exercises and sets from the most recent workout with the same title
 * into this workout (which should be empty).
 */
export function useRepeatLast(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (sourceWorkoutId: string) => {
      const source = await fetchWorkout(sourceWorkoutId)
      for (const we of source.exercises) {
        const { data: newWe, error } = await supabase
          .from('workout_exercises')
          .insert({ user_id: userId, workout_id: workoutId, exercise_id: we.exercise_id, position: we.position })
          .select('id')
          .single()
        if (error) throw error
        if (we.sets.length) {
          const { error: setErr } = await supabase.from('sets').insert(
            we.sets.map((s) => ({
              user_id: userId,
              workout_exercise_id: newWe.id,
              set_number: s.set_number,
              weight: s.weight,
              reps: s.reps,
              unit: s.unit,
            })),
          )
          if (setErr) throw setErr
        }
      }
    },
    onSuccess: () => invalidate(workoutId),
  })
}
