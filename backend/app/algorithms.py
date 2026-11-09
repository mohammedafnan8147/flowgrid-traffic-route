"""Graph algorithms used by FlowGrid.

Core implementations are intentionally explicit rather than hidden behind a
black-box dependency: binary-heap Dijkstra, heuristic A*, Yen's K-shortest
loopless paths, congestion-aware edge costs and an optional ant-colony search.
"""
from __future__ import annotations

import hashlib
import heapq
import math
import random
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .fuel import segment_energy
from .network_data import NODE_BY_ID

INF = float("inf")


@dataclass
class Edge:
    key: str
    road_id: str
    source: str
    target: str
    name: str
    road_class: str
    distance_km: float
    speed_limit: float
    effective_speed: float
    travel_time_min: float
    congestion_score: float
    congestion_level: str
    status: str
    capacity: int
    lanes: int
    direction: str
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def free_flow_time_min(self) -> float:
        if self.speed_limit <= 0:
            return INF
        return self.distance_km / self.speed_limit * 60.0

    def as_segment(self, vehicle: dict[str, Any]) -> dict[str, Any]:
        energy = segment_energy(self.distance_km, self.effective_speed, vehicle)
        return {
            "road_id": self.road_id,
            "key": self.key,
            "from": self.source,
            "to": self.target,
            "name": self.name,
            "road_class": self.road_class,
            "distance_km": round(self.distance_km, 2),
            "speed_limit": round(self.speed_limit, 1),
            "speed_kph": round(self.effective_speed, 1),
            "travel_time_min": round(self.travel_time_min, 2),
            "congestion": round(self.congestion_score, 1),
            "congestion_level": self.congestion_level,
            "status": self.status,
            "lanes": self.lanes,
            "direction": self.direction,
            "fuel_l": energy.fuel_l,
            "energy_kwh": energy.energy_kwh,
            "co2_kg": energy.co2_kg,
            "fuel_cost": energy.fuel_cost,
            "geometry": [[self.y1, self.x1], [self.y2, self.x2]],
        }


@dataclass
class ShortestResult:
    nodes: list[str]
    edges: list[Edge]
    cost: float
    explored: int
    execution_ms: float
    algorithm: str

    @property
    def signature(self) -> tuple[str, ...]:
        return tuple(self.nodes)


@dataclass
class ObjectiveSpec:
    key: str
    label: str
    weight: Callable[[Edge], float]
    heuristic: Callable[[str, str], float]
    weights: dict[str, float] = field(default_factory=dict)


class Graph:
    def __init__(self, roads: dict[str, dict[str, Any]], nodes: dict[str, dict[str, Any]]):
        self.nodes = nodes
        self.adj: dict[str, list[Edge]] = {nid: [] for nid in nodes}
        self.edges_by_key: dict[str, Edge] = {}
        for road in roads.values():
            if road.get("status") == "closed":
                continue
            self._add_direction(road, road["from"], road["to"], "forward")
            if road.get("one_way") == "two_way":
                self._add_direction(road, road["to"], road["from"], "reverse")

    def _add_direction(self, road: dict[str, Any], source: str, target: str, direction: str) -> None:
        if source not in self.nodes or target not in self.nodes:
            return
        key = f"{road['id']}::{source}->{target}"
        a = self.nodes[source]
        b = self.nodes[target]
        edge = Edge(
            key=key,
            road_id=road["id"],
            source=source,
            target=target,
            name=road["name"],
            road_class=road["road_class"],
            distance_km=float(road["distance_km"]),
            speed_limit=float(road["speed_limit"]),
            effective_speed=float(road["effective_speed_kph"]),
            travel_time_min=float(road["travel_time_min"]),
            congestion_score=float(road["congestion"]),
            congestion_level=road["congestion_level"],
            status=road["status"],
            capacity=int(road["capacity"]),
            lanes=int(road["lanes"]),
            direction=direction,
            x1=float(a["x"]),
            y1=float(a["y"]),
            x2=float(b["x"]),
            y2=float(b["y"]),
        )
        self.adj[source].append(edge)
        self.edges_by_key[key] = edge

    def out_edges(self, node: str) -> list[Edge]:
        return self.adj.get(node, [])

    def neighbors(self, node: str) -> list[str]:
        return [e.target for e in self.adj.get(node, [])]

    def bounds(self) -> tuple[float, float, float, float]:
        xs = [n["x"] for n in self.nodes.values()]
        ys = [n["y"] for n in self.nodes.values()]
        return min(xs), min(ys), max(xs), max(ys)


