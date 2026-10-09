import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { reloadEverything } from '../api/mutations'
import { db, type ImportSummary } from '../db'
import type { ReadFile } from '../db/backup'
import { sharedAsImport, sharedPlanDate, sharedWorkoutOf, type SharedImportMode } from '../db/share'
import type { BackupFile } from '../db/types'
import { cleanExercise } from '../db/clean'
import { dayKey } from '../lib/splits'
import { toast } from '../lib/toast'
import { Button, Sheet, Toggle } from './ui'

export interface PendingFile {
  read: ReadFile
  name: string
}

/**
 * "Restore from this file?": what a chosen or opened file would add, and the button that does it.
 * A full backup and a spreadsheet are described as Settings always has; a shared workout is
 * offered as a plan for today (or its own future date), with a switch to keep it as the completed
 * workout it was. Nothing on the phone is removed by any of them.
 */
export function RestoreSheet({ file, onClose, onImported }: { file: PendingFile | null; onClose: () => void; onImported?: (summary: ImportSummary, workoutId: string | null) => void }) {
  return (
    <Sheet open={!!file} onClose={onClose} title={file?.read.kind === 'shared' ? 'Add this workout?' : 'Restore from this file?'}>
      {file && <Preview file={file} onClose={onClose} onImported={onImported} />}
    </Sheet>
  )
}

