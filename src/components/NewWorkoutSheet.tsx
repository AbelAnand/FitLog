import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateWorkout } from '../api/mutations'
import { useWorkouts } from '../api/queries'
import { Button, Chip, Sheet, TextInput } from './ui'

const DEFAULT_TITLES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body']

export function NewWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const { data: workouts = [] } = useWorkouts()
  const create = useCreateWorkout()
  const nav = useNavigate()

  const recent = Array.from(new Set(workouts.map((w) => w.title.trim()).filter(Boolean)))
  const suggestions = Array.from(new Set([...recent, ...DEFAULT_TITLES])).slice(0, 8)

  const start = async (t: string) => {
    const id = await create.mutateAsync({ title: t.trim() })
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
        <Button onClick={() => start(title || 'Workout')} disabled={create.isPending} className="shrink-0">
          Start
        </Button>
      </div>
    </Sheet>
  )
}
