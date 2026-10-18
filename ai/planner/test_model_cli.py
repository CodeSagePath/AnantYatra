"""Tests for grounded candidate preparation and model-output parsing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_cli import attach_provenance, find_model_candidates, parse_generated_json
from planner import build_reason, load_config

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ModelCandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = {
            "sourceRecordId": "approved-runtime-source",
            "sourceStatus": "active",
            "licenseReview": {"status": "approved"},
            "permittedUses": ["runtime_search", "display"],
        }
        self.request = {"preferences": {"interests": ["food"], "food": []}}
        self.route = [(12.95, 77.6), (12.95, 77.0), (12.95, 76.4)]
        self.config = load_config(PROJECT_ROOT / "ai/configs/planner.toml")

    def make_poi(self, poi_id: str, longitude: float, name: str = "Cafe") -> dict:
        return {
            "poiId": poi_id,
            "displayName": name,
            "category": "restaurant",
            "location": {"latitude": 12.95, "longitude": longitude},
            "facilities": {},
            "evidence": [
                {
                    "sourceRecordId": "approved-runtime-source",
                    "fact": "A reviewed synthetic fixture.",
                    "observedAt": "2026-10-18T00:00:00Z",
                }
            ],
        }

    def test_filters_to_approved_runtime_candidates_and_keeps_reason_grounded(self):
        pending = {
            **self.source,
            "sourceRecordId": "pending-source",
            "licenseReview": {"status": "pending"},
        }
        pois = [
            self.make_poi("poi-near", 77.3),
            self.make_poi("poi-platform", 77.2, "Google Maps Cafe"),
            {
                **self.make_poi("poi-pending", 77.1),
                "evidence": [{"sourceRecordId": "pending-source", "fact": "Unreviewed."}],
            },
            {
                **self.make_poi("poi-outside", 77.4),
                "location": {"latitude": 13.01, "longitude": 77.4},
            },
        ]

        candidates = find_model_candidates(
            pois,
            [self.source, pending],
            self.route,
            self.request,
            max_route_distance_meters=100,
            blocked_terms=["Google Maps"],
        )

        self.assertEqual([candidate["poiId"] for candidate in candidates], ["poi-near"])
        self.assertEqual(
            candidates[0]["allowedReason"],
            build_reason(pois[0], self.request, self.config),
        )
        self.assertEqual(candidates[0]["evidence"][0]["evidenceId"], "poi-near:evidence:0")

    def test_candidate_limit_samples_across_route_progress(self):
        pois = [
            self.make_poi(f"poi-{index}", 77.6 - index * 0.1)
            for index in range(6)
        ]

        candidates = find_model_candidates(
            pois,
            [self.source],
            self.route,
            self.request,
            max_count=3,
            max_route_distance_meters=100,
        )

        self.assertEqual(len(candidates), 3)
        progress = [candidate["routeProgress"] for candidate in candidates]
        self.assertEqual(progress, sorted(progress))
        self.assertLess(progress[0], progress[-1])

    def test_model_plan_envelope_is_grounded_and_reaches_schema_shape(self):
        poi = self.make_poi("poi-chosen", 77.3)
        candidates = find_model_candidates(
            [poi], [self.source], self.route, self.request, max_route_distance_meters=100
        )
        plan = {
            "days": [
                {
                    "dayNumber": 1,
                    "date": "2026-10-18",
                    "legs": [{"invented": True}],
                    "stops": [
                        {
                            "poiId": poi["poiId"],
                            "arrival": "2026-10-18T08:00:00",
                            "departure": "2026-10-18T09:00:00",
                            "reason": "Model wrote an unsupported detail.",
                            "evidenceIds": ["poi-chosen:evidence:0"],
                        }
                    ],
                }
            ],
            "notes": ["Keep this model note for inspection."],
            "extensions": {},
        }

        attached = attach_provenance(
            plan,
            candidates,
            [self.source],
            {"requestId": "test-request"},
            {"routeId": "test-route"},
            "test-model",
        )

        stop = attached["days"][0]["stops"][0]
        self.assertEqual(attached["schemaVersion"], "1.0")
        self.assertEqual(attached["status"], "draft")
        self.assertEqual(attached["requestId"], "test-request")
        self.assertEqual(attached["routeId"], "test-route")
        self.assertEqual(attached["days"][0]["legs"], [])
        self.assertEqual(stop["reason"], candidates[0]["allowedReason"])
        self.assertIn("uncertainties", attached)
        self.assertEqual(
            attached["extensions"]["modelNotes"], ["Keep this model note for inspection."]
        )


class ModelOutputParsingTests(unittest.TestCase):
    def test_parses_single_json_object_after_whitespace(self):
        self.assertEqual(parse_generated_json('  {"days": []}  '), {"days": []})

    def test_ignores_text_after_first_complete_json_object(self):
        self.assertEqual(
            parse_generated_json('{"days": []}\nHere is your itinerary.'),
            {"days": []},
        )

    def test_rejects_non_object_json(self):
        with self.assertRaisesRegex(ValueError, "model_output_not_object"):
            parse_generated_json('[1, 2]')


if __name__ == "__main__":
    unittest.main()
