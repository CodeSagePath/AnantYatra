"""Tests the data/evaluation gate for candidate adapter retraining."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from retraining_gate import RetrainingGateError, should_train_candidate
from suites import create_frozen_suite
from evaluation_fixtures import make_evaluation_case

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class RetrainingGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(dir=PROJECT_ROOT, prefix=".retraining-gate-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.train_file = self.root / "train.jsonl"
        self.train_file.write_text("{}\n" * 10, encoding="utf-8")
        self.dataset_dir = self.root / "dataset"
        self.dataset_dir.mkdir()
        self.dataset_manifest = {
            "counts": {"train": 10},
            "sha256": {"train.jsonl": hashlib.sha256(self.train_file.read_bytes()).hexdigest()},
            "testSetFrozen": True,
        }
        self.dataset_manifest_path = self.dataset_dir / "manifest.json"
        self.dataset_manifest_path.write_text(json.dumps(self.dataset_manifest), encoding="utf-8")
        self.suite_dir = self.root / "evaluation" / "v1"
        cases = []
        for index in range(3):
            case = json.loads(json.dumps(make_evaluation_case()))
            case["caseId"] = f"case-{index}"
            cases.append(case)
        create_frozen_suite(cases, "v1", self.suite_dir.parent)
        self.config_path = self.root / "retraining.toml"
        train_file_relative = self.train_file.relative_to(PROJECT_ROOT).as_posix()
        self.config_path.write_text(
            f"[data]\ntrain_file = \"{train_file_relative}\"\n"
            "[retraining_gate]\nminimum_train_examples = 12\n"
            "minimum_examples_for_failure_pattern = 5\n"
            "minimum_distinct_failure_cases = 3\n",
            encoding="utf-8",
        )
        suite_manifest_path = self.suite_dir / "manifest.json"
        self.decision = {
            "schemaVersion": "1.0",
            "decisionId": "decision-1",
            "action": "train_candidate",
            "reason": "recurring_failure_pattern",
            "trainExampleCount": 10,
            "datasetManifestSha256": hashlib.sha256(self.dataset_manifest_path.read_bytes()).hexdigest(),
            "evaluationSuiteManifestSha256": hashlib.sha256(suite_manifest_path.read_bytes()).hexdigest(),
            "failureCaseIds": ["case-0", "case-1", "case-2"],
            "reviewerToken": "human-reviewer-token",
            "reviewedAt": "2026-10-18T12:00:00Z",
        }
        self.decision_path = self.root / "decision.json"
        self.save_decision()

    def save_decision(self) -> None:
        self.decision_path.write_text(json.dumps(self.decision), encoding="utf-8")

    def test_allows_recurring_failure_override_with_enough_examples_and_distinct_cases(self) -> None:
        self.assertTrue(
            should_train_candidate(
                self.decision_path, self.config_path, self.dataset_dir, self.suite_dir
            )
        )

    def test_defers_when_human_decision_says_no_training(self) -> None:
        self.decision["action"] = "defer"
        self.decision["reason"] = "insufficient_evidence"
        self.decision["failureCaseIds"] = []
        self.save_decision()
        self.assertFalse(
            should_train_candidate(
                self.decision_path, self.config_path, self.dataset_dir, self.suite_dir
            )
        )

    def test_rejects_a_candidate_without_enough_examples_or_failure_cases(self) -> None:
        self.decision["reason"] = "enough_quality_data"
        self.decision["failureCaseIds"] = []
        self.save_decision()
        with self.assertRaises(RetrainingGateError) as raised:
            should_train_candidate(
                self.decision_path, self.config_path, self.dataset_dir, self.suite_dir
            )
        self.assertEqual(raised.exception.code, "quality_data_threshold_not_met")

    def test_rejects_stale_dataset_and_unknown_failure_case(self) -> None:
        self.decision["datasetManifestSha256"] = "0" * 64
        self.save_decision()
        with self.assertRaises(RetrainingGateError) as raised:
            should_train_candidate(
                self.decision_path, self.config_path, self.dataset_dir, self.suite_dir
            )
        self.assertEqual(raised.exception.code, "dataset_manifest_hash_mismatch")
        self.decision["datasetManifestSha256"] = hashlib.sha256(
            self.dataset_manifest_path.read_bytes()
        ).hexdigest()
        self.decision["failureCaseIds"] = ["unreviewed-case"]
        self.save_decision()
        with self.assertRaises(RetrainingGateError) as raised:
            should_train_candidate(
                self.decision_path, self.config_path, self.dataset_dir, self.suite_dir
            )
        self.assertEqual(raised.exception.code, "failure_case_not_in_evaluation_suite")


if __name__ == "__main__":
    unittest.main()
