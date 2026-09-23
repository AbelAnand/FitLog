import { useEffect, useState } from 'react'
import type { WorkoutDetail } from '../api/types'
import { formatClock } from '../lib/duration'
import { isNative } from '../lib/native'
import { loadReminderSettings, saveReminderSettings, startGymSession, stopGymSession, type ReminderSettings } from '../lib/notifications'
import { Button, Icon, Sheet, Stepper, Toggle } from './ui'

/** Controls for a live session: pause/resume, finish, and gym reminders with their interval. */
export function SessionSheet({
  open,
  onClose,
  workout,
  elapsed,
  gymActive,
  onGymChange,
  onPause,
  onResume,
  onFinish,
  busy,
}: {
  open: boolean
  onClose: () => void
  workout: WorkoutDetail
  elapsed: number
  gymActive: boolean
  onGymChange: (on: boolean) => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
  busy: boolean
}) {
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  useEffect(() => {
    if (open) loadReminderSettings().then(setSettings)
  }, [open])

  const paused = !!workout.paused_at

  const setInterval = async (min: number) => {
    if (!settings) return
    const next = { ...settings, gymIntervalMin: min }
    setSettings(next)
    await saveReminderSettings(next)
    // Reschedule with the new spacing if reminders are currently running.
    if (gymActive) await startGymSession(workout.id, workout.title)
  }

  const setGymEnabled = async (on: boolean) => {
    if (!settings) return
    const next = { ...settings, gymEnabled: on }
    setSettings(next)
    await saveReminderSettings(next)
    if (!on && gymActive) {
      await stopGymSession()
      onGymChange(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Session">
      <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-4 mb-3">
        <div>
          <div className="text-[12px] font-medium text-muted">{paused ? 'Paused' : 'Elapsed'}</div>
          <div className="text-[36px] leading-none font-bold tabular mt-1">{formatClock(elapsed)}</div>
        </div>
        <Button variant="secondary" size="md" disabled={busy} onClick={paused ? onResume : onPause} aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? <Icon.Play /> : <Icon.Pause />} {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {isNative && settings && (
        <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden mb-3">
          <div className="flex items-center justify-between gap-3 px-4 min-h-[60px]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-muted">{gymActive ? <Icon.Bell /> : <Icon.BellOff />}</span>
              <div className="min-w-0">
                <div className="text-[15px] font-medium">I'm at the gym</div>
                <div className="text-[12px] text-muted truncate">{gymActive ? 'Reminders to log sets are on' : 'Soft reminders to log your sets'}</div>
              </div>
            </div>
            <Toggle checked={gymActive} onChange={onGymChange} label="Gym reminders for this session" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 min-h-[60px]">
            <div>
              <div className="text-[15px] font-medium">Remind every</div>
              <div className="text-[12px] text-muted">Minutes between nudges</div>
            </div>
            <Stepper value={settings.gymIntervalMin} min={5} max={60} onChange={setInterval} suffix=" min" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 min-h-[60px]">
            <div>
              <div className="text-[15px] font-medium">Gym reminders</div>
              <div className="text-[12px] text-muted">Offer them when starting workouts</div>
            </div>
            <Toggle checked={settings.gymEnabled} onChange={setGymEnabled} label="Gym reminders default" />
          </div>
        </div>
      )}

      <Button size="lg" className="w-full" disabled={busy} onClick={onFinish}>
        <Icon.Check /> Finish workout
      </Button>
      <Button variant="secondary" size="lg" className="w-full mt-2" onClick={onClose}>Close</Button>
    </Sheet>
  )
}
