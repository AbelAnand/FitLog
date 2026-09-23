export type Unit = 'lb' | 'kg'
export type DistanceUnit = 'km' | 'mi'

const LB_PER_KG = 2.2046226218
const KM_PER_MI = 1.609344

export function toKg(weight: number, unit: Unit): number {
  return unit === 'kg' ? weight : weight / LB_PER_KG
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function convert(weight: number, from: Unit, to: Unit): number {
  if (from === to) return weight
  return fromKg(toKg(weight, from), to)
}

/** Round for display: whole numbers stay whole, otherwise one decimal. */
export function formatWeight(weight: number): string {
  const rounded = Math.round(weight * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatWeightIn(weight: number, from: Unit, to: Unit): string {
  return formatWeight(convert(weight, from, to))
}

/** Typical plate increment for quick +/- buttons. */
export function stepFor(unit: Unit): number {
  return unit === 'kg' ? 2.5 : 5
}

/* ---- Distance ---- */

export function toKm(distance: number, unit: DistanceUnit): number {
  return unit === 'km' ? distance : distance * KM_PER_MI
}

export function fromKm(km: number, unit: DistanceUnit): number {
  return unit === 'km' ? km : km / KM_PER_MI
}

export function convertDistance(d: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return d
  return fromKm(toKm(d, from), to)
}

export function formatDistance(d: number): string {
  const rounded = Math.round(d * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/* ---- Time ---- */

/** Seconds → "m:ss" or "h:mm:ss". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/**
 * Parse a typed duration. Accepts "30" (minutes), "30:15" (m:ss), "1:05:00" (h:mm:ss),
 * "45m", "1h10m", "90s". Returns null when empty or unparseable.
 */
export function parseDuration(input: string): number | null {
  const t = input.trim().toLowerCase()
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60)
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  const m = t.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/)
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0))
  return null
}

/** Pace as "m:ss /unit" for a distance in the given unit. */
export function formatPace(seconds: number, distance: number, unit: DistanceUnit): string {
  if (!distance || !seconds) return '–'
  return `${formatDuration(seconds / distance)} /${unit}`
}
