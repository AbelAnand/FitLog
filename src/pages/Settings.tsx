import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useAllSets, useBackupStatus, useProfile } from '../api/queries'
import { reloadEverything, useUpdateProfile } from '../api/mutations'
import { keys } from '../api/keys'
import { db, type ImportSummary } from '../db'
import { MAX_FILE_BYTES, UnreadableFile, backupFilename, readImportFile, serializeBackup, type ReadFile } from '../db/backup'
import { GUIDE_URL, PRIVACY_URL, SUPPORT_URL, openExternal } from '../lib/site'
import { toast } from '../lib/toast'
import { clearReminders } from '../lib/notifications'
import { updateWidget } from '../lib/widget'
import { exportCsv, setsToCsv, shareTextFile } from '../lib/csv'
import { isNative } from '../lib/native'
import { DEFAULT_SETTINGS, loadReminderSettings, requestNotificationPermission, saveReminderSettings, syncDailyReminder, type ReminderSettings } from '../lib/notifications'
import { Button, Icon, MenuSheet, PageTitle, Segmented, Sheet, Stepper, TextInput, Toggle } from '../components/ui'
import { ThemeEditorSheet, ThemeImportSheet } from '../components/ThemeEditor'
import { MAX_CUSTOM_THEMES, THEMES, ThemeLimitError, customMeta, deleteCustomTheme, importCustomTheme, saveCustomTheme, saveTheme, themeMeta, useCustomThemes, useTheme, type CustomTheme, type ThemeMeta } from '../lib/theme'
import { encodeThemeCode } from '../lib/theme-code'
import { shareText } from '../lib/share-text'
import { useLongPress } from '../lib/useLongPress'
import { tap } from '../lib/haptics'
import type { DistanceUnit, Unit } from '../lib/units'

