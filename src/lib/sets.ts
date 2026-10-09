import type { NewSet } from '../api/optimistic'
import type { SetDetail, SetType } from '../api/types'
import type { DistanceUnit, Unit } from './units'

/*
 * What "empty" means for a set. Weight and reps are numbers in storage, so an empty strength set
 * is 0 × 0; a cardio interval is empty when none of its metrics has a value. The rows show an
 * empty field (with last session's number as ghost text) for 0 and null, never a typed "0".
 */

type MetricSet = Pick<SetDetail, 'duration_seconds' | 'distance' | 'incline' | 'extra'>

export function hasAnyMetric(s: MetricSet): boolean {
  return !!s.duration_seconds || !!s.distance || !!s.incline || Object.values(s.extra).some((v) => !!v)
}

export function isBlank(s: Pick<SetDetail, 'weight' | 'reps'> & MetricSet, cardio: boolean): boolean {
  return cardio ? !hasAnyMetric(s) : s.weight === 0 && s.reps === 0
}

/**
 * The set "Add set" / "Add interval" appends: nothing typed, so the row shows its placeholders and
 * last session's numbers as hints. Only the units carry over from the set above (or the profile).
 * A drop set starts with one empty drop so the row has somewhere to type.
 */
export function blankSet(opts: { after?: Pick<SetDetail, 'set_number' | 'unit' | 'distance_unit'> | null; type?: SetType; unit: Unit; distanceUnit: DistanceUnit; cardio: boolean }): NewSet {
  const { after, type = 'working', unit, distanceUnit, cardio } = opts
  return {
    set_number: (after?.set_number ?? 0) + 1,
    weight: 0,
    reps: 0,
    unit: after?.unit ?? unit,
    set_type: type,
    duration_seconds: null,
    distance: null,
    distance_unit: cardio ? after?.distance_unit ?? distanceUnit : null,
    drops: type === 'drop' ? [{ weight: 0, reps: 0 }] : [],
    incline: null,
    extra: {},
  }
}
