"""Validate reviewed examples and create leakage-resistant dataset splits."""

import argparse
import hashlib
import json
import tomllib
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Reviewed JSONL intake file")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--schema", type=Path)
    parser.add_argument("--source-register", type=Path)
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--refresh-frozen-test", action="store_true")
    return parser.parse_args()


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolved(value: Path | None, default: str) -> Path:
    return value if value is not None else project_root() / default


def read_jsonl(path: Path) -> list[dict]:
    records = []
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(value, dict):
                raise ValueError(f"Expected a JSON object at {path}:{line_number}.")
            records.append(value)
    if not records:
        raise ValueError(f"Dataset intake is empty: {path}")
    return records


def read_register(path: Path, record_id_field: str) -> dict[str, dict]:
    records = read_jsonl(path)
    indexed = {}
    for record in records:
        record_id = record.get(record_id_field)
        if not isinstance(record_id, str) or not record_id:
            raise ValueError(f"Missing {record_id_field} in {path}.")
        if record_id in indexed:
            raise ValueError(f"Duplicate {record_id_field} '{record_id}' in {path}.")
        indexed[record_id] = record
    return indexed


def validate_schema(records: list[dict], schema_path: Path) -> None:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = []
    for line_number, record in enumerate(records, start=1):
        for error in validator.iter_errors(record):
            location = ".".join(str(part) for part in error.absolute_path) or "record"
            errors.append(f"row {line_number} {location}: {error.message}")
    if errors:
        raise ValueError("Schema validation failed:\n" + "\n".join(errors[:30]))


def validate_review_and_sources(records: list[dict], sources: dict[str, dict]) -> None:
    for row, record in enumerate(records, start=1):
        dataset = record.get("extensions", {}).get("dataset")
        required = {"corridorId", "scenarioFamily", "sourceSnapshotId", "reviewedBy"}
        if not isinstance(dataset, dict) or not required.issubset(dataset):
            raise ValueError(
                f"Dataset metadata on row {row} must include {', '.join(sorted(required))}."
            )
        if not all(isinstance(dataset[field], str) and dataset[field].strip() for field in required):
            raise ValueError(f"Dataset metadata on row {row} must use non-empty text values.")
        if dataset["reviewedBy"].strip().casefold() in {"assistant", "ai", "llm", "model"}:
            raise ValueError(f"Row {row} must be reviewed by a human, not a model label.")
        provenance = record["provenance"]
        for source_id in provenance["sourceRecordIds"]:
            source = sources.get(source_id)
            review = source.get("licenseReview") if source else None
            if (
                not source
                or source.get("sourceStatus") != "active"
                or "training" not in source.get("permittedUses", [])
                or not isinstance(review, dict)
                or review.get("status") != "approved"
            ):
                raise ValueError(
                    f"Row {row} references source '{source_id}' that is not approved for training."
                )


def validate_policy(records: list[dict], policy_path: Path) -> None:
    with policy_path.open("rb") as policy_file:
        policy = tomllib.load(policy_file)
    terms = policy.get("excluded_platform_terms", [])
    if not terms:
        raise ValueError(f"No excluded_platform_terms configured in {policy_path}.")
    for row, record in enumerate(records, start=1):
        messages = record.get("messages", [])
        for message in messages:
            content = message.get("content", "").casefold()
            match = next((term for term in terms if term.casefold() in content), None)
            if match:
                raise ValueError(f"Excluded platform term on row {row}: {match}")


def fingerprint(record: dict) -> str:
    user_content = "\n".join(
        message["content"].strip().casefold()
        for message in record["messages"]
        if message["role"] == "user"
    )
    return hashlib.sha256(" ".join(user_content.split()).encode("utf-8")).hexdigest()


def group_key(record: dict) -> str:
    metadata = record["extensions"]["dataset"]
    return "|".join(
        metadata[field] for field in ("corridorId", "scenarioFamily", "sourceSnapshotId")
    )


def split_records(records: list[dict], seed: int) -> dict[str, list[dict]]:
    grouped = defaultdict(list)
    for record in records:
        grouped[group_key(record)].append(record)
    if len(grouped) < 3:
        raise ValueError("At least three distinct corridor/scenario/snapshot groups are required.")

    group_ids = sorted(
        grouped,
        key=lambda item: hashlib.sha256(f"{seed}:{item}".encode()).hexdigest(),
    )
    proportions = {"train": 0.8, "validation": 0.1, "test": 0.1}
    totals = {split: 0 for split in proportions}
    output = {split: [] for split in proportions}
    total_examples = len(records)
    split_order = ("test", "validation", "train")
    for index, key in enumerate(group_ids):
        if index < len(split_order):
            split = split_order[index]
        else:
            split = max(
                proportions,
                key=lambda name: proportions[name] * total_examples - totals[name],
            )
        output[split].extend(grouped[key])
        totals[split] += len(grouped[key])
    if any(not output[name] for name in output):
        raise ValueError("Grouped split did not populate all three datasets; add more groups.")
    for split_records_list in output.values():
        split_records_list.sort(key=lambda item: item["exampleId"])
    return output


def encode_jsonl(records: list[dict]) -> bytes:
    text = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    return text.encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_dataset(
    records: list[dict], output_dir: Path, seed: int, refresh_frozen_test: bool
) -> None:
    splits = split_records(records, seed)
    output_dir.mkdir(parents=True, exist_ok=True)
    encoded = {f"{name}.jsonl": encode_jsonl(rows) for name, rows in splits.items()}
    test_path = output_dir / "test.jsonl"
    if test_path.exists() and test_path.read_bytes() != encoded["test.jsonl"]:
        if not refresh_frozen_test:
            raise ValueError(
                "Frozen test set differs from the existing version; use --refresh-frozen-test "
                "after an explicit evaluation-set review."
            )
    for filename, content in encoded.items():
        (output_dir / filename).write_bytes(content)

    source_snapshots = sorted(
        {record["extensions"]["dataset"]["sourceSnapshotId"] for record in records}
    )
    manifest = {
        "datasetVersion": "1.0",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "splitStrategy": "grouped by corridorId, scenarioFamily, and sourceSnapshotId",
        "counts": {name: len(rows) for name, rows in splits.items()},
        "sourceSnapshotIds": source_snapshots,
        "exampleIds": {name: [row["exampleId"] for row in rows] for name, rows in splits.items()},
        "sha256": {filename: sha256(content) for filename, content in encoded.items()},
        "testSetFrozen": True,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> None:
    args = parse_args()
    root = project_root()
    schema_path = resolved(args.schema, "ai/schemas/v1/training-example.schema.json")
    source_path = resolved(args.source_register, "ai/data/source-register.jsonl")
    policy_path = resolved(args.policy, "ai/configs/data-policy.toml")

    records = read_jsonl(args.input)
    ids = [record.get("exampleId") for record in records]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate exampleId values in dataset intake.")
    fingerprints = [fingerprint(record) for record in records]
    if len(fingerprints) != len(set(fingerprints)):
        raise ValueError("Duplicate normalized user prompts in dataset intake.")

    validate_schema(records, schema_path)
    sources = read_register(source_path, "sourceRecordId")
    validate_review_and_sources(records, sources)
    validate_policy(records, policy_path)
    write_dataset(records, args.output_dir, args.seed, args.refresh_frozen_test)
    print(f"Validated {len(records)} reviewed examples and wrote dataset splits to {args.output_dir}.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SystemExit(f"dataset build failed: {error}") from error
