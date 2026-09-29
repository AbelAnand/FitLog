import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useNavigationType, useParams } from 'react-router'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useAllSets, useProfile, useWorkout, useWorkouts } from '../api/queries'
import { deleteWorkout, editorOpen, useAddExercise, useAddSets, useDeleteSet, useRemoveExercise, useRepeatLast, useReplaceSets, useSessionControls, useUpdateExercise, useUpdateSets, useUpdateWorkout, useUpdateWorkoutExercise } from '../api/mutations'
import { editKey, keys } from '../api/keys'
import type { WorkoutDetail } from '../api/types'
import { ExerciseCard, type LastSession } from '../components/ExerciseCard'
import { ExercisePicker } from '../components/ExercisePicker'
import { SessionSheet } from '../components/SessionSheet'
import { Button, Icon, MenuSheet, Sheet, Spinner } from '../components/ui'
import { bestByExercise } from '../lib/prs'
import { formatClock, formatSessionLength, isLiveSession, useElapsed } from '../lib/duration'
import { isNative } from '../lib/native'
import { getGymSession, loadReminderSettings, startGymSession, stopGymSession } from '../lib/notifications'
import { tap } from '../lib/haptics'
import { useArrivals, useArrived, useLeaving } from '../lib/motion'
import { LIMITS } from '../data/limits'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: workout, isLoading } = useWorkout(id)
  const { data: profile } = useProfile()
  const { data: allSets = [] } = useAllSets()
  const { data: workouts = [] } = useWorkouts()
  const unit = profile?.unit ?? 'lb'
  const distanceUnit = profile?.distance_unit ?? 'mi'

  const updateWorkout = useUpdateWorkout(id)
  const session = useSessionControls(id)
  const addExercise = useAddExercise(id)
  const updateWorkoutExercise = useUpdateWorkoutExercise(id)
  const updateExercise = useUpdateExercise(id)
  const removeExercise = useRemoveExercise(id)
  const addSets = useAddSets(id)
  const updateSets = useUpdateSets(id)
  const replaceSets = useReplaceSets(id)
  const deleteSet = useDeleteSet(id)
  const repeatLast = useRepeatLast(id)

  const navType = useNavigationType()
  const arrivals = useArrivals(!!workout)
  const { leaving, leave: removeCard } = useLeaving((weId) => removeExercise.mutate(weId))

  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState(false)
  const [sessionSheet, setSessionSheet] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [gymActive, setGymActive] = useState(false)

  useEffect(() => {
    getGymSession().then((s) => setGymActive(!!s && s.workoutId === id))
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

  // A workout (or plan) that never got an exercise is discarded when you leave it.
  const discarded = useRef(false)
  useEffect(() => {
    return () => {
      // Checked a tick later so a remount of the same screen doesn't count as leaving.
      window.setTimeout(() => {
        if (discarded.current || editorOpen(qc, id)) return
        const w = qc.getQueryData<WorkoutDetail>(keys.workout(id))
        if (w && w.exercises.length === 0) {
          deleteWorkout(qc, id).catch(() => {})
          stopGymSession()
        }
      }, 0)
    }
  }, [qc, id])

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
    return workouts.find((w) => w.id !== id && !w.is_plan && w.title.trim().toLowerCase() === workout.title.trim().toLowerCase() && w.exerciseNames.length > 0 && w.date <= workout.date) ?? null
  }, [workouts, workout, id])

  const live = !!workout && isLiveSession(workout)
  const paused = !!workout?.paused_at
  const elapsed = useElapsed(workout, live && !paused)
  const saving = useIsMutating({ mutationKey: editKey(id) }) > 0

  if (!workout && isLoading) return <Spinner className="pt-32" />
  if (!workout) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-safe">
        <div className="pt-20 text-center text-muted">Workout not found.</div>
        <Button variant="secondary" className="mx-auto mt-4 block" onClick={() => nav('/')}>Go home</Button>
      </main>
    )
  }

  const plan = workout.is_plan
  const finished = !!workout.finished_at
  const sessionLength = formatSessionLength(workout)
  const plannedExercises = workout.exercises.filter((we) => we.planned)
  const doneCount = plannedExercises.filter((we) => we.completed_at).length

  const gymIfEnabled = async () => {
    if (!isNative) return
    const s = await loadReminderSettings()
    if (s.gymEnabled) {
      await startGymSession(id, workout.title)
      setGymActive(true)
    }
  }

  // None of these wait for the network: the change shows at once and is saved in the background.
  const finish = () => {
    setSessionSheet(false)
    session.finish(workout)
    stopGymSession()
    setGymActive(false)
    nav('/', { replace: true })
  }

  const reopen = () => {
    session.reopen(workout)
  }

  const startPlan = () => {
    tap()
    session.startPlan()
    gymIfEnabled()
  }

  const toggleGym = async (on: boolean) => {
    if (on) await startGymSession(id, workout.title)
    else await stopGymSession()
    setGymActive(on)
  }

  const pause = () => {
    session.pause()
    stopGymSession()
    setGymActive(false)
  }
  const resume = () => {
    session.resume(workout)
    gymIfEnabled()
  }

  const remove = () => {
    discarded.current = true
    deleteWorkout(qc, id).catch(() => {})
    stopGymSession()
    nav('/', { replace: true })
  }

  return (
    <main className={`mx-auto max-w-lg px-4 pb-safe ${navType === 'POP' ? 'page-back' : 'page-push'}`}>
      <div className="sticky top-0 z-30 -mx-4 px-4 pb-2 bg-bg/90 backdrop-blur-xl flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <button type="button" aria-label="Back" onClick={() => nav(-1)} className="press -ml-2 h-10 w-10 flex items-center justify-center text-muted"><Icon.Back /></button>
        <div className="flex items-center gap-2 text-[13px] text-faint">
          {plan && (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold bg-surface-2 text-muted">
              <Icon.CalendarPlus /> Planned
            </span>
          )}
          {live && (
            <button
              type="button"
              onClick={() => { tap(); setSessionSheet(true) }}
              className={`press inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[15px] font-semibold tabular active:brightness-110 ${
                paused ? 'bg-surface-2 text-muted' : gymActive ? 'bg-accent-dim text-accent' : 'bg-surface-2 text-text'
              }`}
              aria-label="Session controls"
            >
              {paused ? <Icon.Pause /> : gymActive ? <Icon.Bell /> : <Icon.Clock />}
              {formatClock(elapsed)}
            </button>
          )}
          <span>{saving ? 'Saving…' : 'Saved'}</span>
        </div>
        <button type="button" aria-label="More" onClick={() => setMenu(true)} className="press -mr-2 h-10 w-10 flex items-center justify-center text-muted"><Icon.More /></button>
      </div>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); debounced('title', e.target.value) }}
        placeholder="Workout title"
        maxLength={LIMITS.workoutTitle}
        className="page-title w-full bg-transparent text-[30px] outline-none placeholder:text-faint mt-1"
        aria-label="Workout title"
      />
      <div className="mt-1 mb-5 flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={workout.date}
          max={plan ? undefined : format(new Date(), 'yyyy-MM-dd')}
          onChange={(e) => e.target.value && updateWorkout.mutate({ date: e.target.value })}
          className="bg-transparent text-muted text-[15px] outline-none"
          aria-label={plan ? 'Planned date' : 'Workout date'}
        />
        {finished && (
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-accent">
            <span className="inline-flex items-center gap-1"><Icon.Check /> Finished{sessionLength ? ` · ${sessionLength}` : ''}</span>
            <button type="button" onClick={reopen} className="text-muted underline underline-offset-2">Resume</button>
          </span>
        )}
        {!plan && !finished && plannedExercises.length > 0 && (
          <span className={`text-[12px] font-medium ${doneCount === plannedExercises.length ? 'text-accent' : 'text-muted'}`}>
            {doneCount} of {plannedExercises.length} planned done
          </span>
        )}
      </div>

      {workout.exercises.length === 0 && previousSameTitle && (
        <button
          type="button"
          disabled={repeatLast.isPending}
          onClick={() => repeatLast.mutate({ sourceWorkoutId: previousSameTitle.id, planned: plan })}
          className="press-soft w-full flex items-center gap-3 rounded-[18px] bg-accent-dim border border-accent/30 p-4 mb-4 text-left active:brightness-110 disabled:opacity-60"
        >
          <span className="text-accent"><Icon.Repeat /></span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-accent">{plan ? 'Base it on last' : 'Repeat last'} {previousSameTitle.title}</div>
            <div className="text-[13px] text-muted truncate">{format(parseISO(previousSameTitle.date), 'MMM d')} · {previousSameTitle.exerciseNames.join(', ')}</div>
          </div>
        </button>
      )}

      <div className="flex flex-col">
        {workout.exercises.map((we) => (
          <ArrivingCard key={we.id} loaded={arrivals} leaving={leaving.has(we.id)}>
          <ExerciseCard
            we={we}
            unit={unit}
            distanceUnit={distanceUnit}
            prevBestKg={prevBest.get(we.exercise_id) ?? 0}
            last={lastSessions.get(we.id)}
            plan={plan}
            onUpdateSets={(updates) => updateSets.mutate({ updates })}
            onAddSets={(sets) => addSets.mutate({ workoutExerciseId: we.id, sets })}
            onReplaceSets={(sets) => replaceSets.mutate({ workoutExerciseId: we.id, sets })}
            onDeleteSet={(setId) => deleteSet.mutate(setId)}
            onNotes={(n) => updateWorkoutExercise.mutate({ workoutExerciseId: we.id, patch: { notes: n } })}
            onComplete={(done) => updateWorkoutExercise.mutate({ workoutExerciseId: we.id, patch: { completed_at: done ? new Date().toISOString() : null } })}
            onMetrics={(metrics) => updateExercise.mutate({ exerciseId: we.exercise_id, patch: { metrics, track_incline: metrics.includes('incline') } })}
            onRemove={() => removeCard(we.id)}
          />
          </ArrivingCard>
        ))}
      </div>

      <Button variant="secondary" size="lg" className="w-full" onClick={() => setPicker(true)}>
        <Icon.Plus /> Add exercise
      </Button>

      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); debounced('notes', e.target.value) }}
        placeholder={plan ? 'Plan notes — focus, targets, anything to remember…' : 'Workout notes — how did it feel, anything to remember next time…'}
        rows={3}
        maxLength={LIMITS.workoutNotes}
        className="w-full mt-6 px-4 py-3 rounded-[18px] bg-surface border border-border/60 outline-none focus:border-accent/60 placeholder:text-faint resize-none text-[15px]"
        aria-label="Workout notes"
      />

      {plan && workout.exercises.length > 0 && (
        <Button size="lg" className="w-full mt-4 mb-10" onClick={startPlan}>
          <Icon.Play /> Start this workout
        </Button>
      )}
      {!plan && workout.exercises.length > 0 && !finished && (
        <Button size="lg" className="w-full mt-4 mb-10" onClick={finish}>
          <Icon.Check /> Finish workout
        </Button>
      )}
      {(workout.exercises.length === 0 || finished) && <div className="mb-10" />}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        workoutTitle={title}
        onPick={(name, kind, exerciseId, trackIncline) => addExercise.mutate({ name, kind, exerciseId, trackIncline, position: (workout.exercises.at(-1)?.position ?? -1) + 1, unit, distanceUnit, planned: plan })}
      />

      <SessionSheet
        open={sessionSheet}
        onClose={() => setSessionSheet(false)}
        workout={workout}
        elapsed={elapsed}
        gymActive={gymActive}
        onGymChange={toggleGym}
        onPause={pause}
        onResume={resume}
        onFinish={finish}
        busy={false}
      />

      <MenuSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={workout.title || 'Workout'}
        subtitle={`${plan ? 'Planned for ' : ''}${format(parseISO(workout.date), 'EEEE, MMM d')}`}
        items={[
          ...(plan && workout.exercises.length > 0 ? [{ label: 'Start this workout', sub: 'Turns the plan into today\'s session', icon: <Icon.Play />, onClick: startPlan }] : []),
          ...(live ? [{ label: 'Session & reminders', sub: paused ? 'Paused' : `${formatClock(elapsed)} elapsed`, icon: <Icon.Clock />, onClick: () => setSessionSheet(true) }] : []),
          ...(!plan && !finished && workout.exercises.length > 0 ? [{ label: 'Finish workout', sub: 'Marks it done and stops gym reminders', icon: <Icon.Check />, onClick: finish }] : []),
          ...(finished ? [{ label: 'Resume workout', sub: 'Reopens it; time away is not counted', icon: <Icon.Play />, onClick: reopen }] : []),
          { label: plan ? 'Delete plan' : 'Delete workout', icon: <Icon.Trash />, danger: true, onClick: () => setConfirmDelete(true) },
        ]}
      />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={plan ? 'Delete this plan?' : 'Delete this workout?'}>
        <p className="text-muted text-[14px] mb-4">All its exercises and sets will be removed. This can't be undone.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" onClick={remove}>Delete</Button>
        </div>
      </Sheet>
    </main>
  )
}

/** An exercise card: eases in if it was added while you watched, closes up when removed. */
function ArrivingCard({ loaded, leaving, children }: { loaded: React.RefObject<boolean>; leaving: boolean; children: React.ReactNode }) {
  const arrived = useArrived(loaded)
  return (
    <div className={`collapsible ${leaving ? 'leaving' : ''}`}>
      <div className={`pb-3 ${arrived ? 'rise-in' : ''}`}>{children}</div>
    </div>
  )
}
