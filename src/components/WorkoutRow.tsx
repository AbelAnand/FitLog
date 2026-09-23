import { useState } from 'react'
import { useNavigate } from 'react-router'
import { format, parseISO } from 'date-fns'
import { useDeleteWorkout, useSessionControls } from '../api/mutations'
import type { WorkoutSummary } from '../api/types'
import { useLongPress } from '../lib/useLongPress'
import { formatSessionLength, isLiveSession } from '../lib/duration'
import { loadReminderSettings, startGymSession } from '../lib/notifications'
import { isNative } from '../lib/native'
import { tap } from '../lib/haptics'
import { Button, Icon, MenuSheet, Sheet } from './ui'

/** A workout in a list. Tap to open, long-press for actions. Plans get a Start button. */
export function WorkoutRow({ w }: { w: WorkoutSummary }) {
  const nav = useNavigate()
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const del = useDeleteWorkout()
  const session = useSessionControls(w.id)
  const press = useLongPress(() => setMenu(true))
  const d = parseISO(w.date)
  const length = formatSessionLength(w)
  const live = isLiveSession(w)

  const startPlan = async () => {
    tap()
    await session.startPlan()
    if (isNative) {
      const s = await loadReminderSettings()
      if (s.gymEnabled) startGymSession(w.id, w.title)
    }
    nav(`/workout/${w.id}`)
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          {...press}
          onClick={() => nav(`/workout/${w.id}`)}
          className={`w-full text-left flex items-center gap-3 bg-surface rounded-[18px] border p-3.5 active:bg-surface-2 select-none ${w.is_plan ? 'border-dashed border-faint/60' : 'border-border/60'}`}
          style={{ WebkitTouchCallout: 'none' }}
        >
          <div className={`h-12 w-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none ${w.is_plan ? 'bg-transparent border border-dashed border-faint/60' : 'bg-surface-2'}`}>
            <div className="text-[10px] font-semibold uppercase text-faint">{format(d, 'MMM')}</div>
            <div className="text-[18px] font-bold tabular mt-0.5">{format(d, 'd')}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold truncate">{w.title || 'Workout'}</div>
            <div className="text-[13px] text-muted truncate">{w.exerciseNames.length ? w.exerciseNames.join(' · ') : 'No exercises'}</div>
          </div>
          {w.is_plan ? (
            <div className="w-[88px] shrink-0" aria-hidden="true" />
          ) : (
            <div className="text-[12px] text-faint shrink-0 text-right leading-tight">
              <div>{w.setCount} sets</div>
              {live ? <div className="text-accent font-medium">In progress</div> : length ? <div>{length}</div> : w.completedCount > 0 ? <div>{w.completedCount}/{w.exerciseNames.length} done</div> : null}
            </div>
          )}
        </button>
        {w.is_plan && (
          <Button size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" disabled={session.isPending} onClick={startPlan} aria-label={`Start ${w.title}`}>
            <Icon.Play /> Start
          </Button>
        )}
      </div>

      <MenuSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={w.title || 'Workout'}
        subtitle={`${w.is_plan ? 'Planned for ' : ''}${format(d, 'EEEE, MMM d')} · ${w.exerciseNames.length} exercises · ${w.setCount} sets`}
        items={[
          ...(w.is_plan ? [{ label: 'Start this workout', icon: <Icon.Play />, onClick: startPlan }] : []),
          { label: 'Open', icon: <Icon.ChevronRight />, onClick: () => nav(`/workout/${w.id}`) },
          { label: w.is_plan ? 'Delete plan' : 'Delete workout', icon: <Icon.Trash />, danger: true, onClick: () => setConfirm(true) },
        ]}
      />

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={`Delete ${w.title || 'this workout'}?`}>
        <p className="text-muted text-[14px] mb-4">{format(d, 'EEEE, MMM d')}. Its exercises and sets will be removed. This can't be undone.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" disabled={del.isPending} onClick={async () => { await del.mutateAsync(w.id); setConfirm(false) }}>Delete</Button>
        </div>
      </Sheet>
    </>
  )
}
