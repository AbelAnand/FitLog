import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { Icon } from './ui'

export function Calendar({
  month,
  onMonthChange,
  trainedDates,
  plannedDates = new Set<string>(),
  selected,
  onSelect,
}: {
  month: Date
  onMonthChange: (m: Date) => void
  trainedDates: Set<string>
  plannedDates?: Set<string>
  selected: Date | null
  onSelect: (d: Date) => void
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
  return (
    <div className="bg-surface rounded-[22px] border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <button type="button" aria-label="Previous month" className="h-10 w-10 -ml-2 flex items-center justify-center text-muted" onClick={() => onMonthChange(addMonths(month, -1))}>
          <Icon.ChevronLeft />
        </button>
        <div className="text-[16px] font-semibold">{format(month, 'MMMM yyyy')}</div>
        <button
          type="button"
          aria-label="Next month"
          className="h-10 w-10 -mr-2 flex items-center justify-center text-muted disabled:opacity-30"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <Icon.ChevronRight />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[11px] font-medium text-faint">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const inMonth = isSameMonth(d, month)
          const trained = trainedDates.has(format(d, 'yyyy-MM-dd'))
          const plannedDay = !trained && plannedDates.has(format(d, 'yyyy-MM-dd'))
          const isSel = selected ? isSameDay(d, selected) : false
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(d)}
              className="flex flex-col items-center justify-center h-11"
              aria-label={format(d, 'PPP') + (trained ? ', trained' : plannedDay ? ', planned' : '')}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-[14px] tabular ${
                  trained ? 'bg-accent text-accent-ink font-semibold' : plannedDay ? 'border border-dashed border-accent/80 text-text' : inMonth ? 'text-text' : 'text-faint'
                } ${isSel ? 'ring-2 ring-text' : isToday(d) && !trained && !plannedDay ? 'ring-1 ring-accent/70' : ''}`}
              >
                {d.getDate()}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
