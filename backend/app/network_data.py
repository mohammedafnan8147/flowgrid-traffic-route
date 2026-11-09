"""Deterministic synthetic road network for FlowGrid.

The graph is deliberately fictional. Coordinates are local map units, not
geographic positions. They are laid out as a compact city with a ring road,
four arterials, a historic quarter with one-way streets, and a rail/port edge.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from typing import Iterable

MAP_WIDTH = 1200
MAP_HEIGHT = 800
KM_PER_MAP_UNIT = 0.011


@dataclass(frozen=True)
class NodeDef:
    id: str
    name: str
    x: float
    y: float
    district: str
    kind: str = "intersection"


@dataclass(frozen=True)
class RoadDef:
    id: str
    a: str
    b: str
    name: str
    road_class: str
    speed_limit: int
    lanes: int
    one_way: str = "two_way"  # two_way | forward (a→b) | reverse (b→a)
    capacity: int = 0
    distance_km: float = 0.0
    base_demand: float = 0.5
    geometry: tuple[tuple[float, float], ...] = field(default_factory=tuple)


NODES: list[NodeDef] = [
    NodeDef("N01", "North Gate", 100, 90, "North", "gateway"),
    NodeDef("N02", "Hillcrest", 340, 95, "North"),
    NodeDef("N03", "Observatory", 590, 85, "North"),
    NodeDef("N04", "Lakeside", 830, 105, "North"),
    NodeDef("N05", "Airport Link", 1090, 90, "North East", "gateway"),
    NodeDef("N06", "West End", 110, 275, "West"),
    NodeDef("N07", "Museum District", 320, 280, "West"),
    NodeDef("N08", "Central Junction", 550, 285, "Central"),
    NodeDef("N09", "Innovation Square", 780, 295, "Central"),
    NodeDef("N10", "East Station", 1050, 280, "East", "transit"),
    NodeDef("N11", "Riverside", 95, 475, "West"),
    NodeDef("N12", "Old Town", 300, 490, "West"),
    NodeDef("N13", "Civic Center", 520, 470, "Central", "civic"),
    NodeDef("N14", "University", 760, 480, "Central", "campus"),
    NodeDef("N15", "Harbor Point", 1030, 500, "East", "gateway"),
    NodeDef("N16", "Southwest Depot", 135, 680, "South West", "transit"),
    NodeDef("N17", "Stadium", 350, 700, "South", "venue"),
    NodeDef("N18", "Medical Campus", 565, 690, "South", "hospital"),
    NodeDef("N19", "Tech Park", 790, 690, "South East", "employment"),
    NodeDef("N20", "Southeast Gate", 1050, 680, "South East", "gateway"),
    NodeDef("N21", "Cathedral", 430, 385, "Central"),
    NodeDef("N22", "Convention Centre", 645, 390, "Central", "venue"),
    NodeDef("N23", "River Bridge", 900, 405, "East"),
    NodeDef("N24", "Greenway", 230, 590, "South West"),
    NodeDef("N25", "Rail Yard", 900, 590, "South East", "transit"),
    NodeDef("N26", "West Portal", 65, 390, "West", "gateway"),
    NodeDef("N27", "Park Lane", 460, 180, "North"),
    NodeDef("N28", "Canal Cross", 680, 185, "North"),
    NodeDef("N29", "South Junction", 690, 585, "South"),
    NodeDef("N30", "North Commons", 900, 205, "North East"),
]

NODE_BY_ID = {n.id: n for n in NODES}


def _distance(a: str, b: str) -> float:
    na, nb = NODE_BY_ID[a], NODE_BY_ID[b]
    raw = math.hypot(na.x - nb.x, na.y - nb.y) * KM_PER_MAP_UNIT
    # Road distance is longer than straight-line distance; clamp for tiny blocks.
    return round(max(0.32, raw * 1.09), 2)


def _demand(road_id: str, road_class: str) -> float:
    digest = hashlib.blake2s(road_id.encode(), digest_size=2).digest()
    jitter = int.from_bytes(digest, "big") / 65535.0
    bands = {
        "highway": (0.50, 0.25),
        "arterial": (0.43, 0.30),
        "collector": (0.26, 0.26),
        "residential": (0.16, 0.22),
    }
    low, span = bands[road_class]
    return round(low + jitter * span, 3)


_CAPACITY = {"highway": 2600, "arterial": 1900, "collector": 1200, "residential": 650}


def _road(
    rid: str,
    a: str,
    b: str,
    name: str,
    road_class: str,
    speed: int,
    lanes: int,
    one_way: str = "two_way",
) -> RoadDef:
    return RoadDef(
        id=rid,
        a=a,
        b=b,
        name=name,
        road_class=road_class,
        speed_limit=speed,
        lanes=lanes,
        one_way=one_way,
        capacity=_CAPACITY[road_class] * lanes,
        distance_km=_distance(a, b),
        base_demand=_demand(rid, road_class),
    )


ROADS: list[RoadDef] = [
    # Ring road and gateway expressways
    _road("R01", "N01", "N02", "North Ring", "highway", 80, 3),
    _road("R02", "N02", "N03", "North Ring", "highway", 80, 3),
    _road("R03", "N03", "N04", "North Ring", "highway", 80, 3),
    _road("R04", "N04", "N05", "Airport Expressway", "highway", 80, 3),
    _road("R05", "N05", "N10", "East Ring", "highway", 80, 3),
    _road("R06", "N10", "N15", "East Ring", "highway", 80, 3),
    _road("R07", "N15", "N20", "Southeast Link", "highway", 70, 2),
    _road("R08", "N20", "N19", "South Ring", "highway", 70, 2),
    _road("R09", "N19", "N18", "South Ring", "highway", 70, 2),
    _road("R10", "N18", "N17", "South Ring", "highway", 70, 2),
    _road("R11", "N17", "N16", "Southwest Link", "highway", 70, 2),
    _road("R12", "N16", "N11", "West Ring", "arterial", 60, 2),
    _road("R13", "N11", "N06", "West Ring", "arterial", 60, 2),
    _road("R14", "N06", "N01", "Northwest Link", "arterial", 60, 2),
    # East-west arterials
    _road("R15", "N06", "N07", "Central Avenue", "arterial", 55, 3),
    _road("R16", "N07", "N08", "Central Avenue", "arterial", 55, 3),
    _road("R17", "N08", "N09", "Central Avenue", "arterial", 55, 3),
    _road("R18", "N09", "N10", "Central Avenue", "arterial", 55, 3),
    _road("R19", "N11", "N12", "Market Street", "arterial", 50, 2),
    _road("R20", "N12", "N13", "Market Street", "arterial", 50, 2),
    _road("R21", "N13", "N14", "University Avenue", "arterial", 50, 2),
    _road("R22", "N14", "N15", "Harbor Road", "arterial", 50, 2),
    # Central connectors
    _road("R23", "N13", "N21", "Civic Link", "collector", 45, 2),
    _road("R24", "N21", "N07", "Museum Lane", "collector", 40, 1),
    _road("R25", "N21", "N22", "Civic Link", "collector", 45, 2),
    _road("R26", "N22", "N08", "Convention Drive", "collector", 45, 2),
    _road("R27", "N22", "N09", "Convention Drive", "collector", 45, 2),
    _road("R28", "N22", "N14", "University Avenue", "arterial", 50, 2),
    _road("R29", "N22", "N23", "River Bridge Road", "collector", 45, 2),
    _road("R30", "N23", "N14", "River Bridge Road", "collector", 45, 2),
    _road("R31", "N23", "N15", "Harbor Road", "arterial", 50, 2),
    _road("R32", "N23", "N30", "Riverside Drive", "collector", 45, 2),
    _road("R33", "N30", "N09", "Innovation Way", "collector", 45, 2),
    _road("R34", "N30", "N04", "Lakeside Drive", "collector", 45, 2),
    # North-south connectors
    _road("R35", "N01", "N06", "West Portal Road", "collector", 45, 2),
    _road("R36", "N02", "N27", "Hillcrest Road", "residential", 40, 1),
    _road("R37", "N03", "N28", "Observatory Road", "residential", 40, 1),
    _road("R38", "N04", "N30", "Lakeside Road", "residential", 40, 1),
    _road("R39", "N05", "N10", "Airport Link Road", "arterial", 55, 2),
    _road("R40", "N06", "N11", "Riverside Road", "collector", 40, 2),
    _road("R41", "N07", "N12", "Old Town Street", "residential", 35, 1, "reverse"),
    _road("R42", "N08", "N13", "Civic Avenue", "arterial", 45, 2),
    _road("R43", "N09", "N14", "University Link", "collector", 45, 2),
    _road("R44", "N10", "N15", "Station Road", "collector", 40, 2),
    _road("R45", "N11", "N16", "Depot Road", "collector", 40, 2),
    _road("R46", "N12", "N17", "Stadium Road", "collector", 40, 2),
    _road("R47", "N13", "N18", "Medical Link", "arterial", 45, 2),
    _road("R48", "N14", "N19", "Tech Corridor", "arterial", 55, 3),
    _road("R49", "N15", "N20", "Harbor Link", "collector", 40, 2),
    _road("R50", "N12", "N24", "Greenway", "residential", 30, 1, "forward"),
    _road("R51", "N24", "N17", "Greenway", "residential", 30, 1),
    _road("R52", "N17", "N18", "Stadium Link", "collector", 40, 2),
    _road("R53", "N18", "N19", "Tech Park Road", "collector", 40, 2),
    _road("R54", "N19", "N20", "Tech Park Link", "collector", 40, 2),
    _road("R55", "N20", "N15", "Coastal Road", "collector", 45, 2),
    _road("R56", "N18", "N29", "Canal Road", "collector", 40, 2),
    _road("R57", "N29", "N19", "Canal Road", "collector", 40, 2),
    _road("R58", "N13", "N29", "South Junction Link", "collector", 40, 2),
    _road("R59", "N14", "N29", "Canal Road", "collector", 40, 2),
    _road("R60", "N29", "N25", "Rail Loop", "collector", 45, 2, "forward"),
    _road("R61", "N25", "N23", "Rail Loop", "collector", 45, 2),
    _road("R62", "N25", "N19", "Rail Yard Road", "collector", 40, 2),
    _road("R63", "N26", "N11", "West Portal Road", "residential", 40, 1),
    _road("R64", "N26", "N06", "West Portal Link", "residential", 40, 1, "reverse"),
    _road("R65", "N26", "N12", "River Lane", "residential", 30, 1),
    _road("R66", "N27", "N08", "Park Lane", "collector", 40, 2),
    _road("R67", "N27", "N06", "Park Lane", "residential", 40, 1),
    _road("R68", "N27", "N03", "Observatory Link", "residential", 40, 1),
    _road("R69", "N28", "N08", "Canal Cross", "collector", 45, 2),
    _road("R70", "N28", "N09", "Canal Cross", "collector", 40, 2),
    _road("R71", "N28", "N04", "Canal Road", "residential", 40, 1),
    _road("R72", "N24", "N11", "Greenway Extension", "residential", 30, 1),
    _road("R73", "N24", "N12", "Greenway Lane", "residential", 30, 1),
    _road("R74", "N07", "N26", "West Market Link", "residential", 35, 1),
    _road("R75", "N10", "N30", "North Commons Link", "collector", 40, 2),
    _road("R76", "N16", "N24", "Greenway South", "residential", 30, 1),
    _road("R77", "N19", "N25", "Rail Yard Link", "collector", 40, 2),
    _road("R78", "N20", "N25", "Coastal One-Way", "collector", 40, 2, "reverse"),
]

ROAD_BY_ID = {r.id: r for r in ROADS}


def iterations() -> Iterable[RoadDef]:
    return iter(ROADS)


def validate_network() -> list[str]:
    errors: list[str] = []
    ids = {n.id for n in NODES}
    for road in ROADS:
        if road.a not in ids or road.b not in ids:
            errors.append(f"{road.id}: unknown endpoint")
        if road.a == road.b:
            errors.append(f"{road.id}: self loop")
    road_ids = [r.id for r in ROADS]
    if len(road_ids) != len(set(road_ids)):
        errors.append("duplicate road ids")
    return errors


SCENARIO_ROAD_HINTS = {
    "peak_hour": ["R15", "R16", "R17", "R18", "R20", "R21", "R42", "R47"],
    "highway_congestion": ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R09"],
    "network_congestion": ["R15", "R16", "R17", "R18", "R19", "R20", "R21", "R22", "R42", "R47", "R48"],
}
