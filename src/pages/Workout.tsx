import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { format, parseISO } from 'date-fns'
import { useAllSets, useProfile, useWorkout, useWorkouts } from '../api/queries'
import { useAddExercise, useAddSet, useDeleteSet, useDeleteWorkout, useRemoveExercise, useRepeatLast, useUpdateSet, useUpdateWorkout } from '../api/mutations'
import { ExerciseCard, type LastSession } from '../components/ExerciseCard'
import { ExercisePicker } from '../components/ExercisePicker'
import { Button, Icon, Sheet, Spinner } from '../components/ui'
import { bestByExercise } from '../lib/prs'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: workout, isLoading, error } = useWorkout(id)
  const { data: profile } = useProfile()
  const { data: allSets = [] } = useAllSets()
  const { data: workouts = [] } = useWorkouts()
  const unit = profile?.unit ?? 'lb'

  const updateWorkout = useUpdateWorkout(id)
  const deleteWorkout = useDeleteWorkout()
  const addExercise = useAddExercise(id)
  const removeExercise = useRemoveExercise(id)
  const addSet = useAddSet(id)
  const updateSet = useUpdateSet(id)
  const deleteSet = useDeleteSet(id)
  const repeatLast = useRepeatLast(id)

  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Local text state for title/notes with debounced saves.
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const seeded = useRef(false)
  useEffect(() => {
    if (workout && !seeded.current) {
      setTitle(workout.title)
      setNotes(workout.notes)
      seeded.current = true
    }
  }, [workout])
  const timers = useRef<{ title?: number; notes?: number }>({})
  const debounced = (key: 'title' | 'notes', value: string) => {
    if (timers.current[key]) window.clearTimeout(timers.current[key])
    timers.current[key] = window.setTimeout(() => updateWorkout.mutate({ [key]: value }), 500)
  }

  const prevBest = useMemo(() => bestByExercise(allSets, id), [allSets, id])

  const lastSessions = useMemo(() => {
    const map = new Map<string, LastSession>()
    if (!workout) return map
    for (const we of workout.exercises) {
      const candidates = allSets.filter((r) => r.exercise_id === we.exercise_id && r.workout_id !== id && r.date <= workout.date)
      if (!candidates.length) continue
      const latestDate = candidates.map((r) => r.date).sort().at(-1)!
      const latestWorkout = candidates.filter((r) => r.date === latestDate).sort((a, b) => b.created_at.localeCompare(a.created_at))[0].workout_id
      const sets = candidates.filter((r) => r.workout_id === latestWorkout).sort((a, b) => a.set_number - b.set_number)
      map.set(we.id, { date: format(parseISO(latestDate), 'MMM d'), sets })
    }
    return map
  }, [allSets, workout, id])

  const previousSameTitle = useMemo(() => {
    if (!workout || !workout.title.trim()) return null
    return workouts.find((w) => w.id !== id && w.title.trim().toLowerCase() === workout.title.trim().toLowerCase() && w.exerciseNames.length > 0 && w.date <= workout.date) ?? null
  }, [workouts, workout, id])

  if (isLoading) return <Spinner className="pt-32" />
  if (error || !workout) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-safe">
        <div className="pt-20 text-center text-muted">Workout not found.</div>
        <Button variant="secondary" className="mx-auto mt-4 block" onClick={() => nav('/')}>Go home</Button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 pt-safe pb-safe">
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 bg-bg/90 backdrop-blur-xl flex items-center justify-between">
        <button type="button" aria-label="Back" onClick={() => nav(-1)} className="-ml-2 h-10 w-10 flex items-center justify-center text-muted"><Icon.Back /></button>
        <div className="text-[13px] text-faint">{updateWorkout.isPending || updateSet.isPending ? 'Saving…' : 'Saved'}</div>
        <button type="button" aria-label="More" onClick={() => setMenu(true)} className="-mr-2 h-10 w-10 flex items-center justify-center text-muted text-[22px] leading-none">···</button>
      </div>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); debounced('title', e.target.value) }}
        placeholder="Workout title"
        className="w-full bg-transparent text-[30px] font-bold tracking-tight outline-none placeholder:text-faint mt-1"
        aria-label="Workout title"
      />
      <div className="mt-1 mb-5">
        <input
          type="date"
          value={workout.date}
          max={format(new Date(), 'yyyy-MM-dd')}
          onChange={(e) => e.target.value && updateWorkout.mutate({ date: e.target.value })}
          className="bg-transparent text-muted text-[15px] outline-none"
          aria-label="Workout date"
        />
      </div>

      {workout.exercises.length === 0 && previousSameTitle && (
        <button
          type="button"
          disabled={repeatLast.isPending}
          onClick={() => repeatLast.mutate(previousSameTitle.id)}
          className="w-full flex items-center gap-3 rounded-[18px] bg-accent-dim border border-accent/30 p-4 mb-4 text-left active:brightness-110 disabled:opacity-60"
        >
          <span className="text-accent"><Icon.Repeat /></span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-accent">Repeat last {previousSameTitle.title}</div>
            <div className="text-[13px] text-muted truncate">{format(parseISO(previousSameTitle.date), 'MMM d')} · {previousSameTitle.exerciseNames.join(', ')}</div>
          </div>
        </button>
      )}

      <div className="flex flex-col gap-3">
        {workout.exercises.map((we) => (
          <ExerciseCard
            key={we.id}
            we={we}
            unit={unit}
            prevBestKg={prevBest.get(we.exercise_id) ?? 0}
            last={lastSessions.get(we.id)}
            onUpdateSet={(setId, patch) => updateSet.mutate({ setId, patch })}
            onAddSet={() => {
              const last = we.sets.at(-1)
              addSet.mutate({ workoutExerciseId: we.id, set_number: (last?.set_number ?? 0) + 1, weight: last?.weight ?? 0, reps: last?.reps ?? 0, unit: last?.unit ?? unit })
            }}
            onDeleteSet={(setId) => deleteSet.mutate(setId)}
            onRemove={() => removeExercise.mutate(we.id)}
          />
        ))}
      </div>

      <Button variant="secondary" size="lg" className="w-full mt-3" onClick={() => setPicker(true)} disabled={addExercise.isPending}>
        <Icon.Plus /> Add exercise
      </Button>

      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); debounced('notes', e.target.value) }}
        placeholder="Notes — how did it feel, anything to remember next time…"
        rows={3}
        className="w-full mt-6 mb-10 px-4 py-3 rounded-[18px] bg-surface border border-border/60 outline-none focus:border-accent/60 placeholder:text-faint resize-none text-[15px]"
        aria-label="Notes"
      />

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(name) => addExercise.mutate({ name, position: workout.exercises.length, unit })} />

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="flex flex-col gap-1 pt-2">
          <Button variant="danger" size="lg" className="w-full justify-start" onClick={() => { setMenu(false); setConfirmDelete(true) }}>
            <Icon.Trash /> Delete workout
          </Button>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this workout?">
        <p className="text-muted text-[14px] mb-4">All its exercises and sets will be removed. This can't be undone.</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button className="flex-1 !bg-danger !text-white" onClick={async () => { await deleteWorkout.mutateAsync(id); nav('/', { replace: true }) }}>Delete</Button>
        </div>
      </Sheet>
    </main>
  )
}
