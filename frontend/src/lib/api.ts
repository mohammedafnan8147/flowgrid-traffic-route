import type {
  Analytics,
  ApiErrorPayload,
  AppSettings,
  BenchmarkResponse,
  IncidentsPayload,
  Network,
  RouteRequest,
  RouteResponse,
  Scenario,
  ScenarioRun,
  TrafficStatus,
} from '../types'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(message: string, status = 0, code = 'network_error', details: unknown = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...options, headers })
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Could not reach the FlowGrid API.', 0)
  }
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const parsed = data as ApiErrorPayload | null
    throw new ApiError(
      parsed?.error?.message || `Request failed with status ${response.status}.`,
      response.status,
      parsed?.error?.code || 'request_failed',
      parsed?.error?.details,
    )
  }
  return data as T
}

const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  health: () => request<{ status: string }>('/health'),
  network: () => request<Network>('/network'),
  traffic: () => request<TrafficStatus>('/traffic/status'),
  analytics: () => request<Analytics>('/analytics'),
  settings: () => request<AppSettings>('/settings'),
  saveSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  scenarios: () => request<{ scenarios: Scenario[]; count: number; seed_policy: string }>('/scenarios'),
  incidents: () => request<IncidentsPayload>('/incidents'),
  optimize: (payload: RouteRequest) => post<RouteResponse>('/routes/optimize', payload),
  benchmark: (payload: RouteRequest) => post<BenchmarkResponse>('/benchmark', payload),
  simulate: (payload: Record<string, unknown>) => post<TrafficStatus>('/traffic/simulate', payload),
  tick: () => post<TrafficStatus>('/traffic/tick', {}),
  createIncident: (payload: Record<string, unknown>) =>
    post<{ incident: IncidentsPayload['active'][number]; traffic: TrafficStatus }>('/traffic/incidents', payload),
  deleteIncident: (id: string) =>
    request<{ traffic: TrafficStatus }>(`/traffic/incidents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  closeRoad: (payload: Record<string, unknown>) =>
    post<{ traffic: TrafficStatus }>('/traffic/close-road', payload),
  openRoad: (payload: Record<string, unknown>) =>
    post<{ traffic: TrafficStatus }>('/traffic/open-road', payload),
  runScenario: (payload: Record<string, unknown>) => post<ScenarioRun>('/scenarios/run', payload),
  networkAnalysis: () => request<{ topology: Analytics['topology']; summary: Network['summary'] }>('/network/analysis'),
  history: () => request<{ history: Analytics['route_history'] }>('/history/routes'),
}
