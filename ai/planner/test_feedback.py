"""Tests that feedback options can be versioned and changed by configuration."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from feedback import validate_feedback_event  # noqa: E402
from planner import PlannerError  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class FeedbackTaxonomyTests(unittest.TestCase):
    def setUp(self):
        self.taxonomy = json.loads(
            (PROJECT_ROOT / "ai/configs/feedback-taxonomy.json").read_text()
        )
        self.event = {
            "schemaVersion": "1.0",
            "eventId": "feedback-1",
            "targetType": "plan_stop",
            "targetId": "poi-1",
            "categoryId": "helpful",
            "occurredAt": "2026-11-01T09:00:00Z",
            "reviewState": "pending",
            "trainingConsent": False,
        }

    def test_enabled_feedback_category_is_accepted(self):
        validate_feedback_event(self.event, self.taxonomy)

    def test_category_can_be_disabled_or_replaced_by_taxonomy_revision(self):
        self.taxonomy["version"] = 2
        self.taxonomy["categories"] = [
            {"categoryId": "great_stop", "label": "Great stop", "enabled": True}
        ]

        with self.assertRaises(PlannerError):
            validate_feedback_event(self.event, self.taxonomy)

        self.event["categoryId"] = "great_stop"
        validate_feedback_event(self.event, self.taxonomy)

    def test_training_consent_requires_a_consent_record_reference(self):
        self.event["trainingConsent"] = True

        with self.assertRaisesRegex(PlannerError, "feedback_training_consent_record_required"):
            validate_feedback_event(self.event, self.taxonomy)


if __name__ == "__main__":
    unittest.main()
