"""Validate an extracted POI snapshot and write its reproducibility manifest."""

import argparse
import hashlib
import json
import re
import tomllib
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


def project_path(value: str) -> Path:
    root = Path(__file__).resolve().parents[2]
    return (root / value).resolve()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_record(source_id: str) -> dict:
    register = project_path("ai/data/source-register.jsonl")
    for line in register.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if record["sourceRecordId"] == source_id:
            return record
    raise ValueError(f"Source record not found: {source_id}")


def normalized_words(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))


def validate_snapshot(config_path: Path) -> dict:
    with config_path.open("rb") as file:
        config = tomllib.load(file)

    output_path = project_path(config["output"]["file"])
    report_path = project_path(config["output"]["report_file"])
    schema_path = project_path("ai/schemas/v1/poi.schema.json")
    extractor_path = project_path("ai/scripts/extract_osm_pois.py")
    brand_policy_path = project_path("ai/configs/data-policy.toml")
    with brand_policy_path.open("rb") as file:
        excluded_terms = tomllib.load(file)["excluded_platform_terms"]
    normalized_terms = [normalized_words(term) for term in excluded_terms]
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    source = source_record(config["input"]["source_record_id"])

    category_counts = Counter()
    identities = set()
    invalid = []
    brand_hits = []
    count = 0
    with output_path.open(encoding="utf-8") as output:
        for line_number, line in enumerate(output, start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            count += 1
            category_counts[record.get("category", "unknown")] += 1
            identity = record.get("poiId")
            if identity in identities:
                invalid.append(f"line {line_number}: duplicate poiId {identity}")
            identities.add(identity)
            errors = list(validator.iter_errors(record))
            for error in errors[:5]:
                invalid.append(
                    f"line {line_number}: {'/'.join(map(str, error.absolute_path))}: {error.message}"
                )
            if any(
                item.get("sourceRecordId") != source["sourceRecordId"]
                for item in record.get("evidence", [])
            ):
                invalid.append(f"line {line_number}: evidence source ID mismatch")
            model_text = normalized_words(
                " ".join(
                    [record.get("displayName", "")]
                    + [item.get("fact", "") for item in record.get("evidence", [])]
                )
            )
            for term in normalized_terms:
                if f" {term} " in f" {model_text} ":
                    brand_hits.append({"line": line_number, "term": term})
                    break
            if len(invalid) >= 20:
                break

    if invalid:
        raise ValueError("POI validation failed:\n" + "\n".join(invalid[:20]))
    if brand_hits:
        raise ValueError(f"Excluded platform term found in POI text: {brand_hits[:10]}")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    if "featuresByCategory" in report:
        report["observationsByCategoryBeforeDedupe"] = report.pop(
            "featuresByCategory"
        )
    permitted_uses = source["permittedUses"]
    report["validation"] = {
        "status": "passed",
        "schema": "ai/schemas/v1/poi.schema.json",
        "recordCount": count,
        "uniquePoiIds": len(identities),
        "recordsByCategory": dict(sorted(category_counts.items())),
    }
    report["reproducibility"] = {
        "configSha256": sha256(config_path),
        "extractorSha256": sha256(extractor_path),
        "schemaSha256": sha256(schema_path),
        "brandPolicySha256": sha256(brand_policy_path),
        "outputSha256": sha256(output_path),
    }
    report["brandScan"] = {"status": "passed", "recordsScanned": count}
    report["sourceUseGate"] = {
        "license": source["license"],
        "licenseReviewState": source["licenseReview"]["status"],
        "permittedUses": permitted_uses,
        "trainingEligible": "training" in permitted_uses,
        "runtimeDisplayEligible": {
            "runtime_search",
            "display",
        }.issubset(permitted_uses),
        "attributionText": source["attributionText"],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=project_path("ai/configs/karnataka-osm-extract.toml"),
    )
    args = parser.parse_args()
    print(json.dumps(validate_snapshot(args.config), indent=2))


if __name__ == "__main__":
    main()