def straight_km(a: str, b: str) -> float:
    na, nb = NODE_BY_ID[a], NODE_BY_ID[b]
    return math.hypot(na.x - nb.x, na.y - nb.y) * 0.011


def make_objective(
    objective: str,
    weights: dict[str, float] | None = None,
    vehicle: dict[str, Any] | None = None,
) -> ObjectiveSpec:
    weights = weights or {}
    vehicle = vehicle or {}
    wt = max(0.0, float(weights.get("time", 0.4)))
    wd = max(0.0, float(weights.get("distance", 0.2)))
    wc = max(0.0, float(weights.get("congestion", 0.2)))
    we = max(0.0, float(weights.get("eco", 0.2)))
    total = wt + wd + wc + we
    if total <= 0:
        wt, wd, wc, we, total = 0.4, 0.2, 0.2, 0.2, 1.0
    wt, wd, wc, we = wt / total, wd / total, wc / total, we / total

    if objective == "distance":
        return ObjectiveSpec("distance", "Shortest distance", lambda e: max(0.001, e.distance_km), lambda a, b: straight_km(a, b))
    if objective == "congestion":
        return ObjectiveSpec(
            "congestion",
            "Least congestion",
            lambda e: max(0.01, e.travel_time_min * (0.30 + 1.7 * (e.congestion_score / 100.0))),
            lambda a, b: 0.0,
        )
    if objective == "eco":
        return ObjectiveSpec(
            "eco",
            "Eco-friendly",
            lambda e: max(0.001, segment_energy(e.distance_km, e.effective_speed, vehicle).co2_kg * 10.0 + e.distance_km * 0.005),
            lambda a, b: 0.0,
        )
    if objective == "balanced":
        def balanced(e: Edge) -> float:
            # Normalised additive proxy. Reference values keep the terms comparable
            # before the user's weights are applied.
            nd = e.distance_km / 4.0
            nt = e.travel_time_min / 8.0
            nc = e.congestion_score / 100.0
            ne = segment_energy(e.distance_km, e.effective_speed, vehicle).co2_kg / 0.7
            return max(0.001, wt * nt + wd * nd + wc * nc + we * ne)

        return ObjectiveSpec("balanced", "Balanced", balanced, lambda a, b: 0.0, {"time": wt, "distance": wd, "congestion": wc, "eco": we})
    # Default and emergency routing objective: minimum travel time.
    return ObjectiveSpec(
        "time",
        "Fastest route",
        lambda e: max(0.001, e.travel_time_min),
        lambda a, b: straight_km(a, b) / 80.0 * 60.0,
    )


def _reconstruct(parent: dict[str, tuple[str, Edge]], start: str, goal: str) -> tuple[list[str], list[Edge]]:
    nodes = [goal]
    edges: list[Edge] = []
    cur = goal
    while cur != start:
        prev, edge = parent[cur]
        edges.append(edge)
        nodes.append(prev)
        cur = prev
    nodes.reverse()
    edges.reverse()
    return nodes, edges


