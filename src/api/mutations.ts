import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { db } from '../db'
import type { StoredSet, StoredWorkout, StoredWorkoutExercise } from '../db/types'
import { uuid } from '../lib/uuid'
import type { DistanceUnit, Unit } from '../lib/units'
import type { SetRow } from '../lib/prs'
import { editKey, keys } from './keys'
import { enqueue } from './queue'
import * as opt from './optimistic'
import { holdWrite, isHolding, releaseHeld, type Write } from './hold'
import type { NewSet, NewSetWithId } from './optimistic'
import type { Exercise, ExerciseKind, Profile, SetPatch, WorkoutDetail, WorkoutExerciseDetail, WorkoutSummary } from './types'
import { defaultMetricsFor, type MetricKey } from '../data/cardio-metrics'
import { isStarterExercise } from '../data/starter-exercises'

export type { NewSet } from './optimistic'

/*
 * How writes work
 *
 * 1. The change is applied to what is on screen straight away.
 * 2. It is saved to the database on the device (src/db), in the order the changes were made.
 * 3. If saving fails (the phone is out of space), a message is shown and the screen is re-read
 *    from what was actually kept.
 */

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { error?: string }
  }
}

const nowIso = () => new Date().toISOString()

/** Re-read everything that is on screen. */
export function invalidateAll(qc: QueryClient, workoutId?: string) {
  qc.invalidateQueries({ queryKey: keys.workouts })
  qc.invalidateQueries({ queryKey: keys.sets })
  qc.invalidateQueries({ queryKey: keys.exercises })
  qc.invalidateQueries({ queryKey: keys.backup })
  if (workoutId) qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
}

/** After a restore or an erase: forget what was on screen and read it all again. */
export function reloadEverything(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'workout' && q.getObserversCount() === 0 })
  return qc.invalidateQueries()
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return (workoutId?: string) => invalidateAll(qc, workoutId)
}

/* ---------- Optimistic plumbing ---------- */

/** Keep the workout list and the all-sets list in step with the workout being edited. */
function syncDerived(qc: QueryClient, w: WorkoutDetail) {
  qc.setQueryData<WorkoutSummary[]>(keys.workouts, (list) => (list ? opt.upsertSummary(list, w) : list))
  qc.setQueryData<SetRow[]>(keys.sets, (rows) => (rows ? opt.replaceWorkoutRows(rows, w) : rows))
}

async function applyOptimistic(qc: QueryClient, workoutId: string, change: (w: WorkoutDetail) => WorkoutDetail) {
  await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
  const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId))
  if (!prev) return
  const next = change(prev)
  qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), next)
  syncDerived(qc, next)
}

export const editorOpen = (qc: QueryClient, workoutId: string) => (qc.getQueryCache().find({ queryKey: keys.workout(workoutId) })?.getObserversCount() ?? 0) > 0

/** After the last pending write to a workout: reconcile the screen with what was saved. */
function settle(qc: QueryClient, workoutId: string) {
  // This write still counts as in flight here, so 1 means it is the last one.
  if (qc.isMutating({ mutationKey: editKey(workoutId) }) > 1) return
  invalidateAll(qc, workoutId)
}

/**
 * A write to one workout: shown immediately, saved in order. While the workout's writes are
 * being held for an explicit Save (src/api/hold.ts), the write is kept instead of run, and the
 * screen is not re-read, so the copy on screen stays the edited one.
 */
function useEdit<V>(workoutId: string, cfg: { error: string; apply?: (w: WorkoutDetail, v: V) => WorkoutDetail; run: (v: V) => Promise<unknown> }) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: editKey(workoutId),
    networkMode: 'always',
    meta: { error: cfg.error },
    mutationFn: (v: V) => (isHolding(workoutId) ? holdWrite(workoutId, () => cfg.run(v)) : enqueue(workoutId, () => cfg.run(v))),
    onMutate: async (v: V) => {
      if (cfg.apply) await applyOptimistic(qc, workoutId, (w) => cfg.apply!(w, v))
    },
    onSettled: () => {
      if (!isHolding(workoutId)) settle(qc, workoutId)
    },
  })
}

