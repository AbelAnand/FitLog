import { useRef, type PointerEvent as RPointerEvent } from 'react'
import { thud } from './haptics'

/**
 * Long-press detection that plays nicely with taps and scrolling.
 * Fires `onLongPress` after `ms`; a subsequent click is swallowed so the row doesn't also open.
 */
export function useLongPress(onLongPress: () => void, ms = 450) {
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
        thud()
        onLongPress()
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
