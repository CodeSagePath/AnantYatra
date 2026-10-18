"""Consent-aware feedback, factual correction, and training-queue utilities."""

from __future__ import annotations

import fcntl
import json
import os
import re
import tempfile
import tomllib
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from pathlib import Path

from feedback import validate_feedback_event
from planner import PlannerError, validate_schema

PROJECT_ROOT = Path(__file__).resolve().parents[2]
NON_HUMAN_REVIEWER_TOKENS = {"assistant", "ai", "llm", "model"}
PRIVATE_DATA_DIR = PROJECT_ROOT / "ai/data/private"
FEEDBACK_EVENT_PATH = PRIVATE_DATA_DIR / "feedback-events.jsonl"
FEEDBACK_REVIEW_PATH = PRIVATE_DATA_DIR / "feedback-reviews.jsonl"
TRAINING_CANDIDATE_PATH = PRIVATE_DATA_DIR / "training-candidates.jsonl"
TRAINING_CANDIDATE_REVIEW_PATH = PRIVATE_DATA_DIR / "training-candidate-reviews.jsonl"
POI_CORRECTION_PATH = PRIVATE_DATA_DIR / "poi-corrections.jsonl"
DIRECT_IDENTIFIER_PATTERN = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)|"
    r"-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}"
)


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid_jsonl_row_{line_number}") from error
            if not isinstance(record, dict):
                raise ValueError(f"invalid_jsonl_row_{line_number}")
            records.append(record)
    return records