/** Resolves once every write to this workout has been queued or held (changes register a tick after they are made). */
export async function editsQuiet(qc: QueryClient, workoutId: string): Promise<void> {
  for (let i = 0; i < 60 && qc.isMutating({ mutationKey: editKey(workoutId) }) > 0; i++) await new Promise((r) => setTimeout(r, 16))
}

/** Run writes that were held, in order, as one save. Resolves true when they were all written. */
export function writeHeld(qc: QueryClient, workoutId: string, writes: Write[]): Promise<boolean> {
  if (!writes.length) return Promise.resolve(true)
  return runEdit(qc, workoutId, {
    error: "Couldn't save the changes.",
    run: async () => {
      for (const write of writes) await write()
    },
  }).then(() => true, () => false)
}

/** Save the changes held for this workout. */
export async function saveHeld(qc: QueryClient, workoutId: string): Promise<boolean> {
  await editsQuiet(qc, workoutId)
  return writeHeld(qc, workoutId, releaseHeld(workoutId))
}

/** Drop the changes held for this workout and show what is stored again. */
export async function discardHeld(qc: QueryClient, workoutId: string): Promise<void> {
  await editsQuiet(qc, workoutId)
  releaseHeld(workoutId)
  invalidateAll(qc, workoutId)
}

/** Same as `useEdit`, for writes started outside a component's lifetime (creating, deleting, leaving a screen). */
function runEdit(qc: QueryClient, workoutId: string, cfg: { error: string; run: () => Promise<unknown>; onError?: () => void; onSettled?: () => void }): Promise<unknown> {
  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: editKey(workoutId),
    networkMode: 'always',
    meta: { error: cfg.error },
    mutationFn: () => enqueue(workoutId, cfg.run),
    onError: cfg.onError,
    onSettled: cfg.onSettled ?? (() => settle(qc, workoutId)),
  })
  return mutation.execute(undefined)
}

const withIds = (sets: NewSet[]): NewSetWithId[] => sets.map((s) => ({ ...s, id: s.id ?? uuid() }))

function storedSet(entryId: string, s: NewSetWithId, createdAt: string, setNumber = s.set_number): StoredSet {
  return { ...opt.setDetailFrom({ ...s, set_number: setNumber }, createdAt), workout_exercise_id: entryId }
}

/* ---------- Profile ---------- */

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    meta: { error: "Couldn't save that setting." },
    mutationFn: (patch: Partial<Pick<Profile, 'unit' | 'weekly_goal' | 'distance_unit'>>) => db.setProfile(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.profile })
      const prev = qc.getQueryData<Profile>(keys.profile)
      if (prev) qc.setQueryData<Profile>(keys.profile, { ...prev, ...patch })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.profile }),
  })
}

/* ---------- Workouts ---------- */

/** Start a workout. Returns its id immediately so the editor can open at once. */
export function useCreateWorkout() {
  const qc = useQueryClient()
  return (input: { title: string; date?: string; is_plan?: boolean }): string => {
    const id = uuid()
    const now = nowIso()
    const stored: StoredWorkout = {
      id,
      title: input.title,
      date: input.date ?? format(new Date(), 'yyyy-MM-dd'),
      notes: '',
      created_at: now,
      started_at: now,
      finished_at: null,
      paused_at: null,
      paused_seconds: 0,
      is_plan: input.is_plan ?? false,
    }
    qc.setQueryData<WorkoutDetail>(keys.workout(id), { ...stored, exercises: [] })
    runEdit(qc, id, {
      error: "Couldn't start the workout.",
      run: () => db.addWorkout(stored),
      onError: () => qc.removeQueries({ queryKey: keys.workout(id) }),
    }).catch(() => {})
    return id
  }
}

type WorkoutPatch = Partial<Pick<WorkoutDetail, 'title' | 'date' | 'notes' | 'finished_at' | 'paused_at' | 'paused_seconds' | 'is_plan' | 'started_at'>>

