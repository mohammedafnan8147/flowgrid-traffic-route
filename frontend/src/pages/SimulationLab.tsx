import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CloudSun,
  Construction,
  FastForward,
  Gauge,
  Leaf,
  Pause,
  Play,
  RotateCcw,
  Route as RouteIcon,
  Siren,
  Sunrise,
  Timer,
  TrafficCone,
  TriangleAlert,
  Waves,
  X,
} from 'lucide-react'
import { useApp } from '../state'
import { TrafficMap } from '../components/TrafficMap'
import { TrafficTrendChart } from '../components/charts'
import {
  Badge,
  CongestionPill,
  Field,
  MiniBar,
  PageHeader,
  Panel,
  SectionHeader,
  Spinner,
  Toggle,
} from '../components/ui'
import { congestionColors, formatNumber, relativeTime, titleCase } from '../lib/format'
import { cx } from '../lib/cx'
import type { Scenario } from '../types'

const SCENARIO_ICONS: Record<string, typeof CloudSun> = {
  normal: CloudSun,
  peak_hour: Sunrise,
  highway_congestion: RouteIcon,
  accident: TriangleAlert,
  road_closure: AlertOctagon,
  emergency: Siren,
  eco: Leaf,
  network_congestion: Waves,
}

const INCIDENT_ICONS: Record<string, typeof TriangleAlert> = {
  accident: TriangleAlert,
  closure: AlertOctagon,
  construction: Construction,
  heavy_congestion: TrafficCone,
  special_event: CalendarClock,
  emergency: Siren,
}

const SEVERITY_TONE: Record<string, 'default' | 'amber' | 'coral' | 'signal'> = {
  low: 'default',
  medium: 'amber',
  high: 'coral',
  critical: 'coral',
}

