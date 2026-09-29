import type { SetRow } from './prs'
import { isNative } from './native'

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (it starts with = + - or @) is
 * prefixed with an apostrophe so it is shown as typed. Numbers are left alone.
 */
export function esc(v: string | number | null): string {
  let s = v == null ? '' : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function setsToCsv(rows: SetRow[]): string {
  const header = ['date', 'workout', 'exercise', 'kind', 'set', 'type', 'weight', 'unit', 'reps', 'duration_seconds', 'distance', 'distance_unit', 'incline_pct', 'speed', 'level', 'calories', 'heart_rate', 'floors', 'watts', 'rpm']
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const lines = sorted.flatMap((r) => [
    [r.date, r.workout_title, r.exercise_name, r.exercise_kind, r.set_number, r.set_type, r.weight, r.unit, r.reps, r.duration_seconds, r.distance, r.distance_unit, r.incline, r.extra.speed ?? null, r.extra.level ?? null, r.extra.calories ?? null, r.extra.hr ?? null, r.extra.floors ?? null, r.extra.watts ?? null, r.extra.rpm ?? null].map(esc).join(','),
    // Each weight-drop of a drop set becomes its own line, labelled with the parent set number.
    ...r.drops.map((d, i) => [r.date, r.workout_title, r.exercise_name, r.exercise_kind, `${r.set_number}.${i + 1}`, 'drop', d.weight, r.unit, d.reps, null, null, null, null, null, null, null, null, null, null, null].map(esc).join(',')),
  ])
  return [header.join(','), ...lines].join('\n')
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hand a text file to the person. iPhone: the share sheet ("Save to Files", AirDrop, Mail…).
 * Browser: the Web Share API where it can carry files, otherwise a download.
 */
export async function shareTextFile(filename: string, text: string, type: string): Promise<ShareResult> {
  if (isNative) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const written = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    try {
      await Share.share({ title: filename, url: written.uri })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test((e as Error).message ?? '')) return 'cancelled'
      throw e
    } finally {
      // The copy in the cache was only there to be shared.
      Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {})
    }
  }
  const file = new File([text], filename, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export const exportCsv = (filename: string, csv: string) => shareTextFile(filename, csv, 'text/csv')
