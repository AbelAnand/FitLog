import { addDays, format, set } from 'date-fns'
import { isNative } from './native'

export interface ReminderSettings {
  /** "You haven't logged a workout today" at a fixed time on days with no workout. */
  dailyEnabled: boolean
  hour: number
  minute: number
  /** Soft nudges while a workout is in progress at the gym. */
  gymEnabled: boolean
  gymIntervalMin: number
}

export const DEFAULT_SETTINGS: ReminderSettings = { dailyEnabled: false, hour: 19, minute: 0, gymEnabled: true, gymIntervalMin: 15 }

const KEY = 'fitlog.reminders'
const GYM_KEY = 'fitlog.gymSession'
const DAILY_IDS = Array.from({ length: 14 }, (_, i) => 1001 + i)
const GYM_IDS = Array.from({ length: 10 }, (_, i) => 2001 + i)

async function kv() {
  if (isNative) {
    const { Preferences } = await import('@capacitor/preferences')
    return {
      get: async (k: string) => (await Preferences.get({ key: k })).value,
      set: async (k: string, v: string) => Preferences.set({ key: k, value: v }),
      remove: async (k: string) => Preferences.remove({ key: k }),
    }
  }
  return {
    get: async (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
    set: async (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
    remove: async (k: string) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
  }
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const raw = await (await kv()).get(KEY)
  if (!raw) return DEFAULT_SETTINGS
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } } catch { return DEFAULT_SETTINGS }
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  await (await kv()).set(KEY, JSON.stringify(s))
}

/** Ask for permission; resolves false on the web or when denied. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const status = await LocalNotifications.checkPermissions()
  if (status.display === 'granted') return true
  const req = await LocalNotifications.requestPermissions()
  return req.display === 'granted'
}

/**
 * (Re)schedule the daily "did you train?" reminder for the next 14 days,
 * skipping days that already have a workout. Call whenever workouts change.
 */
export async function syncDailyReminder(trainedDates: string[], settings?: ReminderSettings): Promise<void> {
  if (!isNative) return
  const s = settings ?? (await loadReminderSettings())
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.cancel({ notifications: DAILY_IDS.map((id) => ({ id })) }).catch(() => {})
  if (!s.dailyEnabled) return
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
  const trained = new Set(trainedDates)
  const now = new Date()
  const notifications = []
  for (let i = 0; i < 14; i++) {
    const day = addDays(now, i)
    const at = set(day, { hours: s.hour, minutes: s.minute, seconds: 0, milliseconds: 0 })
    if (at <= now || trained.has(format(day, 'yyyy-MM-dd'))) continue
    notifications.push({
      id: DAILY_IDS[i],
      title: 'No workout logged today',
      body: 'Trained today? Take 30 seconds to log it and keep the streak alive.',
      schedule: { at, allowWhileIdle: true },
      extra: { kind: 'daily' },
    })
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications })
}

export interface GymSession { workoutId: string; title: string; startedAt: number }

/** Start soft nudges for an in-progress workout. */
export async function startGymSession(workoutId: string, title: string): Promise<void> {
  const store = await kv()
  const session: GymSession = { workoutId, title, startedAt: Date.now() }
  await store.set(GYM_KEY, JSON.stringify(session))
  if (!isNative) return
  const s = await loadReminderSettings()
  if (!s.gymEnabled) return
  if (!(await requestNotificationPermission())) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.cancel({ notifications: GYM_IDS.map((id) => ({ id })) }).catch(() => {})
  const bodies = [
    'Finished a set? Log it while the numbers are fresh.',
    'Quick check: are your sets logged?',
    'Keep the log going. Tap to add your latest set.',
    'Still lifting? Make sure nothing slips through.',
  ]
  const now = Date.now()
  await LocalNotifications.schedule({
    notifications: GYM_IDS.map((id, i) => ({
      id,
      title: `${title || 'Workout'} in progress`,
      body: bodies[i % bodies.length],
      schedule: { at: new Date(now + (i + 1) * s.gymIntervalMin * 60_000), allowWhileIdle: true },
      extra: { kind: 'gym', workoutId },
    })),
  })
}

export async function stopGymSession(): Promise<void> {
  const store = await kv()
  await store.remove(GYM_KEY)
  if (!isNative) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.cancel({ notifications: GYM_IDS.map((id) => ({ id })) }).catch(() => {})
}

/** The active gym session, auto-expiring after 3 hours. */
export async function getGymSession(): Promise<GymSession | null> {
  const raw = await (await kv()).get(GYM_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as GymSession
    if (Date.now() - s.startedAt > 3 * 60 * 60_000) {
      await stopGymSession()
      return null
    }
    return s
  } catch {
    return null
  }
}

/** Route notification taps: gym nudges open their workout, daily reminders open Home. */
export async function onNotificationTap(cb: (target: { workoutId?: string }) => void): Promise<() => void> {
  if (!isNative) return () => {}
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = (event.notification.extra ?? {}) as { workoutId?: string }
    cb({ workoutId: extra.workoutId })
  })
  return () => { handle.remove() }
}
