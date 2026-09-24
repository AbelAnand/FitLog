import { useMemo, useState } from 'react'
import { useDeleteExercise } from '../api/mutations'
import { useLongPress } from '../lib/useLongPress'
import { useAllSets, useExercises } from '../api/queries'
import type { ExerciseKind } from '../api/types'
import { GROUP_LABELS, STARTER_EXERCISES, groupsForTitle, type MuscleGroup } from '../data/starter-exercises'
import { Button, Icon, MenuSheet, Sheet } from './ui'

export function ExercisePicker({
  open,
  onClose,
  onPick,
  workoutTitle = '',
  historyOnly = false,
  title = 'Add exercise',
}: {
  open: boolean
  onClose: () => void
  onPick: (name: string, kind: ExerciseKind, id?: string, trackIncline?: boolean) => void
  /** Used to rank suggestions, e.g. "Legs" puts squats first. */
  workoutTitle?: string
  historyOnly?: boolean
  title?: string
}) {
  const [q, setQ] = useState('')
  const [manage, setManage] = useState<{ id: string; name: string } | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; name: string; workouts: number } | null>(null)
  const del = useDeleteExercise()
  const { data: exercises = [] } = useExercises()
  const { data: rows = [] } = useAllSets()

  const usage = (id: string) => new Set(rows.filter((r) => r.exercise_id === id).map((r) => r.workout_id)).size

  const model = useMemo(() => {
    const query = q.trim().toLowerCase()
    const filter = (n: string) => !query || n.toLowerCase().includes(query)
    const groups = groupsForTitle(workoutTitle)
    const t = workoutTitle.trim().toLowerCase()

    // How often each of the user's exercises appears under workouts with this title.
    const usageUnderTitle = new Map<string, number>()
    const lastUsedUnderTitle = new Map<string, string>()
    if (t) {
      for (const r of rows) {
        if (r.workout_title.trim().toLowerCase() !== t) continue
        usageUnderTitle.set(r.exercise_id, (usageUnderTitle.get(r.exercise_id) ?? 0) + 1)
        if ((lastUsedUnderTitle.get(r.exercise_id) ?? '') < r.date) lastUsedUnderTitle.set(r.exercise_id, r.date)
      }
    }

    const mine = [...exercises].filter((e) => filter(e.name))
    const suggestedMine = mine
      .filter((e) => usageUnderTitle.has(e.id))
      .sort((a, b) => (lastUsedUnderTitle.get(b.id) ?? '').localeCompare(lastUsedUnderTitle.get(a.id) ?? '') || (usageUnderTitle.get(b.id) ?? 0) - (usageUnderTitle.get(a.id) ?? 0))
    const suggestedIds = new Set(suggestedMine.map((e) => e.id))
    const restMine = mine.filter((e) => !suggestedIds.has(e.id)).sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || a.name.localeCompare(b.name))

    const mineNames = new Set(exercises.map((e) => e.name.toLowerCase()))
    const starters = historyOnly ? [] : STARTER_EXERCISES.filter((s) => !mineNames.has(s.name.toLowerCase()) && filter(s.name))
    const suggestedStarters = groups.length ? starters.filter((s) => groups.includes(s.group)).sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group)) : []
    const suggestedStarterNames = new Set(suggestedStarters.map((s) => s.name))
    const byGroup = new Map<MuscleGroup, typeof starters>()
    for (const s of starters) {
      if (suggestedStarterNames.has(s.name)) continue
      if (!byGroup.has(s.group)) byGroup.set(s.group, [])
      byGroup.get(s.group)!.push(s)
    }
    const groupOrder: MuscleGroup[] = ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'legs', 'glutes', 'core', 'other', 'cardio']
    const exact = query ? [...exercises.map((e) => e.name), ...STARTER_EXERCISES.map((s) => s.name)].some((n) => n.toLowerCase() === query) : true
    const total = mine.length + starters.length
    return { suggestedMine, restMine, suggestedStarters, byGroup, groupOrder, exact, total, hasTitle: !!t }
  }, [q, exercises, rows, workoutTitle, historyOnly])

  const close = () => {
    setQ('')
    onClose()
  }
  const pick = (name: string, kind: ExerciseKind, id?: string, trackIncline?: boolean) => {
    onPick(name, kind, id, trackIncline)
    close()
  }

  const suggestedLabel = model.hasTitle ? `Suggested for ${workoutTitle.trim()}` : 'Suggested'

  return (
    <Sheet open={open} onClose={close} title={title}>
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon.Search /></span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or type a new exercise"
          className="w-full h-12 pl-11 pr-4 rounded-xl bg-surface-2 border border-border/60 placeholder:text-faint outline-none focus:border-accent/60"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // Enter creates a new exercise only for a real name; otherwise it just puts the keyboard away.
            if (q.trim().length >= 3 && !historyOnly && !model.exact) pick(q.trim(), 'strength')
            else (e.target as HTMLInputElement).blur()
          }}
        />
      </div>

      {!historyOnly && q.trim() && !model.exact && (
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => pick(q.trim(), 'strength')} className="flex-1 flex items-center gap-2 h-12 px-3 rounded-xl bg-accent-dim text-accent font-medium text-[14px]">
            <Icon.Plus /> Create “{q.trim()}”
          </button>
          <button type="button" onClick={() => pick(q.trim(), 'cardio')} className="flex items-center gap-2 h-12 px-3 rounded-xl bg-surface-2 text-text font-medium text-[14px]">
            <Icon.Run /> as cardio
          </button>
        </div>
      )}

      {(model.suggestedMine.length > 0 || model.suggestedStarters.length > 0) && (
        <Section label={suggestedLabel} accent>
          {model.suggestedMine.map((e) => (
            <Row key={e.id} name={e.name} kind={e.kind} sub={e.lastUsed ? `Last: ${e.lastUsed}` : undefined} onClick={() => pick(e.name, e.kind, e.id)} onHold={() => setManage({ id: e.id, name: e.name })} />
          ))}
          {model.suggestedStarters.map((s) => (
            <Row key={s.name} name={s.name} kind={s.kind} sub={GROUP_LABELS[s.group]} onClick={() => pick(s.name, s.kind, undefined, s.trackIncline)} />
          ))}
        </Section>
      )}

      {model.restMine.length > 0 && (
        <Section label="Your exercises">
          {model.restMine.map((e) => (
            <Row key={e.id} name={e.name} kind={e.kind} sub={e.lastUsed ? `Last: ${e.lastUsed}` : undefined} onClick={() => pick(e.name, e.kind, e.id)} onHold={() => setManage({ id: e.id, name: e.name })} />
          ))}
        </Section>
      )}

      {model.groupOrder.map((g) => {
        const list = model.byGroup.get(g)
        if (!list?.length) return null
        return (
          <Section key={g} label={GROUP_LABELS[g]}>
            {list.map((s) => (
              <Row key={s.name} name={s.name} kind={s.kind} onClick={() => pick(s.name, s.kind, undefined, s.trackIncline)} />
            ))}
          </Section>
        )
      })}

      {model.total === 0 && (
        <div className="py-8 text-center text-muted text-[14px]">{historyOnly ? 'Nothing logged yet.' : 'No matches. Press enter to create it.'}</div>
      )}
      {(model.suggestedMine.length > 0 || model.restMine.length > 0) && <div className="pt-2 text-center text-[12px] text-faint">Hold one of your exercises to manage it</div>}

      <MenuSheet
        open={!!manage}
        onClose={() => setManage(null)}
        title={manage?.name}
        subtitle={manage ? (usage(manage.id) ? `Logged in ${usage(manage.id)} ${usage(manage.id) === 1 ? 'workout' : 'workouts'}` : 'Never logged') : undefined}
        items={[
          { label: 'Delete exercise', icon: <Icon.Trash />, danger: true, onClick: () => manage && setConfirm({ ...manage, workouts: usage(manage.id) }) },
        ]}
      />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm?.name}?`}>
        <p className="text-muted text-[14px] mb-4">
          {confirm?.workouts
            ? `It will be removed from ${confirm.workouts} ${confirm.workouts === 1 ? 'workout' : 'workouts'}, along with the sets you logged for it. Progress history for it will be gone. This can't be undone.`
            : "It hasn't been logged anywhere, so nothing else changes."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" disabled={del.isPending} onClick={async () => { if (confirm) await del.mutateAsync(confirm.id); setConfirm(null) }}>Delete</Button>
        </div>
      </Sheet>
    </Sheet>
  )
}

function Section({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="mb-3">
      <div className={`text-[11px] font-semibold uppercase tracking-wider px-1 mb-1 ${accent ? 'text-accent' : 'text-faint'}`}>{label}</div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  )
}

function Row({ name, kind, sub, onClick, onHold }: { name: string; kind: ExerciseKind; sub?: string; onClick: () => void; onHold?: () => void }) {
  const press = useLongPress(() => onHold?.())
  return (
    <button type="button" {...(onHold ? press : {})} onClick={onClick} className="w-full flex items-center justify-between gap-3 h-12 px-1 text-left active:bg-surface-2 rounded-lg">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-[15px] truncate">{name}</span>
        {kind === 'cardio' && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted bg-surface-2 rounded px-1.5 py-0.5">Cardio</span>}
      </span>
      {sub && <span className="text-[12px] text-faint shrink-0">{sub}</span>}
    </button>
  )
}
