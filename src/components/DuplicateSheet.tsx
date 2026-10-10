import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { describeAdded, useDuplicateToDays } from '../api/planning'
import { useWorkouts } from '../api/queries'
import type { WorkoutSummary } from '../api/types'
import { LIMITS } from '../data/limits'
import { tap } from '../lib/haptics'
import { dayKey } from '../lib/splits'
import { toast } from '../lib/toast'
import { Calendar } from './Calendar'
import { Button, Sheet } from './ui'

/**
 * "Duplicate to days…": pick any number of days on a month calendar and get a plan with the same
 * title, exercises and target sets on each. Always plans, whatever the dates. Days that already
 * hold the same plan are skipped and said so.
 */
export function DuplicateSheet({ workout, onClose }: { workout: WorkoutSummary | null; onClose: () => void }) {
  return (
    <Sheet open={!!workout} onClose={onClose} title="Duplicate to days">
      {workout && <DayPicker workout={workout} onClose={onClose} />}
    </Sheet>
  )
}

/** Mounted while the sheet is open, so its choices start afresh every time. */
function DayPicker({ workout, onClose }: { workout: WorkoutSummary; onClose: () => void }) {
  const { data: all = [] } = useWorkouts()
  const duplicate = useDuplicateToDays()
  // Open on the workout's month when it is ahead; otherwise on this month, where the next days are.
  const [month, setMonth] = useState(() => startOfMonth(workout.date > dayKey(new Date()) ? parseISO(workout.date) : new Date()))
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const trained = useMemo(() => new Set(all.filter((w) => !w.is_plan && w.exerciseNames.length > 0).map((w) => w.date)), [all])
  const planned = useMemo(() => new Set(all.filter((w) => w.is_plan && w.exerciseNames.length > 0).map((w) => w.date)), [all])

  const toggle = (d: Date) => {
    const key = dayKey(d)
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else if (next.size >= LIMITS.duplicateDays) {
        toast(`Up to ${LIMITS.duplicateDays} days at a time.`, 'info')
        return s
      } else next.add(key)
      return next
    })
  }

  const confirm = async () => {
    if (!picked.size) return
    tap()
    setBusy(true)
    try {
      const result = await duplicate.mutateAsync(workout.id, [...picked])
      toast(describeAdded(result), 'info', 5000)
      onClose()
    } catch {
      // Reported by the global toast.
    } finally {
      setBusy(false)
    }
  }

  const n = picked.size
  const sorted = [...picked].sort()
  return (
    <>
      <p className="text-muted text-[14px] mb-3">
        Tap the days to plan <span className="text-text font-medium">{workout.title || 'this workout'}</span> on. Each gets a plan with the same exercises and target sets.
      </p>
      <Calendar month={month} onMonthChange={setMonth} trainedDates={trained} plannedDates={planned} selected={null} onSelect={toggle} marked={picked} />
      <div className="mt-3 min-h-[20px] text-[13px] text-muted">
        {n === 0 ? 'No days chosen yet.' : n <= 4 ? sorted.map((d) => format(parseISO(d), 'EEE, MMM d')).join(' · ') : `${format(parseISO(sorted[0]), 'MMM d')} to ${format(parseISO(sorted[n - 1]), 'MMM d')}, ${n} days`}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button size="lg" className="flex-1" disabled={busy || n === 0} onClick={confirm}>
          {busy ? 'Adding…' : n === 0 ? 'Add plans' : `Add ${n} ${n === 1 ? 'plan' : 'plans'}`}
        </Button>
      </div>
    </>
  )
}
