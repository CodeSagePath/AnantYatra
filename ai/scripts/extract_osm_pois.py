"""Extract and normalize named Karnataka POIs from a dated OSM PBF snapshot."""

import argparse
import hashlib
import json
import math
import sys
import time
import tomllib
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import osmium
from shapely.geometry import Polygon


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    return parser.parse_args()


def resolve_path(path_value: str) -> Path:
    project_root = Path(__file__).resolve().parents[2]
    return (project_root / path_value).resolve()


def load_config(path: Path) -> dict:
    with path.open("rb") as config_file:
        return tomllib.load(config_file)


def build_category_map(config: dict) -> dict[tuple[str, str], str]:
    mapping = {}
    for category in config["categories"]:
        for expression in category["tags"]:
            key, value = expression.split("=", maxsplit=1)
            mapping[(key, value)] = category["name"]
    return mapping


def display_name(tags: dict[str, str]) -> str | None:
    name = (tags.get("name:en") or tags.get("name") or "").strip()
    if not name or not any(character.isalpha() for character in name):
        return None
    for character in name:
        if character.isalpha() and "LATIN" not in unicodedata.name(character, ""):
            return None
    return name


def category_for(tags: dict[str, str], categories: dict[tuple[str, str], str]) -> str | None:
    for (key, value), category in categories.items():
        if tags.get(key) == value:
            return category
    return None


def point_from_object(obj) -> tuple[float, float] | None:
    if obj.is_node():
        if not obj.location.valid():
            return None
        return obj.location.lat, obj.location.lon
    if obj.is_way():
        nodes = list(obj.nodes)
        if len(nodes) < 4 or nodes[0].ref != nodes[-1].ref:
            return None
        coordinates = [
            (node.lon, node.lat)
            for node in nodes
            if node.location.valid()
        ]
        if len(coordinates) != len(nodes):
            return None
        try:
            geometry = Polygon(coordinates)
        except (ValueError, TypeError):
            return None
        if geometry.is_empty or not geometry.is_valid:
            return None
        return geometry.centroid.y, geometry.centroid.x
    return None


def facility_state(value: str | None) -> str:
    normalized = (value or "").casefold()
    if normalized in {"yes", "1", "available", "designated", "permissive"}:
        return "available"
    if normalized in {"no", "0"}:
        return "unavailable"
    return "unknown"


def facility_tags(tags: dict[str, str]) -> dict[str, str]:
    keys = {
        "toilets": "toilets",
        "wheelchair": "wheelchair_accessible",
        "parking": "parking",
        "internet_access": "internet_access",
        "changing_table": "changing_table",
        "drinking_water": "drinking_water",
    }
    facilities = {
        output_key: facility_state(tags.get(input_key))
        for input_key, output_key in keys.items()
        if input_key in tags
    }
    if tags.get("amenity") == "drinking_water":
        facilities["drinking_water"] = "available"
    return facilities


def object_identity(obj) -> str:
    if obj.is_node():
        return f"osm-node-{obj.id}"
    return f"osm-way-{obj.id}"


def object_label(obj) -> str:
    if obj.is_node():
        return f"node {obj.id}"
    return f"way {obj.id}"


def haversine_meters(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    lat_delta = lat2 - lat1
    lon_delta = lon2 - lon1
    value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(lon_delta / 2) ** 2
    )
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def name_key(name: str) -> str:
    return " ".join(name.casefold().split())


def grid_cell(
    point: tuple[float, float], distance_meters: float
) -> tuple[int, int]:
    latitude, longitude = point
    latitude_step = distance_meters / 111_000
    longitude_step = distance_meters / (111_000 * max(0.1, math.cos(math.radians(latitude))))
    return round(latitude / latitude_step), round(longitude / longitude_step)


def merge_record(existing: dict, incoming: dict) -> None:
    for key, value in incoming["facilities"].items():
        current = existing["facilities"].get(key, "unknown")
        existing["facilities"][key] = value if current == "unknown" else current if value in {"unknown", current} else "unknown"
    if existing["openingHours"] is None:
        existing["openingHours"] = incoming["openingHours"]
    existing["evidence"].extend(incoming["evidence"])