function Preview({ file, onClose, onImported }: { file: PendingFile; onClose: () => void; onImported?: (summary: ImportSummary, workoutId: string | null) => void }) {
  const qc = useQueryClient()
  const { read, name } = file
  const shared = read.kind === 'shared' ? sharedWorkoutOf(read.file) : null
  const [mode, setMode] = useState<SharedImportMode>('plan')
  const [takeProfile, setTakeProfile] = useState(() => read.kind === 'backup' && db.counts().workouts === 0)
  const [busy, setBusy] = useState(false)
  const today = dayKey(new Date())

  // What would go in, and what the database says about it. For a shared file this depends on the switch.
  const plan = useMemo(() => {
    const toImport: BackupFile = read.kind === 'shared' ? sharedAsImport(read.file, mode, today) : read.file
    const { summary } = db.planImport(toImport, read.kind)
    return { toImport, summary }
  }, [read, mode, today])
  const { summary } = plan

  const restore = async () => {
    setBusy(true)
    try {
      const done = await db.importAll(plan.toImport, { takeProfile: read.kind === 'backup' && takeProfile, kind: read.kind })
      await reloadEverything(qc)
      const workoutId = read.kind === 'shared' && done.workouts ? plan.toImport.shared?.workout_id ?? null : null
      onClose()
      if (read.kind === 'shared') toast(done.workouts ? (mode === 'plan' ? `${shared?.title || 'The workout'} is on your calendar.` : `${shared?.title || 'The workout'} was added to your log.`) : 'That workout is already here.', 'info', 5000)
      else toast(done.workouts ? `Restored ${done.workouts} ${done.workouts === 1 ? 'workout' : 'workouts'} and ${done.sets} sets.` : 'Everything in that file was already here.', 'info', 5000)
      onImported?.(done, workoutId)
    } catch {
      toast("The restore didn't finish. Nothing was changed.", 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  if (read.kind === 'shared') {
    if (!shared) return <p className="text-muted text-[14px] mb-4">This file does not hold a shared workout.</p>
    const planDate = sharedPlanDate(shared, today)
    const exerciseNames = read.file.exercises.map(cleanExercise).filter((e): e is NonNullable<typeof e> => !!e).map((e) => e.name)
    const newNames = exerciseNames.filter((n) => !db.findExerciseByName(n))
    const alreadyHere = summary.workouts === 0
    const sets = summary.sets
    return (
      <>
        <p className="text-muted text-[14px] mb-3 break-words">{name}</p>
        <div className="rounded-2xl bg-surface-2 px-4 py-3 mb-3">
          <div className="text-[15px] font-semibold">{shared.title || 'Workout'}</div>
          <div className="text-[13px] text-muted">
            {shared.is_plan ? 'Planned for' : 'Done on'} {format(parseISO(shared.date), 'EEE, MMM d, yyyy')} · {exerciseNames.length} {exerciseNames.length === 1 ? 'exercise' : 'exercises'}{sets ? ` · ${sets} sets` : ''}
          </div>
          {exerciseNames.length > 0 && <div className="mt-1 text-[13px] text-muted truncate">{exerciseNames.join(' · ')}</div>}
        </div>
        <p className="text-muted text-[14px] mb-3">
          {alreadyHere
            ? mode === 'plan' ? 'This plan is already on your calendar for that day, so nothing will be added.' : 'This workout is already in your log, so nothing will be added.'
            : mode === 'plan'
              ? `It goes on your calendar as a plan for ${planDate === today ? 'today' : format(parseISO(planDate), 'EEEE, MMM d')}. Start it when you are ready; it will not count as training until you do.`
              : `It goes into your log as a finished workout on ${format(parseISO(shared.date), 'EEEE, MMM d, yyyy')}, and counts towards your streak and records.`}
          {newNames.length > 0 && ` ${newNames.length === 1 ? `${newNames[0]} is` : `${newNames.length} exercises are`} new and will be added to your library; the rest match exercises you already have.`}
          {summary.skipped > 0 && ` ${summary.skipped} damaged ${summary.skipped === 1 ? 'item' : 'items'} will be left out.`}
        </p>
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-4">
          <div>
            <div className="text-[15px] font-medium">Keep as a completed workout</div>
            <div className="text-[12px] text-muted">On its original date, as the sender logged it</div>
          </div>
          <Toggle checked={mode === 'original'} onChange={(v) => setMode(v ? 'original' : 'plan')} label="Keep as a completed workout on its original date" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button size="lg" className="flex-1" disabled={busy || alreadyHere} onClick={restore}>{busy ? 'Adding…' : mode === 'plan' ? 'Add to calendar' : 'Add to log'}</Button>
        </div>
      </>
    )
  }

  const count = summary.workouts + (read.kind === 'spreadsheet' ? summary.sameWorkouts : 0)
  return (
    <>
      <p className="text-muted text-[14px] mb-3 break-words">{name}</p>
      <div className="rounded-2xl bg-surface-2 px-4 py-3 mb-3 text-[15px]">
        <div className="font-semibold">{count} {count === 1 ? 'workout' : 'workouts'} in this file</div>
        {summary.exercises > 0 && <div className="text-[13px] text-muted">{summary.exercises} exercises for your library</div>}
        {summary.splits > 0 && <div className="text-[13px] text-muted">{summary.splits} {summary.splits === 1 ? 'split' : 'splits'}</div>}
      </div>
      <p className="text-muted text-[14px] mb-3">
        These are added to what is already on this iPhone. Nothing is removed.
        {summary.alreadyHere > 0 && ` ${summary.alreadyHere} ${summary.alreadyHere === 1 ? 'item is' : 'items are'} already here and will be replaced by the file's copy.`}
        {summary.sameWorkouts > 0 && read.kind === 'backup' && ` ${summary.sameWorkouts} ${summary.sameWorkouts === 1 ? 'workout is' : 'workouts are'} already here with the same sets. The file's copy takes ${summary.sameWorkouts === 1 ? 'its' : 'their'} place, bringing notes and session times with it.`}
        {summary.sameWorkouts > 0 && read.kind === 'spreadsheet' && ` ${summary.sameWorkouts} ${summary.sameWorkouts === 1 ? 'workout is' : 'workouts are'} already here with the same sets and will be left as ${summary.sameWorkouts === 1 ? 'it is' : 'they are'}.`}
        {summary.skipped > 0 && ` ${summary.skipped} damaged ${summary.skipped === 1 ? 'item' : 'items'} will be left out.`}
        {read.kind === 'spreadsheet' && ' A spreadsheet holds sets only, so notes, plans and session times are not in it.'}
      </p>
      {read.kind === 'backup' && (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 mb-4">
          <div>
            <div className="text-[15px] font-medium">Use its units and weekly goal</div>
            <div className="text-[12px] text-muted">{read.file.profile.unit}, {read.file.profile.distance_unit}, {read.file.profile.weekly_goal} a week</div>
          </div>
          <Toggle checked={takeProfile} onChange={setTakeProfile} label="Use the file's units and weekly goal" />
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button size="lg" className="flex-1" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : 'Restore'}</Button>
      </div>
    </>
  )
}
