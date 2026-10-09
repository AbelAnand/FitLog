import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '../db'
import type { PlanCopy } from '../db/db'
import type { StoredSplit } from '../db/types'
import { uuid } from '../lib/uuid'
import { cyclePosition, dayKey, plansForSplit, planFromWorkout, type PlanIds } from '../lib/splits'
import { invalidateAll } from './mutations'
import { keys } from './keys'
import type { WorkoutSummary } from './types'

/*
 * Plans made in bulk (duplicating a workout onto other days, applying a split) and the splits
 * themselves. Same shape as the other writes: the screen changes first, the database is written
 * next, and a failure is reported through the global toast (`meta.error`).
 */

const local = { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, networkMode: 'always' } as const

export const splitKeys = { all: ['splits'] as const }

const ids: PlanIds = { workout: uuid, entry: uuid, set: uuid }
const nowIso = () => new Date().toISOString()

export interface AddedPlans {
  added: number
  skipped: number
}

/** "Added 5 plans, skipped 1 already planned." */
export function describeAdded({ added, skipped }: AddedPlans, what = 'plan'): string {
  const plural = (n: number) => (n === 1 ? what : `${what}s`)
  if (!added && !skipped) return `Nothing to add.`
  if (!added) return `Skipped ${skipped} already planned.`
  return `Added ${added} ${plural(added)}${skipped ? `, skipped ${skipped} already planned` : ''}.`
}

/** What a plan looks like in the lists, before the database has confirmed it. */
function summaryOfCopy(copy: PlanCopy, names: Map<string, string>): WorkoutSummary {
  const w = copy.workout
  return { ...w, is_plan: true, exerciseNames: copy.entries.map((e) => names.get(e.exercise_id) ?? '').filter(Boolean), setCount: copy.sets.length, plannedCount: copy.entries.length, completedCount: 0 }
}

function useAddPlans(error: string) {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    meta: { error },
    mutationFn: (copies: PlanCopy[]) => db.addPlans(copies),
    onMutate: async (copies) => {
      // Days that already hold the same plan are not shown twice, even before the save settles.
      const fresh = copies.filter((c) => !db.hasSamePlan(c))
      await qc.cancelQueries({ queryKey: keys.workouts })
      const names = new Map(db.listExercises().map((e) => [e.id, e.name]))
      qc.setQueryData<WorkoutSummary[]>(keys.workouts, (list) => (list ? [...list, ...fresh.map((c) => summaryOfCopy(c, names))].sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date))) : list))
    },
    onSettled: () => invalidateAll(qc),
  })
}

/** Copy a workout onto other days, always as plans. Resolves with how many were added and skipped. */
export function useDuplicateToDays() {
  const add = useAddPlans("Couldn't add the plans.")
  return {
    mutateAsync: async (workoutId: string, dates: string[]): Promise<AddedPlans> => {
      await db.open()
      const source = db.getWorkout(workoutId)
      const now = nowIso()
      const copies = [...new Set(dates)].sort().map((date) => planFromWorkout(source, date, ids, now))
      return add.mutateAsync(copies)
    },
    isPending: add.isPending,
  }
}

/* ---------- Splits ---------- */

export function useSplits() {
  return useQuery({
    queryKey: splitKeys.all,
    ...local,
    queryFn: async (): Promise<StoredSplit[]> => {
      await db.open()
      return db.listSplits()
    },
  })
}

export function useSaveSplit() {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    meta: { error: "Couldn't save the split." },
    mutationFn: (split: StoredSplit) => db.putSplit(split),
    onMutate: async (split) => {
      await qc.cancelQueries({ queryKey: splitKeys.all })
      qc.setQueryData<StoredSplit[]>(splitKeys.all, (list) => (list ? (list.some((s) => s.id === split.id) ? list.map((s) => (s.id === split.id ? split : s)) : [...list, split]) : list))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: splitKeys.all }),
  })
}

export function useDeleteSplit() {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    meta: { error: "Couldn't delete the split." },
    mutationFn: (id: string) => db.removeSplit(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: splitKeys.all })
      qc.setQueryData<StoredSplit[]>(splitKeys.all, (list) => list?.filter((s) => s.id !== id))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: splitKeys.all }),
  })
}

export interface ApplySplitInput {
  splitId: string
  /** First calendar day to fill. */
  from: string
  /** Last calendar day to fill. */
  through: string
  /** Which day of the cycle lands on `from`. */
  startIndex: number
}

/** Fill the calendar with a split's cycle. Plans already on a day are not doubled. */
export function useApplySplit() {
  const qc = useQueryClient()
  const add = useAddPlans("Couldn't apply the split.")
  const mark = useMutation({
    networkMode: 'always',
    meta: { error: "Couldn't note where the split was filled to." },
    mutationFn: (v: { id: string; from: string; through: string }) => db.markSplitApplied(v.id, v.from, v.through),
    onSettled: () => qc.invalidateQueries({ queryKey: splitKeys.all }),
  })
  return {
    mutateAsync: async (input: ApplySplitInput): Promise<AddedPlans> => {
      await db.open()
      const split = db.getSplit(input.splitId)
      const copies = plansForSplit(split, input.from, input.through, input.startIndex, ids, nowIso())
      const result = await add.mutateAsync(copies)
      // The cycle's reference start stays put when extending, so positions keep lining up.
      const continues = split.applied_from && split.applied_through && input.from > split.applied_through && cyclePosition(split, input.from) === input.startIndex
      await mark.mutateAsync({ id: split.id, from: continues ? split.applied_from! : offsetStart(input.from, input.startIndex, split.days.length), through: input.through })
      return result
    },
    isPending: add.isPending || mark.isPending,
  }
}

/** The date on which day 0 of the cycle would have fallen, so later Extends compute positions from it. */
function offsetStart(from: string, startIndex: number, cycleLength: number): string {
  if (!cycleLength || !startIndex) return from
  const d = new Date(`${from}T12:00:00`)
  d.setDate(d.getDate() - startIndex)
  return dayKey(d)
}
