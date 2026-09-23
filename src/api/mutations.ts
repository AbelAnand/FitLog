import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUserId } from '../lib/auth'
import type { DistanceUnit, Unit } from '../lib/units'
import { keys } from './keys'
import { fetchWorkout } from './queries'
import type { Json } from '../lib/database.types'
import type { Drop, ExerciseKind, Profile, SetDetail, SetPatch, WorkoutDetail } from './types'

/** Postgres jsonb wants plain JSON; drops are simple objects so a cast is safe. */
const dropsJson = (drops: Drop[] | undefined): Json => (drops ?? []).map((d) => ({ weight: d.weight, reps: d.reps }))

function setPatchForDb(patch: SetPatch) {
  const { drops, ...rest } = patch
  return drops === undefined ? rest : { ...rest, drops: dropsJson(drops) }
}

export function invalidateAll(qc: QueryClient, workoutId?: string) {
  qc.invalidateQueries({ queryKey: keys.workouts })
  qc.invalidateQueries({ queryKey: keys.sets })
  qc.invalidateQueries({ queryKey: keys.exercises })
  if (workoutId) qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return (workoutId?: string) => invalidateAll(qc, workoutId)
}

/* ---------- Profile ---------- */

export function useUpdateProfile() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'unit' | 'weekly_goal' | 'distance_unit'>>) => {
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

/* ---------- Workouts ---------- */

export function useCreateWorkout() {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { title: string; date?: string; is_plan?: boolean }) => {
      const { data, error } = await supabase
        .from('workouts')
        .insert({ user_id: userId, title: input.title, date: input.date ?? format(new Date(), 'yyyy-MM-dd'), is_plan: input.is_plan ?? false })
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
    mutationFn: async (patch: Partial<Pick<WorkoutDetail, 'title' | 'date' | 'notes' | 'finished_at' | 'paused_at' | 'paused_seconds' | 'is_plan' | 'started_at'>>) => {
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

export async function deleteWorkoutById(workoutId: string) {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
  if (error) throw error
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: deleteWorkoutById,
    onSuccess: () => invalidate(),
  })
}

/** Remove workouts that never got an exercise. `keepId` protects the one currently being edited. */
export async function deleteEmptyWorkouts(qc: QueryClient, keepId?: string, olderThanMs = 0) {
  const { data, error } = await supabase.from('workouts').select('id, created_at, workout_exercises(id)')
  if (error || !data) return
  const cutoff = Date.now() - olderThanMs
  const ids = data
    .filter((w) => w.id !== keepId && w.workout_exercises.length === 0 && new Date(w.created_at).getTime() < cutoff)
    .map((w) => w.id)
  if (!ids.length) return
  await supabase.from('workouts').delete().in('id', ids)
  invalidateAll(qc)
}

/* ---------- Session controls ---------- */

/** Pause: remember when. Resume: fold the pause into paused_seconds. Reopen: un-finish and skip the time away. */
export function useSessionControls(workoutId: string) {
  const update = useUpdateWorkout(workoutId)
  const nowIso = () => new Date().toISOString()
  const secondsSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return {
    pause: () => update.mutateAsync({ paused_at: nowIso() }),
    resume: (w: Pick<WorkoutDetail, 'paused_at' | 'paused_seconds'>) =>
      update.mutateAsync({ paused_at: null, paused_seconds: w.paused_seconds + (w.paused_at ? secondsSince(w.paused_at) : 0) }),
    finish: (w: Pick<WorkoutDetail, 'paused_at' | 'paused_seconds'>) =>
      update.mutateAsync({ finished_at: nowIso(), paused_at: null, paused_seconds: w.paused_seconds + (w.paused_at ? secondsSince(w.paused_at) : 0) }),
    reopen: (w: Pick<WorkoutDetail, 'finished_at' | 'paused_seconds'>) =>
      update.mutateAsync({ finished_at: null, paused_at: null, paused_seconds: w.paused_seconds + (w.finished_at ? secondsSince(w.finished_at) : 0) }),
    /** Turn a plan into a live workout starting now. */
    startPlan: () => update.mutateAsync({ is_plan: false, started_at: nowIso(), finished_at: null, paused_at: null, paused_seconds: 0, date: format(new Date(), 'yyyy-MM-dd') }),
    isPending: update.isPending,
  }
}

/* ---------- Exercises ---------- */

/** Find the user's exercise by name (case-insensitive) or create it. */
async function ensureExercise(userId: string, name: string, kind: ExerciseKind, trackIncline = false): Promise<string> {
  const clean = name.trim()
  const { data: existing } = await supabase.from('exercises').select('id').ilike('name', clean).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('exercises').insert({ user_id: userId, name: clean, kind, track_incline: kind === 'cardio' && trackIncline }).select('id').single()
  if (error) throw error
  return data.id
}

export function useAddExercise(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { name: string; kind: ExerciseKind; trackIncline?: boolean; position: number; unit: Unit; distanceUnit: DistanceUnit; planned?: boolean }) => {
      const exerciseId = await ensureExercise(userId, input.name, input.kind, input.trackIncline)
      const { data: we, error } = await supabase
        .from('workout_exercises')
        .insert({ user_id: userId, workout_id: workoutId, exercise_id: exerciseId, position: input.position, planned: input.planned ?? false })
        .select('id')
        .single()
      if (error) throw error
      // Start every exercise with one empty set so the user can type immediately.
      const { error: setErr } = await supabase.from('sets').insert({
        user_id: userId,
        workout_exercise_id: we.id,
        set_number: 1,
        weight: 0,
        reps: 0,
        unit: input.unit,
        distance_unit: input.kind === 'cardio' ? input.distanceUnit : null,
      })
      if (setErr) throw setErr
      return we.id
    },
    onSuccess: () => invalidate(workoutId),
  })
}

