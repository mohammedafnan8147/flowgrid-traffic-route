import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  ArrowRight,
  Calculator,
  Car,
  Check,
  ChevronDown,
  Clock3,
  Fuel,
  Gauge,
  Info,
  Leaf,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'
import { useApp } from '../state'
import type { AlgorithmKey, Node as GraphNode, ObjectiveKey, RouteRequest } from '../types'
import { TrafficMap, type PickMode } from '../components/TrafficMap'
import { RouteCard, RouteChangeBanner, RouteComparisonTable, RouteDetailMetrics } from '../components/routes'
import { RouteComparisonChart } from '../components/charts'
import { Badge, CongestionPill, Field, PageHeader, Panel, SectionHeader, Spinner } from '../components/ui'
import { formatNumber, formatTime, objectiveShort, titleCase } from '../lib/format'
import { cx } from '../lib/cx'

const ALGORITHMS: { key: AlgorithmKey; name: string; note: string }[] = [
  { key: 'astar', name: 'A* search', note: 'Geographic heuristic; fewer expansions' },
  { key: 'dijkstra', name: 'Dijkstra', note: 'Exact shortest path; broad exploration' },
  { key: 'yen', name: 'Yen K-shortest', note: 'Returns loopless alternatives' },
  { key: 'aco', name: 'Ant colony', note: 'Experimental multi-objective search' },
]

const OBJECTIVES: { key: ObjectiveKey; name: string; note: string }[] = [
  { key: 'time', name: 'Fastest', note: 'Minimum estimated travel time' },
  { key: 'distance', name: 'Shortest', note: 'Minimum road distance' },
  { key: 'congestion', name: 'Low congestion', note: 'Avoid congested exposure' },
  { key: 'eco', name: 'Eco', note: 'Lower fuel and CO₂' },
  { key: 'balanced', name: 'Balanced', note: 'Weighted multi-objective' },
]

const VEHICLES: Record<string, { label: string; fuel: string; efficiency: number; price: number; co2: number; kwh: number; kwhPrice: number; grid: number }> = {
  petrol: { label: 'Petrol car', fuel: 'petrol', efficiency: 7.2, price: 106.5, co2: 2.31, kwh: 16, kwhPrice: 8.2, grid: 0.71 },
  diesel: { label: 'Diesel car', fuel: 'diesel', efficiency: 5.9, price: 94.2, co2: 2.68, kwh: 16, kwhPrice: 8.2, grid: 0.71 },
  hybrid: { label: 'Hybrid car', fuel: 'petrol', efficiency: 4.4, price: 106.5, co2: 2.31, kwh: 16, kwhPrice: 8.2, grid: 0.71 },
  electric: { label: 'Electric car', fuel: 'electric', efficiency: 0, price: 0, co2: 0, kwh: 16, kwhPrice: 8.2, grid: 0.71 },
}

const TRAFFIC_PROFILES = [
  { value: '0.55', label: 'Free flow' },
  { value: '0.95', label: 'Moderate' },
  { value: '1.35', label: 'Heavy' },
  { value: '1.85', label: 'Severe' },
]

