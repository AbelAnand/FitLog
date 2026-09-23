import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useAllSets, useProfile, useWorkout, useWorkouts } from '../api/queries'
import { deleteWorkoutById, invalidateAll, useAddExercise, useAddSets, useDeleteSet, useDeleteWorkout, useRemoveExercise, useRepeatLast, useReplaceSets, useUpdateSets, useUpdateWorkout, useUpdateWorkoutExercise } from '../api/mutations'
import type { WorkoutDetail } from '../api/types'
import { ExerciseCard, type LastSession } from '../components/ExerciseCard'
import { ExercisePicker } from '../components/ExercisePicker'
import { Button, Icon, MenuSheet, Sheet, Spinner, Toggle } from '../components/ui'
import { bestByExercise } from '../lib/prs'
import { isNative } from '../lib/native'
import { getGymSession, loadReminderSettings, startGymSession, stopGymSession } from '../lib/notifications'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: workout, isLoading, error } = useWorkout(id)
  const { data: profile } = useProfile()
  const { data: allSets = [] } = useAllSets()
  const { data: workouts = [] } = useWorkouts()
  const unit = profile?.unit ?? 'lb'
  const distanceUnit = profile?.distance_unit ?? 'mi'

  const updateWorkout = useUpdateWorkout(id)
  const deleteWorkout = useDeleteWorkout()
  const addExercise = useAddExercise(id)
  const updateWorkoutExercise = useUpdateWorkoutExercise(id)
  const removeExercise = useRemoveExercise(id)
  const addSets = useAddSets(id)
  const updateSets = useUpdateSets(id)
  const replaceSets = useReplaceSets(id)
  const deleteSet = useDeleteSet(id)
  const repeatLast = useRepeatLast(id)

  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [gymActive, setGymActive] = useState(false)
  const [gymAllowed, setGymAllowed] = useState(false)

  useEffect(() => {
    getGymSession().then((s) => setGymActive(!!s && s.workoutId === id))
    loadReminderSettings().then((s) => setGymAllowed(isNative && s.gymEnabled))
  }, [id])

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

  // A workout that never got an exercise is discarded when you leave it.
  const latest = useRef<WorkoutDetail | undefined>(undefined)
  latest.current = workout
  useEffect(() => {
    return () => {
      const w = latest.current
      if (w && w.exercises.length === 0) {
        deleteWorkoutById(w.id).then(() => invalidateAll(qc)).catch(() => {})
        stopGymSession()
      }
    }
  }, [qc])

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

  const saving = updateWorkout.isPending || updateSets.isPending || addSets.isPending || replaceSets.isPending || updateWorkoutExercise.isPending
  const finished = !!workout.finished_at

  const finish = async () => {
    await updateWorkout.mutateAsync({ finished_at: new Date().toISOString() })
    await stopGymSession()
    setGymActive(false)
    nav('/', { replace: true })
  }

  const toggleGym = async (on: boolean) => {
    if (on) await startGymSession(id, workout.title)
    else await stopGymSession()
    setGymActive(on)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pt-safe pb-safe">
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 bg-bg/90 backdrop-blur-xl flex items-center justify-between">
        <button type="button" aria-label="Back" onClick={() => nav(-1)} className="-ml-2 h-10 w-10 flex items-center justify-center text-muted"><Icon.Back /></button>
        <div className="flex items-center gap-2 text-[13px] text-faint">
          {gymActive && <span className="inline-flex items-center gap-1 text-accent"><Icon.Bell /> Gym</span>}
          {saving ? 'Saving…' : 'Saved'}
        </div>
        <button type="button" aria-label="More" onClick={() => setMenu(true)} className="-mr-2 h-10 w-10 flex items-center justify-center text-muted"><Icon.More /></button>
      </div>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); debounced('title', e.target.value) }}
        placeholder="Workout title"
        className="w-full bg-transparent text-[30px] font-bold tracking-tight outline-none placeholder:text-faint mt-1"
        aria-label="Workout title"
      />
      <div className="mt-1 mb-5 flex items-center gap-3">
        <input
          type="date"
          value={workout.date}
          max={format(new Date(), 'yyyy-MM-dd')}
          onChange={(e) => e.target.value && updateWorkout.mutate({ date: e.target.value })}
          className="bg-transparent text-muted text-[15px] outline-none"
          aria-label="Workout date"
        />
        {finished && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent"><Icon.Check /> Finished</span>}
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
            distanceUnit={distanceUnit}
            prevBestKg={prevBest.get(we.exercise_id) ?? 0}
            last={lastSessions.get(we.id)}
            onUpdateSets={(updates) => updateSets.mutate({ updates })}
            onAddSets={(sets) => addSets.mutate({ workoutExerciseId: we.id, sets })}
            onReplaceSets={(sets) => replaceSets.mutate({ workoutExerciseId: we.id, sets })}
            onDeleteSet={(setId) => deleteSet.mutate(setId)}
            onNotes={(n) => updateWorkoutExercise.mutate({ workoutExerciseId: we.id, notes: n })}
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
        placeholder="Workout notes — how did it feel, anything to remember next time…"
        rows={3}
        className="w-full mt-6 px-4 py-3 rounded-[18px] bg-surface border border-border/60 outline-none focus:border-accent/60 placeholder:text-faint resize-none text-[15px]"
        aria-label="Workout notes"
      />

      {workout.exercises.length > 0 && !finished && (
        <Button size="lg" className="w-full mt-4 mb-10" onClick={finish}>
          <Icon.Check /> Finish workout
        </Button>
      )}
      {(workout.exercises.length === 0 || finished) && <div className="mb-10" />}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        workoutTitle={title}
        onPick={(name, kind) => addExercise.mutate({ name, kind, position: workout.exercises.length, unit, distanceUnit })}
      />

      <MenuSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={workout.title || 'Workout'}
        subtitle={format(parseISO(workout.date), 'EEEE, MMM d')}
        items={[
          ...(workout.exercises.length > 0 && !finished ? [{ label: 'Finish workout', sub: 'Marks it done and stops gym reminders', icon: <Icon.Check />, onClick: finish }] : []),
          ...(gymAllowed
            ? [{
                label: "I'm at the gym",
                sub: gymActive ? 'Reminders to log sets are on' : 'Get soft reminders to log your sets',
                icon: gymActive ? <Icon.Bell /> : <Icon.BellOff />,
                keepOpen: true,
                right: <Toggle checked={gymActive} onChange={toggleGym} label="Gym reminders" />,
                onClick: () => toggleGym(!gymActive),
              }]
            : []),
          { label: 'Delete workout', icon: <Icon.Trash />, danger: true, onClick: () => setConfirmDelete(true) },
        ]}
      />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this workout?">
        <p className="text-muted text-[14px] mb-4">All its exercises and sets will be removed. This can't be undone.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" onClick={async () => { latest.current = undefined; await deleteWorkout.mutateAsync(id); await stopGymSession(); nav('/', { replace: true }) }}>Delete</Button>
        </div>
      </Sheet>
    </main>
  )
}
