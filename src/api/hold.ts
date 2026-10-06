import { useSyncExternalStore } from 'react'

/*
 * Held writes: an explicit Save for workouts that are not in progress.
 *
 * A live session saves every change as it is made. A finished workout or a plan opens for
 * editing instead: each change still shows on screen at once, but its database write is kept
 * here until the person taps Save (the writes then run in the order they were made) or
 * Discard (they are dropped and the screen is re-read from storage).
 */

export type Write = () => Promise<unknown>

const holds = new Map<string, Write[]>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Start holding writes to this workout. Harmless if already holding. */
export function holdWrites(workoutId: string): void {
  if (holds.has(workoutId)) return
  holds.set(workoutId, [])
  notify()
}

export const isHolding = (workoutId: string): boolean => holds.has(workoutId)

/** Keep a write for later instead of running it. */
export function holdWrite(workoutId: string, write: Write): Promise<void> {
  holds.get(workoutId)!.push(write)
  notify()
  return Promise.resolve()
}

/** The writes held so far, in order; keeps holding new ones. */
export function releaseHeld(workoutId: string): Write[] {
  const writes = holds.get(workoutId) ?? []
  if (holds.has(workoutId)) holds.set(workoutId, [])
  if (writes.length) notify()
  return writes
}

/** Stop holding and return whatever was still held. */
export function stopHolding(workoutId: string): Write[] {
  const writes = holds.get(workoutId) ?? []
  if (holds.delete(workoutId)) notify()
  return writes
}

export const heldCount = (workoutId: string): number => holds.get(workoutId)?.length ?? 0

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** How many unsaved changes this workout has (re-renders as it changes). */
export function useHeldCount(workoutId: string): number {
  return useSyncExternalStore(subscribe, () => heldCount(workoutId), () => 0)
}