function NodePicker({
  label,
  value,
  nodes,
  accent,
  onChange,
  onPickMap,
}: {
  label: string
  value: string
  nodes: GraphNode[]
  accent: 'origin' | 'destination'
  onChange: (id: string) => void
  onPickMap: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const selected = nodes.find((node) => node.id === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(q) ||
        node.district.toLowerCase().includes(q) ||
        node.id.toLowerCase().includes(q),
    )
  }, [nodes, query])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as globalThis.Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  return (
    <div ref={root} className="relative">
      <div className="label mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={onPickMap}
          className="inline-flex items-center gap-1 text-[9px] font-medium text-signal-400 hover:text-signal-300"
        >
          <MapPin size={9} /> Pick on map
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-lg border bg-ink-950/65 px-3 py-2.5 text-left transition-colors',
          open ? 'border-signal-500/45' : 'border-white/[0.09] hover:border-white/[0.17]',
        )}
      >
        <span
          className={cx(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[9px] font-bold',
            accent === 'origin'
              ? 'border-signal-500/30 bg-signal-500/10 text-signal-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
          )}
        >
          {accent === 'origin' ? 'A' : 'B'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-ink-100">{selected?.name ?? 'Select junction'}</span>
          <span className="mono block text-[9px] text-ink-500">
            {selected ? `${selected.id} · ${selected.district}` : 'Search the network'}
          </span>
        </span>
        <ChevronDown size={13} className={cx('shrink-0 text-ink-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-white/[0.12] bg-ink-900 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-2.5 py-2">
            <Search size={12} className="text-ink-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search junctions or districts…"
              className="w-full bg-transparent text-[11px] text-ink-200 outline-none placeholder:text-ink-600"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  onChange(node.id)
                  setOpen(false)
                  setQuery('')
                }}
                className={cx(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.05]',
                  node.id === value && 'bg-white/[0.04]',
                )}
              >
                <span className="grid h-5 w-5 place-items-center rounded border border-white/[0.08] text-[8px] text-ink-500">
                  {node.kind === 'gateway' ? 'G' : node.kind === 'transit' ? 'T' : 'J'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-ink-200">{node.name}</span>
                  <span className="text-[8px] text-ink-500">
                    {node.id} · {node.district} · {node.degree} links
                  </span>
                </span>
                {node.id === value && <Check size={11} className="text-signal-400" />}
              </button>
            ))}
            {!filtered.length && <p className="px-2 py-4 text-center text-[10px] text-ink-500">No junction matches that search.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function WeightSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  color: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-ink-400">{label}</span>
        <span className="mono text-[10px] text-ink-200">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-signal-500"
        style={{ accentColor: color }}
      />
    </div>
  )
}