export function useUpdateWorkoutExercise(workoutId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { workoutExerciseId: string; patch: { notes?: string; completed_at?: string | null } }) => {
      const { error } = await supabase.from('workout_exercises').update(input.patch).eq('id', input.workoutExerciseId)
      if (error) throw error
    },
    onMutate: async ({ workoutExerciseId, patch }) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
      if (prev) {
        qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
          ...prev,
          exercises: prev.exercises.map((we) => (we.id === workoutExerciseId ? { ...we, ...patch } : we)),
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

/** Per-exercise settings that live on the exercise itself (e.g. incline tracking). */
export function useUpdateExercise(workoutId?: string) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { exerciseId: string; patch: { track_incline?: boolean } }) => {
      const { error } = await supabase.from('exercises').update(input.patch).eq('id', input.exerciseId)
      if (error) throw error
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

/* ---------- Sets ---------- */

export interface NewSet {
  set_number: number
  weight: number
  reps: number
  unit: Unit
  set_type?: SetDetail['set_type']
  duration_seconds?: number | null
  distance?: number | null
  distance_unit?: DistanceUnit | null
  drops?: Drop[]
  incline?: number | null
}

/** Insert one or many sets for an exercise. */
export function useAddSets(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { workoutExerciseId: string; sets: NewSet[] }) => {
      if (!input.sets.length) return
      const { error } = await supabase.from('sets').insert(
        input.sets.map((s) => ({
          user_id: userId,
          workout_exercise_id: input.workoutExerciseId,
          set_number: s.set_number,
          weight: s.weight,
          reps: s.reps,
          unit: s.unit,
          set_type: s.set_type ?? 'working',
          duration_seconds: s.duration_seconds ?? null,
          distance: s.distance ?? null,
          distance_unit: s.distance_unit ?? null,
          drops: dropsJson(s.drops),
          incline: s.incline ?? null,
        })),
      )
      if (error) throw error
    },
    onSuccess: () => invalidate(workoutId),
  })
}

/** Patch one or more sets at once (used for fill-down). */
export function useUpdateSets(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { updates: { setId: string; patch: SetPatch }[] }) => {
      await Promise.all(
        input.updates.map(async ({ setId, patch }) => {
          const { error } = await supabase.from('sets').update(setPatchForDb(patch)).eq('id', setId)
          if (error) throw error
        }),
      )
    },
    onMutate: async ({ updates }) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
      if (prev) {
        const byId = new Map(updates.map((u) => [u.setId, u.patch]))
        qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
          ...prev,
          exercises: prev.exercises.map((we) => ({
            ...we,
            sets: we.sets.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s)),
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

/** Replace an exercise's sets with a given list (used by "use last session" and quick fill). */
export function useReplaceSets(workoutId: string) {
  const userId = useUserId()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (input: { workoutExerciseId: string; sets: NewSet[] }) => {
      const { error: delErr } = await supabase.from('sets').delete().eq('workout_exercise_id', input.workoutExerciseId)
      if (delErr) throw delErr
      if (!input.sets.length) return
      const { error } = await supabase.from('sets').insert(
        input.sets.map((s, i) => ({
          user_id: userId,
          workout_exercise_id: input.workoutExerciseId,
          set_number: i + 1,
          weight: s.weight,
          reps: s.reps,
          unit: s.unit,
          set_type: s.set_type ?? 'working',
          duration_seconds: s.duration_seconds ?? null,
          distance: s.distance ?? null,
          distance_unit: s.distance_unit ?? null,
          drops: dropsJson(s.drops),
          incline: s.incline ?? null,
        })),
      )
      if (error) throw error
    },
    onSuccess: () => invalidate(workoutId),
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
    mutationFn: async (input: { sourceWorkoutId: string; planned?: boolean }) => {
      const source = await fetchWorkout(input.sourceWorkoutId)
      for (const we of source.exercises) {
        const { data: newWe, error } = await supabase
          .from('workout_exercises')
          .insert({ user_id: userId, workout_id: workoutId, exercise_id: we.exercise_id, position: we.position, planned: input.planned ?? false })
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
              set_type: s.set_type,
              duration_seconds: s.duration_seconds,
              distance: s.distance,
              distance_unit: s.distance_unit,
              drops: dropsJson(s.drops),
              incline: s.incline,
            })),
          )
          if (setErr) throw setErr
        }
      }
    },
    onSuccess: () => invalidate(workoutId),
  })
}