def dijkstra(
    graph: Graph,
    start: str,
    goal: str,
    objective: ObjectiveSpec,
    blocked_edges: set[str] | None = None,
    blocked_nodes: set[str] | None = None,
) -> ShortestResult | None:
    t0 = time.perf_counter()
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    blocked_edges = blocked_edges or set()
    blocked_nodes = blocked_nodes or set()
    if start in blocked_nodes or goal in blocked_nodes:
        return None
    dist: dict[str, float] = {start: 0.0}
    parent: dict[str, tuple[str, Edge]] = {}
    pq: list[tuple[float, int, str]] = [(0.0, 0, start)]
    settled: set[str] = set()
    explored = 0
    counter = 1
    while pq:
        d, _, node = heapq.heappop(pq)
        if node in settled:
            continue
        settled.add(node)
        explored += 1
        if node == goal:
            nodes, edges = _reconstruct(parent, start, goal)
            return ShortestResult(nodes, edges, round(d, 6), explored, round((time.perf_counter() - t0) * 1000, 3), "dijkstra")
        for edge in graph.out_edges(node):
            if edge.key in blocked_edges or edge.target in blocked_nodes or edge.target in settled:
                continue
            nd = d + objective.weight(edge)
            if nd < dist.get(edge.target, INF) - 1e-12:
                dist[edge.target] = nd
                parent[edge.target] = (node, edge)
                heapq.heappush(pq, (nd, counter, edge.target))
                counter += 1
    return None


def astar(
    graph: Graph,
    start: str,
    goal: str,
    objective: ObjectiveSpec,
    blocked_edges: set[str] | None = None,
    blocked_nodes: set[str] | None = None,
) -> ShortestResult | None:
    t0 = time.perf_counter()
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    blocked_edges = blocked_edges or set()
    blocked_nodes = blocked_nodes or set()
    if start in blocked_nodes or goal in blocked_nodes:
        return None
    g: dict[str, float] = {start: 0.0}
    parent: dict[str, tuple[str, Edge]] = {}
    h0 = objective.heuristic(start, goal)
    pq: list[tuple[float, float, int, str]] = [(h0, 0.0, 0, start)]
    closed: set[str] = set()
    explored = 0
    counter = 1
    while pq:
        _, gscore, _, node = heapq.heappop(pq)
        if node in closed:
            continue
        closed.add(node)
        explored += 1
        if node == goal:
            nodes, edges = _reconstruct(parent, start, goal)
            return ShortestResult(nodes, edges, round(gscore, 6), explored, round((time.perf_counter() - t0) * 1000, 3), "astar")
        for edge in graph.out_edges(node):
            if edge.key in blocked_edges or edge.target in blocked_nodes or edge.target in closed:
                continue
            ng = gscore + objective.weight(edge)
            if ng < g.get(edge.target, INF) - 1e-12:
                g[edge.target] = ng
                parent[edge.target] = (node, edge)
                f = ng + max(0.0, objective.heuristic(edge.target, goal))
                heapq.heappush(pq, (f, ng, counter, edge.target))
                counter += 1
    return None


def _path_cost(nodes: list[str], edges: list[Edge], objective: ObjectiveSpec) -> float:
    return sum(objective.weight(e) for e in edges)


