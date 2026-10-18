"""Scenario checks for evaluation metrics and release-gate detection."""

import sys
import json
import tempfile
import unittest
from pathlib import Path

EVALUATION_DIR = Path(__file__).resolve().parent
PLANNER_DIR = EVALUATION_DIR.parent / "planner"
sys.path.insert(0, str(EVALUATION_DIR))
sys.path.insert(0, str(PLANNER_DIR))

from evaluate_planner import load_cases, plan_case, run, score_plan  # noqa: E402
from test_planner import encode_polyline, poi_record, source_record  # noqa: E402
from planner import load_config  # noqa: E402

PROJECT_ROOT = EVALUATION_DIR.parents[1]


class PlannerEvaluationTests(unittest.TestCase):
    def setUp(self):
        source_id = "evaluation-source"
        route_points = [(12.95, 77.6), (12.95, 77.0), (12.95, 76.4), (12.95, 75.8), (12.95, 75.2), (12.95, 74.8)]
        route = {
            "schemaVersion": "1.0",
            "routeId": "evaluation-route",
            "engine": {"name": "Valhalla", "version": "evaluation-fixture"},
            "snapshotId": "evaluation-route-snapshot",
            "distanceMeters": 350_000,
            "durationSeconds": 8 * 60 * 60,
            "geometry": encode_polyline(route_points),
            "legs": [{"from": "origin", "to": "destination", "distanceMeters": 350_000, "durationSeconds": 8 * 60 * 60}],
        }
        request = {
            "schemaVersion": "1.0",
            "requestId": "evaluation-request",
            "origin": {"label": "origin", "latitude": 12.95, "longitude": 77.6},
            "destination": {"label": "destination", "latitude": 12.95, "longitude": 74.8},
            "startDate": "2026-11-01",
            "durationDays": 3,
            "travelerCount": 2,
            "vehicle": {"mode": "car"},
            "preferences": {
                "interests": ["food"],
                "food": [],
                "requiredFacilities": ["toilets"],
                "avoid": [],
                "pace": "balanced",
                "accommodationNeeded": False,
            },
            "safety": {"profile": "balanced"},
        }
        on_route = poi_record("evaluation-on-route", source_id, 12.95, 77.2)
        on_route["facilities"] = {"toilets": "available"}
        self.case = {
            "schemaVersion": "1.0",
            "caseId": "synthetic-route-grounding",
            "input": {
                "request": request,
                "route": route,
                "pois": [on_route],
                "sources": [source_record(source_id)],
            },
            "expectations": {
                "exactPoiIds": ["evaluation-on-route"],
                "forbiddenPoiIds": [],
                "expectedRequirementGaps": [],
            },
        }
        self.config = load_config(PROJECT_ROOT / "ai/configs/planner.toml")

    def test_scores_grounded_selection_and_flags_unvalidated_route_legs(self):
        plan, latency, failure = plan_case(self.case, self.config)
        result = score_plan(self.case, plan, latency, failure, self.config)

        self.assertTrue(result["checks"]["noInventedPoiIds"])
        self.assertTrue(result["checks"]["evidenceGrounded"])
        self.assertTrue(result["checks"]["exactPoiMatch"])
        self.assertTrue(result["checks"]["requiredFacilitiesRespected"])
        self.assertFalse(result["checks"]["routeLegsValidated"])

    def test_detects_unknown_poi_inserted_into_a_plan(self):
        plan, latency, failure = plan_case(self.case, self.config)
        plan["days"][0]["stops"].append({
            "poiId": "invented-poi",
            "arrival": "2026-11-01T11:00:00+05:30",
            "departure": "2026-11-01T12:00:00+05:30",
            "reason": "invented fixture",
            "evidenceIds": ["invented-poi:evidence:0"],
        })

        result = score_plan(self.case, plan, latency, failure, self.config)

        self.assertEqual(result["inventedPoiIds"], ["invented-poi"])
        self.assertFalse(result["checks"]["noInventedPoiIds"])

    def test_detects_overlapping_or_inverted_stop_times(self):
        plan, latency, failure = plan_case(self.case, self.config)
        stop = plan["days"][0]["stops"][0]
        stop["departure"] = stop["arrival"]

        result = score_plan(self.case, plan, latency, failure, self.config)

        self.assertFalse(result["checks"]["timeFeasible"])

    def test_end_to_end_report_exposes_baseline_route_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            case_path = Path(directory) / "cases.jsonl"
            case_path.write_text(json.dumps(self.case) + "\n", encoding="utf-8")
            cases = load_cases(case_path)
            report = run(cases, self.config)

        self.assertEqual(report["summary"]["caseCount"], 1)
        self.assertEqual(report["summary"]["failedPlanningCount"], 0)
        self.assertTrue(report["summary"]["hardGates"]["zeroInventedPoiIds"])
        self.assertFalse(report["summary"]["hardGates"]["allRouteLegsValidated"])

    def test_rejects_sources_without_evaluation_permission(self):
        with tempfile.TemporaryDirectory() as directory:
            case_path = Path(directory) / "cases.jsonl"
            self.case["input"]["sources"][0]["permittedUses"].remove("evaluation")
            case_path.write_text(json.dumps(self.case) + "\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "not approved for evaluation"):
                load_cases(case_path)


if __name__ == "__main__":
    unittest.main()
