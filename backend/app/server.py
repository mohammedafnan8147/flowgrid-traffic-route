"""Dependency-free HTTP adapter and static server.

This is the guaranteed local runtime: it exposes the same `/api` surface as the
FastAPI adapter and serves the built React frontend. FastAPI is the primary
deployment adapter in `api.py`; this server keeps the demo runnable on a clean
Python install with no third-party packages.
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .service import ServiceError, TrafficService

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = os.environ.get("FLOWGRID_DB", str(ROOT / "data" / "flowgrid.db"))
FRONTEND_DIST = ROOT / "frontend" / "dist"
service = TrafficService(DB_PATH)

JSON_TYPE = ("application/json; charset=utf-8",)


def _body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ServiceError(f"Invalid JSON body: {exc}", 400, "invalid_json")
    if not isinstance(value, dict):
        raise ServiceError("JSON body must be an object.", 400, "invalid_body")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "FlowGrid/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # quieter demo logs
        if os.environ.get("FLOWGRID_VERBOSE"):
            super().log_message(fmt, *args)

    def handle(self) -> None:
        # Browsers and PowerShell probes routinely close keep-alive sockets.
        # Treat that as a normal disconnect rather than a server traceback.
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    # ------------------------------------------------------------------ utils
    def _json(self, status: int, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(raw)

    def _error(self, exc: ServiceError) -> None:
        self._json(
            exc.status,
            {"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    def _file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self._json(404, {"error": {"code": "not_found", "message": "File not found"}})
            return
        data = path.read_bytes()
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix == ".js":
            ctype = "text/javascript; charset=utf-8"
        elif path.suffix == ".css":
            ctype = "text/css; charset=utf-8"
        elif path.suffix == ".svg":
            ctype = "image/svg+xml"
        elif path.suffix == ".json":
            ctype = "application/json; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        cache = "public, max-age=31536000, immutable" if path.parent.name == "assets" else "no-cache"
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _static(self, path: str) -> None:
        if not FRONTEND_DIST.exists():
            self._json(
                503,
                {"error": {"code": "frontend_not_built", "message": "Run `pnpm build` in frontend/ to build the UI."}},
            )
            return
        if path in {"", "/"}:
            self._file(FRONTEND_DIST / "index.html")
            return
        rel = path.lstrip("/")
        # Never serve outside the dist directory (including encoded traversal).
        target = (FRONTEND_DIST / rel).resolve()
        try:
            target.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            self._json(404, {"error": {"code": "not_found", "message": "Not found"}})
            return
        if target.exists() and target.is_file():
            self._file(target)
        elif re.match(r"^assets/", rel):
            self._json(404, {"error": {"code": "asset_not_found", "message": "Asset not found"}})
        else:
            # React SPA fallback for client-side routes.
            self._file(FRONTEND_DIST / "index.html")

    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                return self._json(200, service.health())
            if path == "/api/network":
                return self._json(200, service.network())
            if path == "/api/network/analysis":
                return self._json(200, service.network_analysis())
            if path == "/api/network/import" and method == "POST":
                return self._json(200, service.import_network(_body(self)))
            if path == "/api/traffic/status":
                return self._json(200, service.traffic_status())
            if path == "/api/traffic/providers":
                return self._json(200, service.providers_status())
            if path == "/api/network/import/status":
                from . import osm_adapter

                return self._json(200, osm_adapter.availability())
            if path == "/api/incidents":
                return self._json(200, service.incidents())
            if path == "/api/analytics":
                return self._json(200, service.analytics())
            if path == "/api/scenarios":
                return self._json(200, service.scenarios())
            if path == "/api/settings":
                if method == "GET":
                    return self._json(200, service.get_settings())
                if method in {"PUT", "PATCH"}:
                    return self._json(200, service.update_settings(_body(self)))
            if path == "/api/history/routes":
                limit = int(query.get("limit", ["20"])[0])
                return self._json(200, service.route_history(limit))
            if path == "/api/routes/optimize" and method == "POST":
                return self._json(200, service.optimize(_body(self)))
            if path == "/api/routes/alternatives" and method == "POST":
                result = service.optimize(_body(self))
                return self._json(
                    200,
                    {
                        "origin": result["origin"],
                        "destination": result["destination"],
                        "objective": result["objective"],
                        "recommended": result["recommended"],
                        "alternatives": result["alternatives"],
                        "comparison": result["comparison"],
                        "explanation": result["explanation"],
                    },
                )
            if path == "/api/traffic/simulate" and method == "POST":
                return self._json(200, service.simulate(_body(self)))
            if path == "/api/traffic/tick" and method == "POST":
                body = _body(self)
                return self._json(200, service.simulate({**body, "action": "tick"}))
            if path == "/api/traffic/incidents" and method == "POST":
                return self._json(200, service.create_incident(_body(self)))
            match = re.fullmatch(r"/api/traffic/incidents/([A-Za-z0-9_-]+)", path)
            if match and method == "DELETE":
                return self._json(200, service.delete_incident(match.group(1)))
            if path == "/api/traffic/close-road" and method == "POST":
                return self._json(200, service.close_road(_body(self)))
            if path == "/api/traffic/open-road" and method == "POST":
                return self._json(200, service.open_road(_body(self)))
            if path == "/api/benchmark" and method == "POST":
                return self._json(200, service.benchmark(_body(self)))
            if path == "/api/scenarios/run" and method == "POST":
                return self._json(200, service.run_scenario(_body(self)))
            if path.startswith("/api/"):
                return self._json(404, {"error": {"code": "not_found", "message": f"Unknown API endpoint: {method} {path}"}})
            if method != "GET":
                return self._json(405, {"error": {"code": "method_not_allowed", "message": "Method not allowed"}})
            return self._static(path)
        except ServiceError as exc:
            return self._error(exc)
        except (ValueError, TypeError) as exc:
            return self._json(400, {"error": {"code": "bad_request", "message": str(exc)}})
        except Exception as exc:  # pragma: no cover - defensive server boundary
            import traceback

            traceback.print_exc()
            return self._json(500, {"error": {"code": "internal_error", "message": str(exc)}})

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch("PUT")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    host = os.environ.get("FLOWGRID_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", os.environ.get("FLOWGRID_PORT", "8787")))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"FlowGrid running at http://{host}:{port}")
    print(f"Database: {DB_PATH}")
    print(f"Frontend: {FRONTEND_DIST}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping FlowGrid.")
    finally:
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