def yen_k_shortest(
    graph: Graph,
    start: str,
    goal: str,
    objective: ObjectiveSpec,
    k: int = 5,
) -> list[ShortestResult]:
    t0 = time.perf_counter()
    first = dijkstra(graph, start, goal, objective)
    if not first:
        return []
    accepted: list[ShortestResult] = [first]
    candidates: list[tuple[float, int, list[str], list[Edge]]] = []
    queued: set[tuple[str, ...]] = {first.signature}
    total_explored = first.explored
    counter = 0
    while len(accepted) < k:
        prev = accepted[-1]
        for i in range(len(prev.nodes) - 1):
            spur_node = prev.nodes[i]
            root_nodes = prev.nodes[: i + 1]
            root_edges = prev.edges[:i]
            removed_edges: set[str] = set()
            for route in accepted:
                if route.nodes[: i + 1] == root_nodes and len(route.nodes) > i + 1:
                    removed_edges.add(route.edges[i].key)
            removed_nodes = set(root_nodes[:-1])
            spur = dijkstra(graph, spur_node, goal, objective, blocked_edges=removed_edges, blocked_nodes=removed_nodes)
            total_explored += spur.explored if spur else 0
            if not spur:
                continue
            total_nodes = root_nodes[:-1] + spur.nodes
            total_edges = root_edges + spur.edges
            sig = tuple(total_nodes)
            if sig in queued:
                continue
            queued.add(sig)
            cost = _path_cost(total_nodes, total_edges, objective)
            heapq.heappush(candidates, (cost, counter, total_nodes, total_edges))
            counter += 1
        if not candidates:
            break
        cost, _, nodes, edges = heapq.heappop(candidates)
        accepted.append(
            ShortestResult(
                nodes=nodes,
                edges=edges,
                cost=round(cost, 6),
                explored=total_explored,
                execution_ms=round((time.perf_counter() - t0) * 1000, 3),
                algorithm="yen",
            )
        )
    # Yen's execution time is the whole candidate search; explored is the sum
    # of the shortest-path passes already represented by the accepted routes.
    for route in accepted:
        route.execution_ms = round((time.perf_counter() - t0) * 1000, 3)
        route.explored = total_explored
        route.algorithm = "yen"
    return accepted


def penalised_alternatives(
    graph: Graph,
    start: str,
    goal: str,
    objective: ObjectiveSpec,
    existing: list[ShortestResult],
    limit: int = 4,
) -> list[ShortestResult]:
    """Diversify with congestion/edge penalties when Yen's alternatives are scarce."""
    out: list[ShortestResult] = []
    seen = {r.signature for r in existing}
    t0 = time.perf_counter()
    for iteration in range(1, limit * 2 + 1):
        penalty_edges: set[str] = set()
        for route in existing + out:
            penalty_edges.update(e.key for e in route.edges)
        # Dijkstra cannot directly take a multiplier, so temporarily use a
        # wrapper objective whose edge weights are inflated on used keys.
        wrapped = ObjectiveSpec(
            objective.key,
            objective.label,
            lambda e, pe=penalty_edges: objective.weight(e) * (2.1 if e.key in pe else 1.0),
            objective.heuristic,
            objective.weights,
        )
        found = dijkstra(graph, start, goal, wrapped)
        if not found:
            break
        if found.signature not in seen:
            found.algorithm = "dijkstra"
            found.execution_ms = round((time.perf_counter() - t0) * 1000, 3)
            out.append(found)
            seen.add(found.signature)
        existing = existing + [found]
        if len(out) >= limit:
            break
    return out


