"""Application service layer shared by the FastAPI and fallback HTTP adapters."""
from __future__ import annotations

import gc
import time
import tracemalloc
from datetime import datetime, timezone
from typing import Any

from .algorithms import (
    Graph,
    ant_colony,
    astar,
    dijkstra,
    make_objective,
    penalised_alternatives,
    route_metrics,
    yen_k_shortest,
)
from .analytics import (
    congestion_distribution,
    network_topology,
    speed_distribution,
    utilization_by_class,
)
from .db import Database
from .fuel import DEFAULT_VEHICLE, vehicle_public
from .network_data import NODE_BY_ID, ROAD_BY_ID, ROADS
from .providers import ProviderRegistry
from .scenarios import SCENARIOS, scenario_catalog
from .traffic import INCIDENT_TYPES, SEVERITY, TrafficEngine

ALGORITHMS = {
    "dijkstra": "Dijkstra",
    "astar": "A* search",
    "yen": "Yen K-shortest",
    "aco": "Ant colony",
}
OBJECTIVES = {
    "time": "Minimum travel time",
    "distance": "Minimum distance",
    "congestion": "Minimum congestion",
    "eco": "Eco-friendly",
    "balanced": "Balanced weights",
}


class ServiceError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request", details: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class TrafficService:
    def __init__(self, db_path: str, seed: int = 42):
        self.db = Database(db_path)
        self.settings = self.db.get_settings()
        self.engine = TrafficEngine(seed=seed)
        self.engine.step_minutes = int(self.settings.get("step_minutes", 3))
        self.providers = ProviderRegistry(self.engine)
        self.last_route: dict[str, Any] | None = None
        self.last_benchmark: dict[str, Any] | None = None
        self.started_at = _now()
        # Open on a representative peak-hour view so the demonstration is not a
        # network of empty roads. The scenario is still fully resettable.
        self.engine.run_scenario("peak_hour", seed)
        for incident in self.db.active_incidents():
            restored = self.engine.restore_incident(incident)
            if restored and restored["type"] == "closure":
                self.db.update_road_status(restored["road_id"], "closed")
        self.engine.refresh()

    def close(self) -> None:
        """Release the SQLite handle (used by tests and graceful shutdown)."""
        try:
            self.db._conn.close()
        except Exception:
            pass

    # ------------------------------------------------------------------ helpers
    def _ensure_incident_metadata(self, row: dict[str, Any]) -> dict[str, Any]:
        road = ROAD_BY_ID.get(row.get("road_id"))
        item = dict(row)
        item["type_label"] = INCIDENT_TYPES.get(item.get("incident_type"), {}).get("label", item.get("incident_type"))
        item["severity_label"] = SEVERITY.get(item.get("severity"), {}).get("label", item.get("severity"))
        if road:
            item["road_name"] = road.name
            item["from_name"] = NODE_BY_ID[road.a].name
            item["to_name"] = NODE_BY_ID[road.b].name
        return item

    def _network_payload(self) -> dict[str, Any]:
        payload = self.engine.network()
        payload["database"] = self.db.stats()
        payload["settings"] = {"default_algorithm": self.settings.get("default_algorithm"), "default_objective": self.settings.get("default_objective")}
        return payload

    def _graph_and_nodes(self) -> tuple[Graph, dict[str, dict[str, Any]]]:
        network = self.engine.network()
        nodes = {n["id"]: n for n in network["nodes"]}
        roads = {r["id"]: r for r in network["roads"]}
        return Graph(roads, nodes), nodes

    def _run(self, graph: Graph, payload: dict[str, Any], objective, vehicle: dict[str, Any]) -> tuple[Any, list[Any]]:
        algorithm = payload.get("algorithm", self.settings.get("default_algorithm", "astar"))
        origin = payload["origin"]
        destination = payload["destination"]
        if algorithm not in ALGORITHMS:
            raise ServiceError(f"Unknown algorithm '{algorithm}'. Choose from {', '.join(ALGORITHMS)}.", 400, "invalid_algorithm")
        if algorithm == "dijkstra":
            result = dijkstra(graph, origin, destination, objective)
            return result, [result] if result else []
        if algorithm == "astar":
            result = astar(graph, origin, destination, objective)
            return result, [result] if result else []
        if algorithm == "yen":
            paths = yen_k_shortest(graph, origin, destination, objective, k=5)
            if not paths:
                return None, []
            return paths[0], paths
        result = ant_colony(graph, origin, destination, objective, seed=payload.get("seed", self.engine.seed + self.engine.tick_count))
        return result, [result] if result else []

    def _candidate_results(
        self,
        graph: Graph,
        payload: dict[str, Any],
        objective,
        selected: dict[str, Any],
        vehicle: dict[str, Any],
    ) -> tuple[list[tuple[Any, str]], list[str]]:
        main, same_algorithm_routes = self._run(graph, payload, objective, vehicle)
        if not main:
            raise ServiceError(
                "No traversable route exists between these locations under the current closures.",
                422,
                "route_not_found",
                {"origin": payload["origin"], "destination": payload["destination"]},
            )
        found: list[tuple[Any, str]] = [(main, "primary")] + [(r, ALGORITHMS[payload.get("algorithm", "astar")]) for r in same_algorithm_routes]
        # Compute the best route under each objective as a comparison candidate.
        for key in OBJECTIVES:
            if key == selected["objective"]:
                continue
            try:
                other_obj = make_objective(key, payload.get("weights"), vehicle)
                result = dijkstra(graph, payload["origin"], payload["destination"], other_obj)
                if result:
                    found.append((result, OBJECTIVES[key]))
            except Exception:
                continue
        # Yen alternatives for the selected objective provide loopless diversity.
        if len({r.signature for r, _ in found}) < int(self.settings.get("max_alternatives", 4)) + 1:
            try:
                for result in yen_k_shortest(graph, payload["origin"], payload["destination"], objective, k=6):
                    found.append((result, "Yen alternative"))
            except Exception:
                pass
        unique: dict[tuple[str, ...], tuple[Any, str]] = {}
        for result, source in found:
            if result and result.signature not in unique:
                unique[result.signature] = (result, source)
        if len(unique) < 4:
            try:
                penalty_routes = penalised_alternatives(
                    graph,
                    payload["origin"],
                    payload["destination"],
                    objective,
                    [r for r, _ in unique.values()],
                    limit=4,
                )
                for result in penalty_routes:
                    unique.setdefault(result.signature, (result, "Edge-penalised alternative"))
            except Exception:
                pass
        return list(unique.values()), list(unique.keys())

    def _label_routes(
        self,
        routes: list[dict[str, Any]],
        recommended_id: str,
        objective_key: str,
    ) -> None:
        if not routes:
            return
        min_time = min(r["travel_time_min"] for r in routes)
        min_dist = min(r["distance_km"] for r in routes)
        min_cong = min(r["congestion_score"] for r in routes)
        min_co2 = min(r["co2_kg"] for r in routes)
        rec = next(r for r in routes if r["route_id"] == recommended_id)
        for r in routes:
            tags: list[str] = []
            if r["route_id"] == recommended_id:
                tags.append("Recommended")
            if abs(r["travel_time_min"] - min_time) < 0.02:
                tags.append("Fastest")
            if abs(r["distance_km"] - min_dist) < 0.02:
                tags.append("Shortest")
            if abs(r["congestion_score"] - min_cong) < 0.15:
                tags.append("Low congestion")
            if abs(r["co2_kg"] - min_co2) < 0.003:
                tags.append("Lowest emissions")
            if not tags:
                tags.append(OBJECTIVES.get(objective_key, "Route"))
            r["tags"] = tags
        used = set()
        for r in routes:
            if r["route_id"] == recommended_id:
                r["label"] = "Recommended route"
                continue
            label = None
            for tag, name in [
                ("Fastest", "Fastest alternative"),
                ("Shortest", "Shortest alternative"),
                ("Low congestion", "Low-congestion alternative"),
                ("Lowest emissions", "Eco alternative"),
            ]:
                if tag in r["tags"] and name not in used:
                    label = name
                    used.add(name)
                    break
            if not label:
                index = routes.index(r)
                label = f"Alternative {max(1, index)}"
            r["label"] = label
        rec["recommended"] = True

    def _explain(self, rec: dict[str, Any], pool: list[dict[str, Any]], objective_key: str, algorithm: str, weights: dict[str, float]) -> str:
        fastest = min(pool, key=lambda r: r["travel_time_min"])
        shortest = min(pool, key=lambda r: r["distance_km"])
        lowest_cong = min(pool, key=lambda r: r["congestion_score"])
        eco = min(pool, key=lambda r: r["co2_kg"])
        objective_label = OBJECTIVES[objective_key].lower()
        algorithm_label = ALGORITHMS.get(algorithm, algorithm)
        parts = [
            f"{algorithm_label} returned the {objective_label} route: {rec['travel_time_min']:.1f} min over "
            f"{rec['distance_km']:.1f} km at {rec['avg_speed_kph']:.0f} km/h average."
        ]
        if rec["route_id"] == fastest["route_id"]:
            parts.append(f"It is the fastest of the {len(pool)} evaluated routes.")
        else:
            slower = rec["travel_time_min"] - fastest["travel_time_min"]
            if slower > 0.05:
                parts.append(
                    f"It is {slower:.1f} min slower than the fastest candidate, but its average congestion exposure is "
                    f"{rec['congestion_score']:.0f}% versus {fastest['congestion_score']:.0f}%."
                )
        if rec["route_id"] != shortest["route_id"]:
            extra = rec["distance_km"] - shortest["distance_km"]
            saved = shortest["travel_time_min"] - rec["travel_time_min"]
            if extra > 0.05 and saved > 0.1:
                parts.append(
                    f"Compared with the shortest option, it is {extra:.1f} km longer but saves {saved:.1f} min in current traffic."
                )
        elif len(pool) > 1 and fastest["route_id"] != rec["route_id"]:
            parts.append(f"It is also the shortest option at {rec['distance_km']:.1f} km.")
        if objective_key == "congestion" and rec["route_id"] == lowest_cong["route_id"]:
            parts.append("It has the lowest distance-weighted congestion exposure among the candidates.")
        if objective_key == "eco" and rec["route_id"] == eco["route_id"]:
            parts.append(f"Estimated emissions are {rec['co2_kg']:.2f} kg CO₂, the lowest of the candidates.")
        if objective_key == "balanced":
            w = rec.get("weights") or weights
            parts.append(
                "Weighted score uses "
                + ", ".join(
                    f"{k} {float(w.get(k, 0)) * 100:.0f}%" for k in ("time", "distance", "congestion", "eco")
                )
                + "."
            )
        parts.append("Traffic and vehicle figures are simulation estimates, not live measurements.")
        return " ".join(parts)

    # --------------------------------------------------------------------- API
    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "FlowGrid traffic route API",
            "version": "1.0.0",
            "timestamp": _now(),
            "started_at": self.started_at,
            "network_mode": "synthetic",
            "simulation": "not live traffic",
            "database": str(self.db.path),
            "stats": self.db.stats(),
            "provider": self.providers.status()["active"],
            "provider_interface": "simulation active · live provider not configured",
        }

    def network(self) -> dict[str, Any]:
        return self._network_payload()

    def traffic_status(self) -> dict[str, Any]:
        return self.engine.status()

    def providers_status(self) -> dict[str, Any]:
        return self.providers.status()

    def optimize(self, payload: dict[str, Any]) -> dict[str, Any]:
        origin = payload.get("origin")
        destination = payload.get("destination")
        if not origin or not destination:
            raise ServiceError("Both origin and destination are required.", 400, "missing_locations")
        if origin not in NODE_BY_ID:
            raise ServiceError(f"Unknown origin location '{origin}'.", 404, "unknown_origin")
        if destination not in NODE_BY_ID:
            raise ServiceError(f"Unknown destination location '{destination}'.", 404, "unknown_destination")
        if origin == destination:
            raise ServiceError("Origin and destination must be different locations.", 400, "same_location")
        objective_key = payload.get("objective", self.settings.get("default_objective", "time"))
        if objective_key not in OBJECTIVES:
            raise ServiceError(f"Unknown objective '{objective_key}'.", 400, "invalid_objective")
        algorithm = payload.get("algorithm", self.settings.get("default_algorithm", "astar"))
        if algorithm not in ALGORITHMS:
            raise ServiceError(f"Unknown algorithm '{algorithm}'.", 400, "invalid_algorithm")
        weights = payload.get("weights") or {"time": 0.4, "distance": 0.2, "congestion": 0.2, "eco": 0.2}
        vehicle = vehicle_public({**self.settings.get("vehicle", DEFAULT_VEHICLE), **(payload.get("vehicle") or {})})
        graph, nodes = self._graph_and_nodes()
        objective = make_objective(objective_key, weights, vehicle)
        candidates, signatures = self._candidate_results(graph, payload, objective, {"objective": objective_key}, vehicle)
        if not candidates:
            raise ServiceError("No route could be generated.", 422, "no_route")
        rows: list[dict[str, Any]] = []
        recommended: dict[str, Any] | None = None
        for result, source in candidates:
            metrics = route_metrics(result, objective, vehicle, nodes)
            metrics["source"] = source
            metrics["algorithm"] = result.algorithm
            metrics["seed"] = self.engine.seed
            rows.append(metrics)
        # Recommended route is always the primary algorithm/objective result.
        primary_signature = tuple(candidates[0][0].nodes)
        recommended = next((r for r in rows if tuple(r["path"]) == primary_signature), rows[0])
        recommended["algorithm"] = candidates[0][0].algorithm
        recommended["explored_nodes"] = candidates[0][0].explored
        recommended["execution_ms"] = candidates[0][0].execution_ms
        max_alts = max(1, min(6, int(self.settings.get("max_alternatives", 4))))
        ordered = [recommended] + sorted(
            [r for r in rows if r["route_id"] != recommended["route_id"]],
            key=lambda r: (r["objective_cost"], r["travel_time_min"]),
        )[:max_alts]
        self._label_routes(ordered, recommended["route_id"], objective_key)
        recommended = ordered[0]
        weights_norm = objective.weights or {
            "time": 0.4,
            "distance": 0.2,
            "congestion": 0.2,
            "eco": 0.2,
        }
        explanation = self._explain(recommended, ordered, objective_key, algorithm, weights_norm)
        recommended["explanation"] = explanation
        recommended["weights"] = weights_norm
        response = {
            "generated_at": _now(),
            "origin": {"id": origin, "name": NODE_BY_ID[origin].name},
            "destination": {"id": destination, "name": NODE_BY_ID[destination].name},
            "algorithm": algorithm,
            "algorithm_label": ALGORITHMS[algorithm],
            "objective": objective_key,
            "objective_label": OBJECTIVES[objective_key],
            "traffic_source": "Synthetic simulation",
            "simulation_clock": self.engine.status()["simulation"]["clock"],
            "recommended": recommended,
            "alternatives": ordered[1:],
            "comparison": ordered,
            "candidate_count": len(ordered),
            "explanation": explanation,
            "data_note": "Routes are computed from the current simulated edge travel times. Fuel and CO₂ are configurable engineering estimates.",
        }
        self.last_route = response
        try:
            self.db.record_route(recommended)
        except Exception:
            pass
        return response

    def benchmark(self, payload: dict[str, Any]) -> dict[str, Any]:
        origin = payload.get("origin")
        destination = payload.get("destination")
        if origin not in NODE_BY_ID or destination not in NODE_BY_ID:
            raise ServiceError("Valid origin and destination nodes are required.", 400, "invalid_locations")
        if origin == destination:
            raise ServiceError("Origin and destination must differ.", 400, "same_location")
        objective_key = payload.get("objective", "time")
        if objective_key not in OBJECTIVES:
            raise ServiceError("Invalid objective.", 400, "invalid_objective")
        weights = payload.get("weights")
        vehicle = vehicle_public({**self.settings.get("vehicle", DEFAULT_VEHICLE), **(payload.get("vehicle") or {})})
        objective = make_objective(objective_key, weights, vehicle)
        graph, nodes = self._graph_and_nodes()
        jobs = [
            ("Dijkstra", "dijkstra"),
            ("A* search", "astar"),
            ("Yen K=3", "yen"),
            ("Ant colony", "aco"),
        ]
        results = []
        for label, key in jobs:
            gc.collect()
            tracemalloc.start()
            t0 = time.perf_counter()
            path_count = 1
            if key == "dijkstra":
                result = dijkstra(graph, origin, destination, objective)
            elif key == "astar":
                result = astar(graph, origin, destination, objective)
            elif key == "yen":
                paths = yen_k_shortest(graph, origin, destination, objective, k=3)
                path_count = len(paths)
                result = paths[0] if paths else None
            else:
                result = ant_colony(graph, origin, destination, objective, seed=self.engine.seed)
            wall_ms = (time.perf_counter() - t0) * 1000
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            if not result:
                results.append({"name": label, "algorithm": key, "status": "no route", "path_count": path_count})
                continue
            metrics = route_metrics(result, objective, vehicle, nodes)
            results.append(
                {
                    "name": label,
                    "algorithm": key,
                    "status": "ok",
                    "execution_ms": round(wall_ms, 3),
                    "explored_nodes": result.explored,
                    "distance_km": metrics["distance_km"],
                    "travel_time_min": metrics["travel_time_min"],
                    "objective_cost": metrics["objective_cost"],
                    "congestion_score": metrics["congestion_score"],
                    "co2_kg": metrics["co2_kg"],
                    "memory_kb": round(peak / 1024, 1),
                    "path_count": path_count,
                    "path": result.nodes,
                    "node_names": metrics["node_names"],
                    "segments": len(result.edges),
                }
            )
        best = min((r["objective_cost"] for r in results if r.get("status") == "ok"), default=None)
        for r in results:
            if best is not None and r.get("status") == "ok":
                r["best_cost"] = abs(r["objective_cost"] - best) < 1e-6
        response = {
            "generated_at": _now(),
            "origin": {"id": origin, "name": NODE_BY_ID[origin].name},
            "destination": {"id": destination, "name": NODE_BY_ID[destination].name},
            "objective": objective_key,
            "objective_label": OBJECTIVES[objective_key],
            "clock": self.engine.status()["simulation"]["clock"],
            "results": results,
            "note": "Execution time depends on graph size, implementation, warm-up state and hardware. No algorithm is universally fastest.",
            "same_graph": True,
            "same_objective": True,
            "data_source": "Synthetic simulation",
        }
        self.last_benchmark = response
        return response

    def analytics(self) -> dict[str, Any]:
        network = self.engine.network()
        roads = network["roads"]
        nodes = network["nodes"]
        topology = network_topology(nodes, roads)
        history = [self._ensure_incident_metadata(i) for i in self.db.incident_history(30)]
        return {
            "generated_at": _now(),
            "summary": network["summary"],
            "network": {
                "nodes": len(nodes),
                "roads": len(roads),
                "total_distance_km": network["summary"]["total_network_distance_km"],
            },
            "congestion_distribution": congestion_distribution(roads),
            "speed_distribution": speed_distribution(roads),
            "utilization_by_class": utilization_by_class(roads),
            "hotspots": self.engine.hotspots(8),
            "trend": self.engine.status()["trend"],
            "topology": topology,
            "current_objective": self.settings.get("default_objective", "time"),
            "current_objective_label": OBJECTIVES.get(self.settings.get("default_objective", "time"), "Travel time"),
            "route_history": self.db.route_history(12),
            "current_route": self.last_route,
            "last_benchmark": self.last_benchmark,
            "incident_history": history,
            "simulation_runs": self.db.simulation_runs(5),
            "database": self.db.stats(),
            "data_note": "All traffic values are synthetic simulation output; incident records are persisted locally.",
        }

    def network_analysis(self) -> dict[str, Any]:
        network = self.engine.network()
        return {
            "generated_at": _now(),
            "summary": network["summary"],
            "topology": network_topology(network["nodes"], network["roads"]),
            "roads_by_class": utilization_by_class(network["roads"]),
            "hotspots": self.engine.hotspots(10),
            "data_note": "Topology metrics are calculated on the current simulated graph.",
        }

    # -------------------------------------------------------------- simulation
    def simulate(self, payload: dict[str, Any]) -> dict[str, Any]:
        action = payload.get("action", "tick")
        if action == "start":
            self.engine.set_running(True)
        elif action == "pause":
            self.engine.set_running(False)
        elif action == "reset":
            self.engine.reset(seed=payload.get("seed", self.engine.seed), clear_incidents=True)
            self.db.resolve_all_active()
            self.engine.set_step_minutes(self.settings.get("step_minutes", 3))
        elif action == "tick":
            result = self.engine.tick(payload.get("minutes"), random_events=bool(payload.get("random_events", self.settings.get("random_events", True))))
            for incident in self.engine.active_incidents():
                self.db.save_incident(incident)
            self.db.sync_incident_statuses(result.get("expired", []))
            return result["status"]
        elif action == "increase":
            self.engine.set_level(delta=0.15)
        elif action == "decrease":
            self.engine.set_level(delta=-0.15)
        elif action == "level":
            level = float(payload.get("level", 1.0))
            self.engine.set_level(level=level)
        elif action == "step":
            self.engine.set_step_minutes(int(payload.get("minutes", 3)))
            self.settings = self.db.update_settings({"step_minutes": self.engine.step_minutes})
        else:
            raise ServiceError(f"Unknown simulation action '{action}'.", 400, "invalid_action")
        return self.engine.status()

    def create_incident(self, payload: dict[str, Any]) -> dict[str, Any]:
        road_id = payload.get("road_id")
        kind = payload.get("type", payload.get("incident_type"))
        if road_id not in ROAD_BY_ID:
            raise ServiceError(f"Unknown road '{road_id}'.", 404, "unknown_road")
        if kind not in INCIDENT_TYPES:
            raise ServiceError(f"Unknown incident type '{kind}'.", 400, "invalid_incident_type")
        severity = payload.get("severity", "medium")
        if severity not in SEVERITY:
            raise ServiceError(f"Unknown severity '{severity}'.", 400, "invalid_severity")
        incident = self.engine.add_incident(
            road_id,
            kind,
            severity,
            payload.get("duration_min"),
            source="operator",
            note=payload.get("note", ""),
        )
        self.db.save_incident(incident)
        if kind == "closure":
            self.db.update_road_status(road_id, "closed")
        return {"incident": incident, "traffic": self.engine.status()}

    def delete_incident(self, incident_id: str) -> dict[str, Any]:
        incident = self.engine.remove_incident(incident_id)
        if not incident:
            raise ServiceError(f"Incident '{incident_id}' was not found or is already resolved.", 404, "incident_not_found")
        self.db.resolve_incident(incident_id)
        if incident["type"] == "closure":
            self.db.update_road_status(incident["road_id"], "open")
        return {"removed": incident, "traffic": self.engine.status()}

    def close_road(self, payload: dict[str, Any]) -> dict[str, Any]:
        road_id = payload.get("road_id")
        if road_id not in ROAD_BY_ID:
            raise ServiceError(f"Unknown road '{road_id}'.", 404, "unknown_road")
        incident = self.engine.close_road(road_id, int(payload.get("duration_min", 120)), payload.get("reason", "Operator closure"))
        self.db.save_incident(incident)
        self.db.update_road_status(road_id, "closed")
        return {"incident": incident, "traffic": self.engine.status()}

    def open_road(self, payload: dict[str, Any]) -> dict[str, Any]:
        road_id = payload.get("road_id")
        if road_id not in ROAD_BY_ID:
            raise ServiceError(f"Unknown road '{road_id}'.", 404, "unknown_road")
        result = self.engine.open_road(road_id)
        self.db.resolve_road_incidents(road_id)
        return {**result, "traffic": self.engine.status()}

    # ---------------------------------------------------------------- scenarios
    def scenarios(self) -> dict[str, Any]:
        return {"scenarios": scenario_catalog(), "count": len(SCENARIOS), "seed_policy": "Every scenario has a fixed default seed; the seed is returned with the run."}

    def run_scenario(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = payload.get("scenario") or payload.get("id")
        if key not in SCENARIOS:
            raise ServiceError(f"Unknown scenario '{key}'.", 404, "unknown_scenario")
        self.db.resolve_all_active()
        result = self.engine.run_scenario(key, payload.get("seed"))
        for incident in result.get("created_incidents", []):
            self.db.save_incident(incident)
        route_request = result.get("route_request")
        route = None
        if route_request:
            try:
                route = self.optimize({**route_request, **({"weights": route_request.get("weights")} if route_request.get("weights") else {})})
            except ServiceError as exc:
                route = {"error": exc.message, "code": exc.code}
        run_summary = {
            "scenario": key,
            "clock": result["traffic"]["simulation"]["clock"],
            "seed": result["seed"],
            "summary": result["traffic"]["summary"],
        }
        run_id = self.db.record_simulation(key, result["seed"], {"scenario": key, "level": result["traffic"]["simulation"]["traffic_level"]}, run_summary)
        return {**result, "route": route, "simulation_run_id": run_id}

    def reset_scenario_state(self) -> dict[str, Any]:
        self.engine.reset(seed=self.engine.seed, clear_incidents=True)
        self.db.resolve_all_active()
        return self.engine.status()

    # ----------------------------------------------------------------- settings
    def get_settings(self) -> dict[str, Any]:
        return self.settings

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {"default_algorithm", "default_objective", "max_alternatives", "step_minutes", "random_events", "map_show_traffic", "map_show_labels", "map_show_alternatives", "vehicle"}
        updates = {k: v for k, v in payload.items() if k in allowed}
        if "default_algorithm" in updates and updates["default_algorithm"] not in ALGORITHMS:
            raise ServiceError("Invalid default algorithm.", 400, "invalid_algorithm")
        if "default_objective" in updates and updates["default_objective"] not in OBJECTIVES:
            raise ServiceError("Invalid default objective.", 400, "invalid_objective")
        if "max_alternatives" in updates:
            updates["max_alternatives"] = max(1, min(6, int(updates["max_alternatives"])))
        if "step_minutes" in updates:
            updates["step_minutes"] = max(1, min(15, int(updates["step_minutes"])))
            self.engine.set_step_minutes(updates["step_minutes"])
        if "vehicle" in updates:
            updates["vehicle"] = vehicle_public({**self.settings.get("vehicle", DEFAULT_VEHICLE), **updates["vehicle"]})
        self.settings = self.db.update_settings(updates)
        return self.settings

    def route_history(self, limit: int = 20) -> dict[str, Any]:
        return {"history": self.db.route_history(limit)}

    def incidents(self) -> dict[str, Any]:
        active = self.engine.active_incidents()
        history = [self._ensure_incident_metadata(i) for i in self.db.incident_history(60)]
        return {
            "active": active,
            "history": history,
            "types": [{"key": k, "label": v["label"], "default_duration": v["default_duration"]} for k, v in INCIDENT_TYPES.items()],
            "severities": [{"key": k, "label": v["label"]} for k, v in SEVERITY.items()],
            "roads": [
                {
                    "id": r.id,
                    "name": r.name,
                    "from_name": NODE_BY_ID[r.a].name,
                    "to_name": NODE_BY_ID[r.b].name,
                    "status": self.engine.road_state[r.id]["status"],
                    "road_class": r.road_class,
                }
                for r in ROADS
            ],
        }

    def import_network(self, payload: dict[str, Any]) -> dict[str, Any]:
        from . import osm_adapter

        info = osm_adapter.availability()
        if not info["available"]:
            raise ServiceError(
                "OSM import is available through the optional OSMnx adapter. Install backend/requirements-osm.txt, then set FLOWGRID_OSM=1 and restart.",
                503,
                "osm_unavailable",
                info,
            )
        # The adapter converts a bounded OSM query into FlowGrid's portable
        # node/road format. It is returned for review; the running synthetic demo
        # is never silently replaced by a different graph.
        try:
            imported = osm_adapter.import_graph(payload.get("place"), payload.get("bbox"), payload.get("network_type", "drive"))
        except Exception as exc:
            raise ServiceError(f"OSM import failed: {exc}", 502, "osm_import_failed", info)
        return {
            "mode": "osm_preview",
            "adapter": info,
            "network": imported,
            "counts": {"nodes": len(imported["nodes"]), "roads": len(imported["roads"])},
            "note": "Converted OSM road geometry. Live traffic is not inferred from OpenStreetMap.",
        }
