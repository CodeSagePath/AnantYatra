"""Verify the human retraining decision and frozen input artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "ai/planner"))
sys.path.insert(0, str(PROJECT_ROOT / "ai/evaluation"))

from suites import load_frozen_suite  # noqa: E402

DIRECT_IDENTIFIER_PATTERN = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)"
)
NON_HUMAN_REVIEWER_TOKENS = {"assistant", "ai", "llm", "model"}


class RetrainingGateError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def should_train_candidate(
    decision_path: Path,
    config_path: Path,
    dataset_dir: Path,
    evaluation_suite_dir: Path,
) -> bool:
    decision = _load_decision(decision_path)
    config = _load_toml(config_path)
    gate = config["retraining_gate"]
    if any(
        not isinstance(gate.get(key), int) or gate[key] < minimum
        for key, minimum in (
            ("minimum_train_examples", 1),
            ("minimum_examples_for_failure_pattern", 1),
            ("minimum_distinct_failure_cases", 2),
        )
    ):
        raise RetrainingGateError("retraining_gate_config_invalid")
    dataset_manifest_path = dataset_dir / "manifest.json"
    dataset_manifest = _load_json(dataset_manifest_path, "dataset_manifest_invalid")
    suite_manifest_path = evaluation_suite_dir / "manifest.json"
    suite_manifest, suite_cases = load_frozen_suite(evaluation_suite_dir)

    if _sha256(dataset_manifest_path) != decision["datasetManifestSha256"]:
        raise RetrainingGateError("dataset_manifest_hash_mismatch")
    if _sha256(suite_manifest_path) != decision["evaluationSuiteManifestSha256"]:
        raise RetrainingGateError("evaluation_suite_manifest_hash_mismatch")
    train_path = _resolve_training_file(config["data"]["train_file"])
    if _sha256(train_path) != dataset_manifest.get("sha256", {}).get("train.jsonl"):
        raise RetrainingGateError("training_file_hash_mismatch")
    train_count = dataset_manifest.get("counts", {}).get("train")
    if train_count != decision["trainExampleCount"]:
        raise RetrainingGateError("training_example_count_mismatch")
    if _jsonl_count(train_path) != train_count:
        raise RetrainingGateError("training_file_count_mismatch")
    if dataset_manifest.get("testSetFrozen") is not True:
        raise RetrainingGateError("evaluation_test_set_not_frozen")

    known_case_ids = set(suite_manifest.get("caseIds", []))
    if not set(decision["failureCaseIds"]).issubset(known_case_ids):
        raise RetrainingGateError("failure_case_not_in_evaluation_suite")
    if len(suite_cases) != suite_manifest.get("caseCount"):
        raise RetrainingGateError("evaluation_suite_case_count_mismatch")

    if decision["action"] == "defer":
        return False
    if decision["reason"] == "enough_quality_data":
        if decision["failureCaseIds"] or train_count < gate["minimum_train_examples"]:
            raise RetrainingGateError("quality_data_threshold_not_met")
        return True
    if decision["reason"] == "recurring_failure_pattern":
        if (
            train_count < gate["minimum_examples_for_failure_pattern"]
            or len(set(decision["failureCaseIds"])) < gate["minimum_distinct_failure_cases"]
        ):
            raise RetrainingGateError("failure_pattern_threshold_not_met")
        return True
    raise RetrainingGateError("retraining_reason_not_sufficient")


def _load_decision(path: Path) -> dict:
    decision = _load_json(path, "retraining_decision_invalid")
    schema_path = PROJECT_ROOT / "ai/schemas/v1/retraining-decision.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors = list(
        Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(decision)
    )
    if errors:
        raise RetrainingGateError("retraining_decision_schema_invalid")
    reviewer = decision["reviewerToken"].strip().casefold()
    if reviewer in NON_HUMAN_REVIEWER_TOKENS or DIRECT_IDENTIFIER_PATTERN.search(reviewer):
        raise RetrainingGateError("retraining_reviewer_invalid")
    return decision


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decision", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--dataset-dir", required=True, type=Path)
    parser.add_argument("--evaluation-suite-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        should_train = should_train_candidate(
            _project_path(args.decision),
            _project_path(args.config),
            _project_path(args.dataset_dir),
            _project_path(args.evaluation_suite_dir),
        )
    except RetrainingGateError as error:
        print(json.dumps({"errorCode": error.code}), file=sys.stderr)
        return 1
    print("train_candidate" if should_train else "defer")
    return 0 if should_train else 3


def _project_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _load_toml(path: Path) -> dict:
    with path.open("rb") as config_file:
        return tomllib.load(config_file)


def _load_json(path: Path, failure_code: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RetrainingGateError(failure_code) from error
    if not isinstance(value, dict):
        raise RetrainingGateError(failure_code)
    return value


def _resolve_training_file(path_value: str) -> Path:
    path = (PROJECT_ROOT / path_value).resolve()
    if not path.is_file():
        raise RetrainingGateError("training_file_unavailable")
    return path


def _sha256(path: Path) -> str:
    try:
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError as error:
        raise RetrainingGateError("release_input_unavailable") from error


def _jsonl_count(path: Path) -> int:
    try:
        with path.open(encoding="utf-8") as input_file:
            return sum(1 for line in input_file if line.strip())
    except OSError as error:
        raise RetrainingGateError("training_file_unavailable") from error


if __name__ == "__main__":
    raise SystemExit(main())
