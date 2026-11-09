import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from './lib/api'
import type {
  Analytics,
  AppSettings,
  BenchmarkResponse,
  IncidentsPayload,
  Network,
  PageKey,
  RouteRequest,
  RouteResponse,
  Scenario,
  ScenarioRun,
  TrafficStatus,
} from './types'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export interface RouteChange {
  previous: RouteResponse
  current: RouteResponse
  deltaTime: number
  deltaDistance: number
  changedSegments: number
  changedPath: boolean
}

interface AppContextValue {
  page: PageKey
  navigate: (page: PageKey) => void
  network: Network | null
  traffic: TrafficStatus | null
  analytics: Analytics | null
  settings: AppSettings | null
  scenarios: Scenario[]
  incidents: IncidentsPayload | null
  routeResult: RouteResponse | null
  routeChange: RouteChange | null
  benchmark: BenchmarkResponse | null
  selectedRouteId: string | null
  setSelectedRouteId: (id: string) => void
  activeRequest: RouteRequest | null
  loading: boolean
  busy: string | null
  routeLoading: boolean
  toast: Toast | null
  notify: (message: string, kind?: ToastKind) => void
  dismissToast: () => void
  bootstrap: () => Promise<void>
  planRoute: (request: RouteRequest) => Promise<RouteResponse | null>
  recalculate: () => Promise<void>
  simulateAction: (action: string, extra?: Record<string, unknown>) => Promise<void>
  runScenario: (scenario: string, seed?: number) => Promise<ScenarioRun | null>
  createIncident: (payload: Record<string, unknown>) => Promise<boolean>
  resolveIncident: (id: string) => Promise<void>
  closeRoad: (roadId: string, durationMin?: number, reason?: string) => Promise<void>
  openRoad: (roadId: string) => Promise<void>
  runBenchmark: (request: RouteRequest) => Promise<void>
  saveSettings: (updates: Partial<AppSettings>) => Promise<boolean>
}

const AppContext = createContext<AppContextValue | null>(null)

const DEFAULT_REQUEST: RouteRequest = {
  origin: 'N06',
  destination: 'N15',
  algorithm: 'astar',
  objective: 'time',
  weights: { time: 0.4, distance: 0.2, congestion: 0.2, eco: 0.2 },
}

