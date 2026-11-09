"""Configurable vehicle and environmental model.

Fuel figures are engineering estimates, not measurements. The speed penalty
makes the estimate sensitive to stop-start driving, because distance alone is
not enough to estimate consumption.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

DEFAULT_VEHICLE: dict[str, Any] = {
    "type": "petrol_car",
    "label": "Petrol car",
    "fuel_type": "petrol",
    "efficiency_l_100km": 7.2,
    "fuel_price_per_l": 106.5,
    "co2_kg_per_l": 2.31,
    "electricity_kwh_100km": 16.0,
    "electricity_price_per_kwh": 8.2,
    "grid_co2_kg_per_kwh": 0.71,
    "occupants": 1,
}


@dataclass(frozen=True)
class SegmentEnergy:
    fuel_l: float
    energy_kwh: float
    co2_kg: float
    fuel_cost: float


def speed_penalty(speed_kph: float) -> float:
    """Approximate efficiency penalty away from an efficient cruise band.

    A simple U-shaped curve: 1.0 at 45 km/h, rising for very low and very high
    speeds. Capped so short simulation glitches cannot dominate the estimate.
    """
    speed = max(5.0, min(120.0, speed_kph))
    penalty = 1.0 + 0.30 * ((speed - 45.0) / 38.0) ** 2
    if speed < 22:
        penalty += (22.0 - speed) / 22.0 * 0.22
    return min(1.75, penalty)


def segment_energy(distance_km: float, speed_kph: float, vehicle: dict[str, Any]) -> SegmentEnergy:
    v = {**DEFAULT_VEHICLE, **vehicle}
    penalty = speed_penalty(speed_kph)
    is_electric = v["fuel_type"] == "electric"
    if is_electric:
        energy = distance_km / 100.0 * float(v["electricity_kwh_100km"]) * penalty
        co2 = energy * float(v["grid_co2_kg_per_kwh"])
        cost = energy * float(v["electricity_price_per_kwh"])
        return SegmentEnergy(0.0, round(energy, 4), round(co2, 4), round(cost, 2))
    fuel = distance_km / 100.0 * float(v["efficiency_l_100km"]) * penalty
    co2 = fuel * float(v["co2_kg_per_l"])
    cost = fuel * float(v["fuel_price_per_l"])
    return SegmentEnergy(round(fuel, 4), 0.0, round(co2, 4), round(cost, 2))


def vehicle_public(vehicle: dict[str, Any] | None = None) -> dict[str, Any]:
    return {**DEFAULT_VEHICLE, **(vehicle or {})}


def vehicle_to_dict(vehicle: dict[str, Any]) -> dict[str, Any]:
    return asdict(DEFAULT_VEHICLE) | vehicle
