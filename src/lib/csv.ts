import type { SetRow } from './prs'
import { isNative } from './native'

function esc(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function setsToCsv(rows: SetRow[]): string {
  const header = ['date', 'workout', 'exercise', 'set', 'weight', 'unit', 'reps']
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const lines = sorted.map((r) => [r.date, r.workout_title, r.exercise_name, r.set_number, r.weight, r.unit, r.reps].map(esc).join(','))
  return [header.join(','), ...lines].join('\n')
}

/** Native app: write to the cache dir and open the iOS share sheet. Web: Web Share API or download. */
export async function exportCsv(filename: string, csv: string): Promise<'shared' | 'downloaded'> {
  if (isNative) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const written = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 })
    try {
      await Share.share({ title: 'FitLog export', url: written.uri })
    } catch (e) {
      if (!/cancel/i.test((e as Error).message ?? '')) throw e
    }
    return 'shared'
  }
  const file = new File([csv], filename, { type: 'text/csv' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'FitLog export' })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
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
