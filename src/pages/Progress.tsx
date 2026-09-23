import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, subMonths } from 'date-fns'
import { useAllSets, useExercises, useProfile } from '../api/queries'
import { ExercisePicker } from '../components/ExercisePicker'
import { ProgressChart, type ChartPoint } from '../components/ProgressChart'
import { EmptyState, Icon, PageTitle, Spinner } from '../components/ui'
import { counts, prTimeline, sessionsFor } from '../lib/prs'
import { convert, convertDistance, formatDistance, formatDuration, formatPace, formatWeight, fromKg } from '../lib/units'

const RANGES = [
  { key: '1M', months: 1 },
  { key: '3M', months: 3 },
  { key: '6M', months: 6 },
  { key: '1Y', months: 12 },
  { key: 'All', months: 0 },
] as const
type RangeKey = (typeof RANGES)[number]['key']
type CardioMetric = 'distance' | 'time' | 'pace'

export function ProgressPage() {
  const { data: rows = [], isLoading } = useAllSets()
  const { data: exercises = [] } = useExercises()
  const { data: profile } = useProfile()
  const unit = profile?.unit ?? 'lb'
  const du = profile?.distance_unit ?? 'mi'
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('6M')
  const [metric, setMetric] = useState<CardioMetric>('distance')
  const [picker, setPicker] = useState(false)

  const logged = useMemo(() => exercises.filter((e) => e.lastUsed).sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '')), [exercises])
  useEffect(() => {
    if (!exerciseId && logged.length) setExerciseId(logged[0].id)
  }, [logged, exerciseId])

  const exercise = exercises.find((e) => e.id === exerciseId)
  const cardio = exercise?.kind === 'cardio'
  const sessions = useMemo(() => {
    if (!exerciseId) return []
    const all = sessionsFor(rows, exerciseId)
    return cardio ? all.filter((s) => s.seconds > 0 || s.km > 0) : all.filter((s) => s.topReps > 0)
  }, [rows, exerciseId, cardio])
  const prs = useMemo(() => (cardio ? [] : prTimeline(sessions)), [sessions, cardio])
  const prWorkoutIds = useMemo(() => new Set(prs.map((p) => p.workout_id)), [prs])

  const cutoff = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)!.months
    return months ? format(subMonths(new Date(), months), 'yyyy-MM-dd') : ''
  }, [range])

  const points: ChartPoint[] = useMemo(() => {
    const inRange = sessions.filter((s) => s.date >= cutoff)
    if (cardio) {
      return inRange
        .map((s) => {
          const dist = convertDistance(s.km, 'km', du)
          const value = metric === 'distance' ? dist : metric === 'time' ? s.seconds / 60 : dist && s.seconds ? s.seconds / dist / 60 : 0
          return { date: s.date, weight: Math.round(value * 100) / 100, reps: 0, isPr: false, label: cardioLabel(s.seconds, dist, du) }
        })
        .filter((p) => p.weight > 0)
    }
    return inRange.map((s) => ({ date: s.date, weight: fromKg(s.topKg, unit), reps: s.topReps, isPr: prWorkoutIds.has(s.workout_id) }))
  }, [sessions, cutoff, unit, prWorkoutIds, cardio, metric, du])

  if (isLoading) return <><PageTitle title="Progress" /><Spinner /></>

  if (logged.length === 0) {
    return (
      <>
        <PageTitle title="Progress" />
        <EmptyState icon={<Icon.Chart />} title="No data yet" body="Log a few sessions of the same exercise and your progression chart will appear here." />
      </>
    )
  }

  // Strength stats
  const best = prs.at(-1)
  const lastSession = sessions.at(-1)
  const firstSession = sessions[0]
  const gain = best && firstSession ? fromKg(best.kg, unit) - fromKg(firstSession.topKg, unit) : 0

  // Cardio stats
  const longest = cardio ? sessions.reduce((m, s) => (s.km > m.km ? s : m), sessions[0]) : undefined
  const fastest = cardio ? sessions.filter((s) => s.km > 0 && s.seconds > 0).reduce<typeof sessions[number] | undefined>((m, s) => (!m || s.seconds / s.km < m.seconds / m.km ? s : m), undefined) : undefined
  const totalKm = cardio ? sessions.reduce((n, s) => n + s.km, 0) : 0

  const yLabel = cardio ? (metric === 'distance' ? `Distance (${du})` : metric === 'time' ? 'Time (min)' : `Pace (min/${du})`) : `Top set weight (${unit})`

  return (
    <>
      <PageTitle title="Progress" />

      <button type="button" onClick={() => setPicker(true)} className="w-full flex items-center justify-between bg-surface rounded-[18px] border border-border/60 px-4 h-14 active:bg-surface-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[17px] font-semibold truncate">{exercise?.name ?? 'Choose exercise'}</span>
          {cardio && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted bg-surface-2 rounded px-1.5 py-0.5">Cardio</span>}
        </span>
        <span className="text-muted"><Icon.ChevronDown /></span>
      </button>

      {cardio ? (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="Longest" value={longest && longest.km ? formatDistance(convertDistance(longest.km, 'km', du)) : '–'} sub={longest && longest.km ? `${du} · ${format(parseISO(longest.date), 'MMM d')}` : ''} accent />
          <Stat label="Fastest pace" value={fastest ? formatDuration(fastest.seconds / convertDistance(fastest.km, 'km', du)) : '–'} sub={fastest ? `/${du} · ${format(parseISO(fastest.date), 'MMM d')}` : ''} />
          <Stat label="Total" value={formatDistance(convertDistance(totalKm, 'km', du))} sub={`${du} · ${sessions.length} sessions`} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="All-time best" value={best ? `${formatWeight(fromKg(best.kg, unit))}` : '–'} sub={best ? `${unit} × ${best.reps} · ${format(parseISO(best.date), 'MMM d')}` : ''} accent />
          <Stat label="Last session" value={lastSession ? formatWeight(fromKg(lastSession.topKg, unit)) : '–'} sub={lastSession ? `${unit} × ${lastSession.topReps}` : ''} />
          <Stat label="Since first" value={sessions.length > 1 ? `${gain >= 0 ? '+' : ''}${formatWeight(gain)}` : '–'} sub={sessions.length > 1 ? `${unit} · ${sessions.length} sessions` : `${sessions.length} session`} />
        </div>
      )}

      <div className="bg-surface rounded-[22px] border border-border/60 p-4 mt-3">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-[13px] font-medium text-muted truncate">{yLabel}</div>
          <div className="flex gap-1 shrink-0">
            {RANGES.map((r) => (
              <button key={r.key} type="button" onClick={() => setRange(r.key)} className={`h-7 px-2.5 rounded-lg text-[12px] font-semibold ${range === r.key ? 'bg-surface-3 text-text' : 'text-faint'}`}>
                {r.key}
              </button>
            ))}
          </div>
        </div>
        {cardio && (
          <div className="flex gap-1 mb-2">
            {(['distance', 'time', 'pace'] as CardioMetric[]).map((m) => (
              <button key={m} type="button" onClick={() => setMetric(m)} className={`h-8 px-3 rounded-full text-[12px] font-semibold capitalize ${metric === m ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
                {m}
              </button>
            ))}
          </div>
        )}
        {points.length ? (
          <ProgressChart points={points} unit={cardio ? (metric === 'distance' ? du : metric === 'time' ? 'min' : `min/${du}`) : unit} lowerIsBetter={cardio && metric === 'pace'} />
        ) : (
          <div className="h-[220px] flex items-center justify-center text-muted text-[14px]">No sessions in this range.</div>
        )}
        {!cardio && (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pr" /> PR session</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> Latest</span>
          </div>
        )}
      </div>

      {prs.length > 0 && (
        <>
          <h2 className="text-[17px] font-semibold mt-7 mb-3">Personal records</h2>
          <div className="bg-surface rounded-[18px] border border-border/60 divide-y divide-border/50">
            {[...prs].reverse().map((p) => (
              <div key={p.workout_id} className="flex items-center gap-3 px-4 h-14">
                <span className="h-8 w-8 rounded-lg bg-pr-dim text-pr flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 16 3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold tabular">{formatWeight(fromKg(p.kg, unit))} {unit} × {p.reps}</div>
                  <div className="text-[12px] text-muted">{format(parseISO(p.date), 'EEE, MMM d yyyy')}</div>
                </div>
                {p.prevKg > 0 && <div className="text-[13px] font-medium text-accent tabular">+{formatWeight(fromKg(p.kg - p.prevKg, unit))}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {sessions.length > 0 && (
        <>
          <h2 className="text-[17px] font-semibold mt-7 mb-3">Sessions</h2>
          <div className="bg-surface rounded-[18px] border border-border/60 divide-y divide-border/50">
            {[...sessions].reverse().slice(0, 12).map((s) => {
              const dist = convertDistance(s.km, 'km', du)
              return (
                <div key={s.workout_id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-medium">{format(parseISO(s.date), 'EEE, MMM d')} <span className="text-faint">· {s.workout_title || 'Workout'}</span></div>
                    <div className="text-[12px] text-muted tabular">
                      {cardio ? formatPace(s.seconds, dist, du) : `${formatWeight(fromKg(s.volumeKg, unit))} ${unit} vol`}
                    </div>
                  </div>
                  <div className="mt-1 text-[13px] text-muted tabular">
                    {cardio
                      ? `${formatDuration(s.seconds)}${dist ? ` · ${formatDistance(dist)} ${du}` : ''} · ${s.sets.length} ${s.sets.length === 1 ? 'interval' : 'intervals'}`
                      : s.sets
                          .filter((x) => x.reps > 0)
                          .map((x) => `${x.set_type === 'warmup' ? 'W ' : ''}${formatWeight(convert(x.weight, x.unit, unit))}×${x.reps}${counts(x) ? '' : ''}`)
                          .join('  ')}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} historyOnly title="Choose exercise" onPick={(_name, _kind, id) => id && setExerciseId(id)} />
    </>
  )
}

function cardioLabel(seconds: number, dist: number, du: string) {
  return `${formatDuration(seconds)}${dist ? ` · ${formatDistance(dist)} ${du} · ${formatPace(seconds, dist, du as 'km' | 'mi')}` : ''}`
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="bg-surface rounded-[18px] border border-border/60 p-3 min-w-0">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`mt-1 text-[22px] leading-none font-bold truncate ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="mt-1 text-[11px] text-faint truncate">{sub}</div>
    </div>
  )
}