export function SimulationLab() {
  const {
    network,
    traffic,
    analytics,
    scenarios,
    incidents,
    simulateAction,
    runScenario,
    createIncident,
    resolveIncident,
    busy,
    settings,
  } = useApp()
  const [levelDraft, setLevelDraft] = useState(1)
  const [incidentType, setIncidentType] = useState('accident')
  const [incidentRoad, setIncidentRoad] = useState('R17')
  const [incidentSeverity, setIncidentSeverity] = useState('medium')
  const [incidentDuration, setIncidentDuration] = useState(60)
  const [selectedScenario, setSelectedScenario] = useState<string>('peak_hour')
  const [randomEvents, setRandomEvents] = useState(true)

  useEffect(() => {
    if (!traffic) return
    setLevelDraft(traffic.simulation.traffic_level)
    if (traffic.simulation.scenario) setSelectedScenario(traffic.simulation.scenario)
  }, [traffic?.simulation.traffic_level, traffic?.simulation.scenario])

  if (!network || !traffic) return <div className="skeleton h-96 rounded-xl" />

  const running = traffic.simulation.running
  const activeIncidents = incidents?.active ?? traffic.incidents
  const roadOptions = useMemo(
    () =>
      [...network.roads].sort((a, b) =>
        a.name === b.name ? a.from_name.localeCompare(b.from_name) : a.name.localeCompare(b.name),
      ),
    [network.roads],
  )
  const selectedRoad = network.roads.find((road) => road.id === incidentRoad)
  const congestion = analytics?.congestion_distribution ?? []

  const applyIncident = async () => {
    const success = await createIncident({
      road_id: incidentRoad,
      type: incidentType,
      severity: incidentSeverity,
      duration_min: incidentDuration,
      note: 'Created from the simulation lab',
    })
    if (success) setIncidentType('accident')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Traffic simulation"
        title="Stress-test the network"
        subtitle="Run a reproducible synthetic scenario, manipulate demand, inject incidents and watch edge costs change. The simulation clock and seed are explicit; no live traffic feeds are used."
        actions={
          <>
            <Badge tone={running ? 'signal' : 'default'}>
              <span className={cx('h-1.5 w-1.5 rounded-full', running ? 'bg-signal-400 live-dot' : 'bg-ink-500')} />
              {running ? 'Running' : 'Paused'}
            </Badge>
            <Badge tone="amber">
              <span className="mono">seed {traffic.simulation.seed}</span>
            </Badge>
          </>
        }
      />

      <Panel className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            title="Predefined scenarios"
            subtitle="Each scenario resets the seeded engine, applies road-level demand and writes the run to SQLite."
            action={<Badge tone="default">8 scenarios · fixed seeds</Badge>}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {scenarios.map((scenario: Scenario) => {
            const Icon = SCENARIO_ICONS[scenario.id] ?? Activity
            const active = selectedScenario === scenario.id
            const loading = busy === `scenario-${scenario.id}`
            return (
              <button
                key={scenario.id}
                onClick={async () => {
                  setSelectedScenario(scenario.id)
                  await runScenario(scenario.id)
                }}
                disabled={busy !== null}
                className={cx(
                  'group relative rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
                  active
                    ? 'border-signal-500/35 bg-signal-500/[0.055]'
                    : 'border-white/[0.07] bg-white/[0.018] hover:border-white/[0.15] hover:bg-white/[0.035]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cx(
                      'grid h-7 w-7 place-items-center rounded-md border',
                      active
                        ? 'border-signal-500/25 bg-signal-500/10 text-signal-400'
                        : 'border-white/[0.08] bg-white/[0.03] text-ink-400',
                    )}
                  >
                    {loading ? <Spinner size={12} /> : <Icon size={14} />}
                  </span>
                  <span className="mono text-[8px] text-ink-600">{String(scenario.number).padStart(2, '0')}</span>
                </div>
                <div className="mt-3 text-[11px] font-semibold text-ink-100">{scenario.name}</div>
                <div className="mt-1 text-[9px] leading-snug text-ink-500">{scenario.tagline}</div>
                <div className="mt-2 flex items-center justify-between text-[8px] text-ink-600">
                  <span className="mono">{String(Math.floor(scenario.clock / 60)).padStart(2, '0')}:{String(scenario.clock % 60).padStart(2, '0')}</span>
                  <span>×{scenario.level.toFixed(2)} demand</span>
                </div>
              </button>
            )
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="overflow-hidden xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="label">Network state</span>
              <span className="mono text-[9px] text-ink-500">
                {traffic.simulation.clock} · tick {traffic.simulation.tick}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="default">{traffic.simulation.scenario_label}</Badge>
              <Badge tone={traffic.summary.avg_congestion > 50 ? 'coral' : traffic.summary.avg_congestion > 28 ? 'amber' : 'signal'}>
                avg congestion {formatNumber(traffic.summary.avg_congestion, 0)}%
              </Badge>
            </div>
          </div>
          <TrafficMap
            network={network}
            routes={[]}
            incidents={activeIncidents}
            showTraffic={settings?.map_show_traffic ?? true}
            showAlternatives={false}
            showLabels={settings?.map_show_labels ?? false}
            clock={traffic.simulation.clock}
            className="h-[430px] rounded-none border-0 sm:h-[520px]"
          />
        </Panel>

        <div className="space-y-4 xl:col-span-4">
          <Panel className="p-4">
            <SectionHeader title="Simulation controls" subtitle="Clock advances manually or while running" action={<Timer size={15} className="text-ink-500" />} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className={cx('btn py-2.5', running ? 'btn-amber' : 'btn-primary')}
                onClick={() => void simulateAction(running ? 'pause' : 'start')}
                disabled={busy !== null}
              >
                {busy === 'sim-start' || busy === 'sim-pause' ? <Spinner /> : running ? <Pause size={13} /> : <Play size={13} />}
                {running ? 'Pause' : 'Start'}
              </button>
              <button className="btn" onClick={() => void simulateAction('reset')} disabled={busy !== null}>
                <RotateCcw size={13} /> Reset
              </button>
              <button className="btn" onClick={() => void simulateAction('tick', { minutes: traffic.simulation.step_minutes, random_events: randomEvents })} disabled={busy !== null}>
                <FastForward size={13} /> Advance
              </button>
              <button className="btn" onClick={() => void simulateAction('tick', { minutes: 15, random_events: randomEvents })} disabled={busy !== null}>
                <FastForward size={13} /> +15 min
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-white/[0.065] bg-ink-950/45 p-3">
              <div className="flex items-center justify-between">
                <span className="label">Demand multiplier</span>
                <span className="mono text-xs font-semibold text-ink-100">×{levelDraft.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="btn h-8 w-8 p-0" onClick={() => void simulateAction('decrease')} disabled={busy !== null || levelDraft <= 0.25}>
                  <ArrowDown size={12} />
                </button>
                <input
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.05}
                  value={levelDraft}
                  onChange={(event) => setLevelDraft(Number(event.target.value))}
                  onMouseUp={() => void simulateAction('level', { level: levelDraft })}
                  onTouchEnd={() => void simulateAction('level', { level: levelDraft })}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-signal-500"
                />
                <button className="btn h-8 w-8 p-0" onClick={() => void simulateAction('increase')} disabled={busy !== null || levelDraft >= 2.5}>
                  <ArrowUp size={12} />
                </button>
              </div>
              <div className="mt-2 flex justify-between text-[8px] text-ink-600">
                <span>0.25</span>
                <span>base 1.00</span>
                <span>2.50</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-[10px] text-ink-400">Advance step</span>
              <div className="flex gap-1">
                {[1, 2, 3, 5, 10].map((step) => (
                  <button
                    key={step}
                    onClick={() => void simulateAction('step', { minutes: step })}
                    className={cx(
                      'mono rounded border px-2 py-1 text-[9px] transition-colors',
                      traffic.simulation.step_minutes === step
                        ? 'border-signal-500/35 bg-signal-500/10 text-signal-400'
                        : 'border-white/[0.08] text-ink-400 hover:border-white/[0.15]',
                    )}
                  >
                    {step}m
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              label="Random traffic events"
              description="Seeded incident probability during ticks"
              checked={randomEvents}
              onChange={setRandomEvents}
            />
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Current conditions" subtitle="Distance-weighted network aggregates" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ConditionStat icon={Gauge} label="Average speed" value={`${formatNumber(traffic.summary.avg_speed_kph, 1)}`} unit="km/h" />
              <ConditionStat icon={Activity} label="Congestion" value={`${formatNumber(traffic.summary.avg_congestion, 0)}`} unit="%" />
              <ConditionStat icon={TriangleAlert} label="Congested" value={`${traffic.summary.congested_roads}`} unit="roads" />
              <ConditionStat icon={AlertOctagon} label="Closed" value={`${traffic.summary.closed_roads}`} unit="roads" />
            </div>
            <div className="mt-4 space-y-2">
              {congestion.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="w-16 text-[9px] capitalize text-ink-400">{item.label}</span>
                  <MiniBar value={(item.value / Math.max(1, traffic.summary.total_roads)) * 100} color={congestionColors[item.key as keyof typeof congestionColors]} />
                  <span className="mono w-5 text-right text-[9px] text-ink-300">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-white/[0.055] pt-2 text-[8px] text-ink-600">
              {traffic.data_source}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-8">
          <SectionHeader
            title="Simulated traffic trend"
            subtitle="Seeded lead-in plus every tick since startup"
            action={
              <div className="flex items-center gap-3 text-[9px] text-ink-400">
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-signal-400" /> speed</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> congestion</span>
              </div>
            }
          />
          <div className="mt-3 h-[250px]">
            <TrafficTrendChart data={traffic.trend} />
          </div>
        </Panel>

        <Panel className="overflow-hidden xl:col-span-4">
          <div className="px-4 pt-4">
            <SectionHeader
              title="Active incidents"
              subtitle="Each incident modifies affected edge costs"
              action={<Badge tone={activeIncidents.length ? 'coral' : 'signal'}>{activeIncidents.length}</Badge>}
            />
          </div>
          <div className="mt-3 max-h-[286px] space-y-2 overflow-y-auto px-4 pb-4">
            {activeIncidents.map((incident) => {
              const Icon = INCIDENT_ICONS[incident.type] ?? TriangleAlert
              return (
                <div key={incident.id} className="rounded-lg border border-white/[0.07] bg-white/[0.018] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cx('grid h-6 w-6 place-items-center rounded border', incident.severity === 'critical' ? 'border-coral-500/30 bg-coral-500/10 text-coral-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400')}>
                        <Icon size={11} />
                      </span>
                      <div>
                        <div className="text-[10px] font-semibold text-ink-100">{incident.type_label}</div>
                        <div className="text-[8px] text-ink-500">{incident.road_name}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => void resolveIncident(incident.id)}
                      disabled={busy !== null}
                      className="text-ink-500 transition-colors hover:text-coral-400"
                      aria-label={`Resolve ${incident.id}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[8px] text-ink-500">
                    <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity_label}</Badge>
                    <span>{incident.duration_min} min · {incident.start_clock}</span>
                  </div>
                </div>
              )
            })}
            {!activeIncidents.length && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-signal-500/15 bg-signal-500/[0.05] text-signal-400">
                  <Activity size={16} />
                </span>
                <p className="text-[11px] text-ink-300">No active incidents</p>
                <p className="text-[9px] text-ink-600">Inject one below to change the graph.</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-7">
          <SectionHeader title="Inject an incident" subtitle="The route engine is recalculated immediately after the graph changes" action={<TriangleAlert size={15} className="text-coral-400" />} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Incident type">
              <select className="select" value={incidentType} onChange={(event) => setIncidentType(event.target.value)}>
                {(incidents?.types ?? []).map((type) => (
                  <option key={type.key} value={type.key}>{type.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select className="select" value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value)}>
                {(incidents?.severities ?? []).map((severity) => (
                  <option key={severity.key} value={severity.key}>{severity.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Road segment">
              <select className="select" value={incidentRoad} onChange={(event) => setIncidentRoad(event.target.value)}>
                {roadOptions.map((road) => (
                  <option key={road.id} value={road.id}>
                    {road.name} · {road.from_name} → {road.to_name} ({road.id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duration" hint="minutes">
              <input
                type="number"
                min={5}
                max={720}
                className="input"
                value={incidentDuration}
                onChange={(event) => setIncidentDuration(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.018] p-3">
            <div className="text-[9px] leading-relaxed text-ink-500">
              {selectedRoad ? (
                <>
                  <span className="text-ink-300">{selectedRoad.name}</span> · {selectedRoad.from_name} ↔ {selectedRoad.to_name} ·{' '}
                  <span className="mono">{formatNumber(selectedRoad.effective_speed_kph, 0)} km/h</span> ·{' '}
                  <span style={{ color: congestionColors[selectedRoad.congestion_level] }}>{titleCase(selectedRoad.congestion_level)}</span>
                </>
              ) : 'Select a road'}
            </div>
            <button className="btn btn-danger" onClick={() => void applyIncident()} disabled={busy !== null}>
              {busy === 'incident-create' ? <Spinner /> : <TriangleAlert size={13} />} Add incident
            </button>
          </div>
        </Panel>

        <Panel className="p-4 xl:col-span-5">
          <SectionHeader title="Recent events" subtitle="Engine audit trail" action={<Timer size={15} className="text-ink-500" />} />
          <div className="mt-3 space-y-2">
            {traffic.recent_events.slice().reverse().map((event, index) => (
              <div key={`${event.at}-${index}`} className="flex items-start gap-2 border-b border-white/[0.045] pb-2 last:border-0">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-500/60" />
                <div className="min-w-0">
                  <div className="text-[10px] text-ink-300">{event.message}</div>
                  <div className="mt-0.5 text-[8px] text-ink-600">{relativeTime(event.at)} · {event.type}</div>
                </div>
              </div>
            ))}
            {!traffic.recent_events.length && <p className="py-6 text-center text-[10px] text-ink-500">No events recorded yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function ConditionStat({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: typeof Gauge
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.018] p-2.5">
      <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.1em] text-ink-500">
        <Icon size={10} />
        {label}
      </div>
      <div className="mono mt-1.5 text-base font-semibold text-ink-100">
        {value} <span className="text-[9px] font-normal text-ink-500">{unit}</span>
      </div>
    </div>
  )
}