export function useUpdateWorkout(workoutId: string) {
  return useEdit<WorkoutPatch>(workoutId, {
    error: "Couldn't save the workout.",
    apply: (w, patch) => ({ ...w, ...patch }),
    run: (patch) => db.patchWorkout(workoutId, patch),
  })
}

/** Delete a workout. It disappears from every list at once. */
export function deleteWorkout(qc: QueryClient, workoutId: string): Promise<unknown> {
  qc.setQueryData<WorkoutSummary[]>(keys.workouts, (list) => list?.filter((w) => w.id !== workoutId))
  qc.setQueryData<SetRow[]>(keys.sets, (rows) => rows?.filter((r) => r.workout_id !== workoutId))
  return runEdit(qc, workoutId, {
    error: "Couldn't delete the workout.",
    run: () => db.removeWorkout(workoutId),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: editKey(workoutId) }) > 1) return
      if (!editorOpen(qc, workoutId)) qc.removeQueries({ queryKey: keys.workout(workoutId) })
      invalidateAll(qc)
    },
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return (workoutId: string) => deleteWorkout(qc, workoutId)
}

/** Remove workouts that never got an exercise. `keepId` protects the one currently being edited. */
export async function deleteEmptyWorkouts(qc: QueryClient, keepId?: string, olderThanMs = 0) {
  await db.open()
  const before = db.counts().workouts
  await db.removeEmptyWorkouts(keepId, olderThanMs)
  if (db.counts().workouts !== before) invalidateAll(qc)
}

/* ---------- Session controls ---------- */

/** Pause: remember when. Resume: fold the pause into paused_seconds. Reopen: un-finish and skip the time away. */
export function useSessionControls(workoutId: string) {
  const update = useUpdateWorkout(workoutId)
  const secondsSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  // The screen changes at once; the promise settles when it has been saved. Failures surface as a message.
  const go = (patch: WorkoutPatch): Promise<boolean> => update.mutateAsync(patch).then(() => true, () => false)
  return {
    pause: () => go({ paused_at: nowIso() }),
    resume: (w: Pick<WorkoutDetail, 'paused_at' | 'paused_seconds'>) => go({ paused_at: null, paused_seconds: w.paused_seconds + (w.paused_at ? secondsSince(w.paused_at) : 0) }),
    finish: (w: Pick<WorkoutDetail, 'paused_at' | 'paused_seconds'>) =>
      go({ finished_at: nowIso(), paused_at: null, paused_seconds: w.paused_seconds + (w.paused_at ? secondsSince(w.paused_at) : 0) }),
    reopen: (w: Pick<WorkoutDetail, 'finished_at' | 'paused_seconds'>) =>
      go({ finished_at: null, paused_at: null, paused_seconds: w.paused_seconds + (w.finished_at ? secondsSince(w.finished_at) : 0) }),
    /** Turn a plan into a live workout starting now. */
    startPlan: () => go({ is_plan: false, started_at: nowIso(), finished_at: null, paused_at: null, paused_seconds: 0, date: format(new Date(), 'yyyy-MM-dd') }),
    isPending: update.isPending,
  }
}

/* ---------- Exercises ---------- */

interface AddExerciseInput {
  name: string
  kind: ExerciseKind
  trackIncline?: boolean
  /** Known when the exercise was picked from the library. */
  exerciseId?: string
  position: number
  unit: Unit
  distanceUnit: DistanceUnit
  planned?: boolean
}

interface AddExerciseVars extends AddExerciseInput {
  weId: string
  setId: string
  createdAt: string
  /** The exercise's id: the known one, or a new id the exercise will be created under. */
  resolvedId: string
  metrics: MetricKey[]
  trackInclineResolved: boolean
  displayName: string
}