def insert_deduplicated(
    record: dict,
    records: list[dict],
    cells: dict,
    distance_meters: float,
) -> bool:
    category = record["category"]
    normalized_name = name_key(record["displayName"])
    record_point = (
        record["location"]["latitude"],
        record["location"]["longitude"],
    )
    cell_latitude, cell_longitude = grid_cell(record_point, distance_meters)
    for latitude_delta in (-1, 0, 1):
        for longitude_delta in (-1, 0, 1):
            key = (
                category,
                normalized_name,
                cell_latitude + latitude_delta,
                cell_longitude + longitude_delta,
            )
            for index in cells.get(key, []):
                existing = records[index]
                existing_point = (
                    existing["location"]["latitude"],
                    existing["location"]["longitude"],
                )
                if haversine_meters(existing_point, record_point) <= distance_meters:
                    merge_record(existing, record)
                    return True
    bucket_key = (category, normalized_name, cell_latitude, cell_longitude)
    cells[bucket_key].append(len(records))
    records.append(record)
    return False


def make_record(
    obj,
    tags: dict[str, str],
    category: str,
    point: tuple[float, float],
    config: dict,
) -> dict:
    snapshot_at = config["input"]["snapshot_at"]
    source_id = config["input"]["source_record_id"]
    fact_tags = {
        key: tags[key]
        for key in (
            "amenity",
            "historic",
            "shop",
            "tourism",
            "toilets",
            "wheelchair",
            "parking",
            "internet_access",
            "changing_table",
            "drinking_water",
            "bicycle_parking",
            "bicycle",
            "service:bicycle:pump",
            "surface",
        )
        if key in tags
    }
    fact = f"OSM {object_label(obj)} tags: {json.dumps(fact_tags, sort_keys=True)}"
    return {
        "schemaVersion": "1.0",
        "poiId": object_identity(obj),
        "displayName": display_name(tags),
        "category": category,
        "location": {"latitude": point[0], "longitude": point[1]},
        "facilities": facility_tags(tags),
        "openingHours": tags.get("opening_hours"),
        "priceRange": None,
        "quality": {
            "state": config["normalization"]["quality_state"],
            "confidence": config["normalization"]["quality_confidence"],
            "updatedAt": snapshot_at,
            "lastVerifiedAt": None,
        },
        "evidence": [
            {
                "sourceRecordId": source_id,
                "fact": fact,
                "observedAt": snapshot_at,
            }
        ],
    }


def extract(config: dict) -> tuple[list[dict], dict]:
    categories = build_category_map(config)
    distance_meters = config["normalization"]["dedupe_distance_meters"]
    input_path = resolve_path(config["input"]["file"])
    print(f"Reading OSM snapshot: {input_path}", flush=True)
    processor = osmium.FileProcessor(resolve_path(config["input"]["file"]))
    processor = processor.with_locations()
    print("OSM location index ready; extracting named POIs", flush=True)
    records = []
    cells = defaultdict(list)
    feature_counts = Counter()
    deduplicated_count = 0
    object_count = 0
    started_at = time.monotonic()

    for obj in processor:
        object_count += 1
        if object_count % 250_000 == 0:
            elapsed = int(time.monotonic() - started_at)
            print(f"Scanned {object_count:,} objects in {elapsed}s", flush=True)
        if not (obj.is_node() or obj.is_way()):
            continue
        tags = {tag.k: tag.v for tag in obj.tags}
        category = category_for(tags, categories)
        if category is None:
            continue
        name = display_name(tags)
        if name is None:
            feature_counts["excluded_non_english_or_unnamed"] += 1
            continue
        point = point_from_object(obj)
        if point is None:
            feature_counts["excluded_invalid_geometry"] += 1
            continue
        record = make_record(obj, tags, category, point, config)
        deduplicated_count += insert_deduplicated(
            record,
            records,
            cells,
            distance_meters,
        )
        feature_counts[category] += 1

    report = {
        "schemaVersion": "1.0",
        "inputFile": config["input"]["file"],
        "inputSha256": sha256_file(input_path),
        "snapshotAt": config["input"]["snapshot_at"],
        "sourceRecordId": config["input"]["source_record_id"],
        "dedupeDistanceMeters": distance_meters,
        "featuresByCategory": dict(sorted(feature_counts.items())),
        "duplicatesMerged": deduplicated_count,
        "outputCount": len(records),
        "objectsScanned": object_count,
        "elapsedSeconds": round(time.monotonic() - started_at, 2),
    }
    return records, report


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_outputs(config: dict, records: list[dict], report: dict) -> None:
    output_path = resolve_path(config["output"]["file"])
    report_path = resolve_path(config["output"]["report_file"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as output_file:
        for record in records:
            output_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    config = load_config(parse_args().config)
    records, report = extract(config)
    write_outputs(config, records, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
