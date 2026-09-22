import { useMemo, useState } from 'react'
import { format, isSameMonth, parseISO } from 'date-fns'
import { useWorkouts } from '../api/queries'
import { Calendar } from '../components/Calendar'
import { EmptyState, Icon, PageTitle, Spinner } from '../components/ui'
import { WorkoutRow } from './Home'

export function HistoryPage() {
  const { data: workouts = [], isLoading } = useWorkouts()
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)

  const trained = useMemo(() => new Set(workouts.map((w) => w.date)), [workouts])
  const list = useMemo(() => {
    if (selected) {
      const key = format(selected, 'yyyy-MM-dd')
      return workouts.filter((w) => w.date === key)
    }
    return workouts.filter((w) => isSameMonth(parseISO(w.date), month))
  }, [workouts, selected, month])

  const heading = selected ? format(selected, 'EEEE, MMM d') : `${format(month, 'MMMM')} · ${list.length} ${list.length === 1 ? 'workout' : 'workouts'}`

  return (
    <>
      <PageTitle title="History" />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <Calendar
            month={month}
            onMonthChange={(m) => { setMonth(m); setSelected(null) }}
            trainedDates={trained}
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
