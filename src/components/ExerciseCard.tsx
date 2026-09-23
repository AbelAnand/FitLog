import { useEffect, useMemo, useRef, useState } from 'react'
import type { SetDetail, SetPatch, SetType, WorkoutExerciseDetail } from '../api/types'
import type { NewSet } from '../api/mutations'
import { tap } from '../lib/haptics'
import { convert, convertDistance, formatDistance, formatDuration, formatPace, formatWeight, parseDuration, stepFor, toKg, toKm, type DistanceUnit, type Unit } from '../lib/units'
import { Button, Icon, MenuSheet, PrBadge, Segmented, Sheet, Stepper, Toggle } from './ui'

export interface LastSession {
  date: string
  sets: Pick<SetDetail, 'weight' | 'unit' | 'reps' | 'set_type' | 'duration_seconds' | 'distance' | 'distance_unit'>[]
}

const TYPE_LABEL: Record<SetType, string> = { warmup: 'Warm-up', working: 'Working', drop: 'Drop set', failure: 'To failure' }
const TYPE_SHORT: Record<SetType, string> = { warmup: 'W', working: '', drop: 'D', failure: 'F' }

function isBlank(s: SetDetail, cardio: boolean) {
  return cardio ? !s.duration_seconds && !s.distance : s.weight === 0 && s.reps === 0
}

