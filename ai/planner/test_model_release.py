"""Tests for evaluation-gated model promotion and adapter rollback."""

from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from model_release import (
    adapter_sha256,
    empty_registry,
    load_registry,
    promote_candidate,
    rollback_release,
    save_registry,
)
from planner import PlannerError


def write_adapter(root: Path, name: str) -> str:
    path = root / name / "adapter"
    path.mkdir(parents=True)
    (path / "adapter_config.json").write_text('{"r":4}\n')
    (path / "adapter_model.safetensors").write_bytes(f"weights-{name}".encode())
    return f"{name}/adapter"


def candidate(root: Path, release_id: str, directory: str, pass_rate: float = 0.8, latency: float = 100.0) -> dict:
    relative_path = write_adapter(root, directory)
    references = root / directory / "references"
    references.mkdir()
    dataset_path = references / "dataset-manifest.json"
    suite_path = references / "evaluation-suite-manifest.json"
    report_path = references / "evaluation-report.json"
    dataset_path.write_text('{"dataset":"approved"}\n')
    suite_path.write_text('{"suite":"frozen-v1"}\n')
    report_path.write_text('{"release":"' + release_id + '"}\n')
    sha256 = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "schemaVersion": "1.0",
        "releaseId": release_id,
        "baseModelId": "Qwen/Qwen2.5-1.5B-Instruct",
        "baseRevision": "base-revision-1",
        "adapterPath": relative_path,
        "adapterSha256": adapter_sha256(root / relative_path),
        "datasetManifestPath": str(dataset_path.relative_to(root)),
        "datasetManifestSha256": sha256(dataset_path),
        "evaluationSuiteManifestPath": str(suite_path.relative_to(root)),
        "evaluationSuiteSha256": sha256(suite_path),
        "evaluationReportPath": str(report_path.relative_to(root)),
        "evaluationReportSha256": sha256(report_path),
        "metrics": {"scenarioPassRate": pass_rate, "p95LatencyMs": latency},
        "hardGates": {
            "noInventedPoiIds": True,
            "allEvidenceGrounded": True,
            "allRouteLegsValidated": True,
            "allSourcesApproved": True,
            "noWithdrawnConsent": True,
        },
        "humanReview": {
            "decision": "approved",
            "reviewerToken": "reviewer-token",
            "reviewedAt": "2026-10-18T12:00:00Z",
        },
        "state": "candidate",
        "promotedAt": None,
    }


class ModelReleaseTests(unittest.TestCase):
    def assert_code(self, expected_code: str, operation) -> None:
        with self.assertRaises(PlannerError) as raised:
            operation()
        self.assertEqual(raised.exception.code, expected_code)

    def test_promote_requires_passing_gates_and_retains_previous_adapter_for_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = candidate(root, "release-1", "run-one")
            registry = promote_candidate(empty_registry(), first, root, "2026-10-18T13:00:00Z")
            self.assertEqual(registry["activeReleaseId"], "release-1")
            second = candidate(root, "release-2", "run-two", pass_rate=0.9, latency=105.0)
            registry = promote_candidate(registry, second, root, "2026-10-18T14:00:00Z")
            self.assertEqual(registry["activeReleaseId"], "release-2")
            self.assertEqual(registry["releases"][0]["state"], "rollback_available")
            rolled_back = rollback_release(registry, "release-1", root)
            self.assertEqual(rolled_back["activeReleaseId"], "release-1")
            self.assertEqual(rolled_back["releases"][1]["state"], "rollback_available")

    def test_promotion_rejects_hard_gate_failure_quality_regression_or_new_eval_suite(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = candidate(root, "release-1", "base", pass_rate=0.9, latency=100)
            registry = promote_candidate(empty_registry(), baseline, root)
            failed = candidate(root, "release-2", "failed", pass_rate=0.95, latency=100)
            failed["hardGates"]["allEvidenceGrounded"] = False
            self.assert_code("release_hard_gate_failed", lambda: promote_candidate(registry, failed, root))
            lower = candidate(root, "release-3", "lower", pass_rate=0.89, latency=100)
            self.assert_code("release_quality_regression", lambda: promote_candidate(registry, lower, root))
            incomparable = candidate(root, "release-4", "new-suite", pass_rate=0.95, latency=100)
            incomparable["evaluationSuiteSha256"] = "e" * 64
            self.assert_code("release_comparison_not_comparable", lambda: promote_candidate(registry, incomparable, root))

    def test_promotion_rejects_artifact_tampering_and_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = candidate(root, "release-1", "run-one")
            (root / "run-one/adapter/adapter_model.safetensors").write_bytes(b"changed")
            self.assert_code("adapter_artifact_hash_mismatch", lambda: promote_candidate(empty_registry(), first, root))
            traversal = candidate(root, "release-2", "run-two")
            traversal["adapterPath"] = "../outside"
            self.assert_code("adapter_path_invalid", lambda: promote_candidate(empty_registry(), traversal, root))

    def test_registry_persistence_is_schema_valid_and_rejects_unavailable_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry = promote_candidate(empty_registry(), candidate(root, "release-1", "run-one"), root)
            path = root / "private" / "registry.json"
            save_registry(registry, path)
            self.assertEqual(load_registry(path)["activeReleaseId"], "release-1")
            self.assert_code("rollback_release_unavailable", lambda: rollback_release(registry, "release-1", root))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
