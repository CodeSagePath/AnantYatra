import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from planner import PlannerError, load_config, plan_trip
from route_validation import validate_plan_route_legs
from test_planner import encode_polyline, poi_record, source_record


class RouteValidationTests(unittest.TestCase):
    def setUp(self):
        self.config = load_config(Path(__file__).resolve().parents[1] / "configs/planner.toml")
        self.route = {
            "schemaVersion": "1.0",
            "routeId": "synthetic-route",
            "mode": "car",
            "engine": {"name": "Valhalla", "version": "test"},
            "snapshotId": "synthetic-snapshot",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 3600,
            "geometry": encode_polyline([(12.95, 77.6), (12.95, 74.8)]),
            "legs": [
                {
                    "from": "origin",
                    "to": "destination",
                    "distanceMeters": 350_000,
                    "durationSeconds": 8 * 3600,
                }
            ],
        }
        self.request = {
            "schemaVersion": "1.0",
            "requestId": "validation-test",
            "origin": {"label": "start"},
            "destination": {"label": "end"},
            "startDate": "2026-11-01",
            "durationDays": 3,
            "travelerCount": 1,
            "vehicle": {"mode": "car"},
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
        self.source_id = "validation-source"
        self.pois = [poi_record("validation-stop", self.source_id, 12.95, 77.2)]
        self.sources = [source_record(self.source_id)]
        self.plan = plan_trip(self.request, self.route, self.pois, self.sources, self.config)

    def test_populates_each_day_with_mode_specific_validated_legs(self):
        observed_costings = []

        def route_client(locations, costing):
            observed_costings.append(costing)
            return [
                {"distanceMeters": 25_000, "durationSeconds": 900}
                for _ in range(len(locations) - 1)
            ]

        plan = validate_plan_route_legs(
            self.plan, self.request, self.route, self.pois, self.config, route_client
        )

        self.assertEqual(plan["extensions"]["routeLegValidation"], "valhalla_passed")
        self.assertEqual(observed_costings, ["auto", "auto", "auto"])
        self.assertTrue(all(day["legs"] for day in plan["days"]))
        self.assertEqual(plan["days"][0]["legs"][0]["distanceMeters"], 25_000)
        self.assertIn("checked route feasibility", plan["uncertainties"][-1])

    def test_rejects_invalid_route_metrics(self):
        def invalid_route_client(locations, _costing):
            return [
                {"distanceMeters": 0, "durationSeconds": 900}
                for _ in range(len(locations) - 1)
            ]

        with self.assertRaisesRegex(PlannerError, "route_validation_invalid_leg_metrics"):
            validate_plan_route_legs(
                self.plan,
                self.request,
                self.route,
                self.pois,
                self.config,
                invalid_route_client,
            )


if __name__ == "__main__":
    unittest.main()
