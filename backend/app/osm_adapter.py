"""Optional OpenStreetMap import boundary.

OSMnx is intentionally optional: the shipped demo must run offline with no
third-party geospatial stack. When installed, this adapter fetches and converts
a drivable OSM graph into FlowGrid's node/road shape. The current runtime exposes
the adapter's availability and configuration; the UI does not pretend OSM mode is
active when the dependency is missing.
"""
from __future__ import annotations

import importlib.util
import os
from typing import Any


def availability() -> dict[str, Any]:
    installed = importlib.util.find_spec("osmnx") is not None
    return {
        "available": installed,
        "enabled": os.environ.get("FLOWGRID_OSM", "0") == "1" and installed,
        "mode": "osm",
        "label": "OpenStreetMap (OSMnx)",
        "install": "pip install -r backend/requirements-osm.txt",
        "note": (
            "OSMnx is installed; set FLOWGRID_OSM=1 to enable imports."
            if installed
            else "OSMnx is not installed. The default synthetic network remains fully functional offline."
        ),
        "usage_policy": "Use OSM data within the OpenStreetMap tile/usage policies; this adapter performs one bounded query per import.",
    }


def import_graph(place: str | None = None, bbox: list[float] | None = None, network_type: str = "drive") -> dict[str, Any]:
    info = availability()
    if not info["available"]:
        raise RuntimeError(info["note"])
    import osmnx as ox  # type: ignore
    import networkx as nx  # type: ignore

    if bbox and len(bbox) == 4:
        graph = ox.graph_from_bbox(tuple(bbox), network_type=network_type, simplify=True)  # type: ignore[arg-type]
    elif place:
        graph = ox.graph_from_place(place, network_type=network_type, simplify=True)
    else:
        raise ValueError("Provide a place name or a [west, south, east, north] bounding box.")
    graph = nx.convert_node_labels_to_integers(graph, label_attribute="osm_id")
    nodes = []
    roads = []
    for node_id, data in graph.nodes(data=True):
        nodes.append(
            {
                "id": f"O{node_id}",
                "name": data.get("name") or f"OSM junction {node_id}",
                "lat": float(data["y"]),
                "lon": float(data["x"]),
                "x": float(data["x"]),
                "y": float(data["y"]),
            }
        )
    for u, v, key, data in graph.edges(keys=True, data=True):
        length_m = float(data.get("length", 0.0))
        if length_m <= 0:
            continue
        highway = data.get("highway", "residential")
        if isinstance(highway, list):
            highway = highway[0] if highway else "residential"
        speed = {"motorway": 80, "trunk": 70, "primary": 55, "secondary": 50, "tertiary": 45}.get(str(highway), 35)
        roads.append(
            {
                "id": f"O{min(u, v)}-{max(u, v)}-{key}",
                "from": f"O{u}",
                "to": f"O{v}",
                "name": data.get("name") or str(highway).replace("_", " ").title(),
                "road_class": "highway" if highway in {"motorway", "trunk"} else "arterial" if highway in {"primary", "secondary"} else "collector",
                "speed_limit": speed,
                "lanes": int(data.get("lanes", 2) or 2) if str(data.get("lanes", "2")).isdigit() else 2,
                "one_way": "forward" if data.get("oneway") in {True, "yes", "true", "1"} else "two_way",
                "distance_km": round(length_m / 1000.0, 3),
                "base_demand": 0.35,
                "capacity": 1800,
            }
        )
    return {
        "source": "OpenStreetMap via OSMnx",
        "license": "OpenStreetMap contributors, ODbL",
        "network_type": network_type,
        "query": {"place": place, "bbox": bbox},
        "nodes": nodes,
        "roads": roads,
        "note": "This adapter returns converted road geometry. Live traffic is never inferred from OSM.",
    }
