"""Traffic data provider boundary.

The simulation is the default provider. A future live provider (paid or
open-data) implements the same shape and updates road observations without
changing the routing engine. Nothing in this module labels simulated data as
live.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable


@dataclass
class TrafficObservation:
    road_id: str
    speed_kph: float
    congestion: float
    observed_at: str
    source: str
    confidence: float
    incident_id: str | None = None
    timestamp_source: str = "simulation"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@runtime_checkable
class TrafficProvider(Protocol):
    provider_id: str
    display_name: str
    is_live: bool

    def observations(self) -> list[TrafficObservation]:
        ...

    def status(self) -> dict[str, Any]:
        ...


class SimulatedTrafficProvider:
    provider_id = "flowgrid-simulation"
    display_name = "FlowGrid synthetic simulation"
    is_live = False

    def __init__(self, engine: Any):
        self.engine = engine

    def observations(self) -> list[TrafficObservation]:
        observed = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        return [
            TrafficObservation(
                road_id=road["id"],
                speed_kph=float(road["effective_speed_kph"]),
                congestion=float(road["congestion"]),
                observed_at=observed,
                source=self.display_name,
                confidence=1.0,
                timestamp_source="simulation",
            )
            for road in self.engine.road_state.values()
        ]

    def status(self) -> dict[str, Any]:
        return {
            "provider_id": self.provider_id,
            "display_name": self.display_name,
            "is_live": False,
            "configured": True,
            "description": "Seeded synthetic traffic engine. Values are simulation output, not live observations.",
            "supports": ["road_speed", "congestion", "incidents", "timestamps"],
            "confidence_default": 1.0,
        }


class ProviderRegistry:
    """Registry with a working simulation provider and a live-provider slot."""

    def __init__(self, engine: Any):
        self.simulated = SimulatedTrafficProvider(engine)
        self.live_provider: TrafficProvider | None = None

    def register_live(self, provider: TrafficProvider) -> None:
        if not provider.is_live:
            raise ValueError("A live provider must report is_live=True")
        self.live_provider = provider

    def status(self) -> dict[str, Any]:
        return {
            "active": "flowgrid-simulation" if not self.live_provider else self.live_provider.provider_id,
            "providers": [
                self.simulated.status(),
                {
                    "provider_id": self.live_provider.provider_id if self.live_provider else "live-not-configured",
                    "display_name": self.live_provider.display_name if self.live_provider else "Live provider (not configured)",
                    "is_live": bool(self.live_provider and self.live_provider.is_live),
                    "configured": self.live_provider is not None,
                    "description": "The interface supports speed, congestion, incident, timestamp, source and confidence updates.",
                    "supports": ["road_speed", "congestion", "incidents", "timestamps", "source", "confidence"],
                },
            ],
            "note": "No paid traffic API is required. A configured live provider replaces simulation observations only for roads it covers.",
        }

    def observations(self) -> list[TrafficObservation]:
        if self.live_provider:
            return self.live_provider.observations()
        return self.simulated.observations()
