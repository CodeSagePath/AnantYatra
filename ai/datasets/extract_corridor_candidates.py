"""Extract source-approved POIs within a buffer of a pinned route."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
PLANNER_DIR = ROOT / "ai/planner"
sys.path.insert(0, str(PLANNER_DIR))

from planner import validate_schema
from route_geometry import RouteProjectionIndex, decode_polyline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pois", required=True, type=Path)
    parser.add_argument("--sources", required=True, type=Path)
    parser.add_argument("--route", required=True, type=Path)
    parser.add_argument("--route-source-id", required=True)
    parser.add_argument("--max-distance-km", type=float, default=10)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def source_index(records: list[dict]) -> dict[str, dict]:
    for record in records:
        validate_schema(record, "source-record.schema.json")
    indexed = {record["sourceRecordId"]: record for record in records}
    if len(indexed) != len(records):
        raise ValueError("duplicate_source_record_id")
    return indexed


def require_training_source(source: dict | None, source_id: str) -> dict:
    if (
        not source
        or source.get("sourceStatus") != "active"
        or source.get("licenseReview", {}).get("status") != "approved"
        or "training" not in source.get("permittedUses", [])
    ):
        raise ValueError(f"source_not_approved_for_training:{source_id}")
    return source


def extract_candidates(
    pois: list[dict],
    route: dict,
    sources: dict[str, dict],
    route_source_id: str,
    max_distance_meters: float,
) -> tuple[list[dict], list[str], str]:
    source_ids = {route_source_id}
    route_source = require_training_source(sources.get(route_source_id), route_source_id)
    route_points = decode_polyline(route["geometry"], precision=6)
    projection = RouteProjectionIndex(route_points, max_distance_meters)
    candidates = []

    for poi in pois:
        validate_schema(poi, "poi.schema.json")
        distance, fraction = projection.project(
            (poi["location"]["latitude"], poi["location"]["longitude"])
        )
        if distance <= max_distance_meters:
            poi_sources = {item["sourceRecordId"] for item in poi["evidence"]}
            for source_id in poi_sources:
                require_training_source(sources.get(source_id), source_id)
            source_ids.update(poi_sources)
            candidates.append(
                {
                    "schemaVersion": "1.0",
                    "candidateId": f"{route['routeId']}:{poi['poiId']}",
                    "routeId": route["routeId"],
                    "routeSnapshotId": route["snapshotId"],
                    "routeSourceRecordId": route_source_id,
                    "routeDistanceMeters": round(distance, 3),
                    "routeFraction": round(fraction, 8),
                    "poi": poi,
                }
            )

    candidates.sort(key=lambda row: (row["routeFraction"], row["poi"]["poiId"]))
    licenses = {sources[source_id]["license"] for source_id in source_ids}
    if licenses.issubset({"ODbL-1.0", "CC0-1.0"}) and "ODbL-1.0" in licenses:
        dataset_license = "ODbL-1.0"
    elif licenses == {"CC0-1.0"}:
        dataset_license = "CC0-1.0"
    else:
        raise ValueError("mixed_training_source_licenses_need_review")
    return candidates, sorted(source_ids), dataset_license


def write_candidates(
    candidates: list[dict],
    output: Path,
    route: dict,
    source_ids: list[str],
    dataset_license: str,
    max_distance_meters: float,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded = "".join(
        json.dumps(candidate, ensure_ascii=False, sort_keys=True) + "\n"
        for candidate in candidates
    ).encode("utf-8")
    output.write_bytes(encoded)
    manifest = {
        "schemaVersion": "1.0",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "routeId": route["routeId"],
        "routeSnapshotId": route["snapshotId"],
        "routeMode": route.get("mode"),
        "routeDistanceMeters": route["distanceMeters"],
        "maxRouteDistanceMeters": max_distance_meters,
        "sourceRecordIds": source_ids,
        "license": dataset_license,
        "candidateCount": len(candidates),
        "candidatesByCategory": dict(
            sorted(Counter(row["poi"]["category"] for row in candidates).items())
        ),
        "candidatesSha256": hashlib.sha256(encoded).hexdigest(),
        "trainingExamplesCreated": 0,
        "qualityReviewState": "pending",
        "publicUseRequirements": (
            ["Offer the complete derived candidate dataset under ODbL-1.0.", "Attribute OpenStreetMap in model documentation."]
            if dataset_license == "ODbL-1.0"
            else []
        ),
    }
    output.with_suffix(output.suffix + ".manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def validate_inputs(route: dict, max_distance_meters: float) -> None:
    validate_schema(route, "route-alternative.schema.json")
    if max_distance_meters <= 0:
        raise ValueError("route_buffer_must_be_positive")


def main() -> None:
    args = parse_args()
    route = json.loads(args.route.read_text(encoding="utf-8"))
    max_distance_meters = args.max_distance_km * 1000
    validate_inputs(route, max_distance_meters)
    sources = source_index(read_jsonl(args.sources))
    candidates, source_ids, dataset_license = extract_candidates(
        read_jsonl(args.pois),
        route,
        sources,
        args.route_source_id,
        max_distance_meters,
    )
    write_candidates(
        candidates,
        args.output,
        route,
        source_ids,
        dataset_license,
        max_distance_meters,
    )
    print(
        json.dumps(
            {
                "output": str(args.output),
                "candidateCount": len(candidates),
                "sourceRecordIds": source_ids,
                "license": dataset_license,
                "trainingExamplesCreated": 0,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f"corridor candidate extraction failed: {error}") from error
