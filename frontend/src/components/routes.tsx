import {
  ArrowRight,
  Clock3,
  Fuel,
  Gauge,
  GitCompareArrows,
  Leaf,
  Route as RouteIcon,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import type { RouteChange } from '../state'
import type { Route } from '../types'
import { congestionColors, formatCurrency, formatNumber, formatTime, objectiveShort, routeColors, titleCase } from '../lib/format'
import { cx } from '../lib/cx'
import { Badge, CongestionPill, MiniBar } from './ui'

export function RouteCard({
  route,
  selected,
  onSelect,
  accentIndex = 0,
}: {
  route: Route
  selected?: boolean
  onSelect?: () => void
  accentIndex?: number
}) {
  const color = selected ? '#43e0b0' : routeColors[(accentIndex + 1) % routeColors.length]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'group w-full rounded-xl border p-4 text-left transition-colors',
        selected
          ? 'border-signal-500/35 bg-signal-500/[0.055]'
          : 'border-white/[0.07] bg-ink-850/70 hover:border-white/[0.14]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
            <span className="truncate text-xs font-semibold text-ink-100">{route.label}</span>
            {route.recommended && <Sparkles size={11} className="shrink-0 text-signal-400" />}
          </div>
          <div className="mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-ink-500">
            {route.node_names[0]} → {route.node_names[route.node_names.length - 1]}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-lg font-semibold tracking-[-0.04em] text-ink-100">{formatTime(route.travel_time_min)}</div>
          <div className="mono text-[9px] text-ink-500">{formatNumber(route.distance_km, 1)} km</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <CongestionPill level={route.congestion_label.toLowerCase() as never} score={route.congestion_score} />
        {route.tags
          .filter((tag) => tag !== 'Recommended')
          .slice(0, 3)
          .map((tag) => (
            <Badge key={tag} tone={tag === 'Fastest' ? 'signal' : tag === 'Shortest' ? 'blue' : 'default'}>
              {tag}
            </Badge>
          ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
        <MiniMetric icon={Gauge} label="Avg speed" value={`${formatNumber(route.avg_speed_kph, 0)} km/h`} />
        <MiniMetric icon={Leaf} label="CO₂" value={`${formatNumber(route.co2_kg, 2)} kg`} />
        <MiniMetric icon={Waypoints} label="Segments" value={`${route.segment_count}`} />
      </div>
    </button>
  )
}

function energyValue(route: Route): string {
  return route.fuel_l > 0 ? `${formatNumber(route.fuel_l, 2)} L` : `${formatNumber(route.energy_kwh, 2)} kWh`
}

function energyLabel(route: Route): string {
  return route.fuel_l > 0 ? 'Fuel estimate' : 'Energy estimate'
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.1em] text-ink-500">
        <Icon size={9} />
        {label}
      </div>
      <div className="mono mt-1 text-[10px] text-ink-200">{value}</div>
    </div>
  )
}

export function RecommendedRoutePanel({
  route,
  explanation,
  comparison,
  candidateCount,
  onOpenPlanner,
}: {
  route: Route
  explanation: string
  comparison?: Route[]
  candidateCount?: number
  onOpenPlanner?: () => void
}) {
  const shortest = comparison?.length
    ? comparison.reduce((best, item) => (item.distance_km < best.distance_km ? item : best), comparison[0])
    : route
  const timeVsShortest = shortest.travel_time_min - route.travel_time_min
  const efficiency = route.travel_time_min > 0 ? (route.free_flow_time_min / route.travel_time_min) * 100 : 0
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Current recommendation</div>
          <div className="mt-1 text-sm font-semibold text-ink-100">{route.label}</div>
        </div>
        <Badge tone="signal">
          <Sparkles size={10} /> Recommended
        </Badge>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <span className="mono text-4xl font-semibold tracking-[-0.06em] text-ink-100">{formatNumber(route.travel_time_min, 1)}</span>
        <span className="mb-1 text-xs text-ink-400">min</span>
        <span className="mb-1 ml-auto mono text-xs text-ink-400">{formatNumber(route.distance_km, 1)} km</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4">
        <OverviewLine label="Average speed" value={`${formatNumber(route.avg_speed_kph, 0)} km/h`} />
        <OverviewLine label="Congestion" value={`${formatNumber(route.congestion_score, 0)}%`} valueColor={congestionColors[route.congestion_label.toLowerCase() as keyof typeof congestionColors]} />
        <OverviewLine label="Route efficiency" value={`${formatNumber(efficiency, 0)}%`} />
        <OverviewLine label="Free-flow time" value={formatTime(route.free_flow_time_min)} />
        <OverviewLine
          label="Time vs shortest"
          value={timeVsShortest >= 0 ? `saves ${formatNumber(timeVsShortest, 1)} min` : `${formatNumber(Math.abs(timeVsShortest), 1)} min slower`}
        />
        <OverviewLine label="Traffic delay" value={`+${formatNumber(route.delay_min, 1)} min`} />
        <OverviewLine label={energyLabel(route)} value={energyValue(route)} />
        <OverviewLine label="CO₂ estimate" value={`${formatNumber(route.co2_kg, 2)} kg`} />
      </div>

      <div className="mt-4 rounded-lg border border-signal-500/15 bg-signal-500/[0.035] p-3">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-signal-400">
          <Sparkles size={10} /> Why this route
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-300">{explanation}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex flex-wrap items-center gap-1">
          {route.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="default">
              {tag}
            </Badge>
          ))}
          {candidateCount !== undefined && (
            <span className="mono ml-1 text-[9px] text-ink-500">{candidateCount} routes evaluated</span>
          )}
        </div>
        {onOpenPlanner && (
          <button className="btn btn-primary" onClick={onOpenPlanner}>
            Open planner <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function OverviewLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.055] py-2">
      <span className="text-[10px] text-ink-400">{label}</span>
      <span className="mono text-[10px] text-ink-200" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  )
}

