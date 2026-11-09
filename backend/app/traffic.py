"""Deterministic traffic simulation engine.

Every road's speed is derived from free-flow speed and a simulated
volume/capacity ratio. The engine never claims to represent live traffic: all
values are labelled as simulation output.
"""
from __future__ import annotations

import hashlib
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Any

from .network_data import NODES, ROADS, NODE_BY_ID, ROAD_BY_ID

INCIDENT_TYPES = {
    "accident": {
        "label": "Accident",
        "speed": 0.52,
        "capacity": 0.62,
        "icon": "alert-triangle",
        "default_duration": 55,
    },
    "closure": {
        "label": "Road closure",
        "speed": 0.0,
        "capacity": 0.0,
        "icon": "octagon-x",
        "default_duration": 120,
    },
    "construction": {
        "label": "Construction",
        "speed": 0.68,
        "capacity": 0.72,
        "icon": "construction",
        "default_duration": 240,
    },
    "heavy_congestion": {
        "label": "Heavy congestion",
        "speed": 0.55,
        "capacity": 0.78,
        "icon": "traffic-cone",
        "default_duration": 70,
    },
    "special_event": {
        "label": "Special event",
        "speed": 0.66,
        "capacity": 0.80,
        "icon": "calendar-clock",
        "default_duration": 180,
    },
    "emergency": {
        "label": "Emergency obstruction",
        "speed": 0.48,
        "capacity": 0.58,
        "icon": "siren",
        "default_duration": 45,
    },
}