export function useAddExercise(workoutId: string) {
  const qc = useQueryClient()
  const firstSet = (v: AddExerciseVars): NewSetWithId => ({ id: v.setId, set_number: 1, weight: 0, reps: 0, unit: v.unit, distance_unit: v.kind === 'cardio' ? v.distanceUnit : null })
  const edit = useEdit<AddExerciseVars>(workoutId, {
    error: "Couldn't add the exercise.",
    apply: (w, v) => {
      const we: WorkoutExerciseDetail = {
        id: v.weId,
        exercise_id: v.resolvedId,
        name: v.displayName,
        kind: v.kind,
        track_incline: v.trackInclineResolved,
        metrics: v.metrics,
        position: v.position,
        notes: '',
        planned: v.planned ?? false,
        completed_at: null,
        // Start every exercise with one empty set so the user can type immediately.
        sets: [opt.setDetailFrom(firstSet(v), v.createdAt)],
      }
      return opt.addExercise(w, we)
    },
    run: (v) => {
      const entry: StoredWorkoutExercise = { id: v.weId, workout_id: workoutId, exercise_id: v.resolvedId, position: v.position, notes: '', planned: v.planned ?? false, completed_at: null, created_at: v.createdAt }
      return db.addEntry({ entry, exercise: { name: v.name, kind: v.kind, trackIncline: !!v.trackIncline }, sets: [storedSet(v.weId, firstSet(v), v.createdAt)] })
    },
  })

  const mutate = (input: AddExerciseInput) => {
    const clean = input.name.trim()
    const library = qc.getQueryData<Exercise[]>(keys.exercises) ?? []
    const known = library.find((e) => e.id === input.exerciseId) ?? library.find((e) => e.name.toLowerCase() === clean.toLowerCase()) ?? db.findExerciseByName(clean)
    const vars: AddExerciseVars = {
      ...input,
      name: clean,
      kind: known?.kind ?? input.kind,
      weId: uuid(),
      setId: uuid(),
      createdAt: nowIso(),
      resolvedId: known?.id ?? uuid(),
      displayName: known?.name ?? clean,
      metrics: (known?.kind ?? input.kind) === 'cardio' ? (known?.metrics?.length ? known.metrics : defaultMetricsFor(clean)) : [],
      trackInclineResolved: known?.track_incline ?? (input.kind === 'cardio' && !!input.trackIncline),
    }
    edit.mutate(vars)
  }
  return { mutate, isPending: edit.isPending }
}

export function useUpdateWorkoutExercise(workoutId: string) {
  return useEdit<{ workoutExerciseId: string; patch: { notes?: string; completed_at?: string | null } }>(workoutId, {
    error: "Couldn't save the exercise.",
    apply: (w, { workoutExerciseId, patch }) => opt.patchExercise(w, workoutExerciseId, patch),
    run: (input) => db.patchEntry(input.workoutExerciseId, input.patch),
  })
}

/** Per-exercise settings that live on the exercise itself (e.g. which cardio variables it logs). */
export function useUpdateExercise(workoutId: string) {
  return useEdit<{ exerciseId: string; patch: { track_incline?: boolean; metrics?: MetricKey[] } }>(workoutId, {
    error: "Couldn't save the exercise settings.",
    apply: (w, { exerciseId, patch }) => opt.patchExerciseSettings(w, exerciseId, patch),
    run: (input) => db.patchExercise(input.exerciseId, input.patch),
  })
}

/** Delete an exercise from the library, along with every logged use of it. */
export function useDeleteExercise() {
  const invalidate = useInvalidateAll()
  return useMutation({
    networkMode: 'always',
    meta: { error: "Couldn't delete the exercise." },
    mutationFn: async (exerciseId: string) => {
      const ex = db.listExercises().find((e) => e.id === exerciseId)
      if (ex && isStarterExercise(ex.name)) throw new Error('Built-in exercises can\'t be deleted')
      await db.removeExercise(exerciseId)
    },
    onSuccess: () => invalidate(),
  })
}

export function useRemoveExercise(workoutId: string) {
  return useEdit<string>(workoutId, {
    error: "Couldn't remove the exercise.",
    apply: (w, workoutExerciseId) => opt.removeExercise(w, workoutExerciseId),
    run: (workoutExerciseId) => db.removeEntry(workoutExerciseId),
  })
}

