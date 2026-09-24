import { useEffect, useState } from 'react'
import { useAllSets, useProfile } from '../api/queries'
import { useUpdateProfile } from '../api/mutations'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { exportCsv, setsToCsv } from '../lib/csv'
import { isNative } from '../lib/native'
import { DEFAULT_SETTINGS, loadReminderSettings, requestNotificationPermission, saveReminderSettings, syncDailyReminder, type ReminderSettings } from '../lib/notifications'
import { Button, Icon, PageTitle, Segmented, Stepper, Toggle } from '../components/ui'
import { THEMES, saveTheme, useTheme } from '../lib/theme'
import { tap } from '../lib/haptics'
import type { DistanceUnit, Unit } from '../lib/units'

export function SettingsPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const { data: rows = [] } = useAllSets()
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [rem, setRem] = useState<ReminderSettings>(DEFAULT_SETTINGS)
  const [permDenied, setPermDenied] = useState(false)

  useEffect(() => {
    loadReminderSettings().then(setRem)
  }, [])

  const saveRem = async (patch: Partial<ReminderSettings>) => {
    const next = { ...rem, ...patch }
    if ((patch.dailyEnabled || patch.gymEnabled) && isNative) {
      const ok = await requestNotificationPermission()
      setPermDenied(!ok)
      if (!ok) return
    }
    setRem(next)
    await saveReminderSettings(next)
    const trained = Array.from(new Set(rows.map((r) => r.date)))
    await syncDailyReminder(trained, next)
  }

  const goal = profile?.weekly_goal ?? 4
  const theme = useTheme()
  const timeValue = `${String(rem.hour).padStart(2, '0')}:${String(rem.minute).padStart(2, '0')}`

  return (
    <>
      <PageTitle title="Settings" />

      <Section title="Appearance">
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const active = t.id === theme
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { tap(); saveTheme(t.id) }}
                  aria-pressed={active}
                  className={`rounded-2xl p-2 text-left border-2 transition ${active ? 'border-accent' : 'border-transparent'}`}
                >
                  <div className="h-14 rounded-xl overflow-hidden flex flex-col p-2 gap-1.5" style={{ background: t.swatch[0] }}>
                    <div className="h-2.5 w-2/3 rounded-full" style={{ background: t.swatch[3], opacity: 0.9 }} />
                    <div className="flex gap-1.5 items-end flex-1">
                      <div className="h-full flex-1 rounded-md" style={{ background: t.swatch[1] }} />
                      <div className="h-4 w-8 rounded-full" style={{ background: t.swatch[2] }} />
                    </div>
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted leading-tight">{t.tagline}</div>
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="Units">
        <Row label="Weight" hint="Existing logs are converted on display.">
          <Segmented<Unit> value={profile?.unit ?? 'lb'} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} onChange={(unit) => update.mutate({ unit })} />
        </Row>
        <Row label="Distance" hint="For cardio.">
          <Segmented<DistanceUnit> value={profile?.distance_unit ?? 'mi'} options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]} onChange={(distance_unit) => update.mutate({ distance_unit })} />
        </Row>
      </Section>

      <Section title="Goal">
        <Row label="Workouts per week" hint="Your streak counts weeks you hit this.">
          <Stepper value={goal} min={1} max={14} onChange={(v) => update.mutate({ weekly_goal: v })} />
        </Row>
      </Section>

      <Section title="Reminders">
        {!isNative && <div className="px-4 py-3 text-[13px] text-muted">Reminders are available in the iPhone app.</div>}
        <Row label="Daily check-in" hint="Nudge on days with no workout logged">
          <Toggle checked={rem.dailyEnabled} onChange={(v) => saveRem({ dailyEnabled: v })} label="Daily check-in" />
        </Row>
        {rem.dailyEnabled && (
          <Row label="Remind me at" hint="Skipped automatically once you've logged.">
            <input
              type="time"
              value={timeValue}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                if (Number.isFinite(h) && Number.isFinite(m)) saveRem({ hour: h, minute: m })
              }}
              className="h-10 px-3 rounded-xl bg-surface-2 border border-border/60 outline-none tabular"
              aria-label="Reminder time"
            />
          </Row>
        )}
        <Row label="Gym reminders" hint="Soft nudges to log sets during a workout">
          <Toggle checked={rem.gymEnabled} onChange={(v) => saveRem({ gymEnabled: v })} label="Gym reminders" />
        </Row>
        {rem.gymEnabled && (
          <Row label="Every" hint="Minutes between nudges">
            <Stepper value={rem.gymIntervalMin} min={5} max={60} onChange={(v) => saveRem({ gymIntervalMin: v })} suffix=" min" />
          </Row>
        )}
        {permDenied && <div className="px-4 py-3 text-[13px] text-danger">Notifications are off for FitLog. Enable them in iPhone Settings → Notifications → FitLog.</div>}
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

      {!isNative && (
        <div className="mt-8 text-center text-[12px] text-faint px-6">
          Tip: in Safari, tap Share → “Add to Home Screen” to install FitLog as an app.
        </div>
      )}
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
