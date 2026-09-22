import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { format, parseISO } from 'date-fns'
import { useProfile, useWorkouts } from '../api/queries'
import { StreakCard } from '../components/StreakCard'
import { NewWorkoutSheet } from '../components/NewWorkoutSheet'
import { Button, EmptyState, Icon, PageTitle, Spinner } from '../components/ui'
import { computeStreak } from '../lib/streak'
import type { WorkoutSummary } from '../api/types'

export function HomePage() {
  const { data: workouts, isLoading } = useWorkouts()
  const { data: profile } = useProfile()
  const [sheet, setSheet] = useState(false)

  const streak = useMemo(() => computeStreak((workouts ?? []).map((w) => w.date), profile?.weekly_goal ?? 4), [workouts, profile])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageTitle eyebrow={format(new Date(), 'EEEE, MMM d')} title={greeting} />

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <StreakCard info={streak} />

          <Button size="lg" className="w-full mt-4" onClick={() => setSheet(true)}>
            <Icon.Plus /> Start workout
          </Button>

          <div className="flex items-baseline justify-between mt-8 mb-3">
            <h2 className="text-[17px] font-semibold">Recent</h2>
            {workouts && workouts.length > 5 && <Link to="/history" className="text-[14px] text-accent font-medium">See all</Link>}
          </div>

          {workouts && workouts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {workouts.slice(0, 5).map((w) => (
                <WorkoutRow key={w.id} w={w} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Icon.Dumbbell />} title="No workouts yet" body="Start your first session and it'll show up here." />
          )}
        </>
      )}

      <NewWorkoutSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}

export function WorkoutRow({ w }: { w: WorkoutSummary }) {
  const d = parseISO(w.date)
  return (
    <Link to={`/workout/${w.id}`} className="flex items-center gap-3 bg-surface rounded-[18px] border border-border/60 p-3.5 active:bg-surface-2">
      <div className="h-12 w-12 shrink-0 rounded-xl bg-surface-2 flex flex-col items-center justify-center leading-none">
        <div className="text-[10px] font-semibold uppercase text-faint">{format(d, 'MMM')}</div>
        <div className="text-[18px] font-bold tabular mt-0.5">{format(d, 'd')}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold truncate">{w.title || 'Workout'}</div>
        <div className="text-[13px] text-muted truncate">
          {w.exerciseNames.length ? w.exerciseNames.join(' · ') : 'No exercises'}
        </div>
      </div>
      <div className="text-[12px] text-faint shrink-0">{w.setCount} sets</div>
    </Link>
  )
}
