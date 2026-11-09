"""Reproducible demonstration scenarios for the synthetic network."""
from __future__ import annotations

from typing import Any

from .traffic import TrafficEngine

SCENARIOS: dict[str, dict[str, Any]] = {
    "normal": {
        "id": "normal",
        "name": "Normal traffic",
        "number": 1,
        "tagline": "Free-flow and moderate conditions",
        "description": "A stable off-peak baseline with no incidents. Good for comparing algorithms on the same graph.",
        "clock": 10 * 60 + 30,
        "level": 0.82,
        "road_multipliers": {},
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N06", "destination": "N15", "objective": "time", "algorithm": "astar"},
        "accent": "signal",
    },
    "peak_hour": {
        "id": "peak_hour",
        "name": "Peak-hour traffic",
        "number": 2,
        "tagline": "Morning demand on major arterials",
        "description": "Demand rises across Central Avenue, Market Street and the civic connectors at 08:15.",
        "clock": 8 * 60 + 15,
        "level": 1.32,
        "road_multipliers": {
            "R15": 1.28,
            "R16": 1.34,
            "R17": 1.38,
            "R18": 1.30,
            "R19": 1.22,
            "R20": 1.34,
            "R21": 1.30,
            "R42": 1.25,
            "R47": 1.28,
        },
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N06", "destination": "N15", "objective": "time", "algorithm": "astar"},
        "accent": "amber",
    },
    "highway_congestion": {
        "id": "highway_congestion",
        "name": "Highway congestion",
        "number": 3,
        "tagline": "Reduced speed on the ring road",
        "description": "North and East Ring demand is elevated. Travel-time routing should consider arterial alternatives.",
        "clock": 17 * 60 + 40,
        "level": 1.05,
        "road_multipliers": {
            "R01": 1.55,
            "R02": 1.70,
            "R03": 1.62,
            "R04": 1.55,
            "R05": 1.58,
            "R06": 1.45,
            "R07": 1.35,
            "R09": 1.28,
        },
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N02", "destination": "N19", "objective": "time", "algorithm": "dijkstra"},
        "accent": "coral",
    },
    "accident": {
        "id": "accident",
        "name": "Accident scenario",
        "number": 4,
        "tagline": "A major central link is impaired",
        "description": "An accident on the Civic Avenue approach reduces capacity and speed, changing the optimal path.",
        "clock": 8 * 60 + 30,
        "level": 1.18,
        "road_multipliers": {"R42": 1.22, "R47": 1.12},
        "incidents": [{"road_id": "R42", "type": "accident", "severity": "high", "duration_min": 110, "note": "Two-vehicle collision"}],
        "seed": 42,
        "route": {"origin": "N07", "destination": "N19", "objective": "time", "algorithm": "astar"},
        "accent": "coral",
    },
    "road_closure": {
        "id": "road_closure",
        "name": "Road closure",
        "number": 5,
        "tagline": "Central Avenue is unavailable",
        "description": "A full closure between Central Junction and Innovation Square forces a detour through the civic grid.",
        "clock": 13 * 60 + 20,
        "level": 0.95,
        "road_multipliers": {"R25": 1.25, "R27": 1.28, "R28": 1.18},
        "incidents": [{"road_id": "R17", "type": "closure", "severity": "critical", "duration_min": 180, "note": "Planned emergency closure"}],
        "seed": 42,
        "route": {"origin": "N06", "destination": "N15", "objective": "time", "algorithm": "dijkstra"},
        "accent": "coral",
    },
    "emergency": {
        "id": "emergency",
        "name": "Emergency route",
        "number": 6,
        "tagline": "Travel time is the only priority",
        "description": "A medical campus to airport run under elevated demand. The route is calculated strictly for minimum travel time.",
        "clock": 8 * 60 + 45,
        "level": 1.12,
        "road_multipliers": {"R47": 1.10, "R48": 1.16, "R05": 1.10},
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N18", "destination": "N05", "objective": "time", "algorithm": "astar"},
        "accent": "amber",
    },
    "eco": {
        "id": "eco",
        "name": "Eco-friendly routing",
        "number": 7,
        "tagline": "Lower fuel and emissions",
        "description": "The eco objective weights estimated fuel and CO2 ahead of raw travel time.",
        "clock": 11 * 60 + 10,
        "level": 0.88,
        "road_multipliers": {},
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N01", "destination": "N19", "objective": "eco", "algorithm": "astar"},
        "accent": "signal",
    },
    "network_congestion": {
        "id": "network_congestion",
        "name": "Network-wide congestion",
        "number": 8,
        "tagline": "Evening rush across the city",
        "description": "A high evening demand multiplier is applied network-wide, stressing alternative corridors as well.",
        "clock": 17 * 60 + 55,
        "level": 1.85,
        "road_multipliers": {"R15": 1.10, "R16": 1.12, "R17": 1.15, "R18": 1.12, "R20": 1.12, "R21": 1.10, "R42": 1.12, "R47": 1.12},
        "incidents": [],
        "seed": 42,
        "route": {"origin": "N16", "destination": "N10", "objective": "balanced", "algorithm": "astar", "weights": {"time": 0.4, "distance": 0.2, "congestion": 0.25, "eco": 0.15}},
        "accent": "amber",
    },
}

SCENARIO_ORDER = ["normal", "peak_hour", "highway_congestion", "accident", "road_closure", "emergency", "eco", "network_congestion"]


def scenario_catalog() -> list[dict[str, Any]]:
    return [{k: v for k, v in SCENARIOS[key].items() if k not in {"road_multipliers", "incidents"}} for key in SCENARIO_ORDER]


def apply_scenario(engine: TrafficEngine, scenario: dict[str, Any], seed: int | None = None) -> dict[str, Any]:
    engine.reset(seed=seed if seed is not None else scenario.get("seed", 42), clear_incidents=True, clock=int(scenario["clock"]))
    engine.scenario = scenario["id"]
    engine.scenario_label = scenario["name"]
    engine.traffic_level = float(scenario["level"])
    engine.road_multipliers = dict(scenario.get("road_multipliers", {}))
    created = []
    for spec in scenario.get("incidents", []):
        created.append(
            engine.add_incident(
                spec["road_id"],
                spec["type"],
                spec.get("severity", "medium"),
                spec.get("duration_min"),
                source="scenario",
                note=spec.get("note", ""),
            )
        )
    engine.refresh()
    engine.seed_trend()
    return {
        "scenario": {k: v for k, v in scenario.items() if k not in {"road_multipliers"}},
        "created_incidents": created,
        "traffic": engine.status(),
        "route_request": scenario.get("route"),
        "reproducible": True,
        "seed": engine.seed,
        "message": f"Scenario '{scenario['name']}' loaded at {engine.status()['simulation']['clock']} with seed {engine.seed}.",
    }
