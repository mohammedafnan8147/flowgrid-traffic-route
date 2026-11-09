import { useEffect, useState } from 'react'
import {
  Car,
  CheckCircle2,
  Database,
  Fuel,
  Info,
  Map,
  Network,
  RotateCcw,
  Save,
  Server,
  Settings2,
  SlidersHorizontal,
  WifiOff,
} from 'lucide-react'
import { useApp } from '../state'
import type { AlgorithmKey, AppSettings, ObjectiveKey } from '../types'
import { Badge, Field, PageHeader, Panel, SectionHeader, Spinner, Toggle } from '../components/ui'
import { objectiveLabels } from '../lib/format'
import { cx } from '../lib/cx'

const ALGORITHMS: { key: AlgorithmKey; label: string }[] = [
  { key: 'astar', label: 'A* search' },
  { key: 'dijkstra', label: 'Dijkstra' },
  { key: 'yen', label: 'Yen K-shortest' },
  { key: 'aco', label: 'Ant colony (experimental)' },
]

const OBJECTIVES: ObjectiveKey[] = ['time', 'distance', 'congestion', 'eco', 'balanced']

export function SettingsPage() {
  const { settings, saveSettings, busy, network, traffic, notify } = useApp()
  const [form, setForm] = useState<AppSettings | null>(settings)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (settings && !dirty) setForm(settings)
  }, [settings, dirty])

  if (!settings || !form) return <div className="skeleton h-96 rounded-xl" />

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
    setDirty(true)
  }
  const updateVehicle = (key: keyof AppSettings['vehicle'], value: string | number) => {
    setForm((current) => (current ? { ...current, vehicle: { ...current.vehicle, [key]: value } } : current))
    setDirty(true)
  }

  const save = async () => {
    if (!form) return
    const ok = await saveSettings(form)
    if (ok) setDirty(false)
  }

  const resetLocal = () => {
    setForm(settings)
    setDirty(false)
    notify('Unsaved settings reverted.', 'info')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Configure the routing lab"
        subtitle="Defaults are used by the planner and simulation. Vehicle parameters feed the environmental model; the graph itself only uses them when the eco or balanced objective is selected."
        actions={
          <>
            {dirty && <Badge tone="amber">Unsaved changes</Badge>}
            <button className="btn" onClick={resetLocal} disabled={!dirty || busy !== null}>
              <RotateCcw size={13} /> Revert
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy !== null || !dirty}>
              {busy === 'settings' ? <Spinner /> : <Save size={13} />} Save settings
            </button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Panel className="p-4">
            <SectionHeader title="Routing defaults" subtitle="Applied when a new planner session or scenario starts" action={<SlidersHorizontal size={15} className="text-ink-500" />} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Default algorithm" hint="search strategy">
                <select className="select" value={form.default_algorithm} onChange={(event) => update('default_algorithm', event.target.value as AlgorithmKey)}>
                  {ALGORITHMS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default objective" hint="edge weight model">
                <select className="select" value={form.default_objective} onChange={(event) => update('default_objective', event.target.value as ObjectiveKey)}>
                  {OBJECTIVES.map((key) => (
                    <option key={key} value={key}>{objectiveLabels[key]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Maximum alternatives" hint="1–6">
                <input className="input" type="number" min={1} max={6} value={form.max_alternatives} onChange={(event) => update('max_alternatives', Number(event.target.value))} />
              </Field>
              <Field label="Simulation step" hint="minutes / tick">
                <input className="input" type="number" min={1} max={15} value={form.step_minutes} onChange={(event) => update('step_minutes', Number(event.target.value))} />
              </Field>
            </div>
            <div className="mt-2 border-t border-white/[0.055]">
              <Toggle
                label="Random traffic events"
                description="Allow seeded incident generation during simulation ticks"
                checked={form.random_events}
                onChange={(value) => update('random_events', value)}
              />
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Environmental model" subtitle="Configurable estimates; not measurement-grade fuel data" action={<Car size={15} className="text-ink-500" />} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Vehicle profile">
                <input className="input" value={form.vehicle.label} onChange={(event) => updateVehicle('label', event.target.value)} />
              </Field>
              <Field label="Fuel type">
                <select className="select" value={form.vehicle.fuel_type} onChange={(event) => updateVehicle('fuel_type', event.target.value)}>
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="electric">Electric</option>
                </select>
              </Field>
              <Field label="Efficiency" hint={form.vehicle.fuel_type === 'electric' ? 'kWh/100 km' : 'L/100 km'}>
                <input
                  className="input"
                  type="number"
                  step={0.1}
                  min={0}
                  value={form.vehicle.fuel_type === 'electric' ? form.vehicle.electricity_kwh_100km : form.vehicle.efficiency_l_100km}
                  onChange={(event) =>
                    updateVehicle(
                      form.vehicle.fuel_type === 'electric' ? 'electricity_kwh_100km' : 'efficiency_l_100km',
                      Number(event.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Energy price" hint="₹ per unit">
                <input
                  className="input"
                  type="number"
                  step={0.1}
                  min={0}
                  value={form.vehicle.fuel_type === 'electric' ? form.vehicle.electricity_price_per_kwh : form.vehicle.fuel_price_per_l}
                  onChange={(event) =>
                    updateVehicle(
                      form.vehicle.fuel_type === 'electric' ? 'electricity_price_per_kwh' : 'fuel_price_per_l',
                      Number(event.target.value),
                    )
                  }
                />
              </Field>
              <Field label="CO₂ factor" hint={form.vehicle.fuel_type === 'electric' ? 'kg/kWh' : 'kg/L'}>
                <input
                  className="input"
                  type="number"
                  step={0.01}
                  min={0}
                  value={form.vehicle.fuel_type === 'electric' ? form.vehicle.grid_co2_kg_per_kwh : form.vehicle.co2_kg_per_l}
                  onChange={(event) =>
                    updateVehicle(
                      form.vehicle.fuel_type === 'electric' ? 'grid_co2_kg_per_kwh' : 'co2_kg_per_l',
                      Number(event.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Occupants" hint="vehicle load">
                <input className="input" type="number" min={1} max={60} value={form.vehicle.occupants} onChange={(event) => updateVehicle('occupants', Number(event.target.value))} />
              </Field>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-2.5 text-[9px] leading-relaxed text-amber-100/70">
              <Fuel size={11} className="mt-0.5 shrink-0 text-amber-400" />
              Fuel consumption uses distance × a speed-dependent efficiency penalty. It is an engineering approximation, not an OEM measurement.
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Map preferences" subtitle="Default visualization toggles" action={<Map size={15} className="text-ink-500" />} />
            <div className="mt-2 divide-y divide-white/[0.055]">
              <Toggle label="Show traffic colours" description="Colour roads by simulated congestion" checked={form.map_show_traffic} onChange={(value) => update('map_show_traffic', value)} />
              <Toggle label="Show junction labels" description="Display all junction names on the map" checked={form.map_show_labels} onChange={(value) => update('map_show_labels', value)} />
              <Toggle label="Show alternatives" description="Display alternative routes as dashed overlays" checked={form.map_show_alternatives} onChange={(value) => update('map_show_alternatives', value)} />
            </div>
          </Panel>

          <Panel className="overflow-hidden p-4">
            <SectionHeader title="OpenStreetMap network mode" subtitle="Optional Mode B · real street geometry" action={<Network size={15} className="text-ink-500" />} />
            <div className="mt-3 rounded-lg border border-white/[0.07] bg-ink-950/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-ink-400">
                    <WifiOff size={14} />
                  </span>
                  <div>
                    <div className="text-[11px] font-medium text-ink-200">OSMnx adapter not active</div>
                    <div className="text-[9px] text-ink-500">The default synthetic network runs fully offline.</div>
                  </div>
                </div>
                <Badge tone="amber">optional dependency</Badge>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-ink-500">
                Install <span className="mono text-ink-300">backend/requirements-osm.txt</span> to enable city/bbox imports through OSMnx. Live traffic is never
                inferred from OpenStreetMap; imported roads use configurable speed assumptions and are labelled as estimated.
              </p>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel className="p-4">
            <SectionHeader title="System" subtitle="Current runtime facts" action={<Server size={15} className="text-ink-500" />} />
            <div className="mt-3 space-y-2">
              <SystemRow label="App version" value="FlowGrid 1.0.0" />
              <SystemRow label="Network mode" value={network?.mode_label ?? 'Synthetic'} />
              <SystemRow label="Graph size" value={network ? `${network.nodes.length} nodes / ${network.roads.length} links` : '—'} />
              <SystemRow label="Simulation" value={traffic?.simulation.engine ?? '—'} />
              <SystemRow label="Seed" value={String(traffic?.simulation.seed ?? 42)} />
              <SystemRow label="API" value="FastAPI-compatible REST" />
              <SystemRow label="Storage" value="SQLite · portable schema" />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-signal-500/15 bg-signal-500/[0.035] p-2.5 text-[9px] leading-relaxed text-signal-200/70">
              <Info size={11} className="mt-0.5 shrink-0 text-signal-400" />
              Health, network, routing, traffic, analytics, benchmark and scenario endpoints share one service layer.
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Data integrity" subtitle="What this demo does and does not claim" action={<Database size={15} className="text-ink-500" />} />
            <ul className="mt-3 space-y-2.5">
              {[
                'All traffic speeds, densities and congestion values are synthetic simulation output.',
                'Fuel and CO₂ figures are configurable engineering estimates, not measurements.',
                'Incidents and route evaluations persist locally in SQLite.',
                'No paid API or live traffic feed is required.',
                'OpenStreetMap imports, when enabled, are road geometry only — not live conditions.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-[9px] leading-relaxed text-ink-400">
                  <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-signal-500/70" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-white/[0.055] pt-3 text-[8px] text-ink-600">
              SQLite database: <span className="mono">data/flowgrid.db</span>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeader title="Current values" subtitle="What the backend is using now" action={<Settings2 size={15} className="text-ink-500" />} />
            <div className="mt-3 space-y-2">
              <SystemRow label="Default algorithm" value={settings.default_algorithm} />
              <SystemRow label="Default objective" value={objectiveLabels[settings.default_objective]} />
              <SystemRow label="Max alternatives" value={String(settings.max_alternatives)} />
              <SystemRow label="Step" value={`${settings.step_minutes} min`} />
              <SystemRow label="Random events" value={settings.random_events ? 'enabled' : 'disabled'} />
              <SystemRow label="Vehicle" value={settings.vehicle.label} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0')}>
      <span className="text-[10px] text-ink-400">{label}</span>
      <span className="mono max-w-[60%] truncate text-right text-[9px] text-ink-200">{value}</span>
    </div>
  )
}
