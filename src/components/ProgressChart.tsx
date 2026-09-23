import { format, parseISO } from 'date-fns'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWeight, type Unit } from '../lib/units'

export interface ChartPoint {
  date: string
  weight: number
  reps: number
  isPr: boolean
  /** Optional preformatted tooltip line (cardio). */
  label?: string
}

const ACCENT = '#c6f135'
const SURFACE = '#15181d'
const GRID = '#262b33'
const MUTED = '#8b93a1'

export function ProgressChart({ points, unit, lowerIsBetter = false }: { points: ChartPoint[]; unit: Unit | string; lowerIsBetter?: boolean }) {
  if (points.length === 0) return null
  const values = points.map((p) => p.weight)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max(lowerIsBetter ? 0.5 : 2.5, (max - min) * 0.15)
  const single = points.length === 1

  return (
    <div className="h-[220px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 20, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => format(parseISO(d), 'MMM d')}
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={44}
          />
          <YAxis
            domain={[Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]}
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => formatWeight(v)}
          />
          <Tooltip
            cursor={{ stroke: GRID, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as ChartPoint
              return (
                <div className="rounded-xl bg-surface-3 border border-border px-3 py-2 text-[13px] shadow-lg">
                  <div className="text-muted">{format(parseISO(p.date), 'EEE, MMM d yyyy')}</div>
                  <div className="font-semibold tabular">
                    {p.label ?? `${formatWeight(p.weight)} ${unit} × ${p.reps}`}
                    {p.isPr && <span className="ml-2 text-pr">PR</span>}
                  </div>
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: ChartPoint; index: number }
              const isLast = index === points.length - 1
              const show = single || payload.isPr || isLast
              if (!show) return <g key={index} />
              return <circle key={index} cx={cx} cy={cy} r={isLast ? 5 : 4} fill={payload.isPr ? '#ffb020' : ACCENT} stroke={SURFACE} strokeWidth={2} />
            }}
            activeDot={{ r: 6, fill: ACCENT, stroke: SURFACE, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
