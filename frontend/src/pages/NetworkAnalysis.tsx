import {
  Activity,
  ArrowUpRight,
  CircleDot,
  GitBranch,
  Globe2,
  Info,
  Network as NetworkIcon,
  Route as RouteIcon,
  Share2,
  ShieldCheck,
  Waypoints,
} from 'lucide-react'
import { useApp } from '../state'
import { DegreeChart, UtilizationChart } from '../components/charts'
import { TrafficMap } from '../components/TrafficMap'
import { Badge, MiniBar, PageHeader, Panel, SectionHeader, StatCard } from '../components/ui'
import { formatNumber } from '../lib/format'

export function NetworkAnalysis() {
  const { network, traffic, analytics, incidents } = useApp()
  if (!network || !traffic) return <div className="skeleton h-96 rounded-xl" />

  const topology = analytics?.topology
  if (!topology) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Network analysis" title="Graph topology & critical corridors" />
        <div className="skeleton h-72 rounded-xl" />
      </div>
    )
  }

  const directedEdges = network.roads.reduce((sum, road) => sum + (road.one_way === 'two_way' ? 2 : 1), 0)
  const oneWays = network.roads.filter((road) => road.one_way !== 'two_way').length
  const maxUsage = Math.max(...topology.critical_corridors.map((corridor) => corridor.usage), 1)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Network analysis"
        title="Graph topology & critical corridors"
        subtitle="Structural metrics are calculated on the current simulated directed graph. Criticality counts road appearances in all-pairs shortest travel-time paths, not observed traffic."
        actions={
          <>
            <Badge tone={topology.is_connected ? 'signal' : 'coral'}>
              <ShieldCheck size={10} /> {topology.is_connected ? 'Connected graph' : `${topology.components} components`}
            </Badge>
            <Badge tone="default">{traffic.simulation.clock} snapshot</Badge>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Graph vertices" value={formatNumber(network.nodes.length, 0)} hint={`${directedEdges} directed edges`} icon={CircleDot} tone="blue" />
        <StatCard label="Average degree" value={formatNumber(topology.average_degree, 2)} hint={`max ${topology.max_degree} connections`} icon={Share2} />
        <StatCard label="Avg shortest trip" value={formatNumber(topology.average_shortest_travel_time_min, 1)} suffix="min" hint="all reachable pairs" icon={RouteIcon} tone="signal" />
        <StatCard label="Reachable pairs" value={formatNumber(topology.reachable_pairs_pct, 1)} suffix="%" hint={`${topology.components} component${topology.components === 1 ? '' : 's'}`} icon={Globe2} tone={topology.reachable_pairs_pct > 99 ? 'signal' : 'amber'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="overflow-hidden xl:col-span-8">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="label">Topology map</span>
              <span className="text-[9px] text-ink-500">junction degree shown on hover</span>
            </div>
            <Badge tone="default">simulated network</Badge>
          </div>
          <TrafficMap
            network={network}
            routes={[]}
            incidents={incidents?.active ?? traffic.incidents}
            showTraffic
            showAlternatives={false}
            showLabels
            clock={traffic.simulation.clock}
            className="h-[400px] rounded-none border-0 sm:h-[480px]"
          />
        </Panel>

        <div className="space-y-4 xl:col-span-4">
          <Panel className="p-4">
            <SectionHeader title="Graph model" subtitle="Directed weighted representation" action={<NetworkIcon size={15} className="text-ink-500" />} />
            <div className="mt-3 space-y-2">
              <GraphRow label="Vertices (V)" value={network.nodes.length.toString()} />
              <GraphRow label="Road segments" value={network.roads.length.toString()} />
              <GraphRow label="Directed edges (E)" value={directedEdges.toString()} />
              <GraphRow label="One-way segments" value={oneWays.toString()} />
              <GraphRow label="Connected components" value={topology.components.toString()} />
              <GraphRow label="Total network length" value={`${formatNumber(traffic.summary.total_network_distance_km, 1)} km`} />
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.06] bg-ink-950/45 p-2.5 text-[9px] leading-relaxed text-ink-500">
              <span className="text-ink-300">G = (V, E)</span> · each edge carries distance, free-flow speed, simulated speed, travel time,
              congestion, capacity, fuel and environmental cost. Two-way roads are expanded into two directed edges.
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Network health" subtitle="Current snapshot" action={<Activity size={15} className="text-signal-400" />} />
            <div className="mt-3 space-y-2.5">
              <HealthBar label="Free-flow roads" value={(traffic.summary.free_roads / Math.max(1, traffic.summary.total_roads)) * 100} color="#2f9d83" />
              <HealthBar label="Congested roads" value={(traffic.summary.congested_roads / Math.max(1, traffic.summary.total_roads)) * 100} color="#e8a21e" />
              <HealthBar label="Closed roads" value={(traffic.summary.closed_roads / Math.max(1, traffic.summary.total_roads)) * 100} color="#e65a4a" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.055] pt-2.5">
              <span className="text-[9px] text-ink-500">Average network speed</span>
              <span className="mono text-[11px] text-ink-100">{formatNumber(traffic.summary.avg_speed_kph, 1)} km/h</span>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-7">
          <SectionHeader
            title="Critical corridors"
            subtitle="Road usage across current-time all-pairs shortest paths"
            action={<Badge tone="amber"><ArrowUpRight size={10} /> structural criticality</Badge>}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <th className="table-head">#</th>
                  <th className="table-head">Corridor</th>
                  <th className="table-head">Connection</th>
                  <th className="table-head text-right">Usage</th>
                  <th className="table-head text-right">Share</th>
                  <th className="table-head text-right">Congestion</th>
                </tr>
              </thead>
              <tbody>
                {topology.critical_corridors.map((corridor, index) => (
                  <tr key={corridor.road_id}>
                    <td className="table-cell mono text-ink-600">{String(index + 1).padStart(2, '0')}</td>
                    <td className="table-cell">
                      <div className="font-medium text-ink-200">{corridor.name}</div>
                      <div className="mono text-[8px] text-ink-600">{corridor.road_id}</div>
                    </td>
                    <td className="table-cell text-[10px] text-ink-400">{corridor.from_name} ↔ {corridor.to_name}</td>
                    <td className="table-cell">
                      <div className="ml-auto w-24">
                        <MiniBar value={(corridor.usage / maxUsage) * 100} color="#43e0b0" />
                      </div>
                    </td>
                    <td className="table-cell mono text-right">{formatNumber(corridor.share_pct, 1)}%</td>
                    <td className="table-cell mono text-right">{formatNumber(corridor.congestion, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.055] bg-white/[0.012] p-2.5 text-[9px] leading-relaxed text-ink-500">
            <Info size={11} className="mt-0.5 shrink-0" />
            {topology.method_note}
          </div>
        </Panel>

        <div className="space-y-4 xl:col-span-5">
          <Panel className="p-4">
            <SectionHeader title="Junction degree distribution" subtitle="How many roads meet at each node" action={<GitBranch size={15} className="text-ink-500" />} />
            <div className="mt-3 h-[190px]">
              <DegreeChart data={topology.degree_distribution} />
            </div>
          </Panel>
          <Panel className="p-4">
            <SectionHeader title="Utilization by road class" subtitle="Average volume / capacity ratio" action={<Waypoints size={15} className="text-ink-500" />} />
            <div className="mt-3 h-[180px]">
              <UtilizationChart data={analytics?.utilization_by_class ?? []} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function GraphRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] py-1.5 last:border-0">
      <span className="text-[10px] text-ink-400">{label}</span>
      <span className="mono text-[10px] text-ink-200">{value}</span>
    </div>
  )
}

function HealthBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-ink-400">{label}</span>
        <span className="mono text-[9px] text-ink-300">{formatNumber(value, 0)}%</span>
      </div>
      <MiniBar value={value} color={color} />
    </div>
  )
}
