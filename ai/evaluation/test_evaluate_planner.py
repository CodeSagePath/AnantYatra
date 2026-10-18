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
from evaluation_fixtures import make_evaluation_case  # noqa: E402
from planner import load_config  # noqa: E402

PROJECT_ROOT = EVALUATION_DIR.parents[1]


class PlannerEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.case = make_evaluation_case()
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

    def test_guardrail_metrics_detect_claims_prices_and_confirmed_state(self):
        plan, latency, failure = plan_case(self.case, self.config)
        stop = plan["days"][0]["stops"][0]
        stop["reason"] = "Open now and costs INR 100."
        stop["estimatedCost"] = {"currency": "INR", "minimum": 100, "maximum": 100}
        plan["status"] = "confirmed"

        result = score_plan(self.case, plan, latency, failure, self.config)

        self.assertFalse(result["checks"]["recommendationClaimsGrounded"])
        self.assertFalse(result["checks"]["pricesEvidenceBacked"])
        self.assertFalse(result["checks"]["draftOnly"])

    def test_accepts_valhalla_validated_daily_leg_ids(self):
        plan, latency, failure = plan_case(self.case, self.config)
        plan["extensions"]["routeLegValidation"] = "valhalla_passed"
        for day in plan["days"]:
            leg_count = len(day["stops"]) + 1
            day["legs"] = [
                {
                    "from": f"point-{index}",
                    "to": f"point-{index + 1}",
                    "routeId": f"{self.case['input']['route']['routeId']}-day-{day['dayNumber']}-leg-{index + 1}",
                    "distanceMeters": 1000,
                    "durationSeconds": 600,
                }
                for index in range(leg_count)
            ]

        result = score_plan(self.case, plan, latency, failure, self.config)

        self.assertTrue(result["checks"]["routeLegsValidated"])

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
