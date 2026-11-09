export type PageKey =
  | 'dashboard'
  | 'planner'
  | 'simulation'
  | 'benchmark'
  | 'network'
  | 'incidents'
  | 'settings'

export type AlgorithmKey = 'dijkstra' | 'astar' | 'yen' | 'aco'
export type ObjectiveKey = 'time' | 'distance' | 'congestion' | 'eco' | 'balanced'
export type CongestionLevel = 'free' | 'moderate' | 'heavy' | 'severe' | 'closed'

export interface Node {
  id: string
  name: string
  x: number
  y: number
  lat: number
  lon: number
  district: string
  kind: string
  degree: number
}

export interface Road {
  id: string
  name: string
  from: string
  to: string
  from_name: string
  to_name: string
  road_class: string
  speed_limit: number
  lanes: number
  capacity: number
  distance_km: number
  one_way: string
  effective_speed_kph: number
  free_flow_speed_kph: number
  travel_time_min: number | null
  free_flow_time_min: number
  travel_delay_ratio: number | null
  congestion: number
  congestion_level: CongestionLevel
  traffic_density_vph: number
  utilization: number
  volume_capacity_ratio: number
  status: 'open' | 'closed'
  incident_ids: string[]
  closure_reason: string | null
  simulated: boolean
}

export interface NetworkSummary {
  avg_speed_kph: number
  avg_congestion: number
  congested_roads: number
  free_roads: number
  closed_roads: number
  active_incidents: number
  total_network_distance_km: number
  total_roads: number
  open_roads: number
  simulated: boolean
}

export interface Network {
  mode: string
  mode_label: string
  disclaimer: string
  bounds: { width: number; height: number; km_per_unit: number }
  nodes: Node[]
  roads: Road[]
  summary: NetworkSummary
  database: { routes_saved: number; incidents_saved: number; simulation_runs: number }
  settings: { default_algorithm: AlgorithmKey; default_objective: ObjectiveKey }
}

export interface RouteSegment {
  road_id: string
  key: string
  from: string
  to: string
  name: string
  road_class: string
  distance_km: number
  speed_limit: number
  speed_kph: number
  travel_time_min: number
  congestion: number
  congestion_level: CongestionLevel
  status: string
  lanes: number
  direction: string
  fuel_l: number
  energy_kwh: number
  co2_kg: number
  fuel_cost: number
  geometry: [[number, number], [number, number]]
}

export interface Route {
  route_id: string
  label: string
  tags: string[]
  path: string[]
  node_names: string[]
  segments: RouteSegment[]
  segment_count: number
  intersections: number
  distance_km: number
  travel_time_min: number
  free_flow_time_min: number
  delay_min: number
  avg_speed_kph: number
  congestion_score: number
  congestion_label: string
  fuel_l: number
  energy_kwh: number
  co2_kg: number
  fuel_cost: number
  severe_segments: number
  objective_cost: number
  objective: ObjectiveKey
  algorithm: string
  explored_nodes: number
  execution_ms: number
  normalized: { time: number; distance: number; congestion: number; eco: number }
  recommended?: boolean
  explanation?: string
  weights?: Record<string, number>
  source?: string
  seed?: number
}

export interface RouteResponse {
  generated_at: string
  origin: { id: string; name: string }
  destination: { id: string; name: string }
  algorithm: AlgorithmKey
  algorithm_label: string
  objective: ObjectiveKey
  objective_label: string
  traffic_source: string
  simulation_clock: string
  recommended: Route
  alternatives: Route[]
  comparison: Route[]
  candidate_count: number
  explanation: string
  data_note: string
}

export interface RouteRequest {
  origin: string
  destination: string
  algorithm: AlgorithmKey
  objective: ObjectiveKey
  weights?: { time: number; distance: number; congestion: number; eco: number }
  vehicle?: Record<string, unknown>
}

export interface Incident {
  id: string
  road_id: string
  road_name: string
  from_name: string
  to_name: string
  type: string
  type_label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  severity_label: string
  start_time: string
  start_minutes: number
  start_clock: string
  duration_min: number
  status: 'active' | 'resolved' | 'expired'
  source: string
  note: string
  incident_id?: string
  incident_type?: string
}

export interface Hotspot {
  road_id: string
  name: string
  from_name: string
  to_name: string
  congestion: number
  congestion_level: CongestionLevel
  speed_kph: number
  utilization: number
  status: string
  hotspot_score: number
}

