import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { addDays, format } from 'date-fns'
import { useCreateWorkout, useSessionControls } from '../api/mutations'
import { useWorkouts } from '../api/queries'
import type { WorkoutSummary } from '../api/types'
import { isNative } from '../lib/native'
import { tap } from '../lib/haptics'
import { loadReminderSettings, startGymSession } from '../lib/notifications'
import { Button, Chip, Icon, Segmented, Sheet, TextInput, Toggle } from './ui'

const DEFAULT_TITLES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Cardio']

/** A plan waiting for today, offered at the top of the start sheet so it is not planned twice. */
function TodayPlan({ w, gym, onStarted }: { w: WorkoutSummary; gym: boolean; onStarted: () => void }) {
  const session = useSessionControls(w.id)
  const nav = useNavigate()
  const start = async () => {
    tap()
    if (!(await session.startPlan())) return
    if (gym) startGymSession(w.id, w.title)
    onStarted()
    nav(`/workout/${w.id}`)
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-accent/70 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-accent uppercase tracking-wide">Planned for today</div>
        <div className="text-[15px] font-semibold truncate">{w.title || 'Workout'}</div>
        <div className="text-[12px] text-muted truncate">{w.exerciseNames.join(' · ')}</div>
      </div>
      <Button size="sm" className="shrink-0" disabled={session.isPending} onClick={start} aria-label={`Start ${w.title}`}><Icon.Play /> Start</Button>
    </div>
  )
}

export function NewWorkoutSheet({ open, onClose, initialMode = 'now' }: { open: boolean; onClose: () => void; initialMode?: 'now' | 'plan' }) {
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'now' | 'plan'>(initialMode)
  const today = format(new Date(), 'yyyy-MM-dd')
  const [planDate, setPlanDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [logDate, setLogDate] = useState(today)
  const backdated = mode === 'now' && logDate !== today
  const [gym, setGym] = useState(false)
  const [gymAvailable, setGymAvailable] = useState(false)
  const { data: workouts = [] } = useWorkouts()
  const create = useCreateWorkout()
  const nav = useNavigate()

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setLogDate(today)
    loadReminderSettings().then((s) => {
      setGymAvailable(isNative && s.gymEnabled)
      setGym(isNative && s.gymEnabled)
    })
  }, [open, initialMode])

  const recent = Array.from(new Set(workouts.filter((w) => !w.is_plan).map((w) => w.title.trim()).filter(Boolean)))
  const suggestions = Array.from(new Set([...recent, ...DEFAULT_TITLES])).slice(0, 9)
  const todaysPlans = workouts.filter((w) => w.is_plan && w.date === today && w.exerciseNames.length > 0).slice(0, 3)

  const start = (t: string) => {
    const clean = t.trim() || 'Workout'
    const plan = mode === 'plan'
    // The editor opens straight away; the workout is saved behind it.
    const id = create({ title: clean, is_plan: plan, date: plan ? planDate : logDate })
    if (!plan && !backdated && gym && gymAvailable) startGymSession(id, clean)
    setTitle('')
    onClose()
    nav(`/workout/${id}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'plan' ? 'Plan a workout' : backdated ? 'Log a past workout' : 'Start a workout'}>
      <div className="mb-4">
        <Segmented value={mode} options={[{ value: 'now', label: 'Start now' }, { value: 'plan', label: 'Plan for later' }]} onChange={setMode} />
      </div>

      {mode === 'now' && !backdated && todaysPlans.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {todaysPlans.map((w) => <TodayPlan key={w.id} w={w} gym={gym && gymAvailable} onStarted={onClose} />)}
        </div>
      )}

      {mode === 'now' && (
        <label className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-4">
          <span className="flex items-center gap-3">
            <span className="text-muted"><Icon.Calendar /></span>
            <span>
              <span className="block text-[15px] font-medium">Date</span>
              <span className="block text-[12px] text-muted">{backdated ? 'Logging a past session — no timer' : 'Today'}</span>
            </span>
          </span>
          <input type="date" value={logDate} max={today} onChange={(e) => e.target.value && setLogDate(e.target.value)} className="bg-transparent text-[15px] outline-none text-right" aria-label="Workout date" />
        </label>
      )}

      {mode === 'plan' && (
        <label className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-4">
          <span className="flex items-center gap-3">
            <span className="text-muted"><Icon.CalendarPlus /></span>
            <span className="text-[15px] font-medium">Planned for</span>
          </span>
          <input type="date" value={planDate} min={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => e.target.value && setPlanDate(e.target.value)} className="bg-transparent text-[15px] outline-none text-right" aria-label="Plan date" />
        </label>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {suggestions.map((t) => (
          <Chip key={t} onClick={() => start(t)}>{t}</Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <TextInput placeholder="Custom title…" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && title.trim() && start(title)} />
        <Button onClick={() => start(title)} className="shrink-0">
          {mode === 'plan' ? 'Plan' : backdated ? 'Log' : 'Start'}
        </Button>
      </div>
      {mode === 'now' && !backdated && gymAvailable && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-muted"><Icon.Bell /></span>
            <div>
              <div className="text-[15px] font-medium">I'm at the gym</div>
              <div className="text-[12px] text-muted">Soft reminders to log sets until you finish</div>
            </div>
          </div>
          <Toggle checked={gym} onChange={setGym} label="Gym reminders" />
        </div>
      )}
      {mode === 'plan' && <p className="mt-4 text-[12px] text-muted">Add the exercises and target sets next. On the day, tap Start and check them off as you go.</p>}
    </Sheet>
  )
}
