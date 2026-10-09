import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { describeAdded, useApplySplit, useDeleteSplit, useSaveSplit, useSplits } from '../api/planning'
import { useExercises, useWorkouts } from '../api/queries'
import type { WorkoutSummary } from '../api/types'
import { LIMITS } from '../data/limits'
import { db } from '../db'
import type { SplitDay, StoredSplit } from '../db/types'
import { tap } from '../lib/haptics'
import { countSets, cyclePosition, dayKey, dayTitle, describeDays, expandCycle, fillEnd, nextFillDate, templateFromWorkout } from '../lib/splits'
import { toast } from '../lib/toast'
import { uuid } from '../lib/uuid'
import { Button, Chip, EmptyState, Icon, Sheet, Stepper, TextInput } from './ui'

/**
 * Splits: named cycles of days (Push, Pull, Legs, Rest…) applied to the calendar in order from a
 * start date. One sheet, several views: the list, an editor, the day picker, and Apply.
 */
export function SplitsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {open && <Splits onClose={onClose} />}
    </Sheet>
  )
}

type View = { kind: 'list' } | { kind: 'edit'; draft: StoredSplit; isNew: boolean } | { kind: 'pick'; draft: StoredSplit; isNew: boolean } | { kind: 'apply'; split: StoredSplit; from: string; startIndex: number; extend: boolean }

const newSplit = (): StoredSplit => ({ id: uuid(), name: '', days: [], created_at: new Date().toISOString(), applied_from: null, applied_through: null })

