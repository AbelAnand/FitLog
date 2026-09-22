import { useState } from 'react'
import { useAllSets, useProfile } from '../api/queries'
import { useUpdateProfile } from '../api/mutations'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { exportCsv, setsToCsv } from '../lib/csv'
import { Button, Icon, PageTitle, Segmented } from '../components/ui'
import type { Unit } from '../lib/units'

export function SettingsPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const { data: rows = [] } = useAllSets()
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const goal = profile?.weekly_goal ?? 4

  return (
    <>
      <PageTitle title="Settings" />

      <Section title="Units">
        <Row label="Weight unit" hint="Existing logs are converted on display.">
          <Segmented<Unit> value={profile?.unit ?? 'lb'} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} onChange={(unit) => update.mutate({ unit })} />
        </Row>
      </Section>

      <Section title="Goal">
        <Row label="Workouts per week" hint="Your streak counts weeks you hit this.">
          <div className="inline-flex items-center rounded-xl bg-surface-2">
            <button type="button" aria-label="Decrease" className="h-10 w-10 text-[20px] text-muted" onClick={() => goal > 1 && update.mutate({ weekly_goal: goal - 1 })}>−</button>
            <span className="w-8 text-center font-semibold tabular">{goal}</span>
            <button type="button" aria-label="Increase" className="h-10 w-10 text-[20px] text-muted" onClick={() => goal < 14 && update.mutate({ weekly_goal: goal + 1 })}>+</button>
          </div>
        </Row>
      </Section>

      <Section title="Data">
        <Row label="Export to CSV" hint={`${rows.length} sets logged`}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!rows.length}
            onClick={async () => {
              const result = await exportCsv(`fitlog-${new Date().toISOString().slice(0, 10)}.csv`, setsToCsv(rows))
              setExportMsg(result === 'shared' ? 'Shared.' : 'Downloaded.')
              setTimeout(() => setExportMsg(null), 2500)
            }}
          >
            <Icon.Share /> {exportMsg ?? 'Export'}
          </Button>
        </Row>
      </Section>

      <Section title="Account">
        <Row label={user?.email ?? ''} hint="Signed in">
          <Button variant="danger" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
        </Row>
      </Section>

      <div className="mt-8 text-center text-[12px] text-faint px-6">
        Tip: in Safari, tap Share → “Add to Home Screen” to install FitLog as an app.
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint px-1 mb-2">{title}</div>
      <div className="bg-surface rounded-[18px] border border-border/60 divide-y divide-border/50">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[64px]">
      <div className="min-w-0">
        <div className="text-[15px] font-medium truncate">{label}</div>
        {hint && <div className="text-[12px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
