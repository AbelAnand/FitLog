import type { DistanceUnit } from '../lib/units'

/**
 * The variables a cardio exercise can log. Each exercise picks an ordered subset.
 * `time`, `distance` and `incline` live in dedicated columns; everything else is in `sets.extra`.
 */
export type MetricKey = 'time' | 'distance' | 'speed' | 'incline' | 'level' | 'calories' | 'hr' | 'floors' | 'watts' | 'rpm'

export interface MetricDef {
  key: MetricKey
  label: string
  /** Short column header. */
  short: string
  /** Unit label for the header, may depend on the distance unit. */
  unit: (du: DistanceUnit) => string
  placeholder: string
  inputMode: 'numeric' | 'decimal'
  hint: string
}

export const METRICS: MetricDef[] = [
  { key: 'time', label: 'Time', short: 'Time', unit: () => '', placeholder: 'mm:ss', inputMode: 'numeric', hint: 'Duration, e.g. 30 or 30:00' },
  { key: 'distance', label: 'Distance', short: 'Dist', unit: (du) => du, placeholder: '0', inputMode: 'decimal', hint: 'How far you went' },
  { key: 'speed', label: 'Speed', short: 'Speed', unit: (du) => (du === 'km' ? 'kph' : 'mph'), placeholder: '0', inputMode: 'decimal', hint: 'Machine speed' },
  { key: 'incline', label: 'Incline', short: 'Incl', unit: () => '%', placeholder: '0', inputMode: 'decimal', hint: 'Treadmill or trail grade' },
  { key: 'level', label: 'Level', short: 'Lvl', unit: () => '', placeholder: '0', inputMode: 'decimal', hint: 'Resistance or machine level' },
  { key: 'calories', label: 'Calories', short: 'Cal', unit: () => 'kcal', placeholder: '0', inputMode: 'numeric', hint: 'From the machine or your watch' },
  { key: 'hr', label: 'Heart rate', short: 'HR', unit: () => 'bpm', placeholder: '0', inputMode: 'numeric', hint: 'Average heart rate' },
  { key: 'floors', label: 'Floors', short: 'Floors', unit: () => '', placeholder: '0', inputMode: 'numeric', hint: 'Stair climber floors' },
  { key: 'watts', label: 'Power', short: 'W', unit: () => 'W', placeholder: '0', inputMode: 'numeric', hint: 'Average watts' },
  { key: 'rpm', label: 'Cadence', short: 'RPM', unit: () => 'rpm', placeholder: '0', inputMode: 'numeric', hint: 'Pedal or stroke rate' },
]

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>

export const DEFAULT_METRICS: MetricKey[] = ['time', 'distance']

/** Sensible defaults for the built-in cardio exercises. */
export const STARTER_METRICS: Record<string, MetricKey[]> = {
  treadmill: ['time', 'speed', 'incline'],
  running: ['time', 'distance'],
  walking: ['time', 'distance', 'incline'],
  hiking: ['time', 'distance', 'incline'],
  'stair climber': ['time', 'level', 'floors'],
  elliptical: ['time', 'level', 'incline'],
  cycling: ['time', 'distance'],
  'stationary bike': ['time', 'level', 'distance'],
  rowing: ['time', 'distance'],
  swimming: ['time', 'distance'],
  'jump rope': ['time', 'calories'],
  hiit: ['time', 'calories'],
}

export function defaultMetricsFor(name: string): MetricKey[] {
  return STARTER_METRICS[name.trim().toLowerCase()] ?? DEFAULT_METRICS
}

export function isMetricKey(k: string): k is MetricKey {
  return k in METRIC_BY_KEY
}