export function RouteDetailMetrics({ route }: { route: Route }) {
  const items = [
    { label: 'Distance', value: `${formatNumber(route.distance_km, 2)} km`, icon: RouteIcon },
    { label: 'Travel time', value: formatTime(route.travel_time_min), icon: Clock3 },
    { label: 'Average speed', value: `${formatNumber(route.avg_speed_kph, 0)} km/h`, icon: Gauge },
    { label: 'Congestion', value: `${formatNumber(route.congestion_score, 0)}%`, icon: Gauge },
    { label: 'Fuel / energy', value: energyValue(route), icon: Fuel },
    { label: 'Energy cost', value: formatCurrency(route.fuel_cost), icon: Fuel },
    { label: 'CO₂', value: `${formatNumber(route.co2_kg, 2)} kg`, icon: Leaf },
    { label: 'Intersections', value: `${route.intersections}`, icon: Waypoints },
  ]
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-ink-850 p-3">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-ink-500">
            <item.icon size={10} />
            {item.label}
          </div>
          <div className="mono mt-1.5 text-xs text-ink-100">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function RouteComparisonTable({ routes, selectedId, onSelect }: { routes: Route[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr>
            <th className="table-head">Route</th>
            <th className="table-head text-right">Distance</th>
            <th className="table-head text-right">Travel time</th>
            <th className="table-head text-right">Avg speed</th>
            <th className="table-head text-right">Congestion</th>
            <th className="table-head text-right">Segments</th>
            <th className="table-head text-right">Fuel / energy</th>
            <th className="table-head text-right">CO₂</th>
            <th className="table-head text-right">Objective cost</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const selected = route.route_id === selectedId
            return (
              <tr
                key={route.route_id}
                className={cx('cursor-pointer transition-colors', selected ? 'bg-signal-500/[0.05]' : 'hover:bg-white/[0.02]')}
                onClick={() => onSelect?.(route.route_id)}
              >
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: selected ? '#43e0b0' : '#436781' }} />
                    <span className={cx('font-medium', selected ? 'text-signal-400' : 'text-ink-100')}>{route.label}</span>
                    {route.recommended && <Badge tone="signal">Picked</Badge>}
                  </div>
                  <div className="mt-0.5 max-w-[240px] truncate text-[9px] text-ink-500">{route.node_names.join(' → ')}</div>
                </td>
                <td className="table-cell mono text-right">{formatNumber(route.distance_km, 2)} km</td>
                <td className="table-cell mono text-right">{formatNumber(route.travel_time_min, 1)} min</td>
                <td className="table-cell mono text-right">{formatNumber(route.avg_speed_kph, 0)} km/h</td>
                <td className="table-cell text-right">
                  <span className="mono inline-flex items-center gap-1.5 text-[10px]" style={{ color: congestionColors[route.congestion_label.toLowerCase() as keyof typeof congestionColors] }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {formatNumber(route.congestion_score, 0)}%
                  </span>
                </td>
                <td className="table-cell mono text-right">{route.segment_count}</td>
                <td className="table-cell mono text-right">{energyValue(route)}</td>
                <td className="table-cell mono text-right">{formatNumber(route.co2_kg, 2)} kg</td>
                <td className="table-cell mono text-right">{formatNumber(route.objective_cost, 2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RouteChangeBanner({ change }: { change: RouteChange }) {
  const slower = change.deltaTime > 0.05
  const unchanged = Math.abs(change.deltaTime) <= 0.05 && change.changedSegments === 0
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.022] p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-300">
          <GitCompareArrows size={15} />
        </span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-300">Route change detected</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400">
            <span>
              Previous {formatNumber(change.previous.recommended.travel_time_min, 1)} min
              <ArrowRight size={10} className="mx-1 inline text-ink-600" />
              new {formatNumber(change.current.recommended.travel_time_min, 1)} min
            </span>
            <span className={slower ? 'text-coral-400' : 'text-signal-400'}>
              {unchanged ? 'No measurable change' : `${slower ? '+' : ''}${formatNumber(change.deltaTime, 1)} min`}
            </span>
            <span className="mono">
              {change.deltaDistance >= 0 ? '+' : ''}
              {formatNumber(change.deltaDistance, 2)} km
            </span>
            <span>{change.changedSegments} segment{change.changedSegments === 1 ? '' : 's'} changed</span>
          </div>
        </div>
      </div>
      <Badge tone={slower ? 'coral' : 'signal'}>
        {change.current.simulation_clock} snapshot
      </Badge>
    </div>
  )
}

export function ObjectiveTag({ objective }: { objective: string }) {
  return <Badge tone="blue">{objectiveShort[objective as keyof typeof objectiveShort] ?? titleCase(objective)}</Badge>
}

export function RouteBar({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-400">{label}</span>
        <span className="mono text-[10px] text-ink-200">
          {formatNumber(value, 1)} {unit}
        </span>
      </div>
      <MiniBar value={(value / Math.max(max, 0.001)) * 100} color={color} />
    </div>
  )
}
