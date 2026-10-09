import { format, parseISO } from 'date-fns'
import type { SetDetail, WorkoutDetail, WorkoutExerciseDetail } from '../api/types'
import { METRICS, METRIC_BY_KEY, type MetricKey } from '../data/cardio-metrics'
import { db } from '../db'
import { serializeBackup } from '../db/backup'
import { sharedFilename, sharedWorkoutFile } from '../db/share'
import { shareFileWithText, type ShareResult } from './csv'
import { WEB_URL } from './site'
import { toast } from './toast'
import { formatDuration, formatWeight } from './units'

/**
 * Sharing one workout: a file another SplitLog user can open, and a short text for anyone else,
 * both handed to the share sheet together.
 */

const times = ' × '

function strengthSet(s: SetDetail, withUnit: boolean): string {
  const unit = withUnit ? ` ${s.unit}` : ''
  const weight = (n: number) => (n > 0 ? `${formatWeight(n)}${unit}` : 'BW')
  let text: string
  if (s.set_type === 'drop' && s.drops.length) {
    const sameReps = s.drops.every((d) => d.reps === s.reps)
    text = sameReps
      ? `${[s.weight, ...s.drops.map((d) => d.weight)].map(weight).join(' → ')}${times}${s.reps}`
      : [`${weight(s.weight)}${times}${s.reps}`, ...s.drops.map((d) => `${weight(d.weight)}${times}${d.reps}`)].join(' → ')
  } else text = `${weight(s.weight)}${times}${s.reps}`
  if (s.set_type === 'warmup') text += ' warm-up'
  if (s.set_type === 'failure') text += ' to failure'
  return text
}

function metricValue(key: MetricKey, s: SetDetail): string | null {
  const def = METRIC_BY_KEY[key]
  const du = s.distance_unit ?? 'mi'
  if (key === 'time') return s.duration_seconds ? formatDuration(s.duration_seconds) : null
  if (key === 'distance') return s.distance ? `${Math.round(s.distance * 100) / 100} ${du}` : null
  if (key === 'incline') return s.incline ? `${s.incline}% incline` : null
  const n = s.extra[key]
  if (!n) return null
  const unit = def.unit(du)
  return key === 'level' ? `level ${n}` : key === 'floors' ? `${n} floors` : `${n}${unit ? ` ${unit}` : ''}`
}

function cardioSet(we: WorkoutExerciseDetail, s: SetDetail): string {
  // The exercise's own columns first, in their order; then any other figure that was logged.
  const keys: MetricKey[] = [...we.metrics, ...METRICS.map((m) => m.key).filter((k) => !we.metrics.includes(k))]
  const parts = keys.map((k) => metricValue(k, s)).filter((v): v is string => !!v)
  return parts.length ? parts.join(', ') : '—'
}

function exerciseLine(we: WorkoutExerciseDetail): string {
  if (!we.sets.length) return `${we.name}: no sets`
  if (we.kind === 'cardio') return `${we.name}: ${we.sets.map((s) => cardioSet(we, s)).join('; ')}`
  const units = new Set(we.sets.map((s) => s.unit))
  const mixed = units.size > 1
  const unit = mixed ? '' : ` (${we.sets[0].unit})`
  const label = we.sets.every((s) => s.weight === 0 && s.drops.every((d) => d.weight === 0)) ? '' : unit
  return `${we.name}${label}: ${we.sets.map((s) => strengthSet(s, mixed)).join(', ')}`
}

/** A message-sized account of a workout: title, date, every exercise with its sets, notes, and where it came from. */
export function workoutSummaryText(w: Pick<WorkoutDetail, 'title' | 'date' | 'notes' | 'is_plan' | 'exercises'>): string {
  const when = format(parseISO(w.date), 'EEE, MMM d, yyyy')
  const lines = [`${w.title || 'Workout'} — ${w.is_plan ? `planned for ${when}` : when}`]
  for (const we of w.exercises) {
    lines.push(exerciseLine(we))
    if (we.notes.trim()) lines.push(`  (${we.notes.trim()})`)
  }
  if (w.notes.trim()) lines.push('', `Notes: ${w.notes.trim()}`)
  lines.push('', 'Logged with SplitLog', WEB_URL)
  return lines.join('\n')
}

/**
 * Share a workout: the file for SplitLog users and the text summary for everyone else go to the
 * share sheet together. In a browser the file is downloaded and the summary copied.
 */
export async function shareWorkout(workoutId: string): Promise<ShareResult> {
  await db.open()
  await db.flushed()
  const w = db.getWorkout(workoutId)
  const file = sharedWorkoutFile(db, workoutId)
  return shareFileWithText(sharedFilename(w.title, w.date), serializeBackup(file), 'application/json', workoutSummaryText(w), `${w.title || 'Workout'} — SplitLog`)
}

/** Share from a menu item: the outcome is told through a toast, so the caller has nothing to handle. */
export async function shareFromMenu(workoutId: string): Promise<void> {
  try {
    const result = await shareWorkout(workoutId)
    if (result === 'downloaded') toast('File downloaded and summary copied.', 'info')
  } catch {
    toast("Couldn't share the workout. Try again.")
  }
}
