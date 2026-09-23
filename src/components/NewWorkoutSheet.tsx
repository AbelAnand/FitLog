import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateWorkout } from '../api/mutations'
import { useWorkouts } from '../api/queries'
import { isNative } from '../lib/native'
import { loadReminderSettings, startGymSession } from '../lib/notifications'
import { Button, Chip, Icon, Sheet, TextInput, Toggle } from './ui'

const DEFAULT_TITLES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Cardio']

export function NewWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [gym, setGym] = useState(false)
  const [gymAvailable, setGymAvailable] = useState(false)
  const { data: workouts = [] } = useWorkouts()
  const create = useCreateWorkout()
  const nav = useNavigate()

  useEffect(() => {
    if (!open) return
    loadReminderSettings().then((s) => {
      setGymAvailable(isNative && s.gymEnabled)
      setGym(isNative && s.gymEnabled)
    })
  }, [open])

  const recent = Array.from(new Set(workouts.map((w) => w.title.trim()).filter(Boolean)))
  const suggestions = Array.from(new Set([...recent, ...DEFAULT_TITLES])).slice(0, 9)

  const start = async (t: string) => {
    const clean = t.trim() || 'Workout'
    const id = await create.mutateAsync({ title: clean })
    if (gym && gymAvailable) startGymSession(id, clean)
    setTitle('')
    onClose()
    nav(`/workout/${id}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Start a workout">
      <div className="flex flex-wrap gap-2 mb-4">
        {suggestions.map((t) => (
          <Chip key={t} onClick={() => start(t)}>{t}</Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <TextInput placeholder="Custom title…" value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && title.trim() && start(title)} />
        <Button onClick={() => start(title)} disabled={create.isPending} className="shrink-0">
          Start
        </Button>
      </div>
      {gymAvailable && (
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
    </Sheet>
  )
}
