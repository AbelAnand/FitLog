import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { WorkoutDetail } from '../api/types'
import { LIMITS } from '../data/limits'
import type { PlanCopy } from '../db/db'
import type { SplitDay, StoredSet, StoredSplit, StoredWorkout, StoredWorkoutExercise, TemplateExercise, TemplateSet } from '../db/types'

/**
 * Splits and plan copies, as pure functions. A split is a rolling cycle: its days are applied
 * one per calendar day in order, from a start date, whatever the weekday, and rest days take a
 * day without adding a plan. Nothing here touches storage; the database adds the plans.
 */

export const dayKey = (d: Date): string => format(d, 'yyyy-MM-dd')

export interface CycleEntry {
  date: string
  /** Which day of the cycle this is (an index into `days`). Rest days are not listed. */
  index: number
}

/** The furthest one Apply can reach, as a count of calendar days. */
export const MAX_FILL_DAYS = LIMITS.splitFillWeeks * 7

/**
 * Walk the cycle from `from` to `through` (both inclusive), beginning at day `startIndex`, and
 * list the dates that get a plan. The range is cut at the limit, never extended.
 */
export function expandCycle(days: SplitDay[], from: string, through: string, startIndex = 0): CycleEntry[] {
  if (!days.length || through < from) return []
  const start = parseISO(from)
  const count = Math.min(differenceInCalendarDays(parseISO(through), start) + 1, MAX_FILL_DAYS)
  const out: CycleEntry[] = []
  for (let i = 0; i < count; i++) {
    const index = (((startIndex + i) % days.length) + days.length) % days.length
    if (!days[index].rest) out.push({ date: dayKey(addDays(start, i)), index })
  }
  return out
}

/** The last calendar day that `weeks` weeks from `from` cover. */
export function fillEnd(from: string, weeks: number): string {
  return dayKey(addDays(parseISO(from), Math.max(1, weeks) * 7 - 1))
}

/**
 * Where the cycle stands on a date, given where it last started. Extending a split that was
 * applied from 1 Nov as Push/Pull/Legs/Rest puts 5 Nov on Push again.
 */
export function cyclePosition(split: Pick<StoredSplit, 'days' | 'applied_from'>, date: string): number {
  if (!split.days.length || !split.applied_from) return 0
  const n = split.days.length
  return ((differenceInCalendarDays(parseISO(date), parseISO(split.applied_from)) % n) + n) % n
}

/** The day after the split was last filled to, or today when it has never been applied. */
export function nextFillDate(split: Pick<StoredSplit, 'applied_through'>, today: string): string {
  if (!split.applied_through) return today
  const next = dayKey(addDays(parseISO(split.applied_through), 1))
  return next > today ? next : today
}

/** The title of one day of the cycle as people read it. */
export function dayTitle(day: SplitDay): string {
  return day.rest ? 'Rest' : day.title || 'Workout'
}

/** "Push · Pull · Legs · Rest" */
export function describeDays(days: SplitDay[]): string {
  return days.map(dayTitle).join(' · ')
}

export function templateSetFrom(s: Omit<TemplateSet, 'set_number'> & { set_number?: number }, setNumber: number): TemplateSet {
  return {
    set_number: setNumber,
    set_type: s.set_type,
    weight: s.weight,
    unit: s.unit,
    reps: s.reps,
    duration_seconds: s.duration_seconds,
    distance: s.distance,
    distance_unit: s.distance_unit,
    drops: s.drops.map((d) => ({ weight: d.weight, reps: d.reps })),
    incline: s.incline,
    extra: { ...s.extra },
  }
}

/** Capture a workout (plan or completed) as a day template: its title, exercises and target sets, nothing about the session. */
export function templateFromWorkout(w: Pick<WorkoutDetail, 'title' | 'exercises'>): SplitDay {
  const exercises: TemplateExercise[] = w.exercises.map((we) => ({
    exercise_id: we.exercise_id,
    sets: we.sets.map((s, i) => templateSetFrom(s, i + 1)),
  }))
  return { rest: false, title: w.title.trim(), exercises }
}

export interface PlanIds {
  workout: () => string
  entry: () => string
  set: () => string
}

/**
 * A plan for `date` from a day template: a fresh workout row, planned entries pointing at the same
 * library exercises, and copies of the target sets. No notes, no check-offs, no timer.
 */
export function planFromTemplate(day: SplitDay, date: string, ids: PlanIds, now: string): PlanCopy | null {
  if (day.rest) return null
  const workout: StoredWorkout = { id: ids.workout(), title: day.title, date, notes: '', created_at: now, started_at: now, finished_at: null, paused_at: null, paused_seconds: 0, is_plan: true }
  const entries: StoredWorkoutExercise[] = []
  const sets: StoredSet[] = []
  day.exercises.forEach((te, position) => {
    const entry: StoredWorkoutExercise = { id: ids.entry(), workout_id: workout.id, exercise_id: te.exercise_id, position, notes: '', planned: true, completed_at: null, created_at: now }
    entries.push(entry)
    te.sets.forEach((s, i) => sets.push({ id: ids.set(), workout_exercise_id: entry.id, ...templateSetFrom(s, i + 1), created_at: now }))
  })
  return { workout, entries, sets }
}

/** A plan for `date` with the same title, exercises and target sets as an existing workout. */
export function planFromWorkout(w: Pick<WorkoutDetail, 'title' | 'exercises'>, date: string, ids: PlanIds, now: string): PlanCopy {
  return planFromTemplate(templateFromWorkout(w), date, ids, now)!
}

/** Plans for every non-rest day of a split over a date range. */
export function plansForSplit(split: Pick<StoredSplit, 'days'>, from: string, through: string, startIndex: number, ids: PlanIds, now: string): PlanCopy[] {
  return expandCycle(split.days, from, through, startIndex).flatMap((entry) => {
    const copy = planFromTemplate(split.days[entry.index], entry.date, ids, now)
    return copy ? [copy] : []
  })
}

export function countSets(day: SplitDay): number {
  return day.rest ? 0 : day.exercises.reduce((n, e) => n + e.sets.length, 0)
}