function Splits({ onClose }: { onClose: () => void }) {
  const { data: splits = [] } = useSplits()
  const [view, setView] = useState<View>({ kind: 'list' })
  const today = dayKey(new Date())

  const open = (split: StoredSplit) => setView({ kind: 'edit', draft: split, isNew: false })
  const create = () => {
    if (splits.length >= LIMITS.splits) return toast(`Up to ${LIMITS.splits} splits.`, 'info')
    setView({ kind: 'edit', draft: newSplit(), isNew: true })
  }
  const apply = (split: StoredSplit, extend: boolean) => {
    const from = extend ? nextFillDate(split, today) : today
    setView({ kind: 'apply', split, from, startIndex: extend ? cyclePosition(split, from) : 0, extend })
  }

  if (view.kind === 'edit') return <Editor draft={view.draft} isNew={view.isNew} onBack={() => setView({ kind: 'list' })} onPick={(draft) => setView({ kind: 'pick', draft, isNew: view.isNew })} />
  if (view.kind === 'pick') return <TemplatePicker onBack={(day) => setView({ kind: 'edit', draft: day ? { ...view.draft, days: [...view.draft.days, day] } : view.draft, isNew: view.isNew })} />
  if (view.kind === 'apply') return <Apply split={view.split} from={view.from} startIndex={view.startIndex} extend={view.extend} onBack={() => setView({ kind: 'list' })} />

  return (
    <>
      <Header title="Splits" />
      <p className="text-muted text-[13px] mb-3">A split is your training cycle, say Push, Pull, Legs, Rest. Apply it and the calendar fills with plans, one day after another, whatever the weekday.</p>
      {splits.length === 0 ? (
        <EmptyState icon={<Icon.Repeat />} title="No splits yet" body="Make one from the plans and workouts you already have." />
      ) : (
        <div className="flex flex-col gap-2">
          {splits.map((s) => {
            const filled = s.applied_through ? `Filled to ${format(parseISO(s.applied_through), 'MMM d')}` : 'Not on the calendar yet'
            return (
              <div key={s.id} className="rounded-[18px] bg-surface-2 p-3.5">
                <button type="button" className="press-soft w-full text-left" onClick={() => { tap(); open(s) }}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-semibold truncate">{s.name || 'Untitled split'}</div>
                      <div className="text-[13px] text-muted truncate">{s.days.length ? describeDays(s.days) : 'No days yet'}</div>
                    </div>
                    <span className="text-faint"><Icon.ChevronRight /></span>
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-muted">{filled}</span>
                  <div className="flex gap-2">
                    {s.applied_through && s.applied_through >= today && <Button size="sm" variant="secondary" disabled={!s.days.some((d) => !d.rest)} onClick={() => apply(s, true)}>Extend</Button>}
                    <Button size="sm" disabled={!s.days.some((d) => !d.rest)} onClick={() => apply(s, false)}>Apply</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Done</Button>
        <Button size="lg" className="flex-1" onClick={create}><Icon.Plus /> New split</Button>
      </div>
    </>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-3">
      {onBack && (
        <button type="button" aria-label="Back" className="press -ml-2 h-10 w-10 flex items-center justify-center text-muted" onClick={onBack}>
          <Icon.Back />
        </button>
      )}
      <div className="text-[17px] font-semibold flex-1 truncate">{title}</div>
      {right}
    </div>
  )
}

/* ---------- Editor ---------- */

function Editor({ draft, isNew, onBack, onPick }: { draft: StoredSplit; isNew: boolean; onBack: () => void; onPick: (draft: StoredSplit) => void }) {
  const { data: exercises = [] } = useExercises()
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])
  const save = useSaveSplit()
  const remove = useDeleteSplit()
  const [split, setSplit] = useState(draft)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setDays = (days: SplitDay[]) => setSplit((s) => ({ ...s, days }))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= split.days.length) return
    const days = [...split.days]
    ;[days[i], days[j]] = [days[j], days[i]]
    tap()
    setDays(days)
  }
  const addRest = () => {
    if (split.days.length >= LIMITS.splitDays) return toast(`A cycle can be up to ${LIMITS.splitDays} days.`, 'info')
    tap()
    setDays([...split.days, { rest: true }])
  }
  const addWorkout = () => {
    if (split.days.length >= LIMITS.splitDays) return toast(`A cycle can be up to ${LIMITS.splitDays} days.`, 'info')
    onPick(split)
  }
  const doSave = async () => {
    const name = split.name.trim() || describeDays(split.days).slice(0, LIMITS.splitName) || 'My split'
    tap()
    try {
      await save.mutateAsync({ ...split, name })
      toast(isNew ? `“${name}” saved. Apply it to fill the calendar.` : `Saved “${name}”.`, 'info')
      onBack()
    } catch {
      // Reported by the global toast.
    }
  }
  const doDelete = async () => {
    try {
      await remove.mutateAsync(split.id)
      toast(`Deleted “${split.name || 'the split'}”.`, 'info')
      onBack()
    } catch {
      // Reported by the global toast.
    }
  }

  const describeDay = (d: SplitDay) => {
    if (d.rest) return 'Rest day'
    const list = d.exercises.map((e) => names.get(e.exercise_id)).filter(Boolean)
    const sets = countSets(d)
    return list.length ? `${list.slice(0, 3).join(', ')}${list.length > 3 ? ` +${list.length - 3}` : ''} · ${sets} ${sets === 1 ? 'set' : 'sets'}` : 'No exercises'
  }

  return (
    <>
      <Header title={isNew ? 'New split' : 'Edit split'} onBack={onBack} />
      <label className="block mb-4">
        <span className="block text-[12px] font-medium text-muted mb-1">Name</span>
        <TextInput value={split.name} maxLength={LIMITS.splitName} placeholder="Push Pull Legs" onChange={(e) => setSplit((s) => ({ ...s, name: e.target.value }))} enterKeyHint="done" />
      </label>
      <div className="text-[12px] font-medium text-muted mb-1">Days, in order</div>
      {split.days.length === 0 ? (
        <div className="rounded-2xl bg-surface-2 px-4 py-4 text-[13px] text-muted">Add the days of one cycle. It repeats from the top when it reaches the end.</div>
      ) : (
        <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden">
          {split.days.map((d, i) => (
            <div key={i} className="flex items-center gap-2 pl-3 pr-1 min-h-[56px]">
              <span className="w-5 text-[12px] text-faint tabular">{i + 1}</span>
              <div className="min-w-0 flex-1 py-2">
                <div className={`text-[15px] font-medium truncate ${d.rest ? 'text-muted' : ''}`}>{dayTitle(d)}</div>
                <div className="text-[12px] text-muted truncate">{describeDay(d)}</div>
              </div>
              <button type="button" aria-label="Move up" className="press h-10 w-9 flex items-center justify-center text-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                <span className="rotate-180 inline-flex"><Icon.ChevronDown /></span>
              </button>
              <button type="button" aria-label="Move down" className="press h-10 w-9 flex items-center justify-center text-muted disabled:opacity-30" disabled={i === split.days.length - 1} onClick={() => move(i, 1)}>
                <Icon.ChevronDown />
              </button>
              <button type="button" aria-label="Remove day" className="press h-10 w-9 flex items-center justify-center text-danger" onClick={() => { tap(); setDays(split.days.filter((_, j) => j !== i)) }}>
                <Icon.X />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <Button variant="secondary" size="sm" className="flex-1" onClick={addWorkout}><Icon.Plus /> Workout day</Button>
        <Button variant="secondary" size="sm" className="flex-1" onClick={addRest}><Icon.Plus /> Rest day</Button>
      </div>
      <p className="mt-2 text-[12px] text-muted">A workout day copies the exercises and target sets of a plan or workout you pick. Changing the plans later does not change the split.</p>

      {confirmDelete ? (
        <div className="mt-5 rounded-2xl border border-danger/40 p-3">
          <div className="text-[14px] mb-3">Delete this split? Plans already on the calendar stay.</div>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button size="md" className="flex-1 !bg-danger !text-white" onClick={doDelete}>Delete</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-5">
          {!isNew && <Button variant="danger" size="lg" onClick={() => setConfirmDelete(true)} aria-label="Delete split"><Icon.Trash /></Button>}
          <Button size="lg" className="flex-1" disabled={save.isPending} onClick={doSave}><Icon.Check /> Save split</Button>
        </div>
      )}
    </>
  )
}

/* ---------- Picking a workout to make a day from ---------- */

function TemplatePicker({ onBack }: { onBack: (day: SplitDay | null) => void }) {
  const { data: workouts = [] } = useWorkouts()
  const [query, setQuery] = useState('')
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    const out: WorkoutSummary[] = []
    // Newest first, one per title and exercise list, so the list is short and current.
    for (const w of workouts) {
      if (!w.exerciseNames.length) continue
      if (q && !w.title.toLowerCase().includes(q) && !w.exerciseNames.some((n) => n.toLowerCase().includes(q))) continue
      const key = `${w.title.trim().toLowerCase()}|${w.exerciseNames.join('|')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(w)
      if (out.length >= 40) break
    }
    return out
  }, [workouts, query])

  const pick = (w: WorkoutSummary) => {
    tap()
    try {
      onBack(templateFromWorkout(db.getWorkout(w.id)))
    } catch {
      toast("That workout couldn't be opened.")
    }
  }

  return (
    <>
      <Header title="Pick a workout" onBack={() => onBack(null)} />
      <p className="text-muted text-[13px] mb-3">The day takes its title, exercises and target sets. To build a day from scratch, plan a workout from Home first, then pick it here.</p>
      <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or exercise" className="mb-3" aria-label="Search workouts" />
      {candidates.length === 0 ? (
        <EmptyState icon={<Icon.Dumbbell />} title={query ? 'No match' : 'Nothing to pick yet'} body={query ? 'Try another word.' : 'Plan or log a workout first.'} />
      ) : (
        <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden">
          {candidates.map((w) => (
            <button key={w.id} type="button" className="w-full flex items-center gap-3 px-4 min-h-[56px] text-left active:bg-surface-3" onClick={() => pick(w)}>
              <div className="min-w-0 flex-1 py-2">
                <div className="text-[15px] font-medium truncate">{w.title || 'Workout'}</div>
                <div className="text-[12px] text-muted truncate">{w.exerciseNames.join(' · ')}</div>
              </div>
              <div className="text-[12px] text-faint shrink-0 text-right">
                <div>{w.setCount} sets</div>
                <div>{w.is_plan ? 'Plan' : format(parseISO(w.date), 'MMM d')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- Apply ---------- */

function Apply({ split, from: initialFrom, startIndex: initialIndex, extend, onBack }: { split: StoredSplit; from: string; startIndex: number; extend: boolean; onBack: () => void }) {
  const apply = useApplySplit()
  const [from, setFrom] = useState(initialFrom)
  const [startIndex, setStartIndex] = useState(initialIndex)
  const [weeks, setWeeks] = useState(4)
  const through = fillEnd(from, weeks)
  const plans = useMemo(() => expandCycle(split.days, from, through, startIndex).length, [split, from, through, startIndex])

  const go = async () => {
    tap()
    try {
      const result = await apply.mutateAsync({ splitId: split.id, from, through, startIndex })
      toast(describeAdded(result), 'info', 5000)
      onBack()
    } catch {
      // Reported by the global toast.
    }
  }

  return (
    <>
      <Header title={extend ? `Extend ${split.name || 'split'}` : `Apply ${split.name || 'split'}`} onBack={onBack} />
      <p className="text-muted text-[13px] mb-3">{describeDays(split.days)}</p>
      <label className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-3">
        <span className="flex items-center gap-3">
          <span className="text-muted"><Icon.Calendar /></span>
          <span className="text-[15px] font-medium">{extend ? 'Continue from' : 'Start on'}</span>
        </span>
        <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="bg-transparent text-[15px] outline-none text-right" aria-label="Start date" />
      </label>
      <div className="rounded-2xl bg-surface-2 px-4 py-3 mb-3">
        <div className="text-[15px] font-medium mb-2">First day of the cycle</div>
        <div className="flex flex-wrap gap-2">
          {split.days.map((d, i) => (
            <Chip key={i} active={i === startIndex} onClick={() => { tap(); setStartIndex(i) }}>{dayTitle(d)}</Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-3">
        <div>
          <div className="text-[15px] font-medium">Fill</div>
          <div className="text-[12px] text-muted">Through {format(parseISO(through), 'EEE, MMM d')}</div>
        </div>
        <Stepper value={weeks} min={1} max={LIMITS.splitFillWeeks} onChange={setWeeks} suffix={weeks === 1 ? ' week' : ' weeks'} />
      </div>
      <p className="text-muted text-[13px] mb-4">
        {plans} {plans === 1 ? 'plan' : 'plans'} will be added. Days that already hold the same plan are skipped. The plans are ordinary plans afterwards: edit, start or delete them as you like.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" className="flex-1" disabled={apply.isPending} onClick={onBack}>Cancel</Button>
        <Button size="lg" className="flex-1" disabled={apply.isPending || plans === 0} onClick={go}>{apply.isPending ? 'Adding…' : extend ? 'Extend' : 'Apply'}</Button>
      </div>
    </>
  )
}
