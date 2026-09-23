import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile, useWorkouts } from '../api/queries'
import { deleteEmptyWorkouts } from '../api/mutations'
import { StreakCard } from '../components/StreakCard'
import { NewWorkoutSheet } from '../components/NewWorkoutSheet'
import { WorkoutRow } from '../components/WorkoutRow'
import { Button, EmptyState, Icon, PageTitle, Spinner } from '../components/ui'
import { computeStreak } from '../lib/streak'
import { syncDailyReminder } from '../lib/notifications'
import { updateWidget } from '../lib/widget'

export function HomePage() {
  const { data: workouts, isLoading } = useWorkouts()
  const { data: profile } = useProfile()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState(false)
  const [sheetMode, setSheetMode] = useState<'now' | 'plan'>('now')

  // Widget deep link (fitlog://start) and notification taps land on /?start=1.
  useEffect(() => {
    if (params.get('start') === '1') {
      setSheet(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const nonEmpty = useMemo(() => (workouts ?? []).filter((w) => w.exerciseNames.length > 0 && !w.is_plan), [workouts])
  const plans = useMemo(() => (workouts ?? []).filter((w) => w.is_plan && w.exerciseNames.length > 0).sort((a, b) => a.date.localeCompare(b.date)), [workouts])
  const streak = useMemo(() => computeStreak(nonEmpty.map((w) => w.date), profile?.weekly_goal ?? 4), [nonEmpty, profile])

  // Housekeeping: drop abandoned empty workouts, refresh reminders and the home-screen widget.
  useEffect(() => {
    if (!workouts) return
    if (workouts.some((w) => w.exerciseNames.length === 0)) deleteEmptyWorkouts(qc, undefined, 2 * 60_000)
    syncDailyReminder(nonEmpty.map((w) => w.date))
    const last = nonEmpty[0]
    updateWidget({
      streak: streak.streak,
      thisWeek: streak.thisWeekCount,
      goal: streak.goal,
      week: streak.week.map((d) => (d.trained ? 1 : 0)),
      todayIndex: streak.week.findIndex((d) => d.isToday),
      lastTitle: last?.title ?? '',
      lastDate: last?.date ?? '',
      updatedAt: Date.now(),
    })
  }, [workouts, nonEmpty, streak, qc])

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

          <div className="grid grid-cols-[1fr_auto] gap-2 mt-4">
            <Button size="lg" onClick={() => { setSheetMode('now'); setSheet(true) }}>
              <Icon.Plus /> Start workout
            </Button>
            <Button size="lg" variant="secondary" aria-label="Plan a workout" onClick={() => { setSheetMode('plan'); setSheet(true) }}>
              <Icon.CalendarPlus />
            </Button>
          </div>

          {plans.length > 0 && (
            <>
              <h2 className="text-[17px] font-semibold mt-8 mb-3">Planned</h2>
              <div className="flex flex-col gap-2">
                {plans.slice(0, 4).map((w) => (
                  <WorkoutRow key={w.id} w={w} />
                ))}
              </div>
            </>
          )}

          <div className="flex items-baseline justify-between mt-8 mb-3">
            <h2 className="text-[17px] font-semibold">Recent</h2>
            {nonEmpty.length > 5 && <Link to="/history" className="text-[14px] text-accent font-medium">See all</Link>}
          </div>

          {nonEmpty.length > 0 ? (
            <div className="flex flex-col gap-2">
              {nonEmpty.slice(0, 5).map((w) => (
                <WorkoutRow key={w.id} w={w} />
              ))}
              <div className="text-center text-[12px] text-faint mt-1">Hold a workout for options</div>
            </div>
          ) : (
            <EmptyState icon={<Icon.Dumbbell />} title="No workouts yet" body="Start your first session and it'll show up here." />
          )}
        </>
      )}

      <NewWorkoutSheet open={sheet} onClose={() => setSheet(false)} initialMode={sheetMode} />
    </>
  )
}
