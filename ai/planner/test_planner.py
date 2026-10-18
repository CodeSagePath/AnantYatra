"""Scenario tests for route-aware filtering and planner safety gates."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from planner import PlannerError, approved_runtime_source_ids, load_config, plan_trip
from cli import main as planner_cli_main

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def encode_polyline(points: list[tuple[float, float]], precision: int = 6) -> str:
    previous_latitude = 0
    previous_longitude = 0
    encoded = []
    scale = 10**precision
    for latitude, longitude in points:
        latitude_value = round(latitude * scale)
        longitude_value = round(longitude * scale)
        encoded.extend(_encode_delta(latitude_value - previous_latitude))
        encoded.extend(_encode_delta(longitude_value - previous_longitude))
        previous_latitude = latitude_value
        previous_longitude = longitude_value
    return "".join(encoded)


def _encode_delta(delta: int) -> str:
    value = ~(delta << 1) if delta < 0 else delta << 1
    encoded = []
    while value >= 0x20:
        encoded.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    encoded.append(chr(value + 63))
    return "".join(encoded)


def source_record(source_id: str, approved: bool = True) -> dict:
    review_status = "approved" if approved else "pending"
    uses = ["runtime_search", "display"] if approved else ["local_processing", "attribution"]
    return {
        "schemaVersion": "1.0",
        "sourceRecordId": source_id,
        "sourceName": "Synthetic planner test source",
        "sourceType": "curated",
        "maintainer": "Tests",
        "license": "test-only",
        "licenseReview": {
            "status": review_status,
            "reviewedAt": "2026-10-18T00:00:00Z",
            "reviewer": "Tests",
            "rationale": "Synthetic test record.",
        },
        "sourceStatus": "active",
        "fetchedAt": "2026-10-18T00:00:00Z",
        "permittedUses": uses,
        "refreshFrequency": "test fixture",
        "retentionPolicy": "test fixture",
    }


def poi_record(
    poi_id: str,
    source_id: str,
    latitude: float,
    longitude: float,
    category: str = "restaurant",
    facilities: dict | None = None,
) -> dict:
    return {
        "schemaVersion": "1.0",
        "poiId": poi_id,
        "displayName": f"Synthetic {category.replace('_', ' ').title()}",
        "category": category,
        "location": {"latitude": latitude, "longitude": longitude},
        "facilities": facilities or {},
        "openingHours": None,
        "priceRange": None,
        "quality": {
            "state": "source_confirmed",
            "confidence": 0.9,
            "updatedAt": "2026-10-18T00:00:00Z",
            "lastVerifiedAt": "2026-10-18T00:00:00Z",
        },
        "evidence": [
            {
                "sourceRecordId": source_id,
                "fact": "Synthetic fixture record.",
                "observedAt": "2026-10-18T00:00:00Z",
            }
        ],
    }


class PlannerScenarioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_config(PROJECT_ROOT / "ai/configs/planner.toml")
        self.source_id = "synthetic-approved-source"
        route_points = [
            (12.95, 77.6),
            (12.95, 77.0),
            (12.95, 76.4),
            (12.95, 75.8),
            (12.95, 75.2),
            (12.95, 74.8),
        ]
        self.route = {
            "schemaVersion": "1.0",
            "routeId": "synthetic-bengaluru-mangaluru-route",
            "engine": {"name": "Valhalla", "version": "test-fixture"},
            "snapshotId": "synthetic-route-snapshot",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 60 * 60,
            "geometry": encode_polyline(route_points),
            "legs": [
                {
                    "from": "Bengaluru fixture coordinate",
                    "to": "Mangaluru fixture coordinate",
                    "distanceMeters": 350_000,
                    "durationSeconds": 8 * 60 * 60,
                }
            ],
        }
        self.request = {
            "schemaVersion": "1.0",
            "requestId": "synthetic-request-001",
            "origin": {"label": "Bengaluru fixture", "latitude": 12.95, "longitude": 77.6},
            "destination": {"label": "Mangaluru fixture", "latitude": 12.95, "longitude": 74.8},
            "startDate": "2026-11-01",
            "durationDays": 3,
            "travelerCount": 2,
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
        self.pois = [
            poi_record("synthetic-on-route", self.source_id, 12.95, 77.2),
            poi_record(
                "synthetic-off-route",
                self.source_id,
                13.25,
                76.0,
                facilities={"toilets": "available"},
            ),
            poi_record(
                "synthetic-unknown-facility",
                self.source_id,
                12.95,
                75.7,
                facilities={"toilets": "unknown"},
            ),
        ]

    def test_selects_only_approved_on_route_pois_and_returns_draft(self) -> None:
        self.request["preferences"]["requiredFacilities"] = ["toilets"]
        self.pois[0]["facilities"] = {"toilets": "available"}
        plan = plan_trip(
            self.request,
            self.route,
            self.pois,
            [source_record(self.source_id)],
            self.config,
        )

        stops = [stop for day in plan["days"] for stop in day["stops"]]
        self.assertEqual(plan["status"], "draft")
        self.assertEqual([stop["poiId"] for stop in stops], ["synthetic-on-route"])
        self.assertEqual(plan["extensions"]["routeLegValidation"], "not_run")
        self.assertFalse(any(day["legs"] for day in plan["days"]))
        self.assertIn(self.source_id, plan["extensions"]["sourceSnapshots"])
        self.assertEqual(stops[0]["arrival"][:10], "2026-11-01")
        self.assertEqual(stops[0]["evidenceIds"], ["synthetic-on-route:evidence:0"])

    def test_pending_source_cannot_supply_runtime_candidates(self) -> None:
        plan = plan_trip(
            self.request,
            self.route,
            [poi_record("pending-poi", "pending-source", 12.95, 77.2)],
            [source_record("pending-source", approved=False)],
            self.config,
        )

        self.assertEqual(plan["extensions"]["selectedPoiCount"], 0)
        self.assertTrue(any("No candidates" in text for text in plan["uncertainties"]))

    def test_current_osm_source_is_not_runtime_approved(self) -> None:
        source_path = PROJECT_ROOT / "ai/data/source-register.jsonl"
        sources = [
            json.loads(line)
            for line in source_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

        eligible_source_ids = approved_runtime_source_ids(sources)

        self.assertNotIn("osmfr-karnataka-20261017", eligible_source_ids)

    def test_accommodation_request_reserves_one_stay_per_overnight(self) -> None:
        self.request["preferences"]["accommodationNeeded"] = True
        stays = [
            poi_record("synthetic-hotel-night-one", self.source_id, 12.95, 76.67, "hotel"),
            poi_record("synthetic-hotel-night-two", self.source_id, 12.95, 75.73, "hotel"),
        ]
        plan = plan_trip(
            self.request,
            self.route,
            stays,
            [source_record(self.source_id)],
            self.config,
        )

        overnight_stops = [
            stop
            for day in plan["days"]
            for stop in day["stops"]
            if stop["poiId"].startswith("synthetic-hotel-")
        ]
        self.assertEqual(len(overnight_stops), 2)
        self.assertEqual(overnight_stops[0]["departure"][:10], "2026-11-02")
        self.assertEqual(overnight_stops[1]["departure"][:10], "2026-11-03")
        self.assertEqual(plan["extensions"]["requirementGaps"], [])

    def test_candidates_beyond_configured_day_end_are_not_scheduled(self) -> None:
        self.request["durationDays"] = 1
        self.route["durationSeconds"] = 16 * 60 * 60
        self.route["legs"][0]["durationSeconds"] = 16 * 60 * 60
        late_poi = poi_record(
            "synthetic-late-stop", self.source_id, 12.95, 75.05
        )
        plan = plan_trip(
            self.request,
            self.route,
            [late_poi],
            [source_record(self.source_id)],
            self.config,
        )

        self.assertEqual(plan["extensions"]["selectedPoiCount"], 0)
        self.assertEqual(
            plan["extensions"]["scheduleExcludedPoiIds"], ["synthetic-late-stop"]
        )

    def test_request_over_daily_driving_limit_is_rejected(self) -> None:
        self.request["durationDays"] = 1
        self.request["dailyDrivingLimitHours"] = 4
        with self.assertRaises(PlannerError) as error:
            plan_trip(
                self.request,
                self.route,
                [],
                [source_record(self.source_id)],
                self.config,
            )
        self.assertEqual(error.exception.code, "route_exceeds_daily_driving_limit")

    def test_missing_start_date_is_rejected_for_scheduled_plan(self) -> None:
        self.request.pop("startDate")
        with self.assertRaises(PlannerError) as error:
            plan_trip(
                self.request,
                self.route,
                [],
                [source_record(self.source_id)],
                self.config,
            )
        self.assertEqual(error.exception.code, "start_date_required_for_scheduled_plan")

    def test_cli_writes_a_schema_valid_draft_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_path = temporary_path / "request.json"
            route_path = temporary_path / "route.json"
            pois_path = temporary_path / "pois.jsonl"
            sources_path = temporary_path / "sources.jsonl"
            output_path = temporary_path / "draft-plan.json"
            request_path.write_text(json.dumps(self.request), encoding="utf-8")
            route_path.write_text(json.dumps(self.route), encoding="utf-8")
            pois_path.write_text(
                json.dumps(self.pois[0]) + "\n", encoding="utf-8"
            )
            sources_path.write_text(
                json.dumps(source_record(self.source_id)) + "\n", encoding="utf-8"
            )
            arguments = [
                "plan-trip",
                "--request",
                str(request_path),
                "--route",
                str(route_path),
                "--pois",
                str(pois_path),
                "--sources",
                str(sources_path),
                "--config",
                str(PROJECT_ROOT / "ai/configs/planner.toml"),
                "--output",
                str(output_path),
            ]

            with patch.object(sys, "argv", arguments):
                self.assertEqual(planner_cli_main(), 0)

            plan = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(plan["status"], "draft")
            self.assertEqual(plan["requestId"], "synthetic-request-001")


if __name__ == "__main__":
    unittest.main()
