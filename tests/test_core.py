"""Tests for FlowGrid's graph, routing and simulation core."""
from __future__ import annotations

import unittest
from pathlib import Path

from app.algorithms import Graph, ant_colony, astar, dijkstra, make_objective, yen_k_shortest
from app.network_data import NODE_BY_ID, ROADS, validate_network
from app.service import ServiceError, TrafficService
from app.traffic import TrafficEngine

RUNTIME = Path(__file__).parent / ".runtime"
RUNTIME.mkdir(exist_ok=True)


class NetworkTests(unittest.TestCase):
    def test_network_is_structurally_valid(self):
        self.assertEqual(validate_network(), [])
        self.assertGreaterEqual(len(NODE_BY_ID), 25)
        self.assertGreaterEqual(len(ROADS), 60)

    def test_all_destinations_reachable(self):
        from app.service import TrafficService

        service = TrafficService(str(RUNTIME / "network.db"))
        try:
            graph, _ = service._graph_and_nodes()
            objective = make_objective("time")
            for origin in graph.nodes:
                for destination in graph.nodes:
                    if origin == destination:
                        continue
                    result = dijkstra(graph, origin, destination, objective)
                    self.assertIsNotNone(result, f"{origin} cannot reach {destination}")
        finally:
            service.close()


class AlgorithmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = TrafficService(str(RUNTIME / "algorithms.db"))
        cls.graph, cls.nodes = cls.service._graph_and_nodes()

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def test_astar_matches_dijkstra_cost_for_time(self):
        objective = make_objective("time")
        for origin, destination in [("N06", "N15"), ("N01", "N19"), ("N18", "N05"), ("N16", "N10")]:
            d = dijkstra(self.graph, origin, destination, objective)
            a = astar(self.graph, origin, destination, objective)
            self.assertIsNotNone(d)
            self.assertIsNotNone(a)
            self.assertAlmostEqual(d.cost, a.cost, places=5)

    def test_astar_matches_dijkstra_cost_for_distance(self):
        objective = make_objective("distance")
        d = dijkstra(self.graph, "N02", "N19", objective)
        a = astar(self.graph, "N02", "N19", objective)
        self.assertIsNotNone(d)
        self.assertIsNotNone(a)
        self.assertAlmostEqual(d.cost, a.cost, places=5)

    def test_yen_returns_unique_loopless_routes(self):
        objective = make_objective("time")
        routes = yen_k_shortest(self.graph, "N06", "N15", objective, k=5)
        self.assertGreaterEqual(len(routes), 3)
        signatures = {tuple(route.nodes) for route in routes}
        self.assertEqual(len(signatures), len(routes))
        for route in routes:
            self.assertEqual(len(route.nodes), len(set(route.nodes)), "route contains a loop")

    def test_objective_changes_route_or_metrics(self):
        time_route = self.service.optimize({"origin": "N06", "destination": "N15", "algorithm": "dijkstra", "objective": "time"})["recommended"]
        distance_route = self.service.optimize({"origin": "N06", "destination": "N15", "algorithm": "dijkstra", "objective": "distance"})["recommended"]
        self.assertLessEqual(distance_route["distance_km"], time_route["distance_km"] + 0.001)
        self.assertTrue(
            distance_route["path"] != time_route["path"] or distance_route["travel_time_min"] >= time_route["travel_time_min"] - 0.001
        )

    def test_ant_colony_finds_a_route(self):
        objective = make_objective("time")
        result = ant_colony(self.graph, "N06", "N15", objective, seed=7, ants=12, iterations=18)
        self.assertIsNotNone(result)
        self.assertEqual(result.nodes[0], "N06")
        self.assertEqual(result.nodes[-1], "N15")

    def test_unreachable_when_all_outgoing_closed(self):
        # Block every edge into North Gate's first hop from a tiny artificial graph.
        roads = {
            "X1": {
                "id": "X1", "from": "N01", "to": "N02", "name": "Test", "road_class": "arterial",
                "distance_km": 1, "speed_limit": 50, "effective_speed_kph": 50, "travel_time_min": 1.2,
                "congestion": 0, "congestion_level": "free", "status": "open", "capacity": 1000,
                "lanes": 1, "one_way": "forward",
            }
        }
        nodes = {
            "N01": {"id": "N01", "name": "A", "x": 0, "y": 0},
            "N03": {"id": "N03", "name": "B", "x": 1, "y": 1},
        }
        graph = Graph(roads, nodes)
        self.assertIsNone(dijkstra(graph, "N01", "N03", make_objective("time")))


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = RUNTIME
        self.services: list[TrafficService] = []

    def tearDown(self):
        for service in self.services:
            service.close()

    def _service(self, name: str) -> TrafficService:
        service = TrafficService(str(self.tmp / f"{name}.db"))
        self.services.append(service)
        return service

    def test_seeded_simulation_is_reproducible(self):
        first = TrafficEngine(seed=123)
        second = TrafficEngine(seed=123)
        first.run_scenario("peak_hour", 123)
        second.run_scenario("peak_hour", 123)
        self.assertEqual(first.status()["summary"], second.status()["summary"])
        first.tick(3)
        second.tick(3)
        self.assertEqual(first.status()["summary"], second.status()["summary"])

    def test_closure_changes_graph_and_routes(self):
        service = self._service("closure")
        before = service.optimize({"origin": "N06", "destination": "N15", "algorithm": "dijkstra", "objective": "time"})
        blocked_road = before["recommended"]["segments"][0]["road_id"]
        service.close_road({"road_id": blocked_road, "duration_min": 90, "reason": "test"})
        after = service.optimize({"origin": "N06", "destination": "N15", "algorithm": "dijkstra", "objective": "time"})
        self.assertNotIn(blocked_road, {segment["road_id"] for segment in after["recommended"]["segments"]})
        self.assertNotEqual(before["recommended"]["path"], after["recommended"]["path"])
        service.open_road({"road_id": blocked_road})
        reopened = service.optimize({"origin": "N06", "destination": "N15", "algorithm": "dijkstra", "objective": "time"})
        self.assertEqual(before["recommended"]["path"], reopened["recommended"]["path"])

    def test_incident_modifies_speed(self):
        engine = TrafficEngine(seed=42)
        engine.run_scenario("normal", 42)
        road_before = engine.road_state["R17"]["effective_speed_kph"]
        engine.add_incident("R17", "accident", "high", 60)
        road_after = engine.road_state["R17"]["effective_speed_kph"]
        self.assertLess(road_after, road_before)

    def test_scenario_run_and_settings_persist(self):
        service = self._service("scenario")
        result = service.run_scenario({"scenario": "accident", "seed": 11})
        self.assertGreaterEqual(len(result["traffic"]["incidents"]), 1)
        self.assertIsNotNone(result["route"])
        saved = service.update_settings({"default_algorithm": "dijkstra", "default_objective": "eco"})
        self.assertEqual(saved["default_algorithm"], "dijkstra")
        reopened = TrafficService(str(self.tmp / "scenario.db"))
        self.services.append(reopened)
        self.assertEqual(reopened.get_settings()["default_objective"], "eco")

    def test_benchmark_measures_all_methods(self):
        service = self._service("bench")
        result = service.benchmark({"origin": "N06", "destination": "N15", "objective": "time"})
        names = {row["name"] for row in result["results"]}
        self.assertEqual(names, {"Dijkstra", "A* search", "Yen K=3", "Ant colony"})
        for row in result["results"]:
            self.assertEqual(row["status"], "ok")
            self.assertGreater(row["execution_ms"], 0)
            self.assertIsInstance(row["explored_nodes"], int)


if __name__ == "__main__":
    unittest.main()
