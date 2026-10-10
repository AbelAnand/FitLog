import { deviceName } from '../lib/native'
/**
 * Size limits. The database enforces the same numbers (see the hardening migration), so these exist
 * to stop the input at the limit instead of letting a save be refused.
 */
export const LIMITS = {
  workoutTitle: 120,
  workoutNotes: 4000,
  exerciseNotes: 2000,
  exerciseName: 80,
  drops: 20,
  reps: 10000,
  /** Days that can be picked at once when duplicating a workout onto other days. */
  duplicateDays: 60,
  /** A split: how it is named, how long its cycle can be, and how much of one day it can hold. */
  splitName: 60,
  splitDays: 21,
  splitDayExercises: 30,
  splitTemplateSets: 40,
  splits: 30,
  /** How far ahead one Apply can fill the calendar, in weeks. */
  splitFillWeeks: 26,
} as const

/** Why a save to the device failed, in words a person can act on. */
export function explainSaveError(err: unknown): string {
  const message = (err as { message?: string } | null)?.message ?? ''
  if (/not found/i.test(message)) return 'That item no longer exists. Go back and open the workout again.'
  if (/full|space|quota|disk/i.test(message)) return `This ${deviceName} is out of storage space. Free some up and try again.`
  if (/built-in/i.test(message)) return message
  return 'Close SplitLog and open it again. Your earlier workouts are safe.'
}
