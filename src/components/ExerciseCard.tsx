import { useEffect, useRef, useState } from 'react'
import type { SetDetail, WorkoutExerciseDetail } from '../api/types'
import { convert, formatWeight, toKg, type Unit } from '../lib/units'
import { Icon, PrBadge } from './ui'

export interface LastSession {
  date: string
  sets: { weight: number; unit: Unit; reps: number }[]
}

export function ExerciseCard({
  we,
  unit,
  prevBestKg,
  last,
  onUpdateSet,
  onAddSet,
  onDeleteSet,
  onRemove,
}: {
  we: WorkoutExerciseDetail
  unit: Unit
  /** Best weight (kg) for this exercise in any other workout. */
  prevBestKg: number
  last?: LastSession
  onUpdateSet: (setId: string, patch: Partial<Pick<SetDetail, 'weight' | 'reps' | 'unit'>>) => void
  onAddSet: () => void
  onDeleteSet: (setId: string) => void
  onRemove: () => void
}) {
  // The first set that reaches the session's top weight above the previous best gets the badge.
  let prSetId: string | null = null
  let topKg = 0
  for (const s of we.sets) {
    if (s.reps <= 0) continue
    const kg = toKg(s.weight, s.unit)
    if (kg > topKg) topKg = kg
  }
  if (topKg > prevBestKg && topKg > 0) {
    prSetId = we.sets.find((s) => s.reps > 0 && toKg(s.weight, s.unit) === topKg)?.id ?? null
  }

  return (
    <div className="bg-surface rounded-[18px] border border-border/60">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold truncate">{we.name}</div>
          {last && last.sets.length > 0 && (
            <div className="mt-0.5 text-[12px] text-muted truncate">
              Last ({last.date}): {last.sets.map((s) => `${formatWeight(convert(s.weight, s.unit, unit))}×${s.reps}`).join(', ')}
            </div>
          )}
        </div>
        <button type="button" aria-label="Remove exercise" onClick={onRemove} className="-mr-2 -mt-1 h-9 w-9 flex items-center justify-center text-faint active:text-danger">
          <Icon.X />
        </button>
      </div>

      <div className="grid grid-cols-[40px_1fr_1fr_44px] gap-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <div>Set</div>
        <div className="text-center">{unit}</div>
        <div className="text-center">Reps</div>
        <div />
      </div>

      <div className="px-4 pb-2 pt-1 flex flex-col gap-1.5">
        {we.sets.map((s) => (
          <SetRow key={s.id} set={s} unit={unit} isPr={s.id === prSetId} onChange={(patch) => onUpdateSet(s.id, patch)} onDelete={() => onDeleteSet(s.id)} />
        ))}
      </div>

      <button type="button" onClick={onAddSet} className="w-full h-11 flex items-center justify-center gap-1.5 text-[14px] font-medium text-accent border-t border-border/50 active:bg-surface-2 rounded-b-[18px]">
        <Icon.Plus /> Add set
      </button>
    </div>
  )
}

function SetRow({
  set,
  unit,
  isPr,
  onChange,
  onDelete,
}: {
  set: SetDetail
  unit: Unit
  isPr: boolean
  onChange: (patch: Partial<Pick<SetDetail, 'weight' | 'reps' | 'unit'>>) => void
  onDelete: () => void
}) {
  // Show the stored weight in the display unit. If the set was logged in another unit,
  // the first edit re-saves it in the current unit.
  const displayWeight = set.unit === unit ? set.weight : convert(set.weight, set.unit, unit)
  const [w, setW] = useState(displayWeight ? formatWeight(displayWeight) : '')
  const [r, setR] = useState(set.reps ? String(set.reps) : '')
  const timer = useRef<number | null>(null)
  const dirty = useRef(false)

  // Sync from server when not mid-edit (e.g. after "repeat last").
  useEffect(() => {
    if (dirty.current) return
    setW(displayWeight ? formatWeight(displayWeight) : '')
    setR(set.reps ? String(set.reps) : '')
  }, [displayWeight, set.reps])

  const commit = (nw: string, nr: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const weight = Math.max(0, parseFloat(nw.replace(',', '.')) || 0)
      const reps = Math.max(0, parseInt(nr, 10) || 0)
      onChange({ weight, reps, unit })
      dirty.current = false
    }, 400)
  }

  const inputClass = 'h-11 w-full rounded-xl bg-surface-2 border border-border/60 text-center text-[17px] font-semibold tabular outline-none focus:border-accent/70 placeholder:text-faint placeholder:font-normal'

  return (
    <div className={`grid grid-cols-[40px_1fr_1fr_44px] gap-2 items-center ${isPr ? 'relative' : ''}`}>
      <div className="h-11 flex items-center">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center text-[13px] font-semibold ${isPr ? 'bg-pr text-accent-ink' : 'bg-surface-2 text-muted'}`}>{set.set_number}</span>
      </div>
      <div className="relative">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0"
          value={w}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            dirty.current = true
            setW(e.target.value)
            commit(e.target.value, r)
          }}
          aria-label={`Set ${set.set_number} weight`}
        />
        {isPr && <PrBadge className="absolute -top-2 -right-1 pointer-events-none" />}
      </div>
      <input
        className={inputClass}
        inputMode="numeric"
        placeholder="0"
        value={r}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          dirty.current = true
          setR(e.target.value.replace(/\D/g, ''))
          commit(w, e.target.value.replace(/\D/g, ''))
        }}
        aria-label={`Set ${set.set_number} reps`}
      />
      <button type="button" aria-label="Delete set" onClick={onDelete} className="h-11 w-11 flex items-center justify-center text-faint active:text-danger">
        <Icon.Trash />
      </button>
    </div>
  )
}
