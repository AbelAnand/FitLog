import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { addDays, format } from 'date-fns'
import { useCreateWorkout } from '../api/mutations'
import { useWorkouts } from '../api/queries'
import { isNative } from '../lib/native'
import { loadReminderSettings, startGymSession } from '../lib/notifications'
import { Button, Chip, Icon, Segmented, Sheet, TextInput, Toggle } from './ui'

const DEFAULT_TITLES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Cardio']

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

  const start = async (t: string) => {
    const clean = t.trim() || 'Workout'
    const plan = mode === 'plan'
    const id = await create.mutateAsync({ title: clean, is_plan: plan, date: plan ? planDate : logDate })
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
        <TextInput placeholder="Custom title…" value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && title.trim() && start(title)} />
        <Button onClick={() => start(title)} disabled={create.isPending} className="shrink-0">
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
