/**
 * One line of pending writes per workout. A write starts only when the one before it has finished,
 * so storage sees changes in the order they were made, because a later write may depend on an
 * earlier one (editing a set that was just added).
 *
 * This is deliberately independent of whether the app is in the foreground: a write that has been
 * queued keeps going if the phone is locked a moment later.
 *
 * The retry machinery dates from when writes went over the network. Saving to the device does not
 * fail in a way that is worth retrying, so the default is a single try.
 */

/** A request that never reached the server (no error code) is worth sending again; a rejection is not. */
export function isTransient(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e || e.code) return false
  return /fetch|network|load failed|timed? ?out|connection|offline/i.test(e.message ?? '')
}

const lines = new Map<string, Promise<unknown>>()

export interface RetryPolicy {
  /** Wait before retry number n (0-based), in ms. */
  delay: (attempt: number) => number
  /** Give up after this many failed tries. */
  maxTries: number
}

export const DEFAULT_POLICY: RetryPolicy = { delay: () => 0, maxTries: 1 }

/** Resolves after `ms`, or sooner if the device reports it is back online. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (typeof window !== 'undefined') window.removeEventListener('online', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    if (typeof window !== 'undefined') window.addEventListener('online', done)
  })
}

async function withRetry<T>(run: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  for (let failed = 0; ; ) {
    try {
      return await run()
    } catch (err) {
      failed++
      if (failed >= policy.maxTries || !isTransient(err)) throw err
      await wait(policy.delay(failed - 1))
    }
  }
}

export function enqueue<T>(line: string, run: () => Promise<T>, policy: RetryPolicy = DEFAULT_POLICY): Promise<T> {
  const before = lines.get(line) ?? Promise.resolve()
  // A failure earlier in the line has been reported by its own caller; it must not stop what follows.
  const mine = before.catch(() => {}).then(() => withRetry(run, policy))
  const tail = mine.catch(() => {})
  lines.set(line, tail)
  tail.then(() => {
    if (lines.get(line) === tail) lines.delete(line)
  })
  return mine
}