function readPage(): PageKey {
  const hash = window.location.hash.replace('#/', '').replace('#', '')
  const pages: PageKey[] = ['dashboard', 'planner', 'simulation', 'benchmark', 'network', 'incidents', 'settings']
  return pages.includes(hash as PageKey) ? (hash as PageKey) : 'dashboard'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageKey>(readPage)
  const [network, setNetwork] = useState<Network | null>(null)
  const [traffic, setTraffic] = useState<TrafficStatus | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [incidents, setIncidents] = useState<IncidentsPayload | null>(null)
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null)
  const [routeChange, setRouteChange] = useState<RouteChange | null>(null)
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [activeRequest, setActiveRequest] = useState<RouteRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const booted = useRef(false)
  const tickRef = useRef(false)
  const activeRequestRef = useRef<RouteRequest | null>(null)
  const routeResultRef = useRef<RouteResponse | null>(null)
  const toastTimer = useRef<number | null>(null)

  activeRequestRef.current = activeRequest
  routeResultRef.current = routeResult

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    const item = { id: Date.now(), kind, message }
    setToast(item)
    toastTimer.current = window.setTimeout(() => setToast((current) => (current?.id === item.id ? null : current)), 4800)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const navigate = useCallback((next: PageKey) => {
    setPage(next)
    window.location.hash = `/${next}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const refreshIncidents = useCallback(async () => {
    try {
      setIncidents(await api.incidents())
    } catch {
      /* non-fatal */
    }
  }, [])

  const planRoute = useCallback(
    async (request: RouteRequest): Promise<RouteResponse | null> => {
      setRouteLoading(true)
      const previous = routeResultRef.current
      try {
        const result = await api.optimize(request)
        if (previous && previous.origin.id === result.origin.id && previous.destination.id === result.destination.id) {
          const oldRoads = new Set(previous.recommended.segments.map((segment) => segment.road_id))
          const newRoads = new Set(result.recommended.segments.map((segment) => segment.road_id))
          const changedSegments = [...oldRoads].filter((road) => !newRoads.has(road)).length + [...newRoads].filter((road) => !oldRoads.has(road)).length
          const deltaTime = result.recommended.travel_time_min - previous.recommended.travel_time_min
          const deltaDistance = result.recommended.distance_km - previous.recommended.distance_km
          const changedPath = previous.recommended.path.join('|') !== result.recommended.path.join('|')
          if (changedPath || changedSegments > 0 || Math.abs(deltaTime) > 0.05) {
            setRouteChange({
              previous,
              current: result,
              deltaTime,
              deltaDistance,
              changedSegments,
              changedPath,
            })
          } else {
            setRouteChange(null)
          }
        } else {
          setRouteChange(null)
        }
        setRouteResult(result)
        routeResultRef.current = result
        setActiveRequest(request)
        setSelectedRouteId(result.recommended.route_id)
        return result
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Route calculation failed.'
        notify(message, 'error')
        return null
      } finally {
        setRouteLoading(false)
      }
    },
    [notify],
  )

  const bootstrap = useCallback(async () => {
    setLoading(true)
    try {
      const [net, status, cfg, scen, inc] = await Promise.all([
        api.network(),
        api.traffic(),
        api.settings(),
        api.scenarios(),
        api.incidents(),
      ])
      setNetwork(net)
      setTraffic(status)
      setSettings(cfg)
      setScenarios(scen.scenarios)
      setIncidents(inc)
      try {
        setAnalytics(await api.analytics())
      } catch {
        /* charts degrade gracefully */
      }
      const request: RouteRequest = {
        ...DEFAULT_REQUEST,
        algorithm: cfg.default_algorithm ?? 'astar',
        objective: cfg.default_objective ?? 'time',
      }
      setActiveRequest(request)
      const result = await api.optimize(request)
      setRouteResult(result)
      setSelectedRouteId(result.recommended.route_id)
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not initialise FlowGrid.', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onHash = () => {
      const next = readPage()
      setPage((current) => (current === next ? current : next))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const refreshContext = useCallback(async (includeAnalytics = false) => {
    try {
      const [net, status, inc] = await Promise.all([api.network(), api.traffic(), api.incidents()])
      setNetwork(net)
      setTraffic(status)
      setIncidents(inc)
      if (includeAnalytics) {
        try {
          setAnalytics(await api.analytics())
        } catch {
          /* keep old analytics */
        }
      }
    } catch {
      /* a transient poll failure should not clear the UI */
    }
  }, [])

  const recalculate = useCallback(async () => {
    if (!activeRequestRef.current) return
    await planRoute(activeRequestRef.current)
  }, [planRoute])

  useEffect(() => {
    if (!traffic?.simulation.running) return
    const interval = window.setInterval(async () => {
      if (tickRef.current) return
      tickRef.current = true
      try {
        const status = await api.tick()
        setTraffic(status)
        try {
          setNetwork(await api.network())
        } catch {
          /* keep previous graph */
        }
        if (status.simulation.tick % 5 === 0) {
          try {
            setIncidents(await api.incidents())
            setAnalytics(await api.analytics())
          } catch {
            /* non-fatal */
          }
        }
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Simulation tick failed.', 'error')
      } finally {
        tickRef.current = false
      }
    }, 3200)
    return () => window.clearInterval(interval)
  }, [traffic?.simulation.running, notify])

  const simulateAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(`sim-${action}`)
      try {
        const status = await api.simulate({ action, ...extra })
        setTraffic(status)
        await refreshContext(false)
        if (['start', 'increase', 'decrease', 'level', 'reset'].includes(action)) {
          await recalculate()
        }
        if (action === 'reset') {
          notify('Simulation reset to the seeded peak-hour baseline.', 'success')
        } else if (action === 'start' || action === 'pause') {
          notify(action === 'start' ? 'Traffic simulation running.' : 'Traffic simulation paused.', 'info')
        }
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Simulation action failed.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify, recalculate, refreshContext],
  )

  const runScenario = useCallback(
    async (scenario: string, seed?: number): Promise<ScenarioRun | null> => {
      setBusy(`scenario-${scenario}`)
      try {
        const result = await api.runScenario({ scenario, seed })
        setTraffic(result.traffic)
        if (result.traffic.simulation.running) {
          // Scenario resets are paused; keep the explicit state returned by the server.
        }
        if (result.route) {
          setRouteResult(result.route)
          routeResultRef.current = result.route
          setRouteChange(null)
          setSelectedRouteId(result.route.recommended.route_id)
          const rawWeights = result.route.recommended.weights ?? {}
          const request: RouteRequest = {
            origin: result.route.origin.id,
            destination: result.route.destination.id,
            algorithm: result.route.algorithm,
            objective: result.route.objective,
            weights: {
              time: Number(rawWeights.time ?? 0.4),
              distance: Number(rawWeights.distance ?? 0.2),
              congestion: Number(rawWeights.congestion ?? 0.2),
              eco: Number(rawWeights.eco ?? 0.2),
            },
          }
          setActiveRequest(request)
        }
        await refreshContext(true)
        notify(result.message, 'success')
        return result
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Scenario failed to load.', 'error')
        return null
      } finally {
        setBusy(null)
      }
    },
    [notify, refreshContext],
  )

  const createIncident = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      setBusy('incident-create')
      try {
        const result = await api.createIncident(payload)
        setTraffic(result.traffic)
        await refreshContext(true)
        await recalculate()
        notify(`${String(payload.type ?? 'Incident').replaceAll('_', ' ')} added. Routes recalculated.`, 'success')
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Could not create incident.', 'error')
        return false
      } finally {
        setBusy(null)
      }
    },
    [notify, recalculate, refreshContext],
  )

  const resolveIncident = useCallback(
    async (id: string) => {
      setBusy(`incident-${id}`)
      try {
        const result = await api.deleteIncident(id)
        setTraffic(result.traffic)
        await refreshContext(true)
        await recalculate()
        notify('Incident resolved and route updated.', 'success')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Could not resolve incident.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify, recalculate, refreshContext],
  )

  const closeRoad = useCallback(
    async (roadId: string, durationMin = 120, reason = 'Operator closure') => {
      setBusy(`close-${roadId}`)
      try {
        const result = await api.closeRoad({ road_id: roadId, duration_min: durationMin, reason })
        setTraffic(result.traffic)
        await refreshContext(true)
        await recalculate()
        notify('Road closed. Alternative route evaluated.', 'success')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Could not close road.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify, recalculate, refreshContext],
  )

  const openRoad = useCallback(
    async (roadId: string) => {
      setBusy(`open-${roadId}`)
      try {
        const result = await api.openRoad({ road_id: roadId })
        setTraffic(result.traffic)
        await refreshContext(true)
        await recalculate()
        notify('Road reopened and route updated.', 'success')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Could not reopen road.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify, recalculate, refreshContext],
  )

  const runBenchmark = useCallback(
    async (request: RouteRequest) => {
      setBusy('benchmark')
      try {
        const result = await api.benchmark(request)
        setBenchmark(result)
        notify('Benchmark completed on the same graph and objective.', 'success')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Benchmark failed.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify],
  )

  const saveSettings = useCallback(
    async (updates: Partial<AppSettings>): Promise<boolean> => {
      setBusy('settings')
      try {
        const result = await api.saveSettings(updates)
        setSettings(result)
        notify('Settings saved.', 'success')
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Could not save settings.', 'error')
        return false
      } finally {
        setBusy(null)
      }
    },
    [notify],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      page,
      navigate,
      network,
      traffic,
      analytics,
      settings,
      scenarios,
      incidents,
      routeResult,
      routeChange,
      benchmark,
      selectedRouteId,
      setSelectedRouteId,
      activeRequest,
      loading,
      busy,
      routeLoading,
      toast,
      notify,
      dismissToast,
      bootstrap,
      planRoute,
      recalculate,
      simulateAction,
      runScenario,
      createIncident,
      resolveIncident,
      closeRoad,
      openRoad,
      runBenchmark,
      saveSettings,
    }),
    [
      page,
      navigate,
      network,
      traffic,
      analytics,
      settings,
      scenarios,
      incidents,
      routeResult,
      routeChange,
      benchmark,
      selectedRouteId,
      activeRequest,
      loading,
      busy,
      routeLoading,
      toast,
      notify,
      dismissToast,
      bootstrap,
      planRoute,
      recalculate,
      simulateAction,
      runScenario,
      createIncident,
      resolveIncident,
      closeRoad,
      openRoad,
      runBenchmark,
      saveSettings,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
