import { eachDayOfInterval, endOfMonth, format, isToday, startOfMonth } from 'date-fns'
import { useRef } from 'react'
import { Icon } from './ui'
import { tap } from '../lib/haptics'

/** A whole year at a glance: twelve small months, one dot per day, trained days lit. */
export function YearCalendar({
  year,
  onYearChange,
  trainedDates,
  plannedDates = new Set<string>(),
  onPickMonth,
}: {
  year: number
  onYearChange: (year: number) => void
  trainedDates: Set<string>
  plannedDates?: Set<string>
  onPickMonth: (month: Date) => void
}) {
  const touch = useRef<{ x: number; y: number } | null>(null)
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1))
  const thisYear = new Date().getFullYear()
  return (
    <div
      className="bg-surface rounded-[22px] border border-border/60 p-4"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = touch.current
        touch.current = null
        if (!s) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
        if (dx < 0 && year >= thisYear) return
        tap()
        onYearChange(year + (dx < 0 ? 1 : -1))
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <button type="button" aria-label="Previous year" className="h-10 w-10 -ml-2 flex items-center justify-center text-muted" onClick={() => onYearChange(year - 1)}>
          <Icon.ChevronLeft />
        </button>
        <div className="text-[16px] font-semibold tabular">{year}</div>
        <button
          type="button"
          aria-label="Next year"
          className="h-10 w-10 -mr-2 flex items-center justify-center text-muted disabled:opacity-30"
          disabled={year >= thisYear}
          onClick={() => onYearChange(year + 1)}
        >
          <Icon.ChevronRight />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-4">
        {months.map((m) => {
          const first = startOfMonth(m)
          const lead = (first.getDay() + 6) % 7 // Monday-first offset
          const days = eachDayOfInterval({ start: first, end: endOfMonth(m) })
          const trainedCount = days.filter((d) => trainedDates.has(format(d, 'yyyy-MM-dd'))).length
          return (
            <button
              key={m.toISOString()}
              type="button"
              onClick={() => { tap(); onPickMonth(m) }}
              className="press-soft text-left rounded-xl -m-1 p-1 active:bg-surface-2"
              aria-label={`${format(m, 'MMMM yyyy')}, ${trainedCount} ${trainedCount === 1 ? 'day' : 'days'} trained`}
            >
              <div className="flex h-4 items-center justify-between mb-1.5">
                <span className="text-[12px] font-semibold">{format(m, 'MMM')}</span>
                {trainedCount > 0 && <span className="text-[10px] font-medium text-accent tabular">{trainedCount}</span>}
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
                {days.map((d) => {
                  const key = format(d, 'yyyy-MM-dd')
                  const trained = trainedDates.has(key)
                  const planned = !trained && plannedDates.has(key)
                  return (
                    <span
                      key={key}
                      className={`block aspect-square rounded-full ${
                        trained ? 'bg-accent' : planned ? 'border border-accent/70' : 'bg-surface-3'
                      } ${isToday(d) && !trained ? 'ring-1 ring-accent/70' : ''}`}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-faint">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Trained</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-accent/70" /> Planned</span>
        <span className="ml-auto">Tap a month to open it</span>
      </div>
    </div>
  )
}
