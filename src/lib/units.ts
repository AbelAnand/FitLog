export type Unit = 'lb' | 'kg'

const LB_PER_KG = 2.2046226218

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
