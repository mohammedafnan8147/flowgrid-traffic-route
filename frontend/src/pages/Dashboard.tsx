import {
  Activity,
  ArrowRight,
  CircleGauge,
  CloudSun,
  GitBranch,
  MapPinned,
  RefreshCw,
  Route as RouteIcon,
  ShieldAlert,
  TriangleAlert,
  Waypoints,
} from 'lucide-react'
import { useApp } from '../state'
import { TrafficMap } from '../components/TrafficMap'
import { CongestionDonut, SpeedHistogram, TrafficTrendChart } from '../components/charts'
import { RecommendedRoutePanel, RouteChangeBanner } from '../components/routes'
import { Badge, CongestionPill, MiniBar, PageHeader, Panel, SectionHeader, Spinner, StatCard } from '../components/ui'
import { congestionColors, formatNumber, formatTime, relativeTime, titleCase } from '../lib/format'
import { cx } from '../lib/cx'

export function Dashboard() {
  const {
    network,
    traffic,
    analytics,
    routeResult,
    routeChange,
    navigate,
    recalculate,
    routeLoading,
    settings,
    incidents,
  } = useApp()

  if (!network || !traffic) {
    return <div className="skeleton h-96 rounded-xl" />
  }

  const summary = traffic.summary
  const hotspots = analytics?.hotspots ?? traffic.hotspots
  const objective = routeResult?.objective_label ?? settings?.default_objective ?? 'travel time'
  const recentRoutes = analytics?.route_history ?? []
  const activeIncidents = incidents?.active ?? traffic.incidents
  const route = routeResult?.recommended

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Network overview"
        title="Traffic control room"
        subtitle={`Synthetic city network · ${traffic.simulation.scenario_label} at ${traffic.simulation.clock}. All traffic figures are simulation output, not live observations.`}
        actions={
          <>
            <Badge tone={traffic.simulation.running ? 'signal' : 'default'}>
              <span className={cx('h-1.5 w-1.5 rounded-full', traffic.simulation.running ? 'bg-signal-400 live-dot' : 'bg-ink-500')} />
              {traffic.simulation.running ? 'Simulation running' : 'Simulation paused'}
            </Badge>
            <button className="btn" onClick={() => void recalculate()} disabled={routeLoading}>
              {routeLoading ? <Spinner /> : <RefreshCw size={13} />}
              Refresh route
            </button>
            <button className="btn btn-primary" onClick={() => navigate('planner')}>
              Plan route <ArrowRight size={13} />
            </button>
          </>
        }
      />

      {routeChange && <RouteChangeBanner change={routeChange} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Junctions" value={formatNumber(network.nodes.length, 0)} hint="graph vertices" icon={MapPinned} />
        <StatCard label="Road links" value={formatNumber(network.roads.length, 0)} hint="weighted edges" icon={GitBranch} />
        <StatCard
          label="Active incidents"
          value={formatNumber(summary.active_incidents, 0)}
          hint={`${summary.closed_roads} closures`}
          icon={ShieldAlert}
          tone={summary.active_incidents ? 'coral' : 'default'}
        />
        <StatCard
          label="Congested roads"
          value={formatNumber(summary.congested_roads, 0)}
          hint={`of ${summary.open_roads} open`}
          icon={TriangleAlert}
          tone={summary.congested_roads ? 'amber' : 'signal'}
        />
        <StatCard
          label="Average speed"
          value={formatNumber(summary.avg_speed_kph, 1)}
          suffix="km/h"
          hint="distance-weighted"
          icon={CircleGauge}
          tone="signal"
        />
        <StatCard
          label="Network distance"
          value={formatNumber(summary.total_network_distance_km, 0)}
          suffix="km"
          hint={`${titleCase(objective)} objective`}
          icon={Waypoints}
          tone="blue"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="overflow-hidden xl:col-span-8">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="label">Live network</span>
              <span className="h-1 w-1 rounded-full bg-ink-600" />
              <span className="mono text-[9px] text-ink-500">{traffic.simulation.clock} · {traffic.simulation.tick} ticks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[9px] text-ink-500 sm:inline">colour = simulated congestion</span>
              <Badge tone="default">{network.mode_label}</Badge>
            </div>
          </div>
          <TrafficMap
            network={network}
            routes={routeResult?.comparison ?? []}
            selectedRouteId={routeResult?.recommended.route_id}
            incidents={activeIncidents}
            origin={routeResult?.origin.id ?? 'N06'}
            destination={routeResult?.destination.id ?? 'N15'}
            showTraffic={settings?.map_show_traffic ?? true}
            showAlternatives={settings?.map_show_alternatives ?? true}
            showLabels={settings?.map_show_labels ?? false}
            clock={traffic.simulation.clock}
            className="h-[360px] rounded-none border-0 sm:h-[430px]"
          />
        </Panel>

        <Panel className="min-h-[420px] p-4 xl:col-span-4">
          {route ? (
            <RecommendedRoutePanel
              route={route}
              explanation={routeResult?.explanation ?? ''}
              comparison={routeResult?.comparison}
              candidateCount={routeResult?.candidate_count}
              onOpenPlanner={() => navigate('planner')}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <RouteIcon size={24} className="text-ink-600" />
              <p className="text-xs text-ink-400">No route calculated yet.</p>
              <button className="btn btn-primary" onClick={() => navigate('planner')}>
                Open route planner
              </button>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-7">
          <SectionHeader
            title="Traffic over time"
            subtitle="Seeded simulation history · average speed and congestion"
            action={
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[9px] text-ink-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-400" /> speed
                </span>
                <span className="inline-flex items-center gap-1.5 text-[9px] text-ink-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> congestion
                </span>
              </div>
            }
          />
          <div className="mt-3 h-[210px]">
            <TrafficTrendChart data={analytics?.trend ?? traffic.trend} />
          </div>
        </Panel>

        <Panel className="p-4 xl:col-span-5">
          <SectionHeader title="Congestion mix" subtitle="Current simulated roads by condition" action={<CloudSun size={15} className="text-ink-500" />} />
          <div className="mt-3 h-[210px]">
            <CongestionDonut data={analytics?.congestion_distribution ?? []} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-5">
          <SectionHeader
            title="Congestion hotspots"
            subtitle="Ranked by congestion strength and utilization"
            action={
              <button className="text-[10px] font-medium text-signal-400 hover:text-signal-300" onClick={() => navigate('simulation')}>
                Manage traffic
              </button>
            }
          />
          <div className="mt-3 space-y-2">
            {hotspots.slice(0, 6).map((hotspot, index) => (
              <div key={hotspot.road_id} className="flex items-center gap-3 rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
                <span className="mono w-4 text-[9px] text-ink-600">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-ink-200">{hotspot.name}</span>
                    <span className="mono text-[9px] text-ink-400">{formatNumber(hotspot.speed_kph, 0)} km/h</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <MiniBar value={hotspot.congestion} color={congestionColors[hotspot.congestion_level]} className="max-w-[140px]" />
                    <span className="mono text-[9px] text-ink-500">{formatNumber(hotspot.congestion, 0)}%</span>
                    <span className="truncate text-[8px] text-ink-600">{hotspot.from_name} ↔ {hotspot.to_name}</span>
                  </div>
                </div>
                <CongestionPill level={hotspot.congestion_level} />
              </div>
            ))}
            {!hotspots.length && <p className="py-8 text-center text-xs text-ink-500">No hotspot data available.</p>}
          </div>
        </Panel>

        <Panel className="p-4 xl:col-span-4">
          <SectionHeader title="Speed distribution" subtitle="Open roads by simulated effective speed" />
          <div className="mt-3 h-[250px]">
            <SpeedHistogram data={analytics?.speed_distribution ?? []} />
          </div>
        </Panel>

        <Panel className="p-4 xl:col-span-3">
          <SectionHeader title="Active incidents" subtitle="Persisted local records" action={<TriangleAlert size={15} className="text-coral-400" />} />
          <div className="mt-3 space-y-2">
            {activeIncidents.slice(0, 4).map((incident) => (
              <div key={incident.id} className="rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink-200">{incident.type_label}</span>
                  <Badge tone={incident.severity === 'critical' || incident.severity === 'high' ? 'coral' : 'amber'}>
                    {incident.severity_label}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-[9px] text-ink-500">{incident.road_name}</div>
                <div className="mt-1.5 flex items-center justify-between text-[8px] text-ink-600">
                  <span>started {incident.start_clock}</span>
                  <span>{incident.duration_min} min</span>
                </div>
              </div>
            ))}
            {!activeIncidents.length && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-signal-500/15 bg-signal-500/[0.05] text-signal-400">
                  <Activity size={16} />
                </span>
                <p className="text-[11px] text-ink-400">No active incidents</p>
                <p className="text-[9px] text-ink-600">Network operating normally</p>
              </div>
            )}
            <button className="btn mt-1 w-full" onClick={() => navigate('incidents')}>
              Open incident manager
            </button>
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <SectionHeader
            title="Saved route evaluations"
            subtitle="Every optimiser run is recorded in the local SQLite database"
            action={
              <button className="text-[10px] font-medium text-signal-400 hover:text-signal-300" onClick={() => navigate('benchmark')}>
                Compare algorithms
              </button>
            }
          />
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className="table-head">Route</th>
                <th className="table-head">Algorithm</th>
                <th className="table-head text-right">Distance</th>
                <th className="table-head text-right">Travel time</th>
                <th className="table-head text-right">Congestion</th>
                <th className="table-head text-right">CO₂</th>
                <th className="table-head text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentRoutes.slice(0, 6).map((history) => (
                <tr key={history.id}>
                  <td className="table-cell">
                    <div className="font-medium text-ink-200">
                      {history.source_name} <span className="text-ink-600">→</span> {history.destination_name}
                    </div>
                    <div className="mono mt-0.5 text-[8px] text-ink-600">{history.route_code}</div>
                  </td>
                  <td className="table-cell">
                    <Badge tone="blue">{titleCase(history.algorithm)}</Badge>
                  </td>
                  <td className="table-cell mono text-right">{formatNumber(history.distance_km, 2)} km</td>
                  <td className="table-cell mono text-right">{formatTime(history.travel_time_min)}</td>
                  <td className="table-cell mono text-right">{formatNumber(history.congestion, 0)}%</td>
                  <td className="table-cell mono text-right">{formatNumber(history.co2_kg, 2)} kg</td>
                  <td className="table-cell text-right text-[9px] text-ink-500">{relativeTime(history.created_at)}</td>
                </tr>
              ))}
              {!recentRoutes.length && (
                <tr>
                  <td className="table-cell text-center text-ink-500" colSpan={7}>
                    No saved route evaluations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-2.5 text-[9px] text-ink-600">
          <span>{analytics?.database.routes_saved ?? 0} routes stored locally</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Simulation results, not observed traffic
          </span>
        </div>
      </Panel>
    </div>
  )
}
