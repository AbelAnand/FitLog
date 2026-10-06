import { useMemo, useState } from 'react'
import { format, isSameMonth, isSameYear, parseISO, startOfMonth } from 'date-fns'
import { useWorkouts } from '../api/queries'
import { Calendar } from '../components/Calendar'
import { YearCalendar } from '../components/YearCalendar'
import { EmptyState, Icon, PageTitle, Segmented, Spinner } from '../components/ui'
import { WorkoutRow } from '../components/WorkoutRow'

export function HistoryPage() {
  const { data: all = [], isLoading } = useWorkouts()
  const workouts = useMemo(() => all.filter((w) => w.exerciseNames.length > 0 && !w.is_plan), [all])
  const plans = useMemo(() => all.filter((w) => w.is_plan && w.exerciseNames.length > 0), [all])
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)
  const [view, setView] = useState<'month' | 'year'>('month')

  const trained = useMemo(() => new Set(workouts.map((w) => w.date)), [workouts])
  const planned = useMemo(() => new Set(plans.map((w) => w.date)), [plans])
  const list = useMemo(() => {
    if (selected) {
      const key = format(selected, 'yyyy-MM-dd')
      return [...plans.filter((w) => w.date === key), ...workouts.filter((w) => w.date === key)]
    }
    return [...plans.filter((w) => isSameMonth(parseISO(w.date), month)).sort((a, b) => a.date.localeCompare(b.date)), ...workouts.filter((w) => isSameMonth(parseISO(w.date), month))]
  }, [workouts, plans, selected, month])

  const yearWorkouts = useMemo(() => workouts.filter((w) => isSameYear(parseISO(w.date), month)), [workouts, month])
  const yearDays = useMemo(() => new Set(yearWorkouts.map((w) => w.date)).size, [yearWorkouts])
  const heading = view === 'year'
    ? `${format(month, 'yyyy')} · ${yearWorkouts.length} ${yearWorkouts.length === 1 ? 'workout' : 'workouts'}${yearDays && yearDays !== yearWorkouts.length ? ` on ${yearDays} days` : ''}`
    : selected ? format(selected, 'EEEE, MMM d') : `${format(month, 'MMMM')} · ${list.length} ${list.length === 1 ? 'workout' : 'workouts'}`

  return (
    <>
      <PageTitle title="History" right={<Segmented value={view} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} onChange={(v) => { setView(v); setSelected(null) }} />} />
      {isLoading ? (
        <Spinner />
      ) : view === 'year' ? (
        <>
          <YearCalendar
            year={month.getFullYear()}
            onYearChange={(y) => setMonth(new Date(y, month.getMonth(), 1))}
            trainedDates={trained}
            plannedDates={planned}
            onPickMonth={(m) => { setMonth(startOfMonth(m)); setSelected(null); setView('month') }}
          />
          <div className="flex items-baseline justify-between mt-6 mb-3">
            <h2 className="text-[17px] font-semibold">{heading}</h2>
          </div>
          {yearWorkouts.length === 0 && <EmptyState icon={<Icon.Calendar />} title="Nothing this year" body="Pick another year, or start a workout from Home." />}
        </>
      ) : (
        <>
          <Calendar
            month={month}
            onMonthChange={(m) => { setMonth(m); setSelected(null) }}
            trainedDates={trained}
            plannedDates={planned}
            selected={selected}
            onSelect={(d) => setSelected((s) => (s && format(s, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd') ? null : d))}
          />
          <div className="flex items-baseline justify-between mt-6 mb-3">
            <h2 className="text-[17px] font-semibold">{heading}</h2>
            {selected && <button type="button" className="text-[14px] text-accent font-medium" onClick={() => setSelected(null)}>Show month</button>}
          </div>
          {list.length ? (
            <div className="flex flex-col gap-2">
              {list.map((w) => <WorkoutRow key={w.id} w={w} />)}
            </div>
          ) : (
            <EmptyState icon={<Icon.Calendar />} title={selected ? 'Rest day' : 'Nothing this month'} body={selected ? 'No workout logged on this day.' : 'Pick another month or start a workout from Home.'} />
          )}
        </>
      )}
    </>
  )
}