export function RoutePlanner() {
  const {
    network,
    traffic,
    settings,
    routeResult,
    routeChange,
    selectedRouteId,
    setSelectedRouteId,
    planRoute,
    routeLoading,
    activeRequest,
    simulateAction,
    notify,
    navigate,
  } = useApp()
  const [origin, setOrigin] = useState(routeResult?.origin.id ?? activeRequest?.origin ?? 'N06')
  const [destination, setDestination] = useState(routeResult?.destination.id ?? activeRequest?.destination ?? 'N15')
  const [algorithm, setAlgorithm] = useState<AlgorithmKey>(routeResult?.algorithm ?? settings?.default_algorithm ?? 'astar')
  const [objective, setObjective] = useState<ObjectiveKey>(routeResult?.objective ?? settings?.default_objective ?? 'time')
  const [pickMode, setPickMode] = useState<PickMode>(null)
  const [vehicleKey, setVehicleKey] = useState(() => {
    const configured = settings?.vehicle
    if (!configured) return 'petrol'
    if (configured.fuel_type === 'electric') return 'electric'
    if (configured.fuel_type === 'diesel') return 'diesel'
    return configured.efficiency_l_100km <= 5.2 ? 'hybrid' : 'petrol'
  })
  const [weights, setWeights] = useState({ time: 0.4, distance: 0.2, congestion: 0.25, eco: 0.15 })
  const [showSegments, setShowSegments] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const lastGenerated = useRef<string>('')

  useEffect(() => {
    if (routeResult && routeResult.generated_at !== lastGenerated.current) {
      lastGenerated.current = routeResult.generated_at
      setOrigin(routeResult.origin.id)
      setDestination(routeResult.destination.id)
      setAlgorithm(routeResult.algorithm)
      setObjective(routeResult.objective)
      if (routeResult.recommended.weights) {
        setWeights({
          time: routeResult.recommended.weights.time ?? 0.4,
          distance: routeResult.recommended.weights.distance ?? 0.2,
          congestion: routeResult.recommended.weights.congestion ?? 0.2,
          eco: routeResult.recommended.weights.eco ?? 0.2,
        })
      }
    }
  }, [routeResult])

  if (!network || !traffic) return <div className="skeleton h-96 rounded-xl" />

  const nodes = network.nodes
  const selectedRoute = routeResult?.comparison.find((route) => route.route_id === selectedRouteId) ?? routeResult?.recommended
  const vehicle = VEHICLES[vehicleKey]
  const currentLevel = traffic.simulation.traffic_level
  const profileValue = TRAFFIC_PROFILES.reduce(
    (best, profile) => (Math.abs(Number(profile.value) - currentLevel) < Math.abs(Number(best.value) - currentLevel) ? profile : best),
    TRAFFIC_PROFILES[0],
  )

  const pickOnMap = (mode: 'origin' | 'destination') => {
    setPickMode(mode)
    notify(`Click a junction on the map to set the ${mode}.`, 'info')
  }

  const handleMapPick = (nodeId: string, mode: 'origin' | 'destination') => {
    if (mode === 'origin') setOrigin(nodeId)
    else setDestination(nodeId)
    setPickMode(null)
    const node = nodes.find((item) => item.id === nodeId)
    notify(`${mode === 'origin' ? 'Origin' : 'Destination'} set to ${node?.name ?? nodeId}.`, 'success')
  }

  const calculate = async () => {
    if (origin === destination) {
      notify('Origin and destination must be different junctions.', 'error')
      return
    }
    const request: RouteRequest = {
      origin,
      destination,
      algorithm,
      objective,
      weights: objective === 'balanced' ? weights : undefined,
      vehicle: {
        type: vehicle.fuel === 'electric' ? 'electric_car' : `${vehicle.fuel}_car`,
        label: vehicle.label,
        fuel_type: vehicle.fuel,
        efficiency_l_100km: vehicle.efficiency,
        fuel_price_per_l: vehicle.price,
        co2_kg_per_l: vehicle.co2,
        electricity_kwh_100km: vehicle.kwh,
        electricity_price_per_kwh: vehicle.kwhPrice,
        grid_co2_kg_per_kwh: vehicle.grid,
      },
    }
    const result = await planRoute(request)
    if (result) {
      notify(`Route evaluated with ${result.algorithm_label} · ${result.candidate_count} options.`, 'success')
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }

  const swap = () => {
    setOrigin(destination)
    setDestination(origin)
  }

  const applyProfile = async (value: string) => {
    await simulateAction('level', { level: Number(value) })
    notify(`Traffic level set to ×${Number(value).toFixed(2)}. Route recalculated.`, 'info')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Route planner"
        title="Find the best path through the city"
        subtitle="Edge weights are recomputed from current simulated speeds, congestion and vehicle assumptions. Change the algorithm, objective or demand level and calculate a real route."
        actions={
          <>
            <Badge tone="signal">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-signal-400" />
              {traffic.simulation.clock} · {traffic.simulation.scenario_label}
            </Badge>
            <Badge tone="default">{network.nodes.length} junctions · {network.roads.length} links</Badge>
          </>
        }
      />

      {routeChange && <RouteChangeBanner change={routeChange} />}

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-4">
          <div className="flex items-center justify-between">
            <SectionHeader title="Route parameters" subtitle="Origin, destination and optimisation model" />
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-signal-500/20 bg-signal-500/[0.07] text-signal-400">
              <SlidersHorizontal size={15} />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <NodePicker
              label="Origin"
              value={origin}
              nodes={nodes}
              accent="origin"
              onChange={setOrigin}
              onPickMap={() => pickOnMap('origin')}
            />
            <button className="btn mb-0.5 h-10 w-8 px-0" onClick={swap} title="Swap origin and destination">
              <ArrowLeftRight size={13} />
            </button>
            <NodePicker
              label="Destination"
              value={destination}
              nodes={nodes}
              accent="destination"
              onChange={setDestination}
              onPickMap={() => pickOnMap('destination')}
            />
          </div>

          <div className="mt-4">
            <div className="label mb-1.5">Routing algorithm</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALGORITHMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setAlgorithm(item.key)}
                  className={cx(
                    'rounded-lg border px-2.5 py-2 text-left transition-colors',
                    algorithm === item.key
                      ? 'border-signal-500/35 bg-signal-500/[0.07]'
                      : 'border-white/[0.075] bg-white/[0.018] hover:border-white/[0.15]',
                  )}
                >
                  <div className={cx('text-[10px] font-semibold', algorithm === item.key ? 'text-signal-400' : 'text-ink-200')}>
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[8px] leading-snug text-ink-500">{item.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="label mb-1.5">Optimisation objective</div>
            <div className="flex flex-wrap gap-1.5">
              {OBJECTIVES.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setObjective(item.key)}
                  title={item.note}
                  className={cx(
                    'rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors',
                    objective === item.key
                      ? 'border-signal-500/35 bg-signal-500/10 text-signal-400'
                      : 'border-white/[0.075] bg-white/[0.018] text-ink-300 hover:border-white/[0.15]',
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {objective === 'balanced' && (
            <div className="mt-4 space-y-2.5 rounded-lg border border-white/[0.07] bg-ink-950/45 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400">Objective weights</span>
                <span className="mono text-[8px] text-ink-500">normalised</span>
              </div>
              <WeightSlider label="Travel time" value={weights.time} onChange={(value) => setWeights({ ...weights, time: value })} color="#43e0b0" />
              <WeightSlider label="Distance" value={weights.distance} onChange={(value) => setWeights({ ...weights, distance: value })} color="#7cb4ff" />
              <WeightSlider label="Congestion" value={weights.congestion} onChange={(value) => setWeights({ ...weights, congestion: value })} color="#f5b942" />
              <WeightSlider label="Environment" value={weights.eco} onChange={(value) => setWeights({ ...weights, eco: value })} color="#c998ff" />
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Field label="Vehicle">
              <select className="select" value={vehicleKey} onChange={(event) => setVehicleKey(event.target.value)}>
                {Object.entries(VEHICLES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Traffic profile" hint={`×${currentLevel.toFixed(2)}`}>
              <select className="select" value={profileValue.value} onChange={(event) => void applyProfile(event.target.value)}>
                {TRAFFIC_PROFILES.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.018] p-2.5 text-[9px] leading-relaxed text-ink-500">
            <Info size={12} className="mt-0.5 shrink-0 text-ink-500" />
            <span>
              {objective === 'balanced'
                ? 'Balanced uses distance-normalised time, distance, congestion and environmental cost. Weights are applied to every edge.'
                : `The ${objectiveShort[objective].toLowerCase()} objective is applied directly to every directed edge. Costs update with the simulation clock.`}
            </span>
          </div>

          <button className="btn btn-primary mt-4 w-full py-3" onClick={() => void calculate()} disabled={routeLoading}>
            {routeLoading ? <Spinner /> : <Calculator size={14} />}
            {routeLoading ? 'Evaluating graph…' : 'Calculate route'}
          </button>
        </Panel>

        <div className="space-y-4 xl:col-span-8">
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <Target size={13} className="text-signal-400" />
                <span className="text-xs font-semibold text-ink-100">Network view</span>
                <span className="text-[9px] text-ink-500">
                  {nodes.find((node) => node.id === origin)?.name} → {nodes.find((node) => node.id === destination)?.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {pickMode && (
                  <Badge tone="amber">
                    <MapPin size={10} /> Click a junction for {pickMode}
                  </Badge>
                )}
                <Badge tone="default">
                  <Clock3 size={10} /> snapshot {traffic.simulation.clock}
                </Badge>
              </div>
            </div>
            <TrafficMap
              network={network}
              routes={routeResult?.comparison ?? []}
              selectedRouteId={selectedRouteId}
              incidents={traffic.incidents}
              origin={origin}
              destination={destination}
              showTraffic={settings?.map_show_traffic ?? true}
              showAlternatives={settings?.map_show_alternatives ?? true}
              showLabels={settings?.map_show_labels ?? false}
              pickMode={pickMode}
              onPick={handleMapPick}
              clock={traffic.simulation.clock}
              className="h-[420px] rounded-none border-0 sm:h-[520px]"
            />
          </Panel>

          {routeResult && selectedRoute ? (
            <div ref={resultsRef} className="space-y-4 scroll-mt-24">
              <Panel className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="signal">
                        <Sparkles size={10} /> {routeResult.recommended.label}
                      </Badge>
                      <Badge tone="blue">{titleCase(routeResult.algorithm)}</Badge>
                      <Badge tone="default">{routeResult.objective_label}</Badge>
                      {selectedRoute.route_id !== routeResult.recommended.route_id && <Badge tone="amber">Previewing alternative</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
                      <div>
                        <div className="label">Travel time</div>
                        <div className="mono text-3xl font-semibold tracking-[-0.05em] text-ink-100">{formatNumber(selectedRoute.travel_time_min, 1)} <span className="text-sm font-normal text-ink-400">min</span></div>
                      </div>
                      <div>
                        <div className="label">Distance</div>
                        <div className="mono text-lg font-medium text-ink-200">{formatNumber(selectedRoute.distance_km, 1)} <span className="text-[10px] text-ink-500">km</span></div>
                      </div>
                      <div>
                        <div className="label">Avg speed</div>
                        <div className="mono text-lg font-medium text-ink-200">{formatNumber(selectedRoute.avg_speed_kph, 0)} <span className="text-[10px] text-ink-500">km/h</span></div>
                      </div>
                      <div>
                        <div className="label">Congestion</div>
                        <div className="mt-1"><CongestionPill level={selectedRoute.congestion_label.toLowerCase() as never} score={selectedRoute.congestion_score} /></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button className="btn" onClick={() => setShowSegments((value) => !value)}>
                      {showSegments ? 'Hide' : 'Show'} segments
                    </button>
                    <button className="btn btn-primary" onClick={() => void calculate()} disabled={routeLoading}>
                      {routeLoading ? <Spinner /> : <Zap size={13} />} Recalculate
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-lg border border-signal-500/15 bg-signal-500/[0.035] p-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-signal-400">
                      <Sparkles size={10} /> Route explanation
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">{routeResult.explanation}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 border-t border-signal-500/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.1em] text-ink-500">{selectedRoute.fuel_l > 0 ? 'Fuel' : 'Energy'}</div>
                      <div className="mono mt-1 text-[11px] text-ink-200">
                        {selectedRoute.fuel_l > 0 ? `${formatNumber(selectedRoute.fuel_l, 2)} L` : `${formatNumber(selectedRoute.energy_kwh, 2)} kWh`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.1em] text-ink-500">CO₂</div>
                      <div className="mono mt-1 text-[11px] text-ink-200">{formatNumber(selectedRoute.co2_kg, 2)} kg</div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.1em] text-ink-500">Delay</div>
                      <div className="mono mt-1 text-[11px] text-amber-300">+{formatNumber(selectedRoute.delay_min, 1)}m</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <RouteDetailMetrics route={selectedRoute} />
                </div>
              </Panel>

              <Panel className="p-4">
                <SectionHeader
                  title="Alternative routes"
                  subtitle="Select a card to preview it on the map. Only routes computed by the engine are shown."
                  action={<span className="mono text-[9px] text-ink-500">{routeResult.candidate_count} evaluated</span>}
                />
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <RouteCard route={routeResult.recommended} selected={routeResult.recommended.route_id === selectedRouteId} onSelect={() => setSelectedRouteId(routeResult.recommended.route_id)} />
                  {routeResult.alternatives.map((route, index) => (
                    <RouteCard
                      key={route.route_id}
                      route={route}
                      accentIndex={index}
                      selected={route.route_id === selectedRouteId}
                      onSelect={() => setSelectedRouteId(route.route_id)}
                    />
                  ))}
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel className="p-4">
                  <SectionHeader title="Travel-time comparison" subtitle="Estimated minutes under current simulated traffic" />
                  <div className="mt-3 h-[210px]">
                    <RouteComparisonChart routes={routeResult.comparison} selectedId={selectedRouteId} dataKey="travel_time_min" unit="min" />
                  </div>
                </Panel>
                <Panel className="p-4">
                  <SectionHeader title="Distance comparison" subtitle="Total road distance per route" />
                  <div className="mt-3 h-[210px]">
                    <RouteComparisonChart routes={routeResult.comparison} selectedId={selectedRouteId} dataKey="distance_km" unit="km" />
                  </div>
                </Panel>
              </div>

              <Panel className="overflow-hidden">
                <div className="px-4 pt-4">
                  <SectionHeader
                    title="Route comparison"
                    subtitle="All metrics are computed from the selected route's edge sequence"
                    action={<Badge tone="default">{routeResult.traffic_source}</Badge>}
                  />
                </div>
                <div className="mt-2">
                  <RouteComparisonTable routes={routeResult.comparison} selectedId={selectedRouteId} onSelect={setSelectedRouteId} />
                </div>
              </Panel>

              {showSegments && (
                <Panel className="overflow-hidden">
                  <div className="px-4 pt-4">
                    <SectionHeader title={`${selectedRoute.label} · road sequence`} subtitle={`${selectedRoute.segment_count} segments · ${selectedRoute.intersections} intermediate junctions`} />
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr>
                          <th className="table-head">#</th>
                          <th className="table-head">Road</th>
                          <th className="table-head">From → To</th>
                          <th className="table-head text-right">Distance</th>
                          <th className="table-head text-right">Time</th>
                          <th className="table-head text-right">Speed</th>
                          <th className="table-head text-right">Congestion</th>
                          <th className="table-head text-right">CO₂</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRoute.segments.map((segment, index) => (
                          <tr key={`${segment.key}-${index}`}>
                            <td className="table-cell mono text-ink-500">{String(index + 1).padStart(2, '0')}</td>
                            <td className="table-cell">
                              <span className="font-medium text-ink-200">{segment.name}</span>
                              <span className="ml-2 text-[8px] uppercase tracking-[0.08em] text-ink-500">{segment.road_class}</span>
                            </td>
                            <td className="table-cell text-[10px] text-ink-400">
                              {nodes.find((node) => node.id === segment.from)?.name} → {nodes.find((node) => node.id === segment.to)?.name}
                            </td>
                            <td className="table-cell mono text-right">{formatNumber(segment.distance_km, 2)} km</td>
                            <td className="table-cell mono text-right">{formatNumber(segment.travel_time_min, 1)} min</td>
                            <td className="table-cell mono text-right">{formatNumber(segment.speed_kph, 0)} km/h</td>
                            <td className="table-cell text-right">
                              <CongestionPill level={segment.congestion_level} />
                            </td>
                            <td className="table-cell mono text-right">{formatNumber(segment.co2_kg, 3)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </div>
          ) : (
            <Panel className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-ink-400">
                <Calculator size={20} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink-200">Select two junctions and calculate</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">
                The engine will build the weighted directed graph, apply current simulated speeds and return a recommendation with alternatives.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.055] bg-white/[0.012] px-3 py-2 text-[9px] text-ink-600">
        <span className="flex items-center gap-1.5">
          <Car size={10} /> Vehicle assumptions: {vehicle.label} · {vehicle.fuel === 'electric' ? `${vehicle.kwh} kWh/100 km` : `${vehicle.efficiency} L/100 km`} · configurable in Settings
        </span>
        <span className="flex items-center gap-1.5">
          <Info size={10} /> Fuel and CO₂ are estimates, not measurements.
        </span>
      </div>
    </div>
  )
}
