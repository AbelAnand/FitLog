import { useMemo, useState } from 'react'
import { useExercises } from '../api/queries'
import { STARTER_EXERCISES } from '../data/starter-exercises'
import { Icon, Sheet } from './ui'

export function ExercisePicker({
  open,
  onClose,
  onPick,
  historyOnly = false,
  title = 'Add exercise',
}: {
  open: boolean
  onClose: () => void
  onPick: (name: string, id?: string) => void
  historyOnly?: boolean
  title?: string
}) {
  const [q, setQ] = useState('')
  const { data: exercises = [] } = useExercises()

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const mine = [...exercises].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || a.name.localeCompare(b.name))
    const mineNames = new Set(mine.map((e) => e.name.toLowerCase()))
    const starters = historyOnly ? [] : STARTER_EXERCISES.filter((n) => !mineNames.has(n.toLowerCase()))
    const filter = (n: string) => !query || n.toLowerCase().includes(query)
    return {
      mine: mine.filter((e) => filter(e.name)),
      starters: starters.filter(filter),
      exact: query ? [...mine.map((e) => e.name), ...starters].some((n) => n.toLowerCase() === query) : true,
    }
  }, [q, exercises, historyOnly])

  const pick = (name: string, id?: string) => {
    onPick(name, id)
    setQ('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={() => { setQ(''); onClose() }} title={title}>
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
            if (e.key === 'Enter' && q.trim() && !historyOnly) pick(q.trim())
          }}
        />
      </div>

      {!historyOnly && q.trim() && !results.exact && (
        <button type="button" onClick={() => pick(q.trim())} className="w-full flex items-center gap-3 h-12 px-3 rounded-xl bg-accent-dim text-accent font-medium mb-2">
          <Icon.Plus /> Create “{q.trim()}”
        </button>
      )}

      {results.mine.length > 0 && (
        <Section label="Your exercises">
          {results.mine.map((e) => (
            <Row key={e.id} name={e.name} sub={e.lastUsed ? `Last: ${e.lastUsed}` : undefined} onClick={() => pick(e.name, e.id)} />
          ))}
        </Section>
      )}
      {results.starters.length > 0 && (
        <Section label="Common lifts">
          {results.starters.map((n) => (
            <Row key={n} name={n} onClick={() => pick(n)} />
          ))}
        </Section>
      )}
      {results.mine.length === 0 && results.starters.length === 0 && (
        <div className="py-8 text-center text-muted text-[14px]">{historyOnly ? 'Nothing logged yet.' : 'No matches. Press enter to create it.'}</div>
      )}
    </Sheet>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint px-1 mb-1">{label}</div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  )
}

function Row({ name, sub, onClick }: { name: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between h-12 px-1 text-left active:bg-surface-2 rounded-lg">
      <span className="text-[15px]">{name}</span>
      {sub && <span className="text-[12px] text-faint">{sub}</span>}
    </button>
  )
}
