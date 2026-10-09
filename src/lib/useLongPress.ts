import { useRef, type PointerEvent as RPointerEvent } from 'react'
import { thud } from './haptics'

/** How long a finger rests before a hold counts, everywhere in the app. */
export const LONG_PRESS_MS = 450

/**
 * Long-press detection that plays nicely with taps and scrolling.
 * Fires `onLongPress` after `ms` with the press that started it; a subsequent click is swallowed
 * so the row doesn't also open. `haptic` plays when the hold registers.
 */
export function useLongPress(onLongPress: (press: RPointerEvent) => void, ms = LONG_PRESS_MS, haptic: () => void = thud) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }

  return {
    onPointerDown: (e: RPointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = window.setTimeout(() => {
        fired.current = true
        haptic()
        onLongPress(e)
      }, ms)
    },
    onPointerMove: (e: RPointerEvent) => {
      if (!start.current) return
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.stopPropagation()
        e.preventDefault()
        fired.current = false
      }
    },
  }
}