export function ExerciseCard({
  we,
  unit,
  distanceUnit,
  prevBestKg,
  last,
  onUpdateSets,
  onAddSets,
  onReplaceSets,
  onDeleteSet,
  onNotes,
  onRemove,
}: {
  we: WorkoutExerciseDetail
  unit: Unit
  distanceUnit: DistanceUnit
  /** Best weight (kg) for this exercise in any other workout. */
  prevBestKg: number
  last?: LastSession
  onUpdateSets: (updates: { setId: string; patch: SetPatch }[]) => void
  onAddSets: (sets: NewSet[]) => void
  onReplaceSets: (sets: NewSet[]) => void
  onDeleteSet: (setId: string) => void
  onNotes: (notes: string) => void
  onRemove: () => void
}) {
  const cardio = we.kind === 'cardio'
  const [menu, setMenu] = useState(false)
  const [rowMenu, setRowMenu] = useState<SetDetail | null>(null)
  const [quick, setQuick] = useState(false)
  const [showNotes, setShowNotes] = useState(!!we.notes)
  const [notes, setNotes] = useState(we.notes)
  const notesTimer = useRef<number | null>(null)
  useEffect(() => { if (we.notes) setShowNotes(true) }, [we.notes])

  // PR: the first working set reaching the session's top weight above the previous best.
  const prSetId = useMemo(() => {
    if (cardio) return null
    let topKg = 0
    for (const s of we.sets) if (s.reps > 0 && s.set_type !== 'warmup') topKg = Math.max(topKg, toKg(s.weight, s.unit))
    if (topKg <= prevBestKg || topKg === 0) return null
    return we.sets.find((s) => s.reps > 0 && s.set_type !== 'warmup' && toKg(s.weight, s.unit) === topKg)?.id ?? null
  }, [we.sets, prevBestKg, cardio])

  // Working-set numbering skips warm-ups so "set 1" is the first real set.
  const numbers = useMemo(() => {
    let n = 0
    return we.sets.map((s) => (s.set_type === 'warmup' ? TYPE_SHORT.warmup : String(++n)))
  }, [we.sets])

  const lastSet = we.sets.at(-1)

  /** Change one set, and fill the same field down into untouched sets below it. */
  const changeSet = (set: SetDetail, patch: SetPatch) => {
    const idx = we.sets.findIndex((s) => s.id === set.id)
    const updates: { setId: string; patch: SetPatch }[] = [{ setId: set.id, patch }]
    for (const below of we.sets.slice(idx + 1)) {
      if (!isBlank(below, cardio)) break
      updates.push({ setId: below.id, patch })
    }
    onUpdateSets(updates)
  }

  const addSet = (type: SetType = 'working') => {
    tap()
    onAddSets([
      {
        set_number: (lastSet?.set_number ?? 0) + 1,
        weight: lastSet?.weight ?? 0,
        reps: lastSet?.reps ?? 0,
        unit: lastSet?.unit ?? unit,
        set_type: type,
        duration_seconds: lastSet?.duration_seconds ?? null,
        distance: lastSet?.distance ?? null,
        distance_unit: cardio ? lastSet?.distance_unit ?? distanceUnit : null,
      },
    ])
  }

  const duplicate = (s: SetDetail) => {
    onAddSets([{ set_number: (lastSet?.set_number ?? 0) + 1, weight: s.weight, reps: s.reps, unit: s.unit, set_type: s.set_type, duration_seconds: s.duration_seconds, distance: s.distance, distance_unit: s.distance_unit }])
  }

  const copyToBelow = (s: SetDetail) => {
    const idx = we.sets.findIndex((x) => x.id === s.id)
    const patch: SetPatch = cardio ? { duration_seconds: s.duration_seconds, distance: s.distance, distance_unit: s.distance_unit } : { weight: s.weight, reps: s.reps, unit: s.unit }
    onUpdateSets(we.sets.slice(idx + 1).map((b) => ({ setId: b.id, patch })))
  }

  const useLast = () => {
    if (!last) return
    onReplaceSets(
      last.sets.map((s, i) => ({
        set_number: i + 1,
        weight: s.weight,
        reps: s.reps,
        unit: s.unit,
        set_type: s.set_type,
        duration_seconds: s.duration_seconds,
        distance: s.distance,
        distance_unit: s.distance_unit,
      })),
    )
  }

  const lastLine = last?.sets.length
    ? last.sets
        .map((s) =>
          cardio
            ? `${s.duration_seconds ? formatDuration(s.duration_seconds) : '–'}${s.distance ? ` · ${formatDistance(convertDistance(s.distance, s.distance_unit ?? distanceUnit, distanceUnit))} ${distanceUnit}` : ''}`
            : `${s.set_type === 'warmup' ? 'W ' : ''}${formatWeight(convert(s.weight, s.unit, unit))}×${s.reps}`,
        )
        .join(', ')
    : null

  // Cardio totals
  const totals = useMemo(() => {
    if (!cardio) return null
    let sec = 0
    let km = 0
    for (const s of we.sets) {
      sec += s.duration_seconds ?? 0
      km += s.distance ? toKm(s.distance, s.distance_unit ?? distanceUnit) : 0
    }
    const dist = km ? convertDistance(km, 'km', distanceUnit) : 0
    return { sec, dist }
  }, [we.sets, cardio, distanceUnit])

  return (
    <div className="bg-surface rounded-[18px] border border-border/60">
      <div className="flex items-start justify-between pl-4 pr-1 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[17px] font-semibold truncate">{we.name}</div>
            {cardio && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted bg-surface-2 rounded px-1.5 py-0.5">Cardio</span>}
          </div>
          {lastLine && (
            <button type="button" onClick={() => { tap(); useLast() }} className="mt-0.5 max-w-full flex items-center gap-1.5 text-[12px] text-muted active:text-text">
              <span className="truncate">Last ({last!.date}): {lastLine}</span>
              <span className="shrink-0 text-accent font-medium">Use</span>
            </button>
          )}
        </div>
        <div className="flex shrink-0">
          <button type="button" aria-label="Exercise notes" onClick={() => { tap(); setShowNotes((v) => !v) }} className={`h-10 w-10 flex items-center justify-center ${showNotes || we.notes ? 'text-accent' : 'text-faint'}`}>
            <Icon.Note />
          </button>
          <button type="button" aria-label="Exercise options" onClick={() => { tap(); setMenu(true) }} className="h-10 w-10 flex items-center justify-center text-faint">
            <Icon.More />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[40px_1fr_1fr_44px] gap-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <div>Set</div>
        <div className="text-center">{cardio ? 'Time' : unit}</div>
        <div className="text-center">{cardio ? distanceUnit : 'Reps'}</div>
        <div />
      </div>

      <div className="px-4 pb-2 pt-1 flex flex-col gap-1.5">
        {we.sets.map((s, i) =>
          cardio ? (
            <CardioRow key={s.id} set={s} label={numbers[i]} distanceUnit={distanceUnit} onChange={(p) => changeSet(s, p)} onMenu={() => setRowMenu(s)} />
          ) : (
            <StrengthRow key={s.id} set={s} label={numbers[i]} unit={unit} isPr={s.id === prSetId} onChange={(p) => changeSet(s, p)} onMenu={() => setRowMenu(s)} />
          ),
        )}
      </div>

      {totals && (totals.sec > 0 || totals.dist > 0) && (
        <div className="px-4 pb-2 text-[12px] text-muted tabular">
          Total {formatDuration(totals.sec)}{totals.dist ? ` · ${formatDistance(totals.dist)} ${distanceUnit} · ${formatPace(totals.sec, totals.dist, distanceUnit)}` : ''}
        </div>
      )}

      {showNotes && (
        <div className="px-4 pb-3">
          <textarea
            value={notes}
            autoFocus={!we.notes}
            onChange={(e) => {
              setNotes(e.target.value)
              if (notesTimer.current) window.clearTimeout(notesTimer.current)
              notesTimer.current = window.setTimeout(() => onNotes(e.target.value), 500)
            }}
            placeholder={`Notes for ${we.name}…`}
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border/60 outline-none focus:border-accent/60 placeholder:text-faint resize-none text-[14px]"
            aria-label={`${we.name} notes`}
          />
        </div>
      )}

      <div className="grid grid-cols-2 border-t border-border/50">
        <button type="button" onClick={() => addSet()} className="h-11 flex items-center justify-center gap-1.5 text-[14px] font-medium text-accent active:bg-surface-2 rounded-bl-[18px]">
          <Icon.Plus /> {cardio ? 'Add interval' : 'Add set'}
        </button>
        <button type="button" onClick={() => { tap(); setQuick(true) }} className="h-11 flex items-center justify-center gap-1.5 text-[14px] font-medium text-muted border-l border-border/50 active:bg-surface-2 rounded-br-[18px]">
          <Icon.Rows /> Quick fill
        </button>
      </div>

      <MenuSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={we.name}
        items={[
          ...(cardio ? [] : [{ label: 'Add warm-up set', sub: 'Lighter set, excluded from PRs and volume', icon: <Icon.Flag />, onClick: () => addSet('warmup') }]),
          { label: 'Quick fill sets…', sub: 'Several sets at the same weight and reps', icon: <Icon.Rows />, onClick: () => setQuick(true) },
          ...(last?.sets.length ? [{ label: 'Use last session', sub: `${last.date}: ${lastLine}`, icon: <Icon.Repeat />, onClick: useLast }] : []),
          { label: we.notes || showNotes ? 'Edit notes' : 'Add notes', icon: <Icon.Note />, onClick: () => setShowNotes(true) },
          { label: 'Remove exercise', sub: 'Deletes its sets from this workout', icon: <Icon.Trash />, danger: true, onClick: onRemove },
        ]}
      />

      <RowMenu
        set={rowMenu}
        cardio={cardio}
        onClose={() => setRowMenu(null)}
        onType={(t) => rowMenu && onUpdateSets([{ setId: rowMenu.id, patch: { set_type: t } }])}
        onDuplicate={() => rowMenu && duplicate(rowMenu)}
        onCopyBelow={() => rowMenu && copyToBelow(rowMenu)}
        onDelete={() => rowMenu && onDeleteSet(rowMenu.id)}
        hasBelow={!!rowMenu && we.sets.findIndex((s) => s.id === rowMenu.id) < we.sets.length - 1}
      />

      <QuickFill
        open={quick}
        onClose={() => setQuick(false)}
        cardio={cardio}
        unit={unit}
        distanceUnit={distanceUnit}
        seed={lastSet ?? null}
        existing={we.sets.filter((s) => !isBlank(s, cardio)).length}
        onAdd={(sets) => onAddSets(sets.map((s, i) => ({ ...s, set_number: (lastSet?.set_number ?? 0) + i + 1 })))}
        onReplace={(sets) => onReplaceSets(sets)}
      />
    </div>
  )
}

/* ---------- Rows ---------- */

const inputClass = 'h-11 w-full rounded-xl bg-surface-2 border border-border/60 text-center text-[17px] font-semibold tabular outline-none focus:border-accent/70 placeholder:text-faint placeholder:font-normal'

function Badge({ label, type, isPr, onClick }: { label: string; type: SetType; isPr: boolean; onClick: () => void }) {
  const cls = isPr ? 'bg-pr text-accent-ink' : type === 'warmup' ? 'bg-surface-3 text-muted' : type === 'drop' || type === 'failure' ? 'bg-accent-dim text-accent' : 'bg-surface-2 text-muted'
  return (
    <button type="button" onClick={() => { tap(); onClick() }} aria-label={`Set options (${TYPE_LABEL[type]})`} className="h-11 flex items-center">
      <span className={`h-7 min-w-7 px-1 rounded-lg flex items-center justify-center text-[13px] font-semibold ${cls}`}>
        {label}{type === 'drop' || type === 'failure' ? TYPE_SHORT[type] : ''}
      </span>
    </button>
  )
}

function useLocalField(serverValue: string, commit: (v: string) => void, delay = 400) {
  const [v, setV] = useState(serverValue)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (!dirty.current) setV(serverValue)
  }, [serverValue])
  const onChange = (next: string) => {
    dirty.current = true
    setV(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      commit(next)
      dirty.current = false
    }, delay)
  }
  const flush = () => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
      commit(v)
      dirty.current = false
    }
  }
  return { v, onChange, flush }
}