def append_event(path: Path, event: dict, id_field: str) -> bool:
    """Append once under an OS lock; return false for an identical replay."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    lock_path = path.with_suffix(path.suffix + ".lock")
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        os.fchmod(lock_fd, 0o600)
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        existing = read_jsonl(path)
        matching = [record for record in existing if record.get(id_field) == event.get(id_field)]
        if matching:
            if len(matching) == 1 and _canonical(matching[0]) == _canonical(event):
                return False
            raise PlannerError("event_id_conflict")
        event_fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_APPEND, 0o600)
        try:
            os.fchmod(event_fd, 0o600)
            payload = (_canonical(event) + "\n").encode("utf-8")
            position = 0
            while position < len(payload):
                position += os.write(event_fd, payload[position:])
            os.fsync(event_fd)
        finally:
            os.close(event_fd)
        return True
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)


def store_feedback_event(
    event: dict,
    taxonomy: dict,
    consent_records: dict[str, dict],
    path: Path,
) -> bool:
    validate_feedback_event(event, taxonomy)
    if event["reviewState"] != "pending":
        raise PlannerError("feedback_must_start_pending")
    comment = event.get("comment", "")
    if DIRECT_IDENTIFIER_PATTERN.search(comment) or DIRECT_IDENTIFIER_PATTERN.search(
        event.get("reporterToken", "")
    ):
        raise PlannerError("feedback_comment_contains_direct_identifier")
    if event["trainingConsent"]:
        consent_id = event.get("extensions", {}).get("consentRecordId")
        consent = consent_records.get(consent_id)
        if not consent:
            raise PlannerError("training_consent_record_missing")
        validate_schema(consent, "consent-record.schema.json")
        if DIRECT_IDENTIFIER_PATTERN.search(consent["subjectToken"]):
            raise PlannerError("consent_subject_token_contains_direct_identifier")
        if consent["purpose"] != "model_training" or consent["status"] != "granted":
            raise PlannerError("training_consent_not_active")
    return append_event(path, event, "eventId")


def append_feedback_review(
    review: dict, feedback_events: list[dict], path: Path
) -> bool:
    validate_schema(review, "feedback-review.schema.json")
    if _reviewer_token_invalid(review["reviewerToken"]):
        raise PlannerError("reviewer_token_contains_direct_identifier")
    for event in feedback_events:
        validate_schema(event, "feedback-event.schema.json")
    if review["feedbackEventId"] not in {event["eventId"] for event in feedback_events}:
        raise PlannerError("feedback_event_not_found")
    return append_event(path, review, "reviewId")


def append_training_candidate_review(
    review: dict, candidates: list[dict], path: Path
) -> bool:
    validate_schema(review, "training-candidate-review.schema.json")
    if _reviewer_token_invalid(review["reviewerToken"]):
        raise PlannerError("reviewer_token_contains_direct_identifier")
    for candidate in candidates:
        validate_schema(candidate, "training-candidate.schema.json")
    if review["candidateId"] not in {candidate["candidateId"] for candidate in candidates}:
        raise PlannerError("training_candidate_not_found")
    return append_event(path, review, "reviewId")


def queue_training_candidate(
    candidate: dict,
    consent_records: dict[str, dict],
    sources: list[dict],
    path: Path,
) -> bool:
    validate_schema(candidate, "training-candidate.schema.json")
    source_by_id = {source["sourceRecordId"]: source for source in sources}
    if len(source_by_id) != len(sources):
        raise PlannerError("duplicate_training_source_id")
    for source_id in candidate["sourceRecordIds"]:
        source = source_by_id.get(source_id)
        if not _source_permits_training(source):
            raise PlannerError("training_candidate_source_not_approved")
        validate_schema(source, "source-record.schema.json")
    for message in candidate["messages"]:
        if DIRECT_IDENTIFIER_PATTERN.search(message["content"]):
            raise PlannerError("training_candidate_contains_direct_identifier")
    if candidate["dataOrigin"] == "user_opt_in":
        for consent_id in candidate["consentRecordIds"]:
            consent = consent_records.get(consent_id)
            if not consent:
                raise PlannerError("training_candidate_consent_missing")
            validate_schema(consent, "consent-record.schema.json")
            if DIRECT_IDENTIFIER_PATTERN.search(consent["subjectToken"]):
                raise PlannerError("consent_subject_token_contains_direct_identifier")
            if consent["purpose"] != "model_training" or consent["status"] != "granted":
                raise PlannerError("training_candidate_consent_not_active")
    return append_event(path, candidate, "candidateId")


def aggregate_independent_reports(
    feedback_events: list[dict], minimum_reporters: int = 3
) -> list[dict]:
    if minimum_reporters < 2:
        raise ValueError("minimum_reporters_must_be_at_least_two")
    groups: dict[tuple, dict] = defaultdict(lambda: {"eventIds": set(), "reporterTokens": set()})
    for event in feedback_events:
        validate_schema(event, "feedback-event.schema.json")
        if event.get("reviewState") == "rejected":
            continue
        reporter = event.get("reporterToken")
        if not reporter:
            continue
        key = (event["targetType"], event["targetId"], event["categoryId"])
        groups[key]["eventIds"].add(event["eventId"])
        groups[key]["reporterTokens"].add(reporter)
    summaries = []
    for (target_type, target_id, category_id), group in sorted(groups.items()):
        count = len(group["reporterTokens"])
        if count >= minimum_reporters:
            summaries.append(
                {
                    "targetType": target_type,
                    "targetId": target_id,
                    "categoryId": category_id,
                    "independentReporterCount": count,
                    "feedbackEventIds": sorted(group["eventIds"]),
                    "requiresHumanVerification": True,
                }
            )
    return summaries


def apply_verified_correction(
    poi: dict,
    correction: dict,
    feedback_events: list[dict],
    feedback_reviews: list[dict],
    sources: list[dict],
) -> dict:
    validate_schema(poi, "poi.schema.json")
    validate_schema(correction, "poi-correction.schema.json")
    if _reviewer_token_invalid(correction["verifiedByToken"]):
        raise PlannerError("correction_reviewer_invalid")
    if correction["poiId"] != poi["poiId"]:
        raise PlannerError("correction_poi_mismatch")

    events_by_id = {event["eventId"]: event for event in feedback_events}
    latest_review_by_event = {}
    for review in feedback_reviews:
        validate_schema(review, "feedback-review.schema.json")
        event_id = review["feedbackEventId"]
        latest = latest_review_by_event.get(event_id)
        reviewed_at = _parse_datetime(review["reviewedAt"])
        if latest is None or reviewed_at >= _parse_datetime(latest["reviewedAt"]):
            latest_review_by_event[event_id] = review
    for event_id in correction["feedbackEventIds"]:
        event = events_by_id.get(event_id)
        if (
            not event
            or event.get("targetType") not in {"poi", "plan_stop"}
            or event["targetId"] != poi["poiId"]
            or latest_review_by_event.get(event_id, {}).get("decision") != "verified"
        ):
            raise PlannerError("correction_feedback_not_verified")

    source_by_id = {source["sourceRecordId"]: source for source in sources}
    if len(source_by_id) != len(sources):
        raise PlannerError("duplicate_correction_source_id")
    for source_id in correction["verificationSourceRecordIds"]:
        source = source_by_id.get(source_id)
        if (
            not source
            or source.get("sourceStatus") != "active"
            or source.get("licenseReview", {}).get("status") != "approved"
            or not {"runtime_search", "display"}.issubset(source.get("permittedUses", []))
        ):
            raise PlannerError("correction_source_not_runtime_approved")
        validate_schema(source, "source-record.schema.json")

    updated = deepcopy(poi)
    current_value = _read_fact(updated, correction["factPath"])
    if current_value != correction["previousValue"]:
        raise PlannerError("correction_previous_value_mismatch")
    _write_fact(updated, correction["factPath"], correction["correctedValue"])
    extensions = updated.setdefault("extensions", {})
    history = extensions.setdefault("factHistory", [])
    history.append(
        {
            "correctionId": correction["correctionId"],
            "factPath": correction["factPath"],
            "previousValue": correction["previousValue"],
            "correctedValue": correction["correctedValue"],
            "feedbackEventIds": correction["feedbackEventIds"],
            "sourceRecordIds": correction["verificationSourceRecordIds"],
            "verifiedByToken": correction["verifiedByToken"],
            "verifiedAt": correction["verifiedAt"],
        }
    )
    quality = updated["quality"]
    quality["state"] = "source_confirmed"
    quality["updatedAt"] = correction["verifiedAt"]
    quality["lastVerifiedAt"] = correction["verifiedAt"]
    updated.setdefault("evidence", []).extend(
        {
            "sourceRecordId": source_id,
            "fact": f"Human-verified correction to {correction['factPath']}",
            "observedAt": correction["verifiedAt"],
        }
        for source_id in correction["verificationSourceRecordIds"]
    )
    validate_schema(updated, "poi.schema.json")
    return updated


def record_verified_correction(
    poi: dict,
    correction: dict,
    feedback_events: list[dict],
    feedback_reviews: list[dict],
    sources: list[dict],
    path: Path = POI_CORRECTION_PATH,
) -> dict:
    updated_poi = apply_verified_correction(
        poi, correction, feedback_events, feedback_reviews, sources
    )
    append_event(path, correction, "correctionId")
    return updated_poi


def approved_training_examples(
    candidates: list[dict],
    reviews: list[dict],
    consent_records: dict[str, dict],
    sources: list[dict],
    policy_path: Path | None = None,
) -> list[dict]:
    review_by_candidate = {}
    for review in reviews:
        validate_schema(review, "training-candidate-review.schema.json")
        if _reviewer_token_invalid(review["reviewerToken"]):
            raise PlannerError("reviewer_token_contains_direct_identifier")
        if review["candidateId"] in review_by_candidate:
            raise PlannerError("candidate_has_multiple_review_decisions")
        review_by_candidate[review["candidateId"]] = review
    source_by_id = {source["sourceRecordId"]: source for source in sources}
    if len(source_by_id) != len(sources):
        raise PlannerError("duplicate_training_source_id")
    output = []
    candidate_ids = set()
    policy_terms = _load_brand_terms(policy_path)

    for candidate in candidates:
        validate_schema(candidate, "training-candidate.schema.json")
        if candidate["candidateId"] in candidate_ids:
            raise PlannerError("duplicate_training_candidate_id")
        candidate_ids.add(candidate["candidateId"])
        if any(DIRECT_IDENTIFIER_PATTERN.search(message["content"]) for message in candidate["messages"]):
            raise PlannerError("training_candidate_contains_direct_identifier")
        review = review_by_candidate.get(candidate["candidateId"])
        if not review or review["decision"] != "approved":
            continue
        if any(_contains_term(message["content"], policy_terms) for message in candidate["messages"]):
            raise PlannerError("training_candidate_contains_platform_brand")
        if any(
            not _source_permits_training(source_by_id.get(source_id))
            for source_id in candidate["sourceRecordIds"]
        ):
            raise PlannerError("training_candidate_source_not_approved")
        for source_id in candidate["sourceRecordIds"]:
            validate_schema(source_by_id[source_id], "source-record.schema.json")
        consents = [consent_records.get(consent_id) for consent_id in candidate["consentRecordIds"]]
        for consent in consents:
            if not consent:
                raise PlannerError("training_candidate_consent_missing")
            validate_schema(consent, "consent-record.schema.json")
            if DIRECT_IDENTIFIER_PATTERN.search(consent["subjectToken"]):
                raise PlannerError("consent_subject_token_contains_direct_identifier")
        if any(consent["status"] != "granted" for consent in consents):
            continue
        example = {
            "schemaVersion": "1.0",
            "exampleId": candidate["candidateId"],
            "messages": candidate["messages"],
            "provenance": {
                "sourceRecordIds": candidate["sourceRecordIds"],
                "consentRecordIds": candidate["consentRecordIds"],
                "permittedUse": "training",
                "reviewState": "approved",
                "brandScanStatus": "passed",
                "consentState": "opted_in" if consents else "not_applicable",
                "reviewedAt": review["reviewedAt"],
            },
            "extensions": {
                "dataset": {
                    **candidate["dataset"],
                    "reviewedBy": review["reviewerToken"],
                },
                "candidateType": candidate["candidateType"],
                "dataOrigin": candidate["dataOrigin"],
                "originEventIds": candidate.get("originEventIds", []),
            },
        }
        validate_schema(example, "training-example.schema.json")
        output.append(example)
    return output


def export_approved_training_examples(
    candidates: list[dict],
    reviews: list[dict],
    consent_records: dict[str, dict],
    sources: list[dict],
    output_path: Path,
    policy_path: Path | None = None,
) -> list[dict]:
    examples = approved_training_examples(
        candidates, reviews, consent_records, sources, policy_path
    )
    output_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    output_path.parent.chmod(0o700)
    payload = "".join(_canonical(example) + "\n" for example in examples).encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(
        dir=output_path.parent, prefix=f".{output_path.name}."
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, output_path)
    except Exception:
        Path(temporary_name).unlink(missing_ok=True)
        raise
    return examples


def _read_fact(poi: dict, path: str):
    if path == "openingHours":
        return poi.get("openingHours")
    _, key = path.split(".", 1)
    return poi.get("facilities", {}).get(key, "unknown")


def _write_fact(poi: dict, path: str, value) -> None:
    if path == "openingHours":
        if value is not None and not isinstance(value, str):
            raise PlannerError("correction_value_invalid")
        poi["openingHours"] = value
        return
    _, key = path.split(".", 1)
    if not isinstance(value, str) or value not in {"available", "unavailable", "unknown"}:
        raise PlannerError("correction_value_invalid")
    poi.setdefault("facilities", {})[key] = value


def _source_permits_training(source: dict | None) -> bool:
    return bool(
        source
        and source.get("sourceStatus") == "active"
        and source.get("licenseReview", {}).get("status") == "approved"
        and "training" in source.get("permittedUses", [])
    )


def _load_brand_terms(policy_path: Path | None) -> list[str]:
    policy = policy_path or PROJECT_ROOT / "ai/configs/data-policy.toml"
    with policy.open("rb") as policy_file:
        terms = tomllib.load(policy_file).get("excluded_platform_terms", [])
    if not terms:
        raise ValueError("platform_term_policy_empty")
    return terms


def _contains_term(text: str, terms: list[str]) -> bool:
    content = text.casefold()
    return any(term.casefold() in content for term in terms)


def _canonical(record: dict) -> str:
    return json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _reviewer_token_invalid(token: str) -> bool:
    return (
        token.strip().casefold() in NON_HUMAN_REVIEWER_TOKENS
        or DIRECT_IDENTIFIER_PATTERN.search(token) is not None
    )
