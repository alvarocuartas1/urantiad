import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SalesTrend, TrendPoint } from '@/types/statistics'
import { formatCurrency } from '@/utils/format'
import { formatCompactCurrency, formatPeriod } from '@/utils/statistics'

// Tailwind slate: one series, so one hue; grid and axes stay recessive.
const BAR_COLOR = '#334155' // slate-700
const CURSOR_COLOR = '#f1f5f9' // slate-100
const GRID_COLOR = '#e2e8f0' // slate-200
const AXIS_TEXT_COLOR = '#64748b' // slate-500
const CHART_HEIGHT = 256

interface Datum extends TrendPoint {
  label: string
  /** Chart position only: amounts are shown from the exact decimal strings. */
  value: number
}

interface TrendTooltipProps {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  trend: SalesTrend
}

function TrendTooltip({ active, payload, trend }: TrendTooltipProps) {
  const point = payload?.[0]?.payload as Datum | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">
        {formatPeriod(point.period_start, trend.granularity)}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-slate-600">
        <dt>Total</dt>
        <dd className="text-right font-medium text-slate-900 tabular-nums">
          {formatCurrency(point.total)}
        </dd>
        <dt>Ventas</dt>
        <dd className="text-right tabular-nums">{point.sales_count}</dd>
        <dt>Sin IVA</dt>
        <dd className="text-right tabular-nums">{formatCurrency(point.net_total)}</dd>
        {point.gross_margin !== null && (
          <>
            <dt>Margen bruto</dt>
            <dd className="text-right tabular-nums">{formatCurrency(point.gross_margin)}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

/** Column per period of the sales total, with the details of each one on hover. */
export function SalesTrendChart({ trend }: { trend: SalesTrend }) {
  const data: Datum[] = trend.points.map((point) => ({
    ...point,
    label: formatPeriod(point.period_start, trend.granularity, 'short'),
    value: Number(point.total),
  }))
  return (
    <div className="h-64" aria-hidden="true">
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHT}
        initialDimension={{ width: 600, height: CHART_HEIGHT }}
      >
        {/* Hidden from assistive technology: the table view carries the same data. */}
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={formatCompactCurrency}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
            width={72}
          />
          <Tooltip
            cursor={{ fill: CURSOR_COLOR }}
            content={({ active, payload }) => (
              <TrendTooltip active={active} payload={payload} trend={trend} />
            )}
            isAnimationActive={false}
          />
          <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
