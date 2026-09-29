import { useEffect, useRef, useState } from 'react'

/** How long a removed row takes to close up. Matches `.collapsible` in app.css. */
export const LEAVE_MS = 190

/**
 * True for things that appear after the screen's content has loaded, false for what was there
 * from the start. Lets new items animate in without the whole list animating every time a screen
 * opens. Pass `ready = false` while the screen is still showing a spinner.
 */
export function useArrivals(ready = true) {
  const loaded = useRef(false)
  useEffect(() => {
    if (ready) loaded.current = true
  }, [ready])
  return loaded
}

/** Decided once, when the item first renders. */
export function useArrived(loaded: React.RefObject<boolean>): boolean {
  const [arrived] = useState(() => loaded.current)
  return arrived
}

/** Let an item close up before it is really removed. */
export function useLeaving(remove: (id: string) => void) {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, number>())
  const latest = useRef(remove)
  latest.current = remove
  useEffect(() => {
    const pending = timers.current
    // Leaving the screen mid-animation must still remove the item.
    return () => pending.forEach((timer, id) => { window.clearTimeout(timer); latest.current(id) })
  }, [])
  const leave = (id: string) => {
    if (timers.current.has(id)) return
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return latest.current(id)
    setLeaving((s) => new Set(s).add(id))
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id)
      latest.current(id)
      setLeaving((s) => { const next = new Set(s); next.delete(id); return next })
    }, LEAVE_MS))
  }
  return { leaving, leave }
}
