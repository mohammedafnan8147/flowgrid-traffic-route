import { useMemo, useState } from 'react'
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Construction,
  Filter,
  MapPin,
  Siren,
  TrafficCone,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useApp } from '../state'
import { TrafficMap } from '../components/TrafficMap'
import { RouteChangeBanner } from '../components/routes'
import { Badge, Field, PageHeader, Panel, SectionHeader, Spinner, StatCard } from '../components/ui'
import { congestionColors, formatNumber, relativeTime, titleCase } from '../lib/format'
import { cx } from '../lib/cx'
import type { Incident } from '../types'

const TYPE_ICONS: Record<string, typeof TriangleAlert> = {
  accident: TriangleAlert,
  closure: AlertOctagon,
  construction: Construction,
  heavy_congestion: TrafficCone,
  special_event: CalendarClock,
  emergency: Siren,
}

const TONE: Record<string, 'default' | 'amber' | 'coral' | 'signal'> = {
  low: 'default',
  medium: 'amber',
  high: 'coral',
  critical: 'coral',
}

function incidentKey(incident: Incident): string {
  return incident.id ?? incident.incident_id ?? `${incident.road_id}-${incident.start_time}`
}

export function IncidentsPage() {
  const { network, traffic, incidents, routeChange, createIncident, resolveIncident, closeRoad, openRoad, busy, notify } = useApp()
  const [type, setType] = useState('accident')
  const [roadId, setRoadId] = useState('R17')
  const [severity, setSeverity] = useState('medium')
  const [duration, setDuration] = useState(60)
  const [note, setNote] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')

  const active = incidents?.active ?? traffic?.incidents ?? []
  const history = incidents?.history ?? []
  const closedRoads = useMemo(() => network?.roads.filter((road) => road.status === 'closed') ?? [], [network?.roads])
  const selectedRoad = network?.roads.find((road) => road.id === roadId)
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return history
    return history.filter((incident) => (incident.incident_type ?? incident.type) === historyFilter)
  }, [history, historyFilter])

  if (!network || !traffic) return <div className="skeleton h-96 rounded-xl" />

  const submit = async () => {
    const ok = await createIncident({
      road_id: roadId,
      type,
      severity,
      duration_min: duration,
      note: note || 'Created from incident manager',
    })
    if (ok) {
      setNote('')
      notify('Incident is active and affected routes were re-evaluated.', 'success')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Incident management"
        title="Keep the network honest"
        subtitle="Create, inspect and resolve incidents. Closures remove edge availability; other incidents reduce capacity and speed. Every change recalculates the current route."
        actions={
          <Badge tone={active.length ? 'coral' : 'signal'}>
            <span className={cx('h-1.5 w-1.5 rounded-full', active.length ? 'bg-coral-400 live-dot' : 'bg-signal-400')} />
            {active.length} active
          </Badge>
        }
      />

      {routeChange && <RouteChangeBanner change={routeChange} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active incidents" value={`${active.length}`} hint={`${active.filter((item) => item.source === 'scenario').length} scenario-generated`} icon={TriangleAlert} tone={active.length ? 'coral' : 'signal'} />
        <StatCard label="Closed roads" value={`${closedRoads.length}`} hint="unavailable to routing" icon={AlertOctagon} tone={closedRoads.length ? 'coral' : 'default'} />
        <StatCard label="Simulated clock" value={traffic.simulation.clock} hint={`${traffic.simulation.tick} ticks`} icon={Clock3} />
        <StatCard label="Saved incident records" value={`${incidents?.history.length ?? 0}`} hint="SQLite persistence" icon={CheckCircle2} tone="signal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-4">
          <SectionHeader title="Create incident" subtitle="Graph edge costs update immediately" action={<TriangleAlert size={15} className="text-coral-400" />} />
          <div className="mt-4 space-y-3">
            <Field label="Incident type">
              <select className="select" value={type} onChange={(event) => setType(event.target.value)}>
                {(incidents?.types ?? []).map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Road segment">
              <select className="select" value={roadId} onChange={(event) => setRoadId(event.target.value)}>
                {network.roads.map((road) => (
                  <option key={road.id} value={road.id}>
                    {road.name} · {road.from_name} ↔ {road.to_name} ({road.id})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Severity">
                <select className="select" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                  {(incidents?.severities ?? []).map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration" hint="min">
                <input className="input" type="number" min={5} max={720} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
              </Field>
            </div>
            <Field label="Operator note">
              <textarea className="input min-h-[72px] resize-y" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the incident record…" />
            </Field>
            <button className="btn btn-danger w-full py-2.5" onClick={() => void submit()} disabled={busy !== null}>
              {busy === 'incident-create' ? <Spinner /> : <TriangleAlert size={13} />} Create incident
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-white/[0.06] bg-ink-950/45 p-3">
            <div className="label mb-2">Road closure controls</div>
            {selectedRoad && (
              <div className="mb-2 text-[9px] leading-relaxed text-ink-500">
                {selectedRoad.name} · {selectedRoad.from_name} ↔ {selectedRoad.to_name}
                <div className="mt-1 flex gap-3">
                  <span className="mono">{formatNumber(selectedRoad.distance_km, 2)} km</span>
                  <span className="mono">{formatNumber(selectedRoad.effective_speed_kph, 0)} km/h</span>
                  <span style={{ color: congestionColors[selectedRoad.congestion_level] }}>{titleCase(selectedRoad.congestion_level)}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn btn-danger"
                onClick={() => void closeRoad(roadId, duration, note || 'Operator closure')}
                disabled={busy !== null || selectedRoad?.status === 'closed'}
              >
                <AlertOctagon size={12} /> Close road
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void openRoad(roadId)}
                disabled={busy !== null || selectedRoad?.status !== 'closed'}
              >
                <CheckCircle2 size={12} /> Reopen road
              </button>
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="label">Incident map</span>
              <span className="text-[9px] text-ink-500">dashed roads = closed / affected</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="coral"><span className="h-1.5 w-1.5 rounded-full bg-coral-400" /> incident</Badge>
              <Badge tone="default">{traffic.simulation.clock}</Badge>
            </div>
          </div>
          <TrafficMap
            network={network}
            routes={[]}
            incidents={active}
            showTraffic
            showAlternatives={false}
            showLabels={false}
            clock={traffic.simulation.clock}
            className="h-[430px] rounded-none border-0 sm:h-[510px]"
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-5">
          <SectionHeader title="Active incidents" subtitle="Currently modifying edge weights" action={<Badge tone={active.length ? 'coral' : 'signal'}>{active.length}</Badge>} />
          <div className="mt-3 space-y-2">
            {active.map((incident) => {
              const Icon = TYPE_ICONS[incident.type] ?? TriangleAlert
              return (
                <div key={incidentKey(incident)} className="rounded-lg border border-white/[0.07] bg-white/[0.018] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={cx('grid h-8 w-8 place-items-center rounded-lg border', TONE[incident.severity] === 'coral' ? 'border-coral-500/25 bg-coral-500/10 text-coral-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400')}>
                        <Icon size={14} />
                      </span>
                      <div>
                        <div className="text-[11px] font-semibold text-ink-100">{incident.type_label}</div>
                        <div className="text-[9px] text-ink-500">{incident.road_name}</div>
                      </div>
                    </div>
                    <button className="text-ink-500 transition-colors hover:text-coral-400" onClick={() => void resolveIncident(incident.id)} disabled={busy !== null} aria-label="Resolve incident">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-ink-500">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={TONE[incident.severity]}>{incident.severity_label}</Badge>
                      <span>{incident.source}</span>
                    </div>
                    <span className="mono">{incident.start_clock} · {incident.duration_min} min</span>
                  </div>
                  {incident.note && <div className="mt-2 rounded border border-white/[0.05] bg-ink-950/50 px-2 py-1.5 text-[9px] text-ink-400">{incident.note}</div>}
                </div>
              )
            })}
            {!active.length && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-signal-500/15 bg-signal-500/[0.05] text-signal-400">
                  <CheckCircle2 size={18} />
                </span>
                <p className="text-[11px] text-ink-300">Network clear</p>
                <p className="text-[9px] text-ink-600">No active incidents are modifying the graph.</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <SectionHeader title="Incident record" subtitle="Persisted events, including resolved and expired incidents" />
            <div className="flex items-center gap-2">
              <Filter size={12} className="text-ink-500" />
              <select className="select h-8 w-auto py-1 text-[10px]" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}>
                <option value="all">All types</option>
                {(incidents?.types ?? []).map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 max-h-[380px] overflow-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead className="sticky top-0 bg-ink-850">
                <tr>
                  <th className="table-head">Incident</th>
                  <th className="table-head">Road</th>
                  <th className="table-head">Severity</th>
                  <th className="table-head">Window</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((incident) => {
                  const Icon = TYPE_ICONS[incident.incident_type ?? incident.type] ?? TriangleAlert
                  return (
                    <tr key={incidentKey(incident)}>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <Icon size={11} className="text-ink-500" />
                          <span className="text-ink-200">{incident.type_label ?? titleCase(incident.incident_type ?? incident.type)}</span>
                        </div>
                        <div className="mono mt-0.5 text-[8px] text-ink-600">{incidentKey(incident)}</div>
                      </td>
                      <td className="table-cell text-[10px]">{incident.road_name ?? incident.road_id}</td>
                      <td className="table-cell"><Badge tone={TONE[incident.severity]}>{incident.severity_label ?? titleCase(incident.severity)}</Badge></td>
                      <td className="table-cell mono text-[9px]">{incident.start_clock ?? '—'} · {incident.duration_min} min</td>
                      <td className="table-cell">
                        <span className={cx('text-[9px] capitalize', incident.status === 'active' ? 'text-coral-400' : 'text-ink-500')}>{incident.status}</span>
                      </td>
                      <td className="table-cell text-right text-[9px] text-ink-500">{relativeTime(incident.start_time)}</td>
                    </tr>
                  )
                })}
                {!filteredHistory.length && (
                  <tr>
                    <td colSpan={6} className="table-cell py-10 text-center text-ink-500">No incidents recorded for this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-2.5 text-[9px] text-ink-600">
            <span className="flex items-center gap-1.5"><MapPin size={10} /> Local SQLite incident store</span>
            <span>{filteredHistory.length} records shown</span>
          </div>
        </Panel>
      </div>
    </div>
  )
}
