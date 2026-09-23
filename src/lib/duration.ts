import { useEffect, useState } from 'react'
import { format } from 'date-fns'

/** Sessions longer than this are treated as "forgot to finish" and not shown as a duration. */
export const MAX_SESSION_MS = 6 * 60 * 60_000

export interface Timing {
  started_at: string
  finished_at: string | null
  paused_at: string | null
  paused_seconds: number
}

/** Active seconds: wall time since start minus completed pauses, frozen while paused or finished. */
export function activeSeconds(t: Timing, now = Date.now()): number {
  const end = t.finished_at ? new Date(t.finished_at).getTime() : t.paused_at ? new Date(t.paused_at).getTime() : now
  return Math.max(0, Math.floor((end - new Date(t.started_at).getTime()) / 1000) - t.paused_seconds)
}

/** "42:13" while running, "1:02:05" past an hour. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** "58 min" or "1 h 12 min" for a finished session; null if it wasn't tracked sensibly. */
export function formatSessionLength(t: Timing): string | null {
  if (!t.finished_at) return null
  const ms = activeSeconds(t) * 1000
  if (ms < 60_000 || ms > MAX_SESSION_MS) return null
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  return min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60)} h ${min % 60} min`
}

/** True when a workout is a live session: not a plan, logged today, not finished, under 6 h of active time. */
export function isLiveSession(w: Timing & { date: string; is_plan?: boolean }): boolean {
  if (w.is_plan || w.finished_at) return false
  if (w.date !== format(new Date(), 'yyyy-MM-dd')) return false
  return activeSeconds(w) * 1000 < MAX_SESSION_MS
}

/** Ticking active seconds for a session; the interval only runs while `running`. */
export function useElapsed(t: Timing | undefined, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  if (!t) return 0
  return activeSeconds(t, now)
}
