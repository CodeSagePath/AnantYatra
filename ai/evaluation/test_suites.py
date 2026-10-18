"""Tests for immutable, versioned evaluation suite creation."""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

EVALUATION_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVALUATION_DIR))
sys.path.insert(0, str(EVALUATION_DIR.parent / "planner"))

from evaluation_fixtures import make_evaluation_case  # noqa: E402
from planner import PlannerError
from suites import create_frozen_suite, load_frozen_suite  # noqa: E402


class EvaluationSuiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.case = make_evaluation_case()

    def test_suite_manifest_hashes_cases_and_version_cannot_be_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = create_frozen_suite([self.case], "v1", root)
            suite_path = root / "v1"
            cases_content = (suite_path / "cases.jsonl").read_bytes()
            self.assertEqual(manifest["casesSha256"], hashlib.sha256(cases_content).hexdigest())
            self.assertEqual(json.loads((suite_path / "manifest.json").read_text())["frozen"], True)
            self.assertEqual(load_frozen_suite(suite_path)[1][0]["caseId"], self.case["caseId"])
            with self.assertRaises(PlannerError) as raised:
                create_frozen_suite([self.case], "v1", root)
            self.assertEqual(raised.exception.code, "evaluation_suite_version_already_exists")
            next_case = {**self.case, "caseId": "hard-case-v2"}
            create_frozen_suite([self.case, next_case], "v2", root)
            self.assertEqual((suite_path / "cases.jsonl").read_bytes(), cases_content)
            (suite_path / "cases.jsonl").write_bytes(b"{}\n")
            with self.assertRaises(PlannerError) as raised:
                load_frozen_suite(suite_path)
            self.assertEqual(raised.exception.code, "evaluation_suite_integrity_check_failed")

    def test_suite_rejects_unapproved_evaluation_sources(self) -> None:
        pending_case = json.loads(json.dumps(self.case))
        source = pending_case["input"]["sources"][0]
        source["permittedUses"].remove("evaluation")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(PlannerError) as raised:
                create_frozen_suite([pending_case], "v1", Path(directory))
            self.assertEqual(raised.exception.code, "evaluation_source_not_approved")


if __name__ == "__main__":
    unittest.main()
