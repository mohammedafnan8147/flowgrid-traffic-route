"""Traffic and network analytics derived only from current simulation state."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .algorithms import Graph, dijkstra, make_objective


def _hist(values: list[float], edges: list[float], labels: list[str]) -> list[dict[str, Any]]:
    counts = [0] * (len(edges) - 1)
    for value in values:
        for i in range(len(edges) - 1):
            if edges[i] <= value < edges[i + 1] or (i == len(edges) - 2 and value >= edges[i]):
                counts[i] += 1
                break
    return [{"label": labels[i], "value": counts[i]} for i in range(len(counts))]


def congestion_distribution(roads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = ["free", "moderate", "heavy", "severe", "closed"]
    labels = {"free": "Free flow", "moderate": "Moderate", "heavy": "Heavy", "severe": "Severe", "closed": "Closed"}
    counts = Counter(r["congestion_level"] for r in roads)
    return [{"key": key, "label": labels[key], "value": counts.get(key, 0)} for key in order]


def speed_distribution(roads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    values = [r["effective_speed_kph"] for r in roads if r["status"] == "open"]
    return _hist(values, [0, 15, 25, 35, 45, 55, 200], ["0–15", "15–25", "25–35", "35–45", "45–55", "55+"])


def utilization_by_class(roads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for road in roads:
        grouped[road["road_class"]].append(min(160.0, road["utilization"]))
    return [
        {
            "road_class": key.title(),
            "avg_utilization": round(sum(values) / len(values), 1),
            "roads": len(values),
        }
        for key, values in sorted(grouped.items())
    ]


def network_topology(nodes: list[dict[str, Any]], roads: list[dict[str, Any]]) -> dict[str, Any]:
    node_ids = {n["id"] for n in nodes}
    undirected: dict[str, set[str]] = {nid: set() for nid in node_ids}
    for road in roads:
        if road["status"] == "closed":
            continue
        undirected[road["from"]].add(road["to"])
        undirected[road["to"]].add(road["from"])
    components: list[list[str]] = []
    unseen = set(node_ids)
    while unseen:
        start = next(iter(unseen))
        stack = [start]
        unseen.discard(start)
        comp = []
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nxt in undirected[cur]:
                if nxt in unseen:
                    unseen.discard(nxt)
                    stack.append(nxt)
        components.append(sorted(comp))
    components.sort(key=len, reverse=True)
    degrees = {nid: len(neigh) for nid, neigh in undirected.items()}
    deg_counts = Counter(degrees.values())

    graph = Graph({r["id"]: r for r in roads}, {n["id"]: n for n in nodes})
    objective = make_objective("time")
    usage: Counter[str] = Counter()
    reachable_times: list[float] = []
    for source in node_ids:
        for target in node_ids:
            if source == target:
                continue
            result = dijkstra(graph, source, target, objective)
            if not result:
                continue
            reachable_times.append(result.cost)
            for edge in result.edges:
                usage[edge.road_id] += 1

    road_by_id = {r["id"]: r for r in roads}
    pairs = max(1, len(node_ids) * (len(node_ids) - 1))
    critical = []
    for rid, count in usage.most_common(8):
        road = road_by_id[rid]
        critical.append(
            {
                "road_id": rid,
                "name": road["name"],
                "from_name": road["from_name"],
                "to_name": road["to_name"],
                "usage": count,
                "share_pct": round(count / max(1, sum(usage.values())) * 100, 1),
                "congestion": road["congestion"],
                "status": road["status"],
            }
        )
    return {
        "components": len(components),
        "largest_component": len(components[0]) if components else 0,
        "is_connected": len(components) == 1,
        "component_sizes": [len(c) for c in components],
        "average_degree": round(sum(degrees.values()) / max(1, len(degrees)), 2),
        "max_degree": max(degrees.values()) if degrees else 0,
        "degree_distribution": [{"degree": k, "nodes": v} for k, v in sorted(deg_counts.items())],
        "average_shortest_travel_time_min": round(sum(reachable_times) / max(1, len(reachable_times)), 2),
        "reachable_pairs_pct": round(len(reachable_times) / pairs * 100, 1),
        "critical_corridors": critical,
        "method_note": "Criticality counts how often a road appears in current-time all-pairs shortest paths; it is not a live traffic measurement.",
    }