function StrengthRow({ set, label, unit, isPr, onChange, onMenu }: { set: SetDetail; label: string; unit: Unit; isPr: boolean; onChange: (p: SetPatch) => void; onMenu: () => void }) {
  const displayWeight = set.unit === unit ? set.weight : convert(set.weight, set.unit, unit)
  const w = useLocalField(displayWeight ? formatWeight(displayWeight) : '', (s) => onChange({ weight: Math.max(0, parseFloat(s.replace(',', '.')) || 0), unit }))
  const r = useLocalField(set.reps ? String(set.reps) : '', (s) => onChange({ reps: Math.max(0, parseInt(s, 10) || 0) }))
  return (
    <div className="grid grid-cols-[40px_1fr_1fr_44px] gap-2 items-center">
      <Badge label={label} type={set.set_type} isPr={isPr} onClick={onMenu} />
      <div className="relative">
        <input className={inputClass} inputMode="decimal" placeholder="0" value={w.v} onFocus={(e) => e.target.select()} onBlur={w.flush} onChange={(e) => w.onChange(e.target.value)} aria-label={`Set ${label} weight`} />
        {isPr && <PrBadge className="absolute -top-2 -right-1 pointer-events-none" />}
      </div>
      <input className={inputClass} inputMode="numeric" placeholder="0" value={r.v} onFocus={(e) => e.target.select()} onBlur={r.flush} onChange={(e) => r.onChange(e.target.value.replace(/\D/g, ''))} aria-label={`Set ${label} reps`} />
      <button type="button" aria-label="Set options" onClick={() => { tap(); onMenu() }} className="h-11 w-11 flex items-center justify-center text-faint active:text-text">
        <Icon.More />
      </button>
    </div>
  )
}

