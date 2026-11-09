import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BenchmarkRow, Route, TrendPoint } from '../types'
import { congestionColors, formatNumber, routeColors } from '../lib/format'
import { EmptyState } from './ui'
import { Activity } from 'lucide-react'

const axisTick = { fill: '#6c8ca3', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }
const gridStroke = 'rgba(168,189,203,0.075)'

function ChartTooltip({ active, payload, label, suffix = '' }: { active?: boolean; payload?: any[]; label?: any; suffix?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/[0.12] bg-ink-950/95 px-2.5 py-2 shadow-xl backdrop-blur">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</div>
      {payload.map((item: any) => (
        <div key={item.dataKey ?? item.name} className="flex items-center justify-between gap-4 py-0.5 text-[10px]">
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color ?? item.fill }} />
            {item.name}
          </span>
          <span className="mono text-ink-100">
            {typeof item.value === 'number' ? formatNumber(item.value, item.value < 10 ? 2 : 1) : item.value}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  )
}

function EmptyChart({ label = 'No data yet' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={Activity} title={label} description="Run the simulation to generate chart data." />
    </div>
  )
}

export function CongestionDonut({ data }: { data: { key: string; label: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (!total) return <EmptyChart />
  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((item) => (
                <Cell key={item.key} fill={congestionColors[item.key as keyof typeof congestionColors] ?? '#436781'} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono text-xl font-semibold tracking-[-0.04em] text-ink-100">{total}</span>
          <span className="text-[8px] uppercase tracking-[0.14em] text-ink-500">roads</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {data.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: congestionColors[item.key as keyof typeof congestionColors] ?? '#436781' }}
            />
            <span className="flex-1 truncate text-[10px] text-ink-400">{item.label}</span>
            <span className="mono text-[10px] text-ink-200">{item.value}</span>
            <span className="mono w-8 text-right text-[9px] text-ink-600">{total ? `${Math.round((item.value / total) * 100)}%` : '0%'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TrafficTrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#43e0b0" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#43e0b0" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="congestionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8a21e" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#e8a21e" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="clock" tick={axisTick} axisLine={false} tickLine={false} minTickGap={30} />
        <YAxis yAxisId="speed" tick={axisTick} axisLine={false} tickLine={false} domain={[0, 80]} />
        <YAxis yAxisId="cong" orientation="right" tick={axisTick} axisLine={false} tickLine={false} domain={[0, 100]} width={26} />
        <Tooltip content={<ChartTooltip />} />
        <Area yAxisId="cong" type="monotone" dataKey="avg_congestion" name="Congestion %" stroke="#e8a21e" strokeWidth={1.2} fill="url(#congestionFill)" dot={false} isAnimationActive={false} />
        <Area yAxisId="speed" type="monotone" dataKey="avg_speed_kph" name="Avg speed km/h" stroke="#43e0b0" strokeWidth={1.8} fill="url(#speedFill)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SpeedHistogram({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -26 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip suffix=" roads" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="value" name="Roads" fill="#3e8f7e" radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RouteComparisonChart({
  routes,
  selectedId,
  dataKey,
  unit,
}: {
  routes: Route[]
  selectedId?: string | null
  dataKey: 'travel_time_min' | 'distance_km' | 'congestion_score' | 'co2_kg'
  unit: string
}) {
  const data = routes.map((route, index) => ({
    name: route.route_id === selectedId ? `${route.label}` : `Route ${index + 1}`,
    value: route[dataKey],
    id: route.route_id,
    color: route.route_id === selectedId ? '#43e0b0' : routeColors[(index + 1) % routeColors.length],
  }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: '#a8bdcb', fontSize: 9 }} width={118} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip suffix={` ${unit}`} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="value" name={unit} radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((item) => (
            <Cell key={item.id} fill={item.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MetricBarChart({
  data,
  dataKey,
  label,
  unit,
  color = '#43e0b0',
  highlightBest = false,
}: {
  data: BenchmarkRow[]
  dataKey: 'execution_ms' | 'explored_nodes' | 'memory_kb' | 'objective_cost'
  label: string
  unit: string
  color?: string
  highlightBest?: boolean
}) {
  const rows = data.filter((row) => row.status === 'ok')
  if (!rows.length) return <EmptyChart label="Run a benchmark" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#a8bdcb', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip suffix={` ${unit}`} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey={dataKey} name={label} radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.algorithm} fill={highlightBest && row.best_cost ? '#43e0b0' : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DegreeChart({ data }: { data: { degree: number; nodes: number }[] }) {
  if (!data.length) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -26 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="degree" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip suffix=" nodes" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="nodes" name="Junctions" fill="#6c8ca3" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function UtilizationChart({ data }: { data: { road_class: string; avg_utilization: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} domain={[0, 140]} />
        <YAxis type="category" dataKey="road_class" tick={{ fill: '#a8bdcb', fontSize: 9 }} width={72} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="avg_utilization" name="Utilization" fill="#3e8f7e" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
