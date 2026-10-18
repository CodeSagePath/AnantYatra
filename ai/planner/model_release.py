"""Evaluation-gated adapter promotion and rollback registry."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import tempfile
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from planner import PlannerError, validate_schema

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REGISTRY = PROJECT_ROOT / "ai/runs/model-release-registry.json"
DIRECT_IDENTIFIER_PATTERN = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)"
)


def empty_registry() -> dict:
    return {"schemaVersion": "1.0", "activeReleaseId": None, "releases": []}


def adapter_sha256(adapter_path: Path) -> str:
    if not adapter_path.is_dir():
        raise PlannerError("adapter_artifact_missing")
    files = sorted(path for path in adapter_path.rglob("*") if path.is_file())
    if any(path.is_symlink() for path in adapter_path.rglob("*")):
        raise PlannerError("adapter_symlinks_not_allowed")
    names = {path.name for path in files}
    if "adapter_config.json" not in names or not ({"adapter_model.safetensors", "adapter_model.bin"} & names):
        raise PlannerError("adapter_artifact_incomplete")
    digest = hashlib.sha256()
    for path in files:
        relative = path.relative_to(adapter_path).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as adapter_file:
            for chunk in iter(lambda: adapter_file.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


def validate_registry(registry: dict) -> None:
    validate_schema(registry, "model-release-registry.schema.json")
    ids = set()
    active_ids = []
    for release in registry["releases"]:
        validate_schema(release, "model-release.schema.json")
        if release["releaseId"] in ids:
            raise PlannerError("duplicate_release_id")
        ids.add(release["releaseId"])
        if release["state"] == "active":
            active_ids.append(release["releaseId"])
    if active_ids != ([registry["activeReleaseId"]] if registry["activeReleaseId"] else []):
        raise PlannerError("release_registry_active_pointer_invalid")


def promote_candidate(
    registry: dict,
    candidate: dict,
    artifact_root: Path,
    promoted_at: str | None = None,
    max_latency_regression: float = 0.10,
) -> dict:
    if max_latency_regression < 0:
        raise ValueError("max_latency_regression_must_be_nonnegative")
    validate_registry(registry)
    validate_schema(candidate, "model-release.schema.json")
    if candidate["state"] != "candidate" or candidate["promotedAt"] is not None:
        raise PlannerError("release_is_not_candidate")
    if candidate["humanReview"]["decision"] != "approved":
        raise PlannerError("release_human_review_required")
    reviewer = candidate["humanReview"]["reviewerToken"].strip().casefold()
    if reviewer in {"assistant", "ai", "llm", "model"} or DIRECT_IDENTIFIER_PATTERN.search(reviewer):
        raise PlannerError("release_human_reviewer_invalid")
    if not all(candidate["hardGates"].values()):
        raise PlannerError("release_hard_gate_failed")
    if any(release["releaseId"] == candidate["releaseId"] for release in registry["releases"]):
        raise PlannerError("duplicate_release_id")

    active = _active_release(registry)
    if active:
        if (
            candidate["baseModelId"] != active["baseModelId"]
            or candidate["baseRevision"] != active["baseRevision"]
            or candidate["evaluationSuiteSha256"] != active["evaluationSuiteSha256"]
        ):
            raise PlannerError("release_comparison_not_comparable")
        if candidate["metrics"]["scenarioPassRate"] < active["metrics"]["scenarioPassRate"]:
            raise PlannerError("release_quality_regression")
        latency_limit = active["metrics"]["p95LatencyMs"] * (1 + max_latency_regression)
        if candidate["metrics"]["p95LatencyMs"] > latency_limit:
            raise PlannerError("release_latency_regression")

    adapter_path = _resolve_adapter_path(artifact_root, candidate["adapterPath"])
    if adapter_sha256(adapter_path) != candidate["adapterSha256"]:
        raise PlannerError("adapter_artifact_hash_mismatch")
    _verify_reference_hash(
        artifact_root,
        candidate["datasetManifestPath"],
        candidate["datasetManifestSha256"],
        "dataset_manifest_hash_mismatch",
    )
    _verify_reference_hash(
        artifact_root,
        candidate["evaluationSuiteManifestPath"],
        candidate["evaluationSuiteSha256"],
        "evaluation_suite_hash_mismatch",
    )
    _verify_reference_hash(
        artifact_root,
        candidate["evaluationReportPath"],
        candidate["evaluationReportSha256"],
        "evaluation_report_hash_mismatch",
    )

    updated = deepcopy(registry)
    for release in updated["releases"]:
        if release["state"] == "active":
            release["state"] = "rollback_available"
    promoted = deepcopy(candidate)
    promoted["state"] = "active"
    promoted["promotedAt"] = promoted_at or datetime.now(timezone.utc).isoformat()
    updated["releases"].append(promoted)
    updated["activeReleaseId"] = promoted["releaseId"]
    validate_registry(updated)
    return updated


def rollback_release(registry: dict, release_id: str, artifact_root: Path) -> dict:
    validate_registry(registry)
    target = next((release for release in registry["releases"] if release["releaseId"] == release_id), None)
    if not target or target["state"] != "rollback_available":
        raise PlannerError("rollback_release_unavailable")
    adapter_path = _resolve_adapter_path(artifact_root, target["adapterPath"])
    if adapter_sha256(adapter_path) != target["adapterSha256"]:
        raise PlannerError("adapter_artifact_hash_mismatch")
    _verify_reference_hash(
        artifact_root,
        target["datasetManifestPath"],
        target["datasetManifestSha256"],
        "dataset_manifest_hash_mismatch",
    )
    _verify_reference_hash(
        artifact_root,
        target["evaluationSuiteManifestPath"],
        target["evaluationSuiteSha256"],
        "evaluation_suite_hash_mismatch",
    )
    _verify_reference_hash(
        artifact_root,
        target["evaluationReportPath"],
        target["evaluationReportSha256"],
        "evaluation_report_hash_mismatch",
    )
    updated = deepcopy(registry)
    for release in updated["releases"]:
        if release["state"] == "active":
            release["state"] = "rollback_available"
        if release["releaseId"] == release_id:
            release["state"] = "active"
    updated["activeReleaseId"] = release_id
    validate_registry(updated)
    return updated


def load_registry(path: Path = DEFAULT_REGISTRY) -> dict:
    if not path.exists():
        return empty_registry()
    registry = json.loads(path.read_text(encoding="utf-8"))
    validate_registry(registry)
    return registry


def save_registry(registry: dict, path: Path = DEFAULT_REGISTRY) -> None:
    validate_registry(registry)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    lock_fd = os.open(path.with_suffix(path.suffix + ".lock"), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        os.fchmod(lock_fd, 0o600)
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(json.dumps(registry, ensure_ascii=False, indent=2) + "\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        temporary_path.chmod(0o600)
        os.replace(temporary_path, path)
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)


def _active_release(registry: dict) -> dict | None:
    active_id = registry["activeReleaseId"]
    if active_id is None:
        return None
    return next(release for release in registry["releases"] if release["releaseId"] == active_id)


def _resolve_adapter_path(artifact_root: Path, relative_path: str) -> Path:
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise PlannerError("adapter_path_invalid")
    root = artifact_root.resolve()
    adapter = (root / relative).resolve()
    if not adapter.is_relative_to(root):
        raise PlannerError("adapter_path_invalid")
    return adapter


def _verify_reference_hash(
    artifact_root: Path, relative_path: str, expected_hash: str, failure_code: str
) -> None:
    path = _resolve_adapter_path(artifact_root, relative_path)
    if not path.is_file() or _sha256_file(path) != expected_hash:
        raise PlannerError(failure_code)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
