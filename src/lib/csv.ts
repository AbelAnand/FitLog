import type { SetRow } from './prs'

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

/** Share on iOS (opens the share sheet), otherwise download. */
export async function exportCsv(filename: string, csv: string): Promise<'shared' | 'downloaded'> {
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
