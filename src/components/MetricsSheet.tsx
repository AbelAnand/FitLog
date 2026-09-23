import { useEffect, useState } from 'react'
import { METRICS, type MetricKey } from '../data/cardio-metrics'
import type { DistanceUnit } from '../lib/units'
import { tap } from '../lib/haptics'
import { Button, Icon, Sheet } from './ui'

/** Pick and order the variables a cardio exercise logs. */
export function MetricsSheet({ open, onClose, name, value, distanceUnit, onSave }: { open: boolean; onClose: () => void; name: string; value: MetricKey[]; distanceUnit: DistanceUnit; onSave: (m: MetricKey[]) => void }) {
  const [sel, setSel] = useState<MetricKey[]>(value)
  useEffect(() => {
    if (open) setSel(value)
  }, [open, value])

  const toggle = (k: MetricKey) => {
    tap()
    setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 4 ? s : [...s, k]))
  }
  const move = (k: MetricKey, dir: -1 | 1) => {
    tap()
    setSel((s) => {
      const i = s.indexOf(k)
      const j = i + dir
      if (i < 0 || j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Variables">
      <p className="text-[13px] text-muted mb-3">What to log for <span className="text-text font-medium">{name}</span>. Pick up to four; the order sets the columns.</p>

      {sel.length > 0 && (
        <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden mb-3">
          {sel.map((k, i) => {
            const m = METRICS.find((x) => x.key === k)!
            return (
              <div key={k} className="flex items-center gap-3 px-4 h-[52px]">
                <span className="h-6 w-6 rounded-md bg-accent text-accent-ink flex items-center justify-center text-[12px] font-bold">{i + 1}</span>
                <span className="flex-1 text-[15px] font-medium">{m.label}{m.unit(distanceUnit) ? <span className="text-muted font-normal"> · {m.unit(distanceUnit)}</span> : null}</span>
                <button type="button" aria-label={`Move ${m.label} up`} disabled={i === 0} onClick={() => move(k, -1)} className="h-9 w-9 flex items-center justify-center text-muted disabled:opacity-30 rotate-90"><Icon.ChevronLeft /></button>
                <button type="button" aria-label={`Move ${m.label} down`} disabled={i === sel.length - 1} onClick={() => move(k, 1)} className="h-9 w-9 flex items-center justify-center text-muted disabled:opacity-30 rotate-90"><Icon.ChevronRight /></button>
                <button type="button" aria-label={`Remove ${m.label}`} onClick={() => toggle(k)} className="h-9 w-9 flex items-center justify-center text-faint active:text-danger"><Icon.X /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint px-1 mb-1">Available</div>
      <div className="rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden mb-4">
        {METRICS.filter((m) => !sel.includes(m.key)).map((m) => (
          <button key={m.key} type="button" onClick={() => toggle(m.key)} disabled={sel.length >= 4} className="w-full flex items-center gap-3 px-4 h-[52px] text-left active:bg-surface-3 disabled:opacity-40">
            <span className="text-accent"><Icon.Plus /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium">{m.label}{m.unit(distanceUnit) ? <span className="text-muted font-normal"> · {m.unit(distanceUnit)}</span> : null}</span>
              <span className="block text-[12px] text-muted">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Button size="lg" className="w-full" disabled={sel.length === 0} onClick={() => { onSave(sel); onClose() }}>Save</Button>
    </Sheet>
  )
}