function CardioRow({ set, label, distanceUnit, onChange, onMenu }: { set: SetDetail; label: string; distanceUnit: DistanceUnit; onChange: (p: SetPatch) => void; onMenu: () => void }) {
  const t = useLocalField(set.duration_seconds ? formatDuration(set.duration_seconds) : '', (s) => onChange({ duration_seconds: parseDuration(s) }))
  const displayDist = set.distance == null ? null : convertDistance(set.distance, set.distance_unit ?? distanceUnit, distanceUnit)
  const d = useLocalField(displayDist ? formatDistance(displayDist) : '', (s) => {
    const n = parseFloat(s.replace(',', '.'))
    onChange({ distance: Number.isFinite(n) && n > 0 ? n : null, distance_unit: distanceUnit })
  })
  return (
    <div className="grid grid-cols-[40px_1fr_1fr_44px] gap-2 items-center">
      <Badge label={label} type={set.set_type} isPr={false} onClick={onMenu} />
      <input className={inputClass} inputMode="numeric" placeholder="mm:ss" value={t.v} onFocus={(e) => e.target.select()} onBlur={t.flush} onChange={(e) => t.onChange(e.target.value.replace(/[^\d:hms]/gi, ''))} aria-label={`Interval ${label} time`} />
      <input className={inputClass} inputMode="decimal" placeholder="0" value={d.v} onFocus={(e) => e.target.select()} onBlur={d.flush} onChange={(e) => d.onChange(e.target.value)} aria-label={`Interval ${label} distance`} />
      <button type="button" aria-label="Interval options" onClick={() => { tap(); onMenu() }} className="h-11 w-11 flex items-center justify-center text-faint active:text-text">
        <Icon.More />
      </button>
    </div>
  )
}

