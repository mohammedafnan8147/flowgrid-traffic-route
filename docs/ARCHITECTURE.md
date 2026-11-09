# FlowGrid Architecture

## 1. Runtime shape

```text
React/TypeScript SPA (Vite build)
        │  fetch /api/*
        ▼
HTTP adapter ── FastAPI (optional)  OR  stdlib ThreadingHTTPServer (default)
        │
        ▼
TrafficService  ── one shared application service layer
   ├── TrafficEngine        in-memory simulation state
   ├── Graph + algorithms   per-request weighted directed graph
   ├── SQLite DAL           incidents, routes, runs, settings
   └── providers            simulation now; live-provider slot
```

Both adapters expose the same routes and call the same service methods. The default adapter has no third-party dependencies, which keeps the demo runnable on a clean Python installation. FastAPI is provided for deployment and OpenAPI use.

### Request lifecycle: route optimisation

1. Validate origin, destination, algorithm and objective.
2. Read the current `road_state` snapshot from `TrafficEngine`.
3. Expand roads into directed edges (`Graph`), skipping closures and respecting one-way direction.
4. Build the objective cost function and admissible heuristic.
5. Run the selected algorithm (or Yen/ACO).
6. Compute comparison candidates under other objectives and Yen alternatives, deduplicated by node signature.
7. Calculate distance, travel time, delay, average speed, congestion exposure, fuel, kWh, CO₂ and cost for every candidate.
8. Label the recommended route, choose distinguishing tags, build a metrics-grounded explanation.
9. Persist the recommended route in `route_history`.
10. Return structured JSON including the traffic snapshot clock and data-source labels.

No frontend-only route is drawn: every polyline comes from `path`/`segments` returned by the engine.

## 2. Graph contract

`Graph` takes roads and nodes as dictionaries. Each road has:

```text
id, from, to, name, road_class, distance_km, speed_limit,
effective_speed_kph, travel_time_min, congestion, congestion_level,
status, capacity, lanes, one_way
```

It creates edges in the `forward` direction and, if `two_way`, the reverse direction. Closed roads are excluded. The edge key is `road_id::source->target`, so parallel roads between the same pair remain distinguishable.

Algorithms operate on additive edge costs. A* heuristics are admissible:
- distance: Euclidean straight-line kilometres;
- time: straight-line kilometres / 80 km/h × 60;
- congestion, eco, balanced: zero.

`make_objective()` returns an `ObjectiveSpec` with `weight(edge)` and `heuristic(node, goal)`. This makes the cost unit explicit and prevents mixing a distance heuristic with a time objective.

## 3. Traffic simulation contract

State is held in memory and is deliberately deterministic for a given seed, start clock, demand level and incident set.

- `sim_time_minutes` advances in configurable steps.
- `_hour_factor()` applies morning/evening peaks with smooth Gaussian curves.
- `_road base_demand` is deterministic from the road ID and class.
- `refresh()` computes effective speed, travel time, density, utilization and congestion for all roads.
- `tick()` advances the clock, expires incidents, optionally generates a seeded incident and appends a trend point.
- `add_incident()` and `close_road()` modify capacity/speed or remove the edge; the UI triggers route recalculation after these mutations.
- `run_scenario()` resets the engine, applies the scenario clock/demand/road multipliers and creates scenario incidents.

Road multipliers let scenarios target a class or corridor (for example highway congestion) without special-casing algorithms. Closures set `status = closed` and are excluded from `Graph`.

### Reproducibility

Each scenario has a fixed default seed. `run_scenario` returns the seed and writes a `simulation_runs` row with parameters and summary results. Random incident selection uses `random.Random(seed)`, not the global RNG. The simulation history lead-in is generated deterministically so the chart is populated at startup but still reproducible.

## 4. Route comparison model

All candidates are evaluated with the selected objective's cost function, even if they were discovered while searching another objective. Metrics:

```text
distance        Σ edge.distance_km
travel_time     Σ edge.travel_time_min
free_flow_time  Σ distance / speed_limit × 60
delay           max(0, travel_time - free_flow_time)
avg_speed       distance / (travel_time / 60)
congestion      Σ (congestion × distance) / distance
fuel / CO₂      per-segment speed-dependent estimate
objective_cost  Σ selected objective.weight(edge)
```

Route tags are derived from minima among the returned candidate set. Recomendation reasons compare only returned routes. Candidate generation uses:
- selected algorithm result,
- best Dijkstra result for each other objective,
- Yen's K-shortest results for the selected objective,
- edge-penalised alternatives when needed.

## 5. Persistence

`Database` owns a single SQLite connection behind an `RLock` and creates the schema on first boot.

Tables and relationships:

```text
nodes 1 ──< roads >── 1 nodes
roads 1 ──< incidents
routes are recorded independently (route_history)
simulation_runs records scenario/seed/parameters/results
settings is key/value JSON
```

`PRAGMA foreign_keys=ON`, WAL journaling and indexes on incident status/road and route creation time are enabled. The data layer uses plain SQL and an explicit DAL so it can be replaced with PostgreSQL without touching algorithms or UI.

## 6. Frontend data flow

`AppProvider` owns network, traffic, analytics, settings, scenarios, incidents, current route, benchmark and toast state.

- Initial bootstrap fetches the core resources in parallel, then computes the default route.
- Polling starts only while the simulation is running; each tick updates traffic state and network road colours. Analytics are refreshed periodically.
- Route mutations (incident, closure, demand change, scenario) call the optimiser again.
- The Leaflet map renders only the supplied network and route objects; it uses `CRS.Simple` for the synthetic local coordinate system and no external tile server, so it works offline.
- The map has a toggleable traffic layer, alternative routes, junction labels and click-to-pick junction mode.

## 7. Benchmarks

`TrafficService.benchmark()`:
1. Builds one graph snapshot for the current clock.
2. Runs each algorithm against the same objective.
3. Measures wall-clock time with `perf_counter` and peak allocations with `tracemalloc`.
4. Converts each resulting path with the same `route_metrics()`.
5. Marks the lowest objective cost.

The UI explicitly notes that timing is implementation-, graph-size- and hardware-dependent and that a single run is not a universal ranking.

## 8. Security and production boundary

Implemented:
- Structured JSON errors and validation at the service boundary.
- No SQL interpolation with user values.
- Static path traversal protection in the fallback server.
- CORS restricted to local dev origins.
- No external API keys, paid feeds or scraping.

Production hardening needed:
- Authentication/authorisation and per-tenant data isolation.
- PostgreSQL + migrations, connection pooling, simulation state externalised.
- Provider adapters with rate limits, caching and confidence weighting.
- OSM import queueing, bounding-box limits and usage-policy review.
- Observability, job queue for ACO/benchmarks, and load shedding.

## 9. Extension points

- `providers.TrafficProvider`: register a live provider; return `TrafficObservation` records with source and confidence.
- `osm_adapter.import_graph`: bounded OSMnx conversion to FlowGrid's node/road schema.
- `ObjectiveSpec`: add a new additive objective without changing graph traversal.
- `TrafficEngine`: swap the road demand model or inject historical traces.
- `Database`: replace SQLite with PostgreSQL through the existing DAL methods.
