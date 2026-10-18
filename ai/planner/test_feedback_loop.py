"""Tests for durable feedback, human verification, and opt-in curation."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from feedback_loop import (
    aggregate_independent_reports,
    append_feedback_review,
    append_training_candidate_review,
    append_event,
    apply_verified_correction,
    approved_training_examples,
    export_approved_training_examples,
    queue_training_candidate,
    read_jsonl,
    store_feedback_event,
)
from planner import PlannerError


def source_record(source_id: str = "source-1") -> dict:
    return {
        "schemaVersion": "1.0",
        "sourceRecordId": source_id,
        "sourceName": "Reviewed field report",
        "sourceType": "user_report",
        "maintainer": "data review team",
        "sourceUri": "https://example.org/field-report",
        "license": "Permission granted for runtime and training use",
        "licenseReview": {
            "status": "approved",
            "reviewedAt": "2026-10-18T10:00:00Z",
            "reviewer": "reviewer-token",
            "rationale": "Explicit permission was recorded.",
        },
        "sourceStatus": "active",
        "fetchedAt": "2026-10-18T10:00:00Z",
        "publishedAt": None,
        "lastVerifiedAt": "2026-10-18T10:00:00Z",
        "permittedUses": ["runtime_search", "display", "training", "evaluation"],
        "refreshFrequency": "manual",
        "retentionPolicy": "retain while permission remains active",
    }


def consent(status: str = "granted") -> dict:
    return {
        "schemaVersion": "1.0",
        "consentRecordId": "consent-1",
        "subjectToken": "subject-token-1",
        "purpose": "model_training",
        "status": status,
        "policyVersion": "1",
        "noticeVersion": "1",
        "occurredAt": "2026-10-18T10:00:00Z",
        "withdrawnAt": "2026-10-19T10:00:00Z" if status == "withdrawn" else None,
    }


def feedback_event(event_id: str = "feedback-1", reporter: str = "reporter-1") -> dict:
    return {
        "schemaVersion": "1.0",
        "eventId": event_id,
        "targetType": "poi",
        "targetId": "poi-1",
        "categoryId": "hours_inaccurate",
        "comment": "The listed hours are out of date.",
        "occurredAt": "2026-10-18T10:00:00Z",
        "reviewState": "pending",
        "trainingConsent": False,
        "reporterToken": reporter,
    }


def feedback_review(decision: str = "verified") -> dict:
    return {
        "schemaVersion": "1.0",
        "reviewId": "review-1",
        "feedbackEventId": "feedback-1",
        "decision": decision,
        "reviewerToken": "staff-token-1",
        "reviewedAt": "2026-10-18T11:00:00Z",
        "rationale": "The venue confirmed the current hours.",
        "evidenceSourceRecordIds": ["source-1"],
    }


def poi_record() -> dict:
    return {
        "schemaVersion": "1.0",
        "poiId": "poi-1",
        "displayName": "Quiet Garden",
        "category": "restaurant",
        "location": {"latitude": 12.0, "longitude": 77.0},
        "facilities": {"parking": "available"},
        "openingHours": "09:00-18:00",
        "quality": {
            "state": "source_confirmed",
            "confidence": 0.7,
            "updatedAt": "2026-10-01T00:00:00Z",
            "lastVerifiedAt": "2026-10-01T00:00:00Z",
        },
        "evidence": [
            {"sourceRecordId": "source-1", "fact": "Restaurant listing.", "observedAt": "2026-10-01T00:00:00Z"}
        ],
    }


def training_candidate() -> dict:
    return {
        "schemaVersion": "1.0",
        "candidateId": "candidate-1",
        "candidateType": "meaningful_edit",
        "dataOrigin": "user_opt_in",
        "messages": [
            {"role": "user", "content": "Plan a quiet family lunch stop."},
            {"role": "assistant", "content": "Use poiId poi-1; the verified hours fit the schedule."},
        ],
        "sourceRecordIds": ["source-1"],
        "consentRecordIds": ["consent-1"],
        "originEventIds": ["feedback-1"],
        "createdAt": "2026-10-18T10:00:00Z",
        "dataset": {
            "corridorId": "blr-mlr",
            "scenarioFamily": "family-lunch",
            "sourceSnapshotId": "snapshot-1",
        },
    }


class FeedbackLoopTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[2]
        self.taxonomy = json.loads((self.root / "ai/configs/feedback-taxonomy.json").read_text())

    def assert_code(self, expected_code: str, operation) -> None:
        with self.assertRaises(PlannerError) as raised:
            operation()
        self.assertEqual(raised.exception.code, expected_code)

    def test_append_only_event_store_is_idempotent_and_rejects_conflicts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private" / "feedback.jsonl"
            event = {"eventId": "f-1", "value": 1}
            self.assertTrue(append_event(path, event, "eventId"))
            self.assertFalse(append_event(path, event, "eventId"))
            self.assert_code(
                "event_id_conflict",
                lambda: append_event(path, {"eventId": "f-1", "value": 2}, "eventId"),
            )
            self.assertEqual(read_jsonl(path), [event])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)

    def test_feedback_storage_requires_active_consent_and_rejects_direct_identifiers(self) -> None:
        event = feedback_event()
        event["trainingConsent"] = True
        event["extensions"] = {"consentRecordId": "consent-1"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feedback.jsonl"
            self.assertTrue(store_feedback_event(event, self.taxonomy, {"consent-1": consent()}, path))
            withdrawn = consent("withdrawn")
            self.assert_code(
                "training_consent_not_active",
                lambda: store_feedback_event(event, self.taxonomy, {"consent-1": withdrawn}, path.with_name("other.jsonl")),
            )
            private_comment = feedback_event("feedback-2")
            private_comment["comment"] = "Call me at person@example.com"
            self.assert_code(
                "feedback_comment_contains_direct_identifier",
                lambda: store_feedback_event(private_comment, self.taxonomy, {}, path.with_name("private.jsonl")),
            )

    def test_independent_report_count_uses_distinct_pseudonymous_tokens(self) -> None:
        events = [
            feedback_event("f-1", "r-1"),
            feedback_event("f-2", "r-1"),
            feedback_event("f-3", "r-2"),
            feedback_event("f-4", "r-3"),
        ]
        results = aggregate_independent_reports(events, minimum_reporters=3)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["independentReporterCount"], 3)
        self.assertTrue(results[0]["requiresHumanVerification"])
        self.assertNotIn("comment", results[0])

    def test_review_store_requires_existing_feedback_event(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "reviews.jsonl"
            self.assert_code(
                "feedback_event_not_found",
                lambda: append_feedback_review(feedback_review(), [], path),
            )
            self.assertTrue(append_feedback_review(feedback_review(), [feedback_event()], path))

    def test_verified_correction_updates_copy_and_preserves_previous_fact(self) -> None:
        poi = poi_record()
        correction = {
            "schemaVersion": "1.0",
            "correctionId": "correction-1",
            "poiId": "poi-1",
            "factPath": "openingHours",
            "previousValue": "09:00-18:00",
            "correctedValue": "08:00-20:00",
            "feedbackEventIds": ["feedback-1"],
            "verificationSourceRecordIds": ["source-1"],
            "verifiedByToken": "staff-token-1",
            "verifiedAt": "2026-10-18T11:00:00Z",
        }
        updated = apply_verified_correction(
            poi, correction, [feedback_event()], [feedback_review()], [source_record()]
        )
        self.assertEqual(poi["openingHours"], "09:00-18:00")
        self.assertEqual(updated["openingHours"], "08:00-20:00")
        self.assertEqual(updated["extensions"]["factHistory"][0]["previousValue"], "09:00-18:00")
        self.assertEqual(updated["quality"]["state"], "source_confirmed")

    def test_correction_requires_latest_review_to_be_verified_and_prevents_stale_write(self) -> None:
        correction = {
            "schemaVersion": "1.0", "correctionId": "correction-1", "poiId": "poi-1",
            "factPath": "facilities.parking", "previousValue": "available", "correctedValue": "unavailable",
            "feedbackEventIds": ["feedback-1"], "verificationSourceRecordIds": ["source-1"],
            "verifiedByToken": "staff-token-1", "verifiedAt": "2026-10-18T11:00:00Z",
        }
        rejected_later = feedback_review("rejected")
        rejected_later["reviewedAt"] = "2026-10-18T12:00:00Z"
        self.assert_code(
            "correction_feedback_not_verified",
            lambda: apply_verified_correction(poi_record(), correction, [feedback_event()], [feedback_review(), rejected_later], [source_record()]),
        )
        correction["previousValue"] = "unknown"
        self.assert_code(
            "correction_previous_value_mismatch",
            lambda: apply_verified_correction(poi_record(), correction, [feedback_event()], [feedback_review()], [source_record()]),
        )

    def test_candidate_queue_requires_training_permission_and_consent(self) -> None:
        candidate = training_candidate()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private" / "training-candidates.jsonl"
            self.assertTrue(queue_training_candidate(candidate, {"consent-1": consent()}, [source_record()], path))
            self.assertFalse(queue_training_candidate(candidate, {"consent-1": consent()}, [source_record()], path))
            self.assert_code(
                "training_candidate_consent_not_active",
                lambda: queue_training_candidate(candidate, {"consent-1": consent("withdrawn")}, [source_record()], path.with_name("withdrawn.jsonl")),
            )

    def test_candidate_review_is_recorded_and_export_rechecks_withdrawal(self) -> None:
        candidate = training_candidate()
        review = {
            "schemaVersion": "1.0", "reviewId": "candidate-review-1", "candidateId": "candidate-1",
            "decision": "approved", "reviewerToken": "human-reviewer-1",
            "reviewedAt": "2026-10-18T12:00:00Z", "rationale": "Reviewed against the source snapshot.",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            review_path = root / "private" / "candidate-reviews.jsonl"
            self.assertTrue(append_training_candidate_review(review, [candidate], review_path))
            export_path = root / "private" / "intake.jsonl"
            examples = export_approved_training_examples(
                [candidate], [review], {"consent-1": consent()}, [source_record()], export_path
            )
            self.assertEqual(len(examples), 1)
            self.assertEqual(json.loads(export_path.read_text())["exampleId"], "candidate-1")
            self.assertEqual(export_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                export_approved_training_examples(
                    [candidate], [review], {"consent-1": consent("withdrawn")}, [source_record()], export_path
                ),
                [],
            )
            self.assertEqual(export_path.read_text(), "")

    def test_only_human_approved_candidates_become_training_examples(self) -> None:
        candidate = training_candidate()
        review = {
            "schemaVersion": "1.0", "reviewId": "candidate-review-1", "candidateId": "candidate-1",
            "decision": "approved", "reviewerToken": "human-reviewer-1",
            "reviewedAt": "2026-10-18T12:00:00Z", "rationale": "The plan and evidence were checked.",
        }
        examples = approved_training_examples(
            [candidate], [review], {"consent-1": consent()}, [source_record()]
        )
        self.assertEqual(len(examples), 1)
        self.assertEqual(examples[0]["provenance"]["consentState"], "opted_in")
        self.assertEqual(examples[0]["extensions"]["dataset"]["reviewedBy"], "human-reviewer-1")
        self.assertEqual(approved_training_examples([candidate], [], {"consent-1": consent()}, [source_record()]), [])
        self.assertEqual(approved_training_examples([candidate], [review], {"consent-1": consent("withdrawn")}, [source_record()]), [])


if __name__ == "__main__":
    unittest.main()
