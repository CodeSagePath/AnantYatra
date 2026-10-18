"""Create a provenance-preserving geographic subset of a Wikidata POI snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--center-latitude", required=True, type=float)
    parser.add_argument("--center-longitude", required=True, type=float)
    parser.add_argument("--radius-km", required=True, type=float)
    return parser.parse_args()


def haversine_km(first: tuple[float, float], second: tuple[float, float]) -> float:
    first_latitude, first_longitude = map(math.radians, first)
    second_latitude, second_longitude = map(math.radians, second)
    latitude_delta = second_latitude - first_latitude
    longitude_delta = second_longitude - first_longitude
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(first_latitude)
        * math.cos(second_latitude)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(math.sqrt(haversine))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_pois(snapshot: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in (snapshot / "pois.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def filter_pois(
    pois: list[dict], center: tuple[float, float], radius_km: float
) -> list[dict]:
    return [
        poi
        for poi in pois
        if haversine_km(
            center,
            (poi["location"]["latitude"], poi["location"]["longitude"]),
        )
        <= radius_km
    ]


def write_subset(
    snapshot: Path,
    output: Path,
    center: tuple[float, float],
    radius_km: float,
) -> dict:
    source = json.loads((snapshot / "source-record.json").read_text(encoding="utf-8"))
    if (
        source.get("license") != "CC0-1.0"
        or "training" not in source.get("permittedUses", [])
    ):
        raise ValueError("radius_subset_requires_training_approved_cc0_source")

    pois = read_pois(snapshot)
    selected = filter_pois(pois, center, radius_km)
    output.mkdir(parents=True, exist_ok=False)
    output_pois = output / "pois.jsonl"
    output_pois.write_text(
        "".join(json.dumps(poi, ensure_ascii=False) + "\n" for poi in selected),
        encoding="utf-8",
    )
    (output / "source-record.json").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    manifest = {
        "schemaVersion": "1.0",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceSnapshotId": source["sourceRecordId"],
        "sourcePoisSha256": sha256_file(snapshot / "pois.jsonl"),
        "subsetPoisSha256": sha256_file(output_pois),
        "center": {"latitude": center[0], "longitude": center[1]},
        "radiusKm": radius_km,
        "distanceMethod": "haversine great-circle distance",
        "recordCount": len(selected),
        "recordsByCategory": dict(sorted(Counter(poi["category"] for poi in selected).items())),
        "qualityReviewState": "pending",
        "trainingExamplesCreated": 0,
        "limitations": [
            "This geographic subset is a place-fact candidate set, not a route-distance guarantee.",
            "Records are unverified; review each place before relying on it.",
            "This dataset contains no request-to-itinerary supervision.",
        ],
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> int:
    args = parse_args()
    if not -90 <= args.center_latitude <= 90 or not -180 <= args.center_longitude <= 180:
        raise SystemExit("Center coordinates are outside valid latitude/longitude bounds.")
    if args.radius_km <= 0:
        raise SystemExit("Radius must be positive.")
    manifest = write_subset(
        args.snapshot,
        args.output,
        (args.center_latitude, args.center_longitude),
        args.radius_km,
    )
    print(json.dumps({"output": str(args.output), **manifest}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
