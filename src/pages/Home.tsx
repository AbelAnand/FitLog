import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { useBackupStatus, useProfile, useWorkouts } from '../api/queries'
import { keys } from '../api/keys'
import { db } from '../db'
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
  const { data: backup } = useBackupStatus()

  // A nudge to save a backup file once there is something worth losing and the last one is old.
  const backupDue = useMemo(() => {
    if (!backup || backup.workouts < 3) return false
    const now = Date.now()
    if (backup.snoozedUntil && Date.parse(backup.snoozedUntil) > now) return false
    return !backup.lastBackupAt || now - Date.parse(backup.lastBackupAt) > 30 * 24 * 60 * 60_000
  }, [backup])
  const snoozeBackup = async () => {
    await db.snoozeBackupReminder(new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString())
    qc.invalidateQueries({ queryKey: keys.backup })
  }

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

          {backupDue && (
            <div className="mt-4 rounded-[18px] border border-border/60 bg-surface p-4">
              <div className="text-[15px] font-semibold">Save a backup of your log</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {backup?.lastBackupAt ? 'Your last backup file is over a month old.' : 'Your workouts are kept on this iPhone only.'} A backup file protects them if the phone is lost.
              </div>
              <div className="mt-3 flex gap-2">
                <Link to="/settings" className="inline-flex items-center justify-center h-9 px-3 rounded-xl bg-accent text-accent-ink text-[14px] font-semibold">Open Settings</Link>
                <Button variant="ghost" size="sm" onClick={snoozeBackup}>Not now</Button>
              </div>
            </div>
          )}

          {plans.length > 0 && (
            <>
              <div className="flex items-baseline justify-between mt-8 mb-3">
                <h2 className="text-[17px] font-semibold">Planned</h2>
                {plans.length > 4 && <Link to="/history" className="text-[14px] text-accent font-medium">See calendar</Link>}
              </div>
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