SEVERITY = {
    "low": {"label": "Low", "speed_factor": 0.82, "capacity_factor": 0.92, "bump": 3},
    "medium": {"label": "Medium", "speed_factor": 1.0, "capacity_factor": 1.0, "bump": 7},
    "high": {"label": "High", "speed_factor": 1.18, "capacity_factor": 1.12, "bump": 12},
    "critical": {"label": "Critical", "speed_factor": 1.35, "capacity_factor": 1.2, "bump": 18},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _clock(minutes: int) -> str:
    minutes = int(minutes) % 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _hour_factor(minutes: int) -> float:
    h = (minutes % 1440) / 60.0
    morning = 0.40 * math.exp(-((h - 8.35) ** 2) / (2 * 0.95**2))
    evening = 0.46 * math.exp(-((h - 17.7) ** 2) / (2 * 1.05**2))
    base = 0.66 if 6 <= h <= 21 else 0.40
    return round(base + morning + evening, 3)


class TrafficEngine:
    def __init__(self, seed: int = 42):
        self.seed = int(seed)
        self.rng = random.Random(seed)
        self.running = False
        self.sim_time_minutes = 8 * 60 + 15
        self.tick_count = 0
        self.step_minutes = 3
        self.traffic_level = 1.0
        self.scenario = "morning_peak"
        self.scenario_label = "Morning peak"
        self.incidents: dict[str, dict[str, Any]] = {}
        self.manual_closures: set[str] = set()
        self.road_multipliers: dict[str, float] = {}
        self.trend: list[dict[str, Any]] = []
        self.road_state: dict[str, dict[str, Any]] = {}
        self.last_tick_at = _now_iso()
        self.event_log: list[dict[str, Any]] = []
        self.refresh()
        self.seed_trend()

    # ------------------------------------------------------------------ state
    def reset(self, *, seed: int | None = None, clear_incidents: bool = True, clock: int = 8 * 60 + 15) -> None:
        if seed is not None:
            self.seed = int(seed)
        self.rng = random.Random(self.seed)
        self.running = False
        self.sim_time_minutes = clock
        self.tick_count = 0
        self.traffic_level = 1.0
        self.scenario = "normal"
        self.scenario_label = "Normal traffic"
        self.road_multipliers = {}
        if clear_incidents:
            self.incidents.clear()
            self.manual_closures.clear()
        self.trend.clear()
        self.last_tick_at = _now_iso()
        self.refresh()
        self.seed_trend()

    def refresh(self) -> None:
        now = self.sim_time_minutes
        hour_factor = _hour_factor(now)
        active = [i for i in self.incidents.values() if i["status"] == "active"]
        by_road: dict[str, list[dict[str, Any]]] = {}
        for incident in active:
            by_road.setdefault(incident["road_id"], []).append(incident)
        for road in ROADS:
            incidents = by_road.get(road.id, [])
            closed = road.id in self.manual_closures or any(i["type"] == "closure" for i in incidents)
            speed_mult = 1.0
            capacity_mult = 1.0
            bump = 0.0
            for inc in incidents:
                if inc["type"] == "closure":
                    continue
                sev = SEVERITY[inc["severity"]]
                base = INCIDENT_TYPES[inc["type"]]
                effect = 1.0 - (1.0 - base["speed"]) * sev["speed_factor"]
                speed_mult *= max(0.08, effect)
                capacity_mult *= max(0.1, base["capacity"] * sev["capacity_factor"])
                bump += sev["bump"]
            # A deterministic per-road demand component plus a small time-varying
            # ripple makes the simulation feel alive without random walk drift.
            ripple = 0.035 * math.sin((now / 60.0) * 1.7 + int(road.id[1:]) * 0.7)
            ratio = road.base_demand * hour_factor * self.traffic_level * capacity_mult * self.road_multipliers.get(road.id, 1.0) + ripple
            ratio = max(0.03, min(1.75, ratio))
            if closed:
                speed_factor = 0.0
                effective_speed = 0.0
                congestion = 100.0
                level = "closed"
                travel_time = float("inf")
                status = "closed"
            else:
                speed_factor = 1.0 / (1.0 + 2.15 * max(0.0, ratio - 0.16) ** 2.25)
                speed_factor = max(0.12, min(1.0, speed_factor * speed_mult))
                effective_speed = max(3.0, road.speed_limit * speed_factor)
                congestion = min(100.0, max(0.0, (1.0 - speed_factor) * 100.0 + bump))
                if congestion >= 80:
                    level = "severe"
                elif congestion >= 58:
                    level = "heavy"
                elif congestion >= 30:
                    level = "moderate"
                else:
                    level = "free"
                travel_time = road.distance_km / effective_speed * 60.0
                status = "open"
            density = int(round(ratio * road.capacity))
            self.road_state[road.id] = {
                "id": road.id,
                "name": road.name,
                "from": road.a,
                "to": road.b,
                "from_name": NODE_BY_ID[road.a].name,
                "to_name": NODE_BY_ID[road.b].name,
                "road_class": road.road_class,
                "speed_limit": road.speed_limit,
                "lanes": road.lanes,
                "capacity": road.capacity,
                "distance_km": road.distance_km,
                "one_way": road.one_way,
                "effective_speed_kph": round(effective_speed, 2),
                "free_flow_speed_kph": road.speed_limit,
                "travel_time_min": round(travel_time, 4) if travel_time != float("inf") else None,
                "free_flow_time_min": round(road.distance_km / road.speed_limit * 60.0, 3),
                "travel_delay_ratio": round((travel_time / (road.distance_km / road.speed_limit * 60.0)) - 1, 3) if not closed else None,
                "congestion": round(congestion, 1),
                "congestion_level": level,
                "traffic_density_vph": density,
                "utilization": round(min(175.0, ratio * 100.0), 1),
                "volume_capacity_ratio": round(ratio, 3),
                "status": status,
                "incident_ids": [i["id"] for i in incidents],
                "closure_reason": "Incident closure" if closed else None,
                "simulated": True,
            }
        self.last_tick_at = _now_iso()

    def seed_trend(self, points: int = 18, step: int = 6) -> None:
        """Populate the chart with a deterministic simulated lead-in."""
        self.trend.clear()
        original = self.sim_time_minutes
        for offset in range(points - 1, -1, -1):
            self.sim_time_minutes = (original - offset * step) % 1440
            self.refresh()
            s = self.summary()
            self.trend.append(
                {
                    "tick": -offset,
                    "sim_time_minutes": self.sim_time_minutes,
                    "clock": _clock(self.sim_time_minutes),
                    "avg_speed_kph": s["avg_speed_kph"],
                    "avg_congestion": s["avg_congestion"],
                    "congested_roads": s["congested_roads"],
                    "closed_roads": s["closed_roads"],
                    "incidents": s["active_incidents"],
                }
            )
        self.sim_time_minutes = original
        self.refresh()

    # --------------------------------------------------------------- helpers
    def active_incidents(self) -> list[dict[str, Any]]:
        return [dict(i) for i in self.incidents.values() if i["status"] == "active"]

    def summary(self) -> dict[str, Any]:
        roads = list(self.road_state.values())
        open_roads = [r for r in roads if r["status"] == "open"]
        total_distance = sum(r["distance_km"] for r in roads)
        avg_speed = (
            sum(r["effective_speed_kph"] * r["distance_km"] for r in open_roads) / sum(r["distance_km"] for r in open_roads)
            if open_roads
            else 0.0
        )
        avg_congestion = sum(r["congestion"] for r in open_roads) / len(open_roads) if open_roads else 0.0
        congested = sum(1 for r in roads if r["congestion_level"] in {"heavy", "severe"})
        free = sum(1 for r in roads if r["congestion_level"] == "free")
        closed = sum(1 for r in roads if r["status"] == "closed")
        return {
            "avg_speed_kph": round(avg_speed, 1),
            "avg_congestion": round(avg_congestion, 1),
            "congested_roads": congested,
            "free_roads": free,
            "closed_roads": closed,
            "active_incidents": len(self.active_incidents()),
            "total_network_distance_km": round(total_distance, 2),
            "total_roads": len(roads),
            "open_roads": len(open_roads),
            "simulated": True,
        }

    def hotspots(self, limit: int = 6) -> list[dict[str, Any]]:
        scored = []
        for road in self.road_state.values():
            if road["status"] == "closed":
                score = 1000
            else:
                score = road["congestion"] * 0.65 + min(100, road["utilization"]) * 0.35
            scored.append((score, road))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        out = []
        for score, r in scored[:limit]:
            out.append(
                {
                    "road_id": r["id"],
                    "name": r["name"],
                    "from_name": r["from_name"],
                    "to_name": r["to_name"],
                    "congestion": r["congestion"],
                    "congestion_level": r["congestion_level"],
                    "speed_kph": r["effective_speed_kph"],
                    "utilization": r["utilization"],
                    "status": r["status"],
                    "hotspot_score": round(score, 1),
                }
            )
        return out

    def status(self) -> dict[str, Any]:
        s = self.summary()
        return {
            "simulation": {
                "running": self.running,
                "clock": _clock(self.sim_time_minutes),
                "time_minutes": self.sim_time_minutes,
                "tick": self.tick_count,
                "step_minutes": self.step_minutes,
                "seed": self.seed,
                "scenario": self.scenario,
                "scenario_label": self.scenario_label,
                "traffic_level": round(self.traffic_level, 2),
                "last_tick_at": self.last_tick_at,
                "engine": "FlowGrid synthetic traffic engine v1.0",
            },
            "summary": s,
            "hotspots": self.hotspots(),
            "trend": self.trend[-36:],
            "incidents": self.active_incidents(),
            "recent_events": self.event_log[-8:],
            "data_source": "Synthetic simulation — not live traffic data",
        }

    def network(self) -> dict[str, Any]:
        nodes = [
            {
                "id": n.id,
                "name": n.name,
                "x": n.x,
                "y": n.y,
                "lat": round(12.80 + n.y * 0.00035, 6),
                "lon": round(77.45 + n.x * 0.00035, 6),
                "district": n.district,
                "kind": n.kind,
                "degree": sum(1 for r in ROADS if r.a == n.id or r.b == n.id),
            }
            for n in NODES
        ]
        return {
            "mode": "synthetic",
            "mode_label": "Synthetic road network",
            "disclaimer": "Simulated city network for algorithm demonstration. Not a real place and not live traffic.",
            "bounds": {"width": 1200, "height": 800, "km_per_unit": 0.011},
            "nodes": nodes,
            "roads": list(self.road_state.values()),
            "summary": self.summary(),
        }

    # -------------------------------------------------------------- mutations
    def set_step_minutes(self, minutes: int) -> int:
        self.step_minutes = max(1, min(15, int(minutes)))
        return self.step_minutes

    def set_running(self, running: bool) -> dict[str, Any]:
        self.running = bool(running)
        self.event_log.append({"at": _now_iso(), "type": "simulation", "message": "Simulation started" if running else "Simulation paused"})
        return self.status()

    def tick(self, minutes: int | None = None, random_events: bool = False) -> dict[str, Any]:
        step = max(1, min(15, int(minutes or self.step_minutes)))
        self.sim_time_minutes = (self.sim_time_minutes + step) % 1440
        self.tick_count += 1
        expired = []
        for inc in list(self.incidents.values()):
            if inc["status"] != "active":
                continue
            elapsed = self._sim_elapsed(inc)
            if elapsed >= inc["duration_min"]:
                inc["status"] = "expired"
                inc["resolved_at"] = _now_iso()
                expired.append(inc["id"])
        if random_events and self.rng.random() < 0.14:
            self._random_incident()
        self.refresh()
        s = self.summary()
        self.trend.append(
            {
                "tick": self.tick_count,
                "sim_time_minutes": self.sim_time_minutes,
                "clock": _clock(self.sim_time_minutes),
                "avg_speed_kph": s["avg_speed_kph"],
                "avg_congestion": s["avg_congestion"],
                "congested_roads": s["congested_roads"],
                "closed_roads": s["closed_roads"],
                "incidents": s["active_incidents"],
            }
        )
        self.trend = self.trend[-48:]
        return {"status": self.status(), "expired": expired, "new_incidents": self.active_incidents()}

    def _sim_elapsed(self, incident: dict[str, Any]) -> int:
        start = incident.get("start_minutes", 0)
        diff = (self.sim_time_minutes - start) % 1440
        return diff

    def _random_incident(self) -> dict[str, Any] | None:
        open_roads = [r for r in self.road_state.values() if r["status"] == "open"]
        if not open_roads:
            return None
        road = self.rng.choice(open_roads)
        kind = self.rng.choices(
            ["accident", "construction", "heavy_congestion", "special_event"],
            weights=[0.38, 0.17, 0.30, 0.15],
            k=1,
        )[0]
        severity = self.rng.choices(["low", "medium", "high"], weights=[0.25, 0.52, 0.23], k=1)[0]
        return self.add_incident(road["id"], kind, severity, source="simulation")

    def add_incident(
        self,
        road_id: str,
        incident_type: str,
        severity: str = "medium",
        duration_min: int | None = None,
        source: str = "operator",
        note: str = "",
    ) -> dict[str, Any]:
        if road_id not in ROAD_BY_ID:
            raise ValueError(f"Unknown road: {road_id}")
        if incident_type not in INCIDENT_TYPES:
            raise ValueError(f"Unknown incident type: {incident_type}")
        if severity not in SEVERITY:
            raise ValueError(f"Unknown severity: {severity}")
        road = ROAD_BY_ID[road_id]
        inc_id = f"INC-{uuid.uuid4().hex[:6].upper()}"
        inc = {
            "id": inc_id,
            "road_id": road_id,
            "road_name": road.name,
            "from_name": NODE_BY_ID[road.a].name,
            "to_name": NODE_BY_ID[road.b].name,
            "type": incident_type,
            "type_label": INCIDENT_TYPES[incident_type]["label"],
            "severity": severity,
            "severity_label": SEVERITY[severity]["label"],
            "start_time": _now_iso(),
            "start_minutes": self.sim_time_minutes,
            "start_clock": _clock(self.sim_time_minutes),
            "duration_min": int(duration_min or INCIDENT_TYPES[incident_type]["default_duration"]),
            "status": "active",
            "source": source,
            "note": note,
        }
        self.incidents[inc_id] = inc
        if incident_type == "closure":
            self.manual_closures.add(road_id)
        self.event_log.append(
            {
                "at": _now_iso(),
                "type": "incident",
                "message": f"{inc['type_label']} on {road.name} ({severity})",
            }
        )
        self.refresh()
        return dict(inc)

    def restore_incident(self, row: dict[str, Any]) -> dict[str, Any] | None:
        """Restore an active persisted incident without generating a new id."""
        road_id = row.get("road_id") or row.get("road")
        if road_id not in ROAD_BY_ID or row.get("incident_type") not in INCIDENT_TYPES:
            return None
        road = ROAD_BY_ID[road_id]
        kind = row["incident_type"]
        severity = row.get("severity", "medium")
        if severity not in SEVERITY:
            severity = "medium"
        inc = {
            "id": row.get("incident_id") or row.get("id"),
            "road_id": road_id,
            "road_name": road.name,
            "from_name": NODE_BY_ID[road.a].name,
            "to_name": NODE_BY_ID[road.b].name,
            "type": kind,
            "type_label": INCIDENT_TYPES[kind]["label"],
            "severity": severity,
            "severity_label": SEVERITY[severity]["label"],
            "start_time": row.get("start_time") or _now_iso(),
            "start_minutes": int(row.get("start_minutes", 0)),
            "start_clock": row.get("start_clock", "08:15"),
            "duration_min": int(row.get("duration_min", 120)),
            "status": "active",
            "source": row.get("source", "restored"),
            "note": row.get("note", ""),
        }
        self.incidents[inc["id"]] = inc
        if kind == "closure":
            self.manual_closures.add(road_id)
        self.refresh()
        return dict(inc)

    def remove_incident(self, incident_id: str) -> dict[str, Any] | None:
        inc = self.incidents.get(incident_id)
        if not inc:
            return None
        inc["status"] = "resolved"
        inc["resolved_at"] = _now_iso()
        if inc["type"] == "closure" and not any(
            i["status"] == "active" and i["type"] == "closure" and i["road_id"] == inc["road_id"] for i in self.incidents.values()
        ):
            self.manual_closures.discard(inc["road_id"])
        self.event_log.append({"at": _now_iso(), "type": "incident", "message": f"{inc['type_label']} cleared on {inc['road_name']}"})
        self.refresh()
        return dict(inc)

    def close_road(self, road_id: str, duration_min: int = 120, reason: str = "Operator closure") -> dict[str, Any]:
        return self.add_incident(road_id, "closure", "critical", duration_min, source="operator", note=reason)

    def open_road(self, road_id: str) -> dict[str, Any]:
        if road_id not in ROAD_BY_ID:
            raise ValueError(f"Unknown road: {road_id}")
        removed = []
        for inc in list(self.incidents.values()):
            if inc["status"] == "active" and inc["road_id"] == road_id and inc["type"] == "closure":
                inc["status"] = "resolved"
                inc["resolved_at"] = _now_iso()
                removed.append(inc["id"])
        self.manual_closures.discard(road_id)
        self.event_log.append({"at": _now_iso(), "type": "road", "message": f"Road reopened: {ROAD_BY_ID[road_id].name}"})
        self.refresh()
        return {"road_id": road_id, "reopened": True, "removed_incidents": removed, "status": self.status()}

    def set_level(self, level: float | None = None, delta: float = 0.0) -> float:
        if level is not None:
            self.traffic_level = float(level)
        else:
            self.traffic_level += float(delta)
        self.traffic_level = round(max(0.25, min(2.5, self.traffic_level)), 2)
        self.refresh()
        return self.traffic_level

    def run_scenario(self, key: str, seed: int | None = None) -> dict[str, Any]:
        from .scenarios import SCENARIOS, apply_scenario

        if key not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {key}")
        scenario = SCENARIOS[key]
        return apply_scenario(self, scenario, seed)
