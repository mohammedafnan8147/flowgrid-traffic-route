"""FastAPI adapter for the FlowGrid service layer."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .service import OBJECTIVES, ServiceError, TrafficService

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = os.environ.get("FLOWGRID_DB", str(ROOT / "data" / "flowgrid.db"))
FRONTEND_DIST = ROOT / "frontend" / "dist"

service = TrafficService(DB_PATH)


class Weights(BaseModel):
    time: float = 0.4
    distance: float = 0.2
    congestion: float = 0.2
    eco: float = 0.2


class VehicleConfig(BaseModel):
    type: str = "petrol_car"
    label: str = "Petrol car"
    fuel_type: str = "petrol"
    efficiency_l_100km: float = 7.2
    fuel_price_per_l: float = 106.5
    co2_kg_per_l: float = 2.31
    electricity_kwh_100km: float = 16.0
    electricity_price_per_kwh: float = 8.2
    grid_co2_kg_per_kwh: float = 0.71
    occupants: int = 1


class RouteRequest(BaseModel):
    origin: str = Field(..., min_length=1, examples=["N06"])
    destination: str = Field(..., min_length=1, examples=["N15"])
    algorithm: Literal["dijkstra", "astar", "yen", "aco"] = "astar"
    objective: Literal["time", "distance", "congestion", "eco", "balanced"] = "time"
    weights: Weights = Field(default_factory=Weights)
    vehicle: VehicleConfig | None = None
    seed: int | None = None


class SimulationRequest(BaseModel):
    action: Literal["start", "pause", "reset", "tick", "increase", "decrease", "level", "step"] = "tick"
    minutes: int | None = None
    level: float | None = None
    seed: int | None = None
    random_events: bool | None = None


class IncidentRequest(BaseModel):
    road_id: str
    type: Literal["accident", "closure", "construction", "heavy_congestion", "special_event", "emergency"] = "accident"
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    duration_min: int | None = None
    note: str = ""


class RoadRequest(BaseModel):
    road_id: str
    duration_min: int = 120
    reason: str = "Operator closure"


class ImportRequest(BaseModel):
    mode: str = "osm"
    place: str | None = None
    bbox: list[float] | None = None
    network_type: str = "drive"


class SettingsUpdate(BaseModel):
    default_algorithm: Literal["dijkstra", "astar", "yen", "aco"] | None = None
    default_objective: Literal["time", "distance", "congestion", "eco", "balanced"] | None = None
    max_alternatives: int | None = Field(default=None, ge=1, le=6)
    step_minutes: int | None = Field(default=None, ge=1, le=15)
    random_events: bool | None = None
    map_show_traffic: bool | None = None
    map_show_labels: bool | None = None
    map_show_alternatives: bool | None = None
    vehicle: dict[str, Any] | None = None


class ScenarioRequest(BaseModel):
    scenario: str
    seed: int | None = None


def create_app() -> FastAPI:
    app = FastAPI(
        title="FlowGrid Traffic Route API",
        version="1.0.0",
        description="Graph-theory routing, traffic simulation and route analytics on a synthetic network.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8787", "http://localhost:8787"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ServiceError)
    async def service_error_handler(_request: Request, exc: ServiceError):
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = f"Invalid request{f' at {field}' if field else ''}: {first.get('msg', 'validation failed')}"
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation_error", "message": message, "details": exc.errors()}},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(_request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": str(exc)}},
        )

    @app.get("/api/health")
    def health():
        return service.health()

    @app.get("/api/network")
    def network():
        return service.network()

    @app.post("/api/network/import")
    def import_network(payload: ImportRequest):
        return service.import_network(payload.model_dump())

    @app.get("/api/network/analysis")
    def network_analysis():
        return service.network_analysis()

    @app.post("/api/routes/optimize")
    def optimize(payload: RouteRequest):
        return service.optimize(payload.model_dump(exclude_none=True))

    @app.post("/api/routes/alternatives")
    def alternatives(payload: RouteRequest):
        result = service.optimize(payload.model_dump(exclude_none=True))
        return {
            "origin": result["origin"],
            "destination": result["destination"],
            "objective": result["objective"],
            "recommended": result["recommended"],
            "alternatives": result["alternatives"],
            "comparison": result["comparison"],
            "explanation": result["explanation"],
        }

    @app.get("/api/traffic/status")
    def traffic_status():
        return service.traffic_status()

    @app.get("/api/traffic/providers")
    def traffic_providers():
        return service.providers_status()

    @app.get("/api/network/import/status")
    def osm_status():
        from . import osm_adapter

        return osm_adapter.availability()

    @app.post("/api/traffic/simulate")
    def simulate(payload: SimulationRequest):
        return service.simulate(payload.model_dump(exclude_none=True))

    @app.post("/api/traffic/tick")
    def tick(payload: SimulationRequest | None = None):
        body = payload.model_dump(exclude_none=True) if payload else {}
        return service.simulate({**body, "action": "tick"})

    @app.post("/api/traffic/incidents")
    def create_incident(payload: IncidentRequest):
        return service.create_incident(payload.model_dump(exclude_none=True))

    @app.delete("/api/traffic/incidents/{incident_id}")
    def delete_incident(incident_id: str):
        return service.delete_incident(incident_id)

    @app.get("/api/incidents")
    def incidents():
        return service.incidents()

    @app.post("/api/traffic/close-road")
    def close_road(payload: RoadRequest):
        return service.close_road(payload.model_dump())

    @app.post("/api/traffic/open-road")
    def open_road(payload: RoadRequest):
        return service.open_road(payload.model_dump())

    @app.get("/api/analytics")
    def analytics():
        return service.analytics()

    @app.post("/api/benchmark")
    def benchmark(payload: RouteRequest):
        return service.benchmark(payload.model_dump(exclude_none=True))

    @app.get("/api/scenarios")
    def scenarios():
        return service.scenarios()

    @app.post("/api/scenarios/run")
    def run_scenario(payload: ScenarioRequest):
        return service.run_scenario(payload.model_dump())

    @app.get("/api/settings")
    def settings():
        return service.get_settings()

    @app.put("/api/settings")
    def update_settings(payload: SettingsUpdate):
        return service.update_settings(payload.model_dump(exclude_none=True))

    @app.get("/api/history/routes")
    def route_history(limit: int = 20):
        return service.route_history(limit)

    if FRONTEND_DIST.exists():
        assets = FRONTEND_DIST / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API endpoint not found")
            target = FRONTEND_DIST / full_path
            if full_path and target.exists() and target.is_file():
                return FileResponse(target)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.api:app", host="127.0.0.1", port=int(os.environ.get("PORT", "8787")), reload=False)