export interface Simulation {
  running: boolean
  clock: string
  time_minutes: number
  tick: number
  step_minutes: number
  seed: number
  scenario: string
  scenario_label: string
  traffic_level: number
  last_tick_at: string
  engine: string
}

export interface TrendPoint {
  tick: number
  sim_time_minutes: number
  clock: string
  avg_speed_kph: number
  avg_congestion: number
  congested_roads: number
  closed_roads: number
  incidents: number
}

export interface TrafficStatus {
  simulation: Simulation
  summary: NetworkSummary
  hotspots: Hotspot[]
  trend: TrendPoint[]
  incidents: Incident[]
  recent_events: { at: string; type: string; message: string }[]
  data_source: string
}

export interface BenchmarkRow {
  name: string
  algorithm: string
  status: string
  execution_ms?: number
  explored_nodes?: number
  distance_km?: number
  travel_time_min?: number
  objective_cost?: number
  congestion_score?: number
  co2_kg?: number
  memory_kb?: number
  path_count?: number
  path?: string[]
  node_names?: string[]
  segments?: number
  best_cost?: boolean
}

export interface BenchmarkResponse {
  generated_at: string
  origin: { id: string; name: string }
  destination: { id: string; name: string }
  objective: ObjectiveKey
  objective_label: string
  clock: string
  results: BenchmarkRow[]
  note: string
  same_graph: boolean
  same_objective: boolean
  data_source: string
}

export interface Topology {
  components: number
  largest_component: number
  is_connected: boolean
  component_sizes: number[]
  average_degree: number
  max_degree: number
  degree_distribution: { degree: number; nodes: number }[]
  average_shortest_travel_time_min: number
  reachable_pairs_pct: number
  critical_corridors: {
    road_id: string
    name: string
    from_name: string
    to_name: string
    usage: number
    share_pct: number
    congestion: number
    status: string
  }[]
  method_note: string
}

export interface Analytics {
  generated_at: string
  summary: NetworkSummary
  network: { nodes: number; roads: number; total_distance_km: number }
  congestion_distribution: { key: string; label: string; value: number }[]
  speed_distribution: { label: string; value: number }[]
  utilization_by_class: { road_class: string; avg_utilization: number; roads: number }[]
  hotspots: Hotspot[]
  trend: TrendPoint[]
  topology: Topology
  current_objective: ObjectiveKey
  current_objective_label: string
  route_history: {
    id: number
    route_code: string
    source_name: string
    destination_name: string
    algorithm: string
    objective: string
    distance_km: number
    travel_time_min: number
    congestion: number
    co2_kg: number
    created_at: string
  }[]
  current_route: RouteResponse | null
  last_benchmark: BenchmarkResponse | null
  incident_history: Incident[]
  simulation_runs: { id: number; scenario: string; random_seed: number; created_at: string }[]
  database: { routes_saved: number; incidents_saved: number; simulation_runs: number }
  data_note: string
}

export interface Scenario {
  id: string
  name: string
  number: number
  tagline: string
  description: string
  clock: number
  level: number
  seed: number
  route: {
    origin: string
    destination: string
    objective: ObjectiveKey
    algorithm: AlgorithmKey
    weights?: Record<string, number>
  }
  accent: string
}

export interface ScenarioRun {
  scenario: Scenario
  created_incidents: Incident[]
  traffic: TrafficStatus
  route: RouteResponse | null
  route_request: Scenario['route']
  reproducible: boolean
  seed: number
  message: string
  simulation_run_id: number
}

export interface VehicleSettings {
  type: string
  label: string
  fuel_type: string
  efficiency_l_100km: number
  fuel_price_per_l: number
  co2_kg_per_l: number
  electricity_kwh_100km: number
  electricity_price_per_kwh: number
  grid_co2_kg_per_kwh: number
  occupants: number
}

export interface AppSettings {
  default_algorithm: AlgorithmKey
  default_objective: ObjectiveKey
  max_alternatives: number
  step_minutes: number
  random_events: boolean
  map_show_traffic: boolean
  map_show_labels: boolean
  map_show_alternatives: boolean
  vehicle: VehicleSettings
}

export interface IncidentsPayload {
  active: Incident[]
  history: Incident[]
  types: { key: string; label: string; default_duration: number }[]
  severities: { key: string; label: string }[]
  roads: {
    id: string
    name: string
    from_name: string
    to_name: string
    status: string
    road_class: string
  }[]
}

export interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: unknown }
}
