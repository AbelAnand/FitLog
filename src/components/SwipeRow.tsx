import { useRef, useState, type ReactNode, type TouchEvent as RTouchEvent } from 'react'
import { tap, thud } from '../lib/haptics'

const ACTION_W = 88

/**
 * iOS-style swipe-to-delete. Swipe left to reveal Delete; keep going for a full swipe to delete outright.
 * Vertical scrolling is left to the browser via `touch-action: pan-y`.
 */
export function SwipeRow({ onDelete, children, className = '', rounded = 'rounded-xl', label = 'Delete', surface = 'bg-bg' }: { onDelete: () => void; children: ReactNode; className?: string; rounded?: string; label?: string; surface?: string }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; dx0: number; axis: 'x' | 'y' | null; t: number } | null>(null)
  const armed = useRef(false)

  const onTouchStart = (e: RTouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, dx0: dx, axis: null, t: Date.now() }
  }
  const onTouchMove = (e: RTouchEvent) => {
    const s = start.current
    if (!s) return
    const t = e.touches[0]
    const mx = t.clientX - s.x
    const my = t.clientY - s.y
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (s.axis === 'x') setDragging(true)
    }
    if (s.axis !== 'x') return
    const next = Math.min(0, Math.max(-ACTION_W * 2, s.dx0 + mx))
    // Light click when crossing into the full-swipe zone.
    const full = next < -ACTION_W * 1.6
    if (full !== armed.current) {
      armed.current = full
      if (full) thud()
    }
    setDx(next)
  }
  const onTouchEnd = () => {
    const s = start.current
    start.current = null
    setDragging(false)
    if (!s || s.axis !== 'x') return
    if (dx < -ACTION_W * 1.6) {
      setDx(0)
      onDelete()
    } else if (dx < -ACTION_W / 2) {
      setDx(-ACTION_W)
    } else {
      setDx(0)
    }
    armed.current = false
  }

  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`} style={{ touchAction: 'pan-y' }}>
      <div className={`absolute inset-y-0 right-0 flex ${rounded}`} style={{ width: ACTION_W * 2, visibility: dx === 0 ? 'hidden' : 'visible' }} aria-hidden={dx === 0}>
        <button
          type="button"
          tabIndex={dx === 0 ? -1 : 0}
          onClick={() => { tap(); setDx(0); onDelete() }}
          className="ml-auto h-full bg-danger text-white text-[14px] font-semibold flex items-center justify-center"
          style={{ width: Math.max(ACTION_W, -dx) }}
        >
          {label}
        </button>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // A tap on an open row closes it instead of activating what's underneath.
          if (dx !== 0) {
            e.stopPropagation()
            e.preventDefault()
            setDx(0)
          }
        }}
        className={`relative ${surface}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)' }}
      >
        {children}
      </div>
    </div>
  )
}
