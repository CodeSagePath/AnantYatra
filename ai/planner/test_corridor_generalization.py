"""Regression checks across varied synthetic route geometries.

These paths test route-relative planner behavior only. They are not road routes,
place recommendations, or evidence of geographic coverage.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from planner import PlannerError, load_config, plan_trip
from test_planner import encode_polyline, poi_record, source_record

PROJECT_ROOT = Path(__file__).resolve().parents[2]


SYNTHETIC_CORRIDORS = {
    "north_south": [
        (15.2, 76.0),
        (14.5, 75.9),
        (13.8, 75.7),
        (13.0, 75.4),
    ],
    "east_west": [
        (13.1, 78.0),
        (13.0, 77.2),
        (12.9, 76.4),
        (12.7, 75.6),
    ],
    "curving": [
        (13.4, 77.4),
        (13.8, 76.9),
        (13.6, 76.2),
        (13.1, 75.9),
        (12.8, 75.2),
    ],
}


class CorridorGeneralizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_config(PROJECT_ROOT / "ai/configs/planner.toml")
        self.source_id = "synthetic-corridor-source"
        self.source = source_record(self.source_id)

    def test_on_corridor_poi_is_selected_and_distant_poi_is_excluded(self) -> None:
        for corridor_name, points in SYNTHETIC_CORRIDORS.items():
            for mode in ("car", "motorcycle", "bicycle"):
                with self.subTest(corridor=corridor_name, mode=mode):
                    self._assert_corridor_selection(corridor_name, points, mode)

    def test_route_calculated_for_different_mode_is_rejected(self) -> None:
        points = SYNTHETIC_CORRIDORS["east_west"]
        route = {
            "schemaVersion": "1.0",
            "routeId": "synthetic-bicycle-route",
            "mode": "bicycle",
            "engine": {"name": "Valhalla", "version": "synthetic-fixture"},
            "snapshotId": "synthetic-only",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 60 * 60,
            "geometry": encode_polyline(points),
            "legs": [{
                "from": "synthetic origin",
                "to": "synthetic destination",
                "distanceMeters": 350_000,
                "durationSeconds": 8 * 60 * 60,
            }],
        }
        request = self._make_request("east_west", points, "motorcycle")

        with self.assertRaises(PlannerError) as error:
            plan_trip(request, route, [], [self.source], self.config)

        self.assertEqual(error.exception.code, "route_mode_mismatch")

    def test_bicycle_request_requires_a_mode_tagged_route(self) -> None:
        points = SYNTHETIC_CORRIDORS["east_west"]
        route = {
            "schemaVersion": "1.0",
            "routeId": "legacy-untyped-route",
            "engine": {"name": "Valhalla", "version": "synthetic-fixture"},
            "snapshotId": "synthetic-only",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 60 * 60,
            "geometry": encode_polyline(points),
            "legs": [{
                "from": "synthetic origin",
                "to": "synthetic destination",
                "distanceMeters": 350_000,
                "durationSeconds": 8 * 60 * 60,
            }],
        }
        request = self._make_request("east_west", points, "bicycle")

        with self.assertRaises(PlannerError) as error:
            plan_trip(request, route, [], [self.source], self.config)

        self.assertEqual(error.exception.code, "route_mode_required")

    def test_cycling_preference_prioritizes_bike_support_pois(self) -> None:
        points = SYNTHETIC_CORRIDORS["east_west"]
        route = self._make_route("east_west", points, "bicycle")
        request = self._make_request("east_west", points, "bicycle")
        request["durationDays"] = 1
        request["preferences"]["interests"] = ["cycling"]
        candidates = [
            poi_record("food-stop", self.source_id, 13.06, 77.6, "restaurant"),
            poi_record("bike-shop", self.source_id, 12.95, 76.5, "bicycle_shop"),
            poi_record("scenic-stop", self.source_id, 12.75, 75.7, "viewpoint"),
        ]

        plan = plan_trip(request, route, candidates, [self.source], self.config)

        selected_ids = {
            stop["poiId"] for day in plan["days"] for stop in day["stops"]
        }
        self.assertEqual(selected_ids, {"food-stop", "bike-shop"})

    def _assert_corridor_selection(
        self, corridor_name: str, points: list[tuple[float, float]], mode: str
    ) -> None:
        route = self._make_route(corridor_name, points, mode)
        request = self._make_request(corridor_name, points, mode)
        middle = points[len(points) // 2]
        on_route = poi_record(
            f"{corridor_name}-on-route", self.source_id, middle[0], middle[1]
        )
        distant = poi_record(
            f"{corridor_name}-distant", self.source_id, middle[0] + 1.0, middle[1] + 1.0
        )

        plan = plan_trip(
            request, route, [on_route, distant], [self.source], self.config
        )

        selected_ids = {
            stop["poiId"]
            for day in plan["days"]
            for stop in day["stops"]
        }
        self.assertEqual(selected_ids, {f"{corridor_name}-on-route"})
        self.assertEqual(
            plan["extensions"]["sourceSnapshots"][self.source_id]["licenseReviewState"],
            "approved",
        )

    @staticmethod
    def _make_route(
        corridor_name: str, points: list[tuple[float, float]], mode: str
    ) -> dict:
        return {
            "schemaVersion": "1.0",
            "routeId": f"synthetic-{corridor_name}",
            "mode": mode,
            "engine": {"name": "Valhalla", "version": "synthetic-fixture"},
            "snapshotId": "synthetic-only",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 60 * 60,
            "geometry": encode_polyline(points),
            "legs": [{
                "from": "synthetic origin",
                "to": "synthetic destination",
                "distanceMeters": 350_000,
                "durationSeconds": 8 * 60 * 60,
            }],
        }

    @staticmethod
    def _make_request(
        corridor_name: str, points: list[tuple[float, float]], mode: str
    ) -> dict:
        origin = points[0]
        destination = points[-1]
        return {
            "schemaVersion": "1.0",
            "requestId": f"request-{corridor_name}",
            "origin": {
                "label": "synthetic origin",
                "latitude": origin[0],
                "longitude": origin[1],
            },
            "destination": {
                "label": "synthetic destination",
                "latitude": destination[0],
                "longitude": destination[1],
            },
            "startDate": "2026-11-01",
            "durationDays": 3,
            "travelerCount": 2,
            "vehicle": {"mode": mode},
            "preferences": {
                "interests": ["food"],
                "food": [],
                "requiredFacilities": [],
                "avoid": [],
                "pace": "balanced",
                "accommodationNeeded": False,
            },
            "safety": {"profile": "balanced"},
        }


if __name__ == "__main__":
    unittest.main()
