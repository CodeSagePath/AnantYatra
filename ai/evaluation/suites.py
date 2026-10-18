"""Create immutable, versioned planner evaluation suites."""

from __future__ import annotations

import hashlib
import fcntl
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from planner import PlannerError, validate_schema

SUITE_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}\Z")
DIRECT_IDENTIFIER_PATTERN = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)"
)


def create_frozen_suite(cases: list[dict], suite_id: str, output_root: Path) -> dict:
    if not SUITE_ID_PATTERN.fullmatch(suite_id) or suite_id in {".", ".."}:
        raise PlannerError("evaluation_suite_id_invalid")
    if not cases:
        raise PlannerError("evaluation_suite_empty")

    seen_case_ids = set()
    source_ids = set()
    for case in cases:
        validate_schema(case, "planner-evaluation-case.schema.json")
        review = case.get("extensions", {}).get("humanReview", {})
        if (
            review.get("status") != "approved"
            or not review.get("reviewerToken")
            or not review.get("reviewedAt")
            or review.get("reviewerToken", "").strip().casefold() in {"assistant", "ai", "llm", "model"}
            or DIRECT_IDENTIFIER_PATTERN.search(review.get("reviewerToken", ""))
        ):
            raise PlannerError("evaluation_case_human_review_required")
        if case["caseId"] in seen_case_ids:
            raise PlannerError("evaluation_case_id_duplicate")
        seen_case_ids.add(case["caseId"])
        for source in case["input"]["sources"]:
            validate_schema(source, "source-record.schema.json")
            if (
                source["sourceStatus"] != "active"
                or source["licenseReview"]["status"] != "approved"
                or "evaluation" not in source["permittedUses"]
            ):
                raise PlannerError("evaluation_source_not_approved")
            source_ids.add(source["sourceRecordId"])

    encoded_cases = "".join(
        json.dumps(case, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
        for case in sorted(cases, key=lambda item: item["caseId"])
    ).encode("utf-8")
    case_hash = hashlib.sha256(encoded_cases).hexdigest()
    manifest = {
        "suiteSchemaVersion": "1.0",
        "suiteId": suite_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "caseCount": len(cases),
        "caseIds": sorted(seen_case_ids),
        "sourceRecordIds": sorted(source_ids),
        "casesSha256": case_hash,
        "frozen": True,
    }

    output_root.mkdir(parents=True, exist_ok=True)
    final_path = output_root / suite_id
    lock_fd = os.open(output_root / ".suite-write.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        if final_path.exists():
            raise PlannerError("evaluation_suite_version_already_exists")
        with tempfile.TemporaryDirectory(dir=output_root, prefix=f".{suite_id}.") as temporary:
            staging = Path(temporary)
            cases_path = staging / "cases.jsonl"
            manifest_path = staging / "manifest.json"
            cases_path.write_bytes(encoded_cases)
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            cases_path.chmod(0o600)
            manifest_path.chmod(0o600)
            os.rename(staging, final_path)
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)
    return manifest


def load_frozen_suite(suite_path: Path) -> tuple[dict, list[dict]]:
    try:
        manifest = json.loads((suite_path / "manifest.json").read_text(encoding="utf-8"))
        case_bytes = (suite_path / "cases.jsonl").read_bytes()
    except (OSError, json.JSONDecodeError) as error:
        raise PlannerError("evaluation_suite_unavailable") from error
    if (
        manifest.get("frozen") is not True
        or manifest.get("suiteId") != suite_path.name
        or hashlib.sha256(case_bytes).hexdigest() != manifest.get("casesSha256")
    ):
        raise PlannerError("evaluation_suite_integrity_check_failed")
    cases = []
    for line in case_bytes.decode("utf-8").splitlines():
        if line.strip():
            try:
                cases.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise PlannerError("evaluation_suite_integrity_check_failed") from error
    if not all(isinstance(case, dict) for case in cases):
        raise PlannerError("evaluation_suite_integrity_check_failed")
    if len(cases) != manifest.get("caseCount") or sorted(
        case.get("caseId") for case in cases
    ) != manifest.get("caseIds"):
        raise PlannerError("evaluation_suite_integrity_check_failed")
    for case in cases:
        validate_schema(case, "planner-evaluation-case.schema.json")
    return manifest, cases