export function SettingsPage() {
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const { data: rows = [] } = useAllSets()
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [rem, setRem] = useState<ReminderSettings>(DEFAULT_SETTINGS)
  const [permDenied, setPermDenied] = useState(false)
  const qc = useQueryClient()
  const { data: backup } = useBackupStatus()
  const [busy, setBusy] = useState<'backup' | 'restore' | 'erase' | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ read: ReadFile; summary: ImportSummary; name: string } | null>(null)
  const [takeProfile, setTakeProfile] = useState(false)
  const [confirmErase, setConfirmErase] = useState(false)
  const [typed, setTyped] = useState('')

  const saveBackup = async () => {
    setBusy('backup')
    try {
      await db.flushed()
      const now = new Date()
      const result = await shareTextFile(backupFilename(now), serializeBackup(db.exportAll(now)), 'application/json')
      if (result !== 'cancelled') {
        await db.markBackedUp(now.toISOString())
        qc.invalidateQueries({ queryKey: keys.backup })
        toast(result === 'downloaded' ? 'Backup downloaded.' : 'Backup saved. Keep it somewhere other than this iPhone.', 'info')
      }
    } catch {
      toast("Couldn't make the backup. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const chooseFile = async (file: File | undefined) => {
    if (picker.current) picker.current.value = ''
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new UnreadableFile('This file is too large to be a SplitLog backup.')
      const read = readImportFile(await file.text())
      const { summary } = db.planImport(read.file, read.kind)
      if (!summary.workouts && !summary.sets && !summary.sameWorkouts) throw new UnreadableFile('There are no workouts in this file.')
      setTakeProfile(read.kind === 'backup' && db.counts().workouts === 0)
      setPending({ read, summary, name: file.name })
    } catch (e) {
      toast(e instanceof UnreadableFile ? e.message : "That file couldn't be read.", 'error', 6000)
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy('restore')
    try {
      const done = await db.importAll(pending.read.file, { takeProfile, kind: pending.read.kind })
      await reloadEverything(qc)
      setPending(null)
      toast(done.workouts ? `Restored ${done.workouts} ${done.workouts === 1 ? 'workout' : 'workouts'} and ${done.sets} sets.` : 'Everything in that file was already here.', 'info', 5000)
    } catch {
      toast("The restore didn't finish. Nothing was changed.", 'error', 6000)
    } finally {
      setBusy(null)
    }
  }

  const erase = async () => {
    setBusy('erase')
    try {
      await db.eraseEverything()
      await clearReminders().catch(() => {})
      await updateWidget({ streak: 0, thisWeek: 0, goal: 4, week: [0, 0, 0, 0, 0, 0, 0], todayIndex: -1, lastTitle: '', lastDate: '', updatedAt: Date.now() })
      setRem(DEFAULT_SETTINGS)
      await reloadEverything(qc)
      setConfirmErase(false)
      toast('Everything has been erased from this iPhone.', 'info', 5000)
    } catch {
      toast("Couldn't erase. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const lastBackup = backup?.lastBackupAt ? format(parseISO(backup.lastBackupAt), 'MMM d, yyyy') : null

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
  const custom = useCustomThemes()
  const themeTiles: ThemeMeta[] = [...THEMES, ...custom.map(customMeta)]
  const [editor, setEditor] = useState<{ open: boolean; theme: CustomTheme | null }>({ open: false, theme: null })
  const [importing, setImporting] = useState(false)
  const [themeMenu, setThemeMenu] = useState<CustomTheme | null>(null)
  const [deletingTheme, setDeletingTheme] = useState<CustomTheme | null>(null)

  const createTheme = () => {
    tap()
    if (custom.length >= MAX_CUSTOM_THEMES) {
      toast(new ThemeLimitError().message, 'info')
      return
    }
    setEditor({ open: true, theme: null })
  }

  const saveOwnTheme = async (t: CustomTheme) => {
    const isNew = !editor.theme
    try {
      const saved = await saveCustomTheme(t)
      if (isNew) await saveTheme(saved.id)
      setEditor((e) => ({ ...e, open: false }))
      toast(isNew ? `“${saved.name}” is your theme now.` : `Saved “${saved.name}”.`, 'info')
    } catch (e) {
      toast(e instanceof ThemeLimitError ? e.message : "Couldn't save the theme.")
    }
  }

  const shareTheme = async (t: CustomTheme) => {
    tap()
    const code = encodeThemeCode(t)
    try {
      const result = await shareText(`My SplitLog theme “${t.name}”\n${code}\n\nIn SplitLog: Settings → Appearance → Import a theme.`, `SplitLog theme: ${t.name}`)
      if (result === 'copied') toast('Theme code copied.', 'info')
    } catch {
      toast("Couldn't share the theme. Try again.")
    }
  }

  const importTheme = async (decoded: Omit<CustomTheme, 'id'>) => {
    try {
      const { theme: saved, updated } = await importCustomTheme(decoded)
      await saveTheme(saved.id)
      setImporting(false)
      toast(updated ? `Updated “${saved.name}” and switched to it.` : `“${saved.name}” is your theme now.`, 'info')
    } catch (e) {
      toast(e instanceof ThemeLimitError ? e.message : "Couldn't save the theme.")
    }
  }

  const removeTheme = async (t: CustomTheme) => {
    try {
      await deleteCustomTheme(t.id)
      setDeletingTheme(null)
      setEditor((e) => ({ ...e, open: false }))
      toast(`Deleted “${t.name}”.`, 'info')
    } catch {
      toast("Couldn't delete the theme.")
    }
  }

  const timeValue = `${String(rem.hour).padStart(2, '0')}:${String(rem.minute).padStart(2, '0')}`

  return (
    <>
      <PageTitle title="Settings" />

      <Section title="Appearance">
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {themeTiles.map((t) => (
              <ThemeTile key={t.id} meta={t} active={t.id === theme} onSelect={() => { tap(); saveTheme(t.id) }} onHold={t.custom ? () => setThemeMenu(t.custom!) : undefined} />
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" size="sm" className="flex-1" onClick={createTheme}><Icon.Plus /> Create your own</Button>
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => { tap(); setImporting(true) }}>Import a theme</Button>
          </div>
          {custom.length > 0 && <div className="mt-2 text-[12px] text-muted">Hold one of your themes to edit, share or delete it.</div>}
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
        {permDenied && <div className="px-4 py-3 text-[13px] text-danger">Notifications are off for SplitLog. Enable them in iPhone Settings → Notifications → SplitLog.</div>}
      </Section>

      <Section title="Your data">
        <div className="px-4 py-3 text-[13px] text-muted leading-relaxed">
          Your log is kept on this iPhone and nowhere else. It is part of your iPhone's own backups, so it comes with you to a new iPhone. Save a backup file as well, in case this phone is lost or SplitLog is deleted.
        </div>
        <Row label="Save a backup" hint={lastBackup ? `Last saved ${lastBackup}` : backup?.workouts ? 'Never saved' : 'Nothing to save yet'}>
          <Button variant="secondary" size="sm" disabled={busy !== null || !backup?.workouts} onClick={saveBackup}>
            <Icon.Share /> {busy === 'backup' ? 'Saving…' : 'Save'}
          </Button>
        </Row>
        <Row label="Restore from a file" hint="A SplitLog backup or spreadsheet export">
          <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => picker.current?.click()}>Choose file</Button>
          <input ref={picker} type="file" accept=".json,.csv,application/json,text/csv,text/comma-separated-values,public.json,public.comma-separated-values-text" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} aria-label="Choose a backup file" />
        </Row>
        <Row label="Export to CSV" hint={`${rows.length} sets, for spreadsheets`}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!rows.length}
            onClick={async () => {
              const result = await exportCsv(`fitlog-${new Date().toISOString().slice(0, 10)}.csv`, setsToCsv(rows))
              if (result === 'cancelled') return
              setExportMsg(result === 'shared' ? 'Shared.' : 'Downloaded.')
              setTimeout(() => setExportMsg(null), 2500)
            }}
          >
            <Icon.Share /> {exportMsg ?? 'Export'}
          </Button>
        </Row>
        <Row label="Erase everything" hint="Removes every workout from this iPhone">
          <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => { setTyped(''); setConfirmErase(true) }}>Erase</Button>
        </Row>
      </Section>

      <Section title="About">
        <LinkRow label="How to use SplitLog" onClick={() => openExternal(GUIDE_URL)} />
        <LinkRow label="Privacy policy" onClick={() => openExternal(PRIVACY_URL)} />
        <LinkRow label="Help and support" onClick={() => openExternal(SUPPORT_URL)} />
      </Section>

      <Sheet open={!!pending} onClose={() => busy === null && setPending(null)} title="Restore from this file?">
        {pending && (
          <>
            <p className="text-muted text-[14px] mb-3 break-words">{pending.name}</p>
            <div className="rounded-2xl bg-surface-2 px-4 py-3 mb-3 text-[15px]">
              <div className="font-semibold">{pending.summary.workouts + (pending.read.kind === 'spreadsheet' ? pending.summary.sameWorkouts : 0)} {pending.summary.workouts + (pending.read.kind === 'spreadsheet' ? pending.summary.sameWorkouts : 0) === 1 ? 'workout' : 'workouts'} in this file</div>
              {pending.summary.exercises > 0 && <div className="text-[13px] text-muted">{pending.summary.exercises} exercises for your library</div>}
            </div>
            <p className="text-muted text-[14px] mb-3">
              These are added to what is already on this iPhone. Nothing is removed.
              {pending.summary.alreadyHere > 0 && ` ${pending.summary.alreadyHere} ${pending.summary.alreadyHere === 1 ? 'item is' : 'items are'} already here and will be replaced by the file's copy.`}
              {pending.summary.sameWorkouts > 0 && pending.read.kind === 'backup' && ` ${pending.summary.sameWorkouts} ${pending.summary.sameWorkouts === 1 ? 'workout is' : 'workouts are'} already here with the same sets. The file's copy takes ${pending.summary.sameWorkouts === 1 ? 'its' : 'their'} place, bringing notes and session times with it.`}
              {pending.summary.sameWorkouts > 0 && pending.read.kind === 'spreadsheet' && ` ${pending.summary.sameWorkouts} ${pending.summary.sameWorkouts === 1 ? 'workout is' : 'workouts are'} already here with the same sets and will be left as ${pending.summary.sameWorkouts === 1 ? 'it is' : 'they are'}.`}
              {pending.summary.skipped > 0 && ` ${pending.summary.skipped} damaged ${pending.summary.skipped === 1 ? 'item' : 'items'} will be left out.`}
              {pending.read.kind === 'spreadsheet' && ' A spreadsheet holds sets only, so notes, plans and session times are not in it.'}
            </p>
            {pending.read.kind === 'backup' && (
              <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-4">
                <div>
                  <div className="text-[15px] font-medium">Use its units and weekly goal</div>
                  <div className="text-[12px] text-muted">{pending.read.file.profile.unit}, {pending.read.file.profile.distance_unit}, {pending.read.file.profile.weekly_goal} a week</div>
                </div>
                <Toggle checked={takeProfile} onChange={setTakeProfile} label="Use the file's units and weekly goal" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" disabled={busy !== null} onClick={() => setPending(null)}>Cancel</Button>
              <Button size="lg" className="flex-1" disabled={busy !== null} onClick={restore}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={confirmErase} onClose={() => busy === null && setConfirmErase(false)} title="Erase everything?">
        <p className="text-muted text-[14px] mb-3">
          This removes every workout from this iPhone ({backup?.workouts ?? 0} {backup?.workouts === 1 ? 'workout' : 'workouts'}, {backup?.sets ?? 0} sets). It can't be undone.
          {lastBackup ? ` Your last backup file was saved on ${lastBackup}.` : ' You have not saved a backup file.'}
        </p>
        <label className="block mb-3">
          <span className="block text-[12px] font-medium text-muted mb-1">Type DELETE to confirm</span>
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="DELETE" aria-label="Type DELETE to confirm" />
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" disabled={busy !== null} onClick={() => setConfirmErase(false)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" disabled={busy !== null || typed.trim().toUpperCase() !== 'DELETE'} onClick={erase}>
            {busy === 'erase' ? 'Erasing…' : 'Erase everything'}
          </Button>
        </div>
      </Sheet>

      <ThemeEditorSheet
        open={editor.open}
        initial={editor.theme}
        seed={themeMeta(theme) ?? THEMES[0]}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        onSave={saveOwnTheme}
        onShare={shareTheme}
        onDelete={(t) => setDeletingTheme(t)}
      />

      <ThemeImportSheet open={importing} onClose={() => setImporting(false)} onImport={importTheme} />

      <MenuSheet
        open={!!themeMenu}
        onClose={() => setThemeMenu(null)}
        title={themeMenu?.name}
        subtitle={themeMenu ? `${themeMenu.light ? 'Light' : 'Dark'} theme, made by you` : undefined}
        items={[
          { label: 'Use this theme', icon: <Icon.Check />, onClick: () => { if (themeMenu) saveTheme(themeMenu.id) } },
          { label: 'Edit', icon: <Icon.Note />, onClick: () => { if (themeMenu) setEditor({ open: true, theme: themeMenu }) } },
          { label: 'Share', icon: <Icon.Share />, onClick: () => { if (themeMenu) shareTheme(themeMenu) } },
          { label: 'Delete', icon: <Icon.Trash />, danger: true, onClick: () => { if (themeMenu) setDeletingTheme(themeMenu) } },
        ]}
      />

      <Sheet open={!!deletingTheme} onClose={() => setDeletingTheme(null)} title={`Delete “${deletingTheme?.name ?? ''}”?`}>
        <p className="text-muted text-[14px] mb-4">
          {deletingTheme?.id === theme ? 'It is the theme in use, so the screen goes back to a built-in one. ' : ''}
          Share it first if you want to keep a copy of its code.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setDeletingTheme(null)}>Cancel</Button>
          <Button size="lg" className="flex-1 !bg-danger !text-white" onClick={() => { if (deletingTheme) removeTheme(deletingTheme) }}>Delete</Button>
        </div>
      </Sheet>
    </>
  )
}

/** One theme in the picker. Tapping applies it; holding one of your own opens its menu. */
function ThemeTile({ meta, active, onSelect, onHold }: { meta: ThemeMeta; active: boolean; onSelect: () => void; onHold?: () => void }) {
  const press = useLongPress(() => onHold?.())
  return (
    <button
      type="button"
      {...(onHold ? press : {})}
      onClick={onSelect}
      aria-pressed={active}
      className={`press-soft rounded-2xl p-2 text-left border-2 ${active ? 'border-accent' : 'border-transparent'}`}
    >
      <div className="h-14 rounded-xl overflow-hidden flex flex-col p-2 gap-1.5" style={{ background: meta.swatch[0] }}>
        <div className="h-2.5 w-2/3 rounded-full" style={{ background: meta.swatch[3], opacity: 0.9 }} />
        <div className="flex gap-1.5 items-end flex-1">
          <div className="h-full flex-1 rounded-md" style={{ background: meta.swatch[1] }} />
          <div className="h-4 w-8 rounded-full" style={{ background: meta.swatch[2] }} />
        </div>
      </div>
      <div className="mt-1.5 text-[13px] font-medium truncate">{meta.name}</div>
      <div className="text-[11px] text-muted leading-tight">{meta.tagline}</div>
    </button>
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

function LinkRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between gap-3 px-4 min-h-[56px] text-left active:bg-surface-2 first:rounded-t-[18px] last:rounded-b-[18px]">
      <span className="text-[15px] font-medium">{label}</span>
      <span className="text-faint"><Icon.ChevronRight /></span>
    </button>
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