def ant_colony(
    graph: Graph,
    start: str,
    goal: str,
    objective: ObjectiveSpec,
    seed: int = 42,
    ants: int = 24,
    iterations: int = 40,
) -> ShortestResult | None:
    """Optional multi-objective ant-colony search.

    Pheromone reinforces low-cost paths; a small exploratory probability keeps
    the colony from collapsing onto the first route. This is a demonstrator, not
    the primary deterministic router.
    """
    t0 = time.perf_counter()
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    rng = random.Random(seed)
    pheromone: dict[str, float] = {key: 1.0 for key in graph.edges_by_key}
    best: tuple[list[str], list[Edge], float] | None = None
    max_steps = len(graph.nodes) * 2
    explored = 0
    for _ in range(iterations):
        colony: list[tuple[list[str], list[Edge], float]] = []
        for _ant in range(ants):
            node = start
            nodes = [start]
            edges: list[Edge] = []
            visited = {start}
            for _step in range(max_steps):
                if node == goal:
                    break
                options = [e for e in graph.out_edges(node) if e.target not in visited]
                if not options:
                    break
                scores: list[float] = []
                for e in options:
                    w = max(1e-4, objective.weight(e))
                    scores.append((pheromone.get(e.key, 1.0) ** 1.15) * (1.0 / w) ** 2.1)
                total = sum(scores)
                if total <= 0:
                    edge = rng.choice(options)
                else:
                    pick = rng.random() * total
                    acc = 0.0
                    edge = options[-1]
                    for candidate, score in zip(options, scores):
                        acc += score
                        if acc >= pick:
                            edge = candidate
                            break
                edges.append(edge)
                nodes.append(edge.target)
                visited.add(edge.target)
                node = edge.target
                explored += 1
            if node == goal:
                colony.append((nodes, edges, _path_cost(nodes, edges, objective)))
        if not colony:
            break
        colony.sort(key=lambda item: item[2])
        if not best or colony[0][2] < best[2]:
            best = colony[0]
        # Evaporate and reinforce the best few tours.
        for key in pheromone:
            pheromone[key] = max(0.15, pheromone[key] * 0.82)
        for nodes, edges, cost in colony[: max(2, ants // 6)]:
            deposit = 18.0 / max(0.4, cost)
            for edge in edges:
                pheromone[edge.key] = pheromone.get(edge.key, 1.0) + deposit
    if not best:
        return None
    nodes, edges, cost = best
    return ShortestResult(nodes, edges, round(cost, 6), explored, round((time.perf_counter() - t0) * 1000, 3), "aco")


def route_metrics(
    result: ShortestResult,
    objective: ObjectiveSpec,
    vehicle: dict[str, Any],
    nodes: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    distance = sum(e.distance_km for e in result.edges)
    travel_time = sum(e.travel_time_min for e in result.edges)
    free_flow = sum(e.free_flow_time_min for e in result.edges if e.free_flow_time_min < INF)
    energy = [segment_energy(e.distance_km, e.effective_speed, vehicle) for e in result.edges]
    fuel = sum(x.fuel_l for x in energy)
    kwh = sum(x.energy_kwh for x in energy)
    co2 = sum(x.co2_kg for x in energy)
    fuel_cost = sum(x.fuel_cost for x in energy)
    weighted_cong = sum(e.congestion_score * e.distance_km for e in result.edges)
    congestion = weighted_cong / distance if distance > 0 else 0.0
    avg_speed = distance / (travel_time / 60.0) if travel_time > 0 else 0.0
    if congestion < 35:
        label = "Low"
    elif congestion < 60:
        label = "Moderate"
    elif congestion < 78:
        label = "Heavy"
    else:
        label = "Severe"
    segments = [e.as_segment(vehicle) for e in result.edges]
    severe_segments = sum(1 for e in result.edges if e.congestion_level in {"heavy", "severe"})
    route_hash = hashlib.sha1(("|".join(result.nodes) + objective.key).encode()).hexdigest()[:10]
    return {
        "route_id": f"RT-{route_hash.upper()}",
        "label": objective.label,
        "tags": [],
        "path": result.nodes,
        "node_names": [nodes[n]["name"] for n in result.nodes],
        "segments": segments,
        "segment_count": len(result.edges),
        "intersections": max(0, len(result.nodes) - 2),
        "distance_km": round(distance, 2),
        "travel_time_min": round(travel_time, 2),
        "free_flow_time_min": round(free_flow, 2),
        "delay_min": round(max(0.0, travel_time - free_flow), 2),
        "avg_speed_kph": round(avg_speed, 1),
        "congestion_score": round(congestion, 1),
        "congestion_label": label,
        "fuel_l": round(fuel, 3),
        "energy_kwh": round(kwh, 3),
        "co2_kg": round(co2, 3),
        "fuel_cost": round(fuel_cost, 2),
        "severe_segments": severe_segments,
        "objective_cost": round(result.cost, 4),
        "objective": objective.key,
        "algorithm": result.algorithm,
        "explored_nodes": result.explored,
        "execution_ms": result.execution_ms,
        "normalized": {
            "time": round(travel_time / 15.0, 3),
            "distance": round(distance / 8.0, 3),
            "congestion": round(congestion / 100.0, 3),
            "eco": round(co2 / 2.0, 3),
        },
    }
