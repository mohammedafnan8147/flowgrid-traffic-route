import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Cpu,
  GitCompareArrows,
  Info,
  MemoryStick,
  Network,
  Play,
  Timer,
  Waypoints,
} from 'lucide-react'
import { useApp } from '../state'
import type { BenchmarkResponse, ObjectiveKey, RouteRequest } from '../types'
import { MetricBarChart } from '../components/charts'
import { Badge, Field, PageHeader, Panel, SectionHeader, Spinner } from '../components/ui'
import { formatNumber, objectiveLabels } from '../lib/format'
import { cx } from '../lib/cx'

const OBJECTIVES: ObjectiveKey[] = ['time', 'distance', 'congestion', 'eco', 'balanced']

export function Benchmark() {
  const { network, traffic, benchmark, analytics, runBenchmark, busy, routeResult, settings, notify } = useApp()
  const [origin, setOrigin] = useState(routeResult?.origin.id ?? 'N06')
  const [destination, setDestination] = useState(routeResult?.destination.id ?? 'N15')
  const [objective, setObjective] = useState<ObjectiveKey>(routeResult?.objective ?? settings?.default_objective ?? 'time')
  const [metric, setMetric] = useState<'execution_ms' | 'explored_nodes' | 'memory_kb'>('execution_ms')

  useEffect(() => {
    if (routeResult) {
      setOrigin(routeResult.origin.id)
      setDestination(routeResult.destination.id)
      setObjective(routeResult.objective)
    }
  }, [routeResult])

  const result: BenchmarkResponse | null = benchmark ?? analytics?.last_benchmark ?? null
  const okRows = result?.results.filter((row) => row.status === 'ok') ?? []
  const fastest = okRows.reduce<typeof okRows[number] | null>(
    (best, row) => (!best || (row.execution_ms ?? Infinity) < (best.execution_ms ?? Infinity) ? row : best),
    null,
  )
  const fewestExplored = okRows.reduce<typeof okRows[number] | null>(
    (best, row) => (!best || (row.explored_nodes ?? Infinity) < (best.explored_nodes ?? Infinity) ? row : best),
    null,
  )

  if (!network || !traffic) return <div className="skeleton h-96 rounded-xl" />

  const run = async () => {
    if (origin === destination) {
      notify('Choose two different junctions for a fair comparison.', 'error')
      return
    }
    const request: RouteRequest = { origin, destination, objective, algorithm: 'astar' }
    await runBenchmark(request)
  }

  const metricOptions = [
    { key: 'execution_ms' as const, label: 'Execution time', unit: 'ms', icon: Timer },
    { key: 'explored_nodes' as const, label: 'Explored nodes', unit: 'nodes', icon: Waypoints },
    { key: 'memory_kb' as const, label: 'Peak memory', unit: 'KB', icon: MemoryStick },
  ]
  const activeMetric = metricOptions.find((item) => item.key === metric)!

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Algorithm comparison"
        title="Measure the search, not the marketing"
        subtitle="Run Dijkstra, A*, Yen's K-shortest paths and the experimental ant-colony optimiser on the same graph, objective and traffic snapshot. Timings are measured in this process."
        actions={
          <Badge tone="default">
            <GitCompareArrows size={10} /> {traffic.simulation.clock} snapshot
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="p-4 xl:col-span-4">
          <SectionHeader title="Benchmark setup" subtitle="One graph, one objective, four algorithms" action={<Cpu size={15} className="text-ink-500" />} />
          <div className="mt-4 space-y-3">
            <Field label="Origin">
              <select className="select" value={origin} onChange={(event) => setOrigin(event.target.value)}>
                {network.nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.name} · {node.id}</option>
                ))}
              </select>
            </Field>
            <Field label="Destination">
              <select className="select" value={destination} onChange={(event) => setDestination(event.target.value)}>
                {network.nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.name} · {node.id}</option>
                ))}
              </select>
            </Field>
            <Field label="Objective">
              <select className="select" value={objective} onChange={(event) => setObjective(event.target.value as ObjectiveKey)}>
                {OBJECTIVES.map((key) => (
                  <option key={key} value={key}>{objectiveLabels[key]}</option>
                ))}
              </select>
            </Field>
          </div>

          <button className="btn btn-primary mt-4 w-full py-3" onClick={() => void run()} disabled={busy !== null}>
            {busy === 'benchmark' ? <Spinner /> : <Play size={14} />}
            Run benchmark
          </button>

          <div className="mt-4 space-y-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.035] p-3 text-[9px] leading-relaxed text-amber-100/70">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400">
              <Info size={10} /> Fair-comparison note
            </div>
            <p>
              Execution time depends on graph size, implementation details, Python warm-up and hardware. A single run is an
              indicator, not a universal ranking. All four methods use the same weighted graph and objective.
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.018] p-3">
            <div className="label mb-2">Algorithms</div>
            <div className="space-y-1.5 text-[10px] text-ink-400">
              <div className="flex justify-between"><span>Dijkstra</span><span className="mono text-ink-500">binary heap</span></div>
              <div className="flex justify-between"><span>A*</span><span className="mono text-ink-500">geographic lower bound</span></div>
              <div className="flex justify-between"><span>Yen</span><span className="mono text-ink-500">K = 3 loopless</span></div>
              <div className="flex justify-between"><span>Ant colony</span><span className="mono text-ink-500">24 ants × 40</span></div>
            </div>
          </div>
        </Panel>

        <div className="space-y-4 xl:col-span-8">
          {result ? (
            <>
              <Panel className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="label">Benchmark result</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-100">
                        {result.origin.name} <ArrowRight size={12} className="inline text-ink-600" /> {result.destination.name}
                      </span>
                      <Badge tone="blue">{result.objective_label}</Badge>
                      <Badge tone="default">{result.clock}</Badge>
                    </div>
                    <div className="mt-2 text-[10px] text-ink-500">{result.note}</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="rounded-lg border border-signal-500/20 bg-signal-500/[0.05] px-3 py-2">
                      <div className="text-[8px] uppercase tracking-[0.1em] text-ink-500">Fastest measured</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-signal-400">{fastest?.name ?? '—'}</div>
                      <div className="mono text-[9px] text-ink-400">{fastest ? `${formatNumber(fastest.execution_ms, 2)} ms` : ''}</div>
                    </div>
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2">
                      <div className="text-[8px] uppercase tracking-[0.1em] text-ink-500">Fewest explored</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-sky-300">{fewestExplored?.name ?? '—'}</div>
                      <div className="mono text-[9px] text-ink-400">{fewestExplored ? `${fewestExplored.explored_nodes} nodes` : ''}</div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SectionHeader title="Measured performance" subtitle={`${activeMetric.label} · lower is better`} />
                  <div className="flex gap-1">
                    {metricOptions.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setMetric(option.key)}
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-medium transition-colors',
                          metric === option.key
                            ? 'border-signal-500/35 bg-signal-500/10 text-signal-400'
                            : 'border-white/[0.08] text-ink-400 hover:border-white/[0.15]',
                        )}
                      >
                        <option.icon size={10} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 h-[230px]">
                  <MetricBarChart data={result.results} dataKey={metric} label={activeMetric.label} unit={activeMetric.unit} />
                </div>
              </Panel>

              <Panel className="overflow-hidden">
                <div className="px-4 pt-4">
                  <SectionHeader
                    title="Comparison table"
                    subtitle="Route metrics are recalculated from each path's edge sequence"
                    action={<Badge tone="default">{result.data_source}</Badge>}
                  />
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse">
                    <thead>
                      <tr>
                        <th className="table-head">Algorithm</th>
                        <th className="table-head text-right">Execution</th>
                        <th className="table-head text-right">Explored</th>
                        <th className="table-head text-right">Memory</th>
                        <th className="table-head text-right">Distance</th>
                        <th className="table-head text-right">Travel time</th>
                        <th className="table-head text-right">Congestion</th>
                        <th className="table-head text-right">Objective cost</th>
                        <th className="table-head">Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.map((row) => (
                        <tr key={row.algorithm} className={row.best_cost ? 'bg-signal-500/[0.04]' : undefined}>
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <span className={cx('h-1.5 w-1.5 rounded-full', row.best_cost ? 'bg-signal-400' : 'bg-ink-500')} />
                              <span className={cx('font-medium', row.best_cost ? 'text-signal-400' : 'text-ink-200')}>{row.name}</span>
                              {row.best_cost && <Badge tone="signal">best cost</Badge>}
                            </div>
                          </td>
                          <td className="table-cell mono text-right">{formatNumber(row.execution_ms, 2)} ms</td>
                          <td className="table-cell mono text-right">{row.explored_nodes ?? '—'}</td>
                          <td className="table-cell mono text-right">{formatNumber(row.memory_kb, 1)} KB</td>
                          <td className="table-cell mono text-right">{formatNumber(row.distance_km, 2)} km</td>
                          <td className="table-cell mono text-right">{formatNumber(row.travel_time_min, 2)} min</td>
                          <td className="table-cell mono text-right">{formatNumber(row.congestion_score, 1)}%</td>
                          <td className="table-cell mono text-right">{formatNumber(row.objective_cost, 2)}</td>
                          <td className="table-cell text-[9px] text-ink-500">{row.node_names?.slice(0, 3).join(' → ')}{(row.node_names?.length ?? 0) > 3 ? ' …' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 border-t border-white/[0.055] px-4 py-2.5 text-[9px] text-ink-600">
                  <MemoryStick size={10} /> Memory is measured with <span className="mono">tracemalloc</span> during each run and includes temporary allocations.
                </div>
              </Panel>
            </>
          ) : (
            <Panel className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-ink-400">
                <GitCompareArrows size={24} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink-200">No benchmark in this session</h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">
                Select a pair of junctions and an objective, then run all four algorithms against the exact same simulated graph.
              </p>
              <div className="mt-4 flex gap-2">
                <Badge tone="default"><Network size={10} /> same graph</Badge>
                <Badge tone="default"><Timer size={10} /> measured now</Badge>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
