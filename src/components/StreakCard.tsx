import type { StreakInfo } from '../lib/streak'
import { Icon } from './ui'

export function StreakCard({ info }: { info: StreakInfo }) {
  const pct = Math.min(1, info.thisWeekCount / info.goal)
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-surface border border-border/60 p-5">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted text-[13px] font-medium">
            <span className="text-accent"><Icon.Flame /></span>
            Week streak
          </div>
          <div className="mt-1 text-[44px] leading-none font-bold tracking-tight">
            {info.streak}
            <span className="ml-2 text-[16px] font-medium text-muted">{info.streak === 1 ? 'week' : 'weeks'}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted text-[13px] font-medium">This week</div>
          <div className="mt-1 text-[24px] leading-none font-semibold">
            {info.thisWeekCount}
            <span className="text-muted font-medium"> / {info.goal}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct * 100}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {info.week.map((d) => (
          <div key={d.label + d.date.getDate()} className="flex flex-col items-center gap-1.5">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                d.trained ? 'bg-accent text-accent-ink' : d.isFuture ? 'bg-transparent border border-border text-faint' : 'bg-surface-2 text-muted'
              } ${d.isToday && !d.trained ? 'ring-2 ring-accent/60' : ''}`}
            >
              {d.trained ? '✓' : d.date.getDate()}
            </div>
            <div className={`text-[10px] font-medium ${d.isToday ? 'text-text' : 'text-faint'}`}>{d.label}</div>
          </div>
        ))}
      </div>
      {info.thisWeekDone && <div className="mt-3 text-[13px] text-accent font-medium">Goal hit this week. Keep it rolling.</div>}
    </div>
  )
}