/* ---------- Sets ---------- */

interface SetsVars {
  workoutExerciseId: string
  sets: NewSetWithId[]
  createdAt: string
}

/** Add one or many sets to an exercise. */
export function useAddSets(workoutId: string) {
  const edit = useEdit<SetsVars>(workoutId, {
    error: "Couldn't add the set.",
    apply: (w, v) => opt.addSets(w, v.workoutExerciseId, v.sets.map((s) => opt.setDetailFrom(s, v.createdAt))),
    run: (v) => db.addSets(v.workoutExerciseId, v.sets.map((s) => storedSet(v.workoutExerciseId, s, v.createdAt))),
  })
  return {
    mutate: (input: { workoutExerciseId: string; sets: NewSet[] }) => {
      if (input.sets.length) edit.mutate({ workoutExerciseId: input.workoutExerciseId, sets: withIds(input.sets), createdAt: nowIso() })
    },
    isPending: edit.isPending,
  }
}

/** Change one or more sets at once (used for fill-down). */
export function useUpdateSets(workoutId: string) {
  return useEdit<{ updates: { setId: string; patch: SetPatch }[] }>(workoutId, {
    error: "Couldn't save the set.",
    apply: (w, { updates }) => opt.patchSets(w, updates),
    run: (input) => db.patchSets(input.updates),
  })
}

export function useDeleteSet(workoutId: string) {
  return useEdit<string>(workoutId, {
    error: "Couldn't delete the set.",
    apply: (w, setId) => opt.removeSet(w, setId),
    run: (setId) => db.removeSet(setId),
  })
}

/** Replace an exercise's sets with a given list (used by "use last session" and quick fill). */
export function useReplaceSets(workoutId: string) {
  const edit = useEdit<SetsVars>(workoutId, {
    error: "Couldn't update the sets.",
    apply: (w, v) => opt.replaceSets(w, v.workoutExerciseId, v.sets.map((s, i) => opt.setDetailFrom({ ...s, set_number: i + 1 }, v.createdAt))),
    run: (v) => db.replaceSets(v.workoutExerciseId, v.sets.map((s, i) => storedSet(v.workoutExerciseId, s, v.createdAt, i + 1))),
  })
  return {
    mutate: (input: { workoutExerciseId: string; sets: NewSet[] }) => edit.mutate({ workoutExerciseId: input.workoutExerciseId, sets: withIds(input.sets), createdAt: nowIso() }),
    isPending: edit.isPending,
  }
}

/**
 * Copy the exercises from the most recent workout with the same title into this
 * workout (which should be empty), each with one empty set. Last time's sets are
 * shown as hints in the rows rather than logged again.
 */
export function useRepeatLast(workoutId: string) {
  const edit = useEdit<{ copies: WorkoutExerciseDetail[]; createdAt: string }>(workoutId, {
    error: "Couldn't copy the last workout.",
    apply: (w, v) => ({ ...w, exercises: v.copies }),
    run: (v) =>
      db.replaceEntries(
        workoutId,
        v.copies.map((we) => ({
          entry: { id: we.id, workout_id: workoutId, exercise_id: we.exercise_id, position: we.position, notes: '', planned: we.planned, completed_at: null, created_at: v.createdAt },
          sets: we.sets.map((s) => ({ ...s, workout_exercise_id: we.id })),
        })),
      ),
  })
  return {
    mutate: (input: { sourceWorkoutId: string; planned?: boolean }) => {
      const source = db.getWorkout(input.sourceWorkoutId)
      const profile = db.profile()
      const createdAt = nowIso()
      const copies = opt.repeatExercises(source, { entry: uuid, set: uuid }, { planned: input.planned ?? false, createdAt, unit: profile.unit, distanceUnit: profile.distance_unit })
      edit.mutate({ copies, createdAt })
    },
    isPending: edit.isPending,
  }
}
