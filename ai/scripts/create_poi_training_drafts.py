"""Create pending, fact-grounded Q&A drafts from one Wikidata POI snapshot."""

from __future__ import annotations

import argparse
import json
import tomllib
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-record-id", required=True)
    parser.add_argument("--source-snapshot-id", required=True)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as source_file:
        return [json.loads(line) for line in source_file if line.strip()]


def make_draft(poi: dict, source_record_id: str, snapshot_id: str) -> dict:
    poi_id = poi["poiId"]
    name = poi["displayName"]
    category = poi["category"]
    readable_category = category.replace("_", " ")
    article = "an" if readable_category[0].lower() in "aeiou" else "a"
    latitude = poi["location"]["latitude"]
    longitude = poi["location"]["longitude"]
    context = {
        "poiId": poi_id,
        "displayName": name,
        "category": category,
        "location": {"latitude": latitude, "longitude": longitude},
        "facilities": "not supplied",
        "openingHours": "not supplied",
        "priceRange": "not supplied",
        "quality": "unverified",
    }
    return {
        "schemaVersion": "1.0",
        "draftId": f"poi-fact-{poi_id}",
        "messages": [
            {
                "role": "user",
                "content": (
                    "Use only this unverified place record. What name, category, and "
                    "coordinates does it list? Are facilities, opening hours, or "
                    f"price provided?\nRecord: {json.dumps(context, ensure_ascii=False, sort_keys=True)}"
                ),
            },
            {
                "role": "assistant",
                "content": (
                    f"The unverified record lists {name} as {article} {readable_category} at "
                    f"{latitude}, {longitude}. Facilities, opening hours, and "
                    "price are not provided, so they are unknown."
                ),
            },
        ],
        "provenance": {
            "sourceRecordIds": [source_record_id],
            "sourceSnapshotId": snapshot_id,
            "permittedUse": "training",
            "qualityState": "unverified",
        },
        "review": {
            "state": "pending",
            "brandScanStatus": "passed",
            "generationMethod": "deterministic_poi_fact_template_v1",
        },
        "extensions": {"poiId": poi_id, "category": category},
    }


def main() -> None:
    args = parse_args()
    pois = read_jsonl(args.snapshot / "pois.jsonl")
    terms = tomllib.loads((ROOT / "ai/configs/data-policy.toml").read_text(encoding="utf-8"))[
        "excluded_platform_terms"
    ]
    drafts = []
    excluded = 0
    for poi in pois:
        draft = make_draft(poi, args.source_record_id, args.source_snapshot_id)
        content = " ".join(message["content"].casefold() for message in draft["messages"])
        if any(term.casefold() in content for term in terms):
            excluded += 1
            continue
        drafts.append(draft)
    schema = json.loads(
        (ROOT / "ai/schemas/v1/training-example-draft.schema.json").read_text(encoding="utf-8")
    )
    validator = Draft202012Validator(schema)
    for draft in drafts:
        validator.validate(draft)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(draft, ensure_ascii=False) + "\n" for draft in drafts),
        encoding="utf-8",
    )
    print(f"Created {len(drafts)} pending POI fact Q&A drafts; excluded {excluded} by brand policy.")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    main()
