"""SQLite persistence for FlowGrid.

The schema is intentionally portable: standard SQL, no SQLite-only routing
features, and explicit foreign keys. A PostgreSQL deployment can map these
tables one-to-one (see docs/ARCHITECTURE.md).
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .fuel import DEFAULT_VEHICLE
from .network_data import NODES, ROADS

DEFAULT_SETTINGS: dict[str, Any] = {
    "default_algorithm": "astar",
    "default_objective": "time",
    "max_alternatives": 4,
    "step_minutes": 3,
    "random_events": True,
    "map_show_traffic": True,
    "map_show_labels": False,
    "map_show_alternatives": True,
    "vehicle": DEFAULT_VEHICLE,
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Database:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._migrate()
        self.seed_network()

    def _migrate(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS nodes (
                    node_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL,
                    node_type TEXT NOT NULL,
                    district TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS roads (
                    road_id TEXT PRIMARY KEY,
                    source_node TEXT NOT NULL REFERENCES nodes(node_id),
                    destination_node TEXT NOT NULL REFERENCES nodes(node_id),
                    name TEXT NOT NULL,
                    distance_km REAL NOT NULL,
                    speed_limit INTEGER NOT NULL,
                    road_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    capacity INTEGER NOT NULL,
                    lanes INTEGER NOT NULL,
                    current_speed REAL NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'open'
                );

                CREATE TABLE IF NOT EXISTS incidents (
                    incident_id TEXT PRIMARY KEY,
                    road_id TEXT NOT NULL REFERENCES roads(road_id),
                    incident_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    duration_min INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT 'operator',
                    start_minutes INTEGER NOT NULL DEFAULT 0,
                    start_clock TEXT NOT NULL DEFAULT '08:15',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS route_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    route_code TEXT NOT NULL,
                    source_node TEXT NOT NULL,
                    destination_node TEXT NOT NULL,
                    source_name TEXT NOT NULL,
                    destination_name TEXT NOT NULL,
                    algorithm TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    distance_km REAL NOT NULL,
                    travel_time_min REAL NOT NULL,
                    congestion REAL NOT NULL,
                    fuel_l REAL NOT NULL,
                    co2_kg REAL NOT NULL,
                    objective_cost REAL NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS simulation_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario TEXT NOT NULL,
                    random_seed INTEGER NOT NULL,
                    parameters TEXT NOT NULL,
                    results TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
                CREATE INDEX IF NOT EXISTS idx_route_history_created ON route_history(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_incidents_road ON incidents(road_id);
                """
            )

    def seed_network(self) -> None:
        with self._lock, self._conn:
            for node in NODES:
                self._conn.execute(
                    """
                    INSERT INTO nodes (node_id, name, latitude, longitude, x, y, node_type, district)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(node_id) DO UPDATE SET
                        name=excluded.name, latitude=excluded.latitude,
                        longitude=excluded.longitude, x=excluded.x, y=excluded.y,
                        node_type=excluded.node_type, district=excluded.district
                    """,
                    (
                        node.id,
                        node.name,
                        round(12.80 + node.y * 0.00035, 6),
                        round(77.45 + node.x * 0.00035, 6),
                        node.x,
                        node.y,
                        node.kind,
                        node.district,
                    ),
                )
            for road in ROADS:
                self._conn.execute(
                    """
                    INSERT INTO roads (road_id, source_node, destination_node, name, distance_km,
                                       speed_limit, road_type, direction, capacity, lanes, current_speed, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
                    ON CONFLICT(road_id) DO UPDATE SET
                        source_node=excluded.source_node,
                        destination_node=excluded.destination_node,
                        name=excluded.name,
                        distance_km=excluded.distance_km,
                        speed_limit=excluded.speed_limit,
                        road_type=excluded.road_type,
                        direction=excluded.direction,
                        capacity=excluded.capacity,
                        lanes=excluded.lanes
                    """,
                    (
                        road.id,
                        road.a,
                        road.b,
                        road.name,
                        road.distance_km,
                        road.speed_limit,
                        road.road_class,
                        road.one_way,
                        road.capacity,
                        road.lanes,
                        road.speed_limit,
                    ),
                )
            for key, value in DEFAULT_SETTINGS.items():
                self._conn.execute(
                    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, json.dumps(value), _now()),
                )

    # ------------------------------------------------------------------ routes
    def record_route(self, route: dict[str, Any]) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO route_history
                (route_code, source_node, destination_node, source_name, destination_name,
                 algorithm, objective, distance_km, travel_time_min, congestion, fuel_l,
                 co2_kg, objective_cost, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    route["route_id"],
                    route["path"][0],
                    route["path"][-1],
                    route["node_names"][0],
                    route["node_names"][-1],
                    route["algorithm"],
                    route["objective"],
                    route["distance_km"],
                    route["travel_time_min"],
                    route["congestion_score"],
                    route["fuel_l"],
                    route["co2_kg"],
                    route["objective_cost"],
                    _now(),
                ),
            )

    def route_history(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM route_history ORDER BY id DESC LIMIT ?", (int(limit),)
            ).fetchall()
        return [dict(row) for row in rows]

    # --------------------------------------------------------------- incidents
    def save_incident(self, incident: dict[str, Any]) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO incidents
                (incident_id, road_id, incident_type, severity, start_time, duration_min,
                 status, note, source, start_minutes, start_clock, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(incident_id) DO UPDATE SET
                    status=excluded.status, note=excluded.note
                """,
                (
                    incident["id"],
                    incident["road_id"],
                    incident["type"],
                    incident["severity"],
                    incident["start_time"],
                    incident["duration_min"],
                    incident["status"],
                    incident.get("note", ""),
                    incident.get("source", "operator"),
                    incident.get("start_minutes", 0),
                    incident.get("start_clock", "08:15"),
                    _now(),
                ),
            )
            self._conn.execute(
                "UPDATE roads SET status=? WHERE road_id=?",
                ("closed" if incident["type"] == "closure" else "open", incident["road_id"]),
            )

    def resolve_incident(self, incident_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute("UPDATE incidents SET status='resolved' WHERE incident_id=?", (incident_id,))

    def active_incidents(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM incidents WHERE status='active' ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]

    def incident_history(self, limit: int = 60) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?", (int(limit),)).fetchall()
        return [dict(row) for row in rows]

    def update_road_status(self, road_id: str, status: str, speed: float | None = None) -> None:
        with self._lock, self._conn:
            if speed is None:
                self._conn.execute("UPDATE roads SET status=? WHERE road_id=?", (status, road_id))
            else:
                self._conn.execute("UPDATE roads SET status=?, current_speed=? WHERE road_id=?", (status, speed, road_id))

    def resolve_all_active(self) -> None:
        with self._lock, self._conn:
            self._conn.execute("UPDATE incidents SET status='resolved' WHERE status='active'")
            self._conn.execute("UPDATE roads SET status='open'")

    def resolve_road_incidents(self, road_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE incidents SET status='resolved' WHERE road_id=? AND status='active'", (road_id,)
            )
            self._conn.execute("UPDATE roads SET status='open' WHERE road_id=?", (road_id,))

    def sync_incident_statuses(self, expired_ids: list[str]) -> None:
        if not expired_ids:
            return
        with self._lock, self._conn:
            marks = ",".join("?" for _ in expired_ids)
            self._conn.execute(f"UPDATE incidents SET status='expired' WHERE incident_id IN ({marks})", expired_ids)

    # --------------------------------------------------------------- simulation
    def record_simulation(self, scenario: str, seed: int, parameters: dict[str, Any], results: dict[str, Any]) -> int:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "INSERT INTO simulation_runs (scenario, random_seed, parameters, results, created_at) VALUES (?, ?, ?, ?, ?)",
                (scenario, int(seed), json.dumps(parameters), json.dumps(results), _now()),
            )
            return int(cur.lastrowid)

    def simulation_runs(self, limit: int = 10) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM simulation_runs ORDER BY id DESC LIMIT ?", (int(limit),)).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            item["parameters"] = json.loads(item["parameters"])
            item["results"] = json.loads(item["results"])
            out.append(item)
        return out

    # ----------------------------------------------------------------- settings
    def get_settings(self) -> dict[str, Any]:
        with self._lock:
            rows = self._conn.execute("SELECT key, value FROM settings").fetchall()
        values = {k: v for k, v in DEFAULT_SETTINGS.items()}
        for row in rows:
            try:
                values[row["key"]] = json.loads(row["value"])
            except json.JSONDecodeError:
                values[row["key"]] = row["value"]
        return values

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self._lock, self._conn:
            for key, value in updates.items():
                if key not in DEFAULT_SETTINGS:
                    continue
                self._conn.execute(
                    """
                    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                    """,
                    (key, json.dumps(value), _now()),
                )
        return self.get_settings()

    def stats(self) -> dict[str, Any]:
        with self._lock:
            route_count = self._conn.execute("SELECT COUNT(*) FROM route_history").fetchone()[0]
            incident_count = self._conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
            run_count = self._conn.execute("SELECT COUNT(*) FROM simulation_runs").fetchone()[0]
        return {"routes_saved": route_count, "incidents_saved": incident_count, "simulation_runs": run_count}