/* ---------- Row menu ---------- */

function RowMenu({ set, cardio, hasBelow, onClose, onType, onDuplicate, onCopyBelow, onDelete }: { set: SetDetail | null; cardio: boolean; hasBelow: boolean; onClose: () => void; onType: (t: SetType) => void; onDuplicate: () => void; onCopyBelow: () => void; onDelete: () => void }) {
  const types: SetType[] = cardio ? ['warmup', 'working'] : ['warmup', 'working', 'drop', 'failure']
  return (
    <Sheet open={!!set} onClose={onClose} title={cardio ? 'Interval' : 'Set'}>
      {set && (
        <>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-faint mb-2">Type</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { tap(); onType(t); onClose() }}
                className={`h-12 rounded-xl text-[15px] font-medium ${set.set_type === t ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-text'}`}
              >
                {cardio && t === 'working' ? 'Interval' : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden">
            <button type="button" onClick={() => { tap(); onDuplicate(); onClose() }} className="w-full flex items-center gap-3 px-4 h-[54px] text-left active:bg-surface-3">
              <span className="text-muted"><Icon.Copy /></span>
              <span className="text-[16px] font-medium">Duplicate {cardio ? 'interval' : 'set'}</span>
            </button>
            {hasBelow && (
              <button type="button" onClick={() => { tap(); onCopyBelow(); onClose() }} className="w-full flex items-center gap-3 px-4 h-[54px] text-left active:bg-surface-3">
                <span className="text-muted"><Icon.Rows /></span>
                <span className="text-[16px] font-medium">Copy to all {cardio ? 'intervals' : 'sets'} below</span>
              </button>
            )}
            <button type="button" onClick={() => { tap(); onDelete(); onClose() }} className="w-full flex items-center gap-3 px-4 h-[54px] text-left text-danger active:bg-surface-3">
              <Icon.Trash />
              <span className="text-[16px] font-medium">Delete {cardio ? 'interval' : 'set'}</span>
            </button>
          </div>
          <Button variant="secondary" size="lg" className="w-full mt-3" onClick={onClose}>Cancel</Button>
        </>
      )}
    </Sheet>
  )
}

/* ---------- Quick fill ---------- */

function QuickFill({ open, onClose, cardio, unit, distanceUnit, seed, existing, onAdd, onReplace }: {
  open: boolean
  onClose: () => void
  cardio: boolean
  unit: Unit
  distanceUnit: DistanceUnit
  seed: SetDetail | null
  existing: number
  onAdd: (sets: Omit<NewSet, 'set_number'>[]) => void
  onReplace: (sets: NewSet[]) => void
}) {
  const [count, setCount] = useState(3)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [time, setTime] = useState('')
  const [dist, setDist] = useState('')
  const [warmup, setWarmup] = useState(false)
  const [mode, setMode] = useState<'add' | 'replace'>('replace')

  useEffect(() => {
    if (!open) return
    const w = seed && seed.weight ? convert(seed.weight, seed.unit, unit) : 0
    setWeight(w ? formatWeight(w) : '')
    setReps(seed?.reps ? String(seed.reps) : '')
    setTime(seed?.duration_seconds ? formatDuration(seed.duration_seconds) : '')
    setDist(seed?.distance ? formatDistance(convertDistance(seed.distance, seed.distance_unit ?? distanceUnit, distanceUnit)) : '')
    setMode(existing > 0 ? 'add' : 'replace')
    setWarmup(false)
  }, [open, seed, unit, distanceUnit, existing])

  const build = (): Omit<NewSet, 'set_number'>[] => {
    const out: Omit<NewSet, 'set_number'>[] = []
    if (cardio) {
      const sec = parseDuration(time)
      const d = parseFloat(dist.replace(',', '.'))
      for (let i = 0; i < count; i++) out.push({ weight: 0, reps: 0, unit, set_type: 'working', duration_seconds: sec, distance: Number.isFinite(d) && d > 0 ? d : null, distance_unit: distanceUnit })
      return out
    }
    const w = Math.max(0, parseFloat(weight.replace(',', '.')) || 0)
    const r = Math.max(0, parseInt(reps, 10) || 0)
    if (warmup && w > 0) {
      const step = stepFor(unit)
      const wu = Math.max(step, Math.round((w * 0.5) / step) * step)
      out.push({ weight: wu, reps: Math.max(r, 8), unit, set_type: 'warmup' })
    }
    for (let i = 0; i < count; i++) out.push({ weight: w, reps: r, unit, set_type: 'working' })
    return out
  }

  const go = () => {
    tap()
    const sets = build()
    if (mode === 'replace' || existing === 0) onReplace(sets.map((s, i) => ({ ...s, set_number: i + 1 })))
    else onAdd(sets)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Quick fill">
      <p className="text-[13px] text-muted mb-4">{cardio ? 'Log several identical intervals in one go.' : 'Log several identical sets in one go, like 3 × 8 at 185.'}</p>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[15px] font-medium">{cardio ? 'Intervals' : 'Sets'}</div>
        <Stepper value={count} min={1} max={12} onChange={setCount} />
      </div>

      {cardio ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Time" value={time} onChange={(v) => setTime(v.replace(/[^\d:hms]/gi, ''))} placeholder="mm:ss" inputMode="numeric" />
          <Field label={`Distance (${distanceUnit})`} value={dist} onChange={setDist} placeholder="0" inputMode="decimal" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label={`Weight (${unit})`} value={weight} onChange={setWeight} placeholder="0" inputMode="decimal" />
          <Field label="Reps" value={reps} onChange={(v) => setReps(v.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" />
        </div>
      )}

      {!cardio && (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-3">
          <div>
            <div className="text-[15px] font-medium">Add a warm-up first</div>
            <div className="text-[12px] text-muted">Half the weight, rounded to a plate</div>
          </div>
          <Toggle checked={warmup} onChange={setWarmup} label="Add warm-up" />
        </div>
      )}

      {existing > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-[14px] text-muted">Existing {cardio ? 'intervals' : 'sets'}</div>
          <Segmented value={mode} options={[{ value: 'add', label: 'Keep & add' }, { value: 'replace', label: 'Replace' }]} onChange={setMode} />
        </div>
      )}

      <Button size="lg" className="w-full" onClick={go}>
        {mode === 'replace' || existing === 0 ? `Log ${count + (warmup && !cardio ? 1 : 0)} ${cardio ? 'intervals' : 'sets'}` : `Add ${count + (warmup && !cardio ? 1 : 0)} ${cardio ? 'intervals' : 'sets'}`}
      </Button>
    </Sheet>
  )
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; inputMode: 'decimal' | 'numeric' }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-muted mb-1">{label}</span>
      <input className={inputClass} inputMode={inputMode} placeholder={placeholder} value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
