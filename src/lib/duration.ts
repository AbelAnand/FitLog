import { useEffect, useState } from 'react'
import { format } from 'date-fns'

/** Sessions longer than this are treated as "forgot to finish" and not shown as a duration. */
export const MAX_SESSION_MS = 6 * 60 * 60_000

/** Whole seconds between start and end (or now). */
export function elapsedSeconds(startedAt: string, endedAt?: string | null): number {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  return Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000))
}

/** "42:13" while running, "1:02:05" past an hour. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** "58 min" or "1 h 12 min" for a finished session; null if it wasn't tracked sensibly. */
export function formatSessionLength(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 60_000 || ms > MAX_SESSION_MS) return null
  const min = Math.round(ms / 60_000)
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
}

/** True when a workout is a live session: logged today, not finished, started less than 6 h ago. */
export function isLiveSession(w: { date: string; started_at: string; finished_at: string | null }): boolean {
  if (w.finished_at) return false
  if (w.date !== format(new Date(), 'yyyy-MM-dd')) return false
  return Date.now() - new Date(w.started_at).getTime() < MAX_SESSION_MS
}

/** Ticking elapsed seconds since `startedAt`; stops when `running` is false. */
export function useElapsed(startedAt: string | undefined, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
}
