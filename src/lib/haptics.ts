import { isNative } from './native'

/** Light tap feedback for buttons; no-op on the web. */
export function tap(): void {
  if (!isNative) return
  import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {})
}

/** Firmer feedback for long-press / destructive confirmation. */
export function thud(): void {
  if (!isNative) return
  import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium })).catch(() => {})
}
