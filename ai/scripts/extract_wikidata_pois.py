"""Extract Karnataka place facts from Wikidata into reviewable POI snapshots."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import time
import tomllib
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from jsonschema import Draft202012Validator, FormatChecker

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = PROJECT_ROOT / "ai/schemas/v1"
QID_PATTERN = re.compile(r"Q[1-9][0-9]*\Z")
CATEGORY_PATTERN = re.compile(r"[a-z][a-z0-9_]*\Z")
ITEM_PATTERN = re.compile(r"https?://www\.wikidata\.org/entity/(Q[1-9][0-9]*)\Z")
POINT_PATTERN = re.compile(
    r"Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)\Z"
)
RETRYABLE_STATUS = {429, 502, 503, 504}


class ExtractionError(ValueError):
    """An extraction input or response cannot be trusted."""

    def __init__(self, message: str, code: str = "extraction_error") -> None:
        super().__init__(message)
        self.code = code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=PROJECT_ROOT / "ai/configs/karnataka-wikidata.toml",
    )
    parser.add_argument(
        "--response-dir",
        type=Path,
        help="Replay previously saved category JSON responses without network access.",
    )
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    return (PROJECT_ROOT / value).resolve()


def load_config(path: Path) -> dict:
    with path.open("rb") as config_file:
        config = tomllib.load(config_file)
    if not config.get("categories"):
        raise ExtractionError("At least one category is required.")
    if not QID_PATTERN.fullmatch(config["source"]["administrative_entity"]):
        raise ExtractionError("Invalid administrative entity QID.")
    names = set()
    for category in config["categories"]:
        if not CATEGORY_PATTERN.fullmatch(category["name"]):
            raise ExtractionError("Invalid category name.")
        if category["name"] in names:
            raise ExtractionError(f"Duplicate category: {category['name']}")
        names.add(category["name"])
        if not category["instance_of"] or any(
            not QID_PATTERN.fullmatch(qid) for qid in category["instance_of"]
        ):
            raise ExtractionError(f"Invalid instance_of QID in {category['name']}.")
    if config["source"]["max_results_per_category"] < 1:
        raise ExtractionError("max_results_per_category must be positive.")
    if config["source"]["administrative_check_batch_size"] < 1:
        raise ExtractionError("administrative_check_batch_size must be positive.")
    if config["source"]["administrative_max_depth"] < 1:
        raise ExtractionError("administrative_max_depth must be positive.")
    return config


def build_query(config: dict, category: dict) -> str:
    classes = " ".join(f"wd:{qid}" for qid in category["instance_of"])
    limit = config["source"]["max_results_per_category"] + 1
    bounds = config["normalization"]
    southwest = f"Point({bounds['minimum_longitude']} {bounds['minimum_latitude']})"
    northeast = f"Point({bounds['maximum_longitude']} {bounds['maximum_latitude']})"
    return (
        "SELECT DISTINCT ?place ?name ?location ?kind WHERE {\n"
        "  SERVICE wikibase:box {\n"
        "    ?place wdt:P625 ?location .\n"
        f'    bd:serviceParam wikibase:cornerSouthWest "{southwest}"^^geo:wktLiteral ;\n'
        f'                    wikibase:cornerNorthEast "{northeast}"^^geo:wktLiteral .\n'
        "  }\n"
        f"  VALUES ?kind {{ {classes} }}\n"
        "  ?place wdt:P31 ?kind ;\n"
        "         rdfs:label ?name .\n"
        '  FILTER(LANG(?name) = "en")\n'
        "}\n"
        "ORDER BY ?place\n"
        f"LIMIT {limit}\n"
    )


def candidate_ids(response: dict) -> list[str]:
    rows = response.get("results", {}).get("bindings")
    if not isinstance(rows, list):
        raise ExtractionError("Invalid Wikidata candidate response.")
    ids = set()
    for row in rows:
        match = ITEM_PATTERN.fullmatch(row.get("place", {}).get("value", ""))
        if match is not None:
            ids.add(match.group(1))
    return sorted(ids)


def membership_ids(response: dict) -> set[str]:
    rows = response.get("results", {}).get("bindings")
    if not isinstance(rows, list):
        raise ExtractionError("Invalid Wikidata administrative response.")
    ids = set()
    for row in rows:
        match = ITEM_PATTERN.fullmatch(row.get("place", {}).get("value", ""))
        if match is None:
            raise ExtractionError("Invalid item in Wikidata administrative response.")
        ids.add(match.group(1))
    return ids


def administrative_parents(entity: dict) -> set[str]:
    claims = entity.get("claims", {})
    if not isinstance(claims, dict):
        return set()
    parents = set()
    for claim in claims.get("P131", []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        qid = value.get("id") if isinstance(value, dict) else None
        if isinstance(qid, str) and QID_PATTERN.fullmatch(qid):
            parents.add(qid)
    return parents


def fetch_entities(item_ids: list[str], config: dict) -> dict:
    source = config["source"]
    ids = "|".join(item_ids)
    parameters = {
        "action": "wbgetentities",
        "ids": ids,
        "props": "claims",
        "format": "json",
    }
    request = Request(
        f"{source['entity_api_endpoint']}?{urlencode(parameters)}",
        headers={"User-Agent": source["user_agent"]},
    )
    for attempt in range(source["retry_attempts"]):
        try:
            with urlopen(request, timeout=source["request_timeout_seconds"]) as response:
                result = json.load(response)
            if not isinstance(result.get("entities"), dict):
                raise ExtractionError("Invalid Wikidata entity API response.")
            return result
        except HTTPError as error:
            if error.code not in RETRYABLE_STATUS or attempt == source["retry_attempts"] - 1:
                raise ExtractionError(f"Wikidata API HTTP {error.code} while checking administration.") from error
            delay = error.headers.get("Retry-After", "")
            time.sleep(int(delay) if delay.isdecimal() else min(2 ** attempt, 8))
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == source["retry_attempts"] - 1:
                raise ExtractionError("Wikidata entity API failed after retries.") from error
            time.sleep(min(2 ** attempt, 8))
    raise ExtractionError("Wikidata entity API could not be completed.")


def fetch_membership(candidate_qids: list[str], config: dict) -> tuple[dict, list[dict], str]:
    if not candidate_qids:
        return {"results": {"bindings": []}}, [], "No candidate QIDs."
    source = config["source"]
    batch_size = source["administrative_check_batch_size"]
    target = source["administrative_entity"]
    pending = set(candidate_qids)
    visited = set()
    parent_graph = {}
    audits = []
    request_notes = []
    max_depth = source["administrative_max_depth"]

    for depth in range(max_depth):
        current = sorted(pending - visited)
        if not current:
            break
        pending = set()
        parents_by_id = {}
        for start in range(0, len(current), batch_size):
            batch = current[start : start + batch_size]
            print(
                f"Checking Karnataka administration, hierarchy level {depth + 1}: "
                f"{start + 1}-{start + len(batch)} of {len(current)} entities",
                flush=True,
            )
            if audits:
                time.sleep(source["delay_between_queries_seconds"])
            result = fetch_entities(batch, config)
            audits.append(result)
            request_notes.append(f"level={depth + 1} ids={'|'.join(batch)}")
            for qid in batch:
                entity = result["entities"].get(qid, {})
                parents_by_id[qid] = administrative_parents(entity)
            visited.update(batch)
        for qid, parents in parents_by_id.items():
            parent_graph[qid] = parents
            pending.update(parent for parent in parents if parent != target and parent not in visited)
    if pending - visited:
        raise ExtractionError("Administrative hierarchy exceeded configured maximum depth.")
    def reaches_target(qid: str, path: set[str]) -> bool:
        if qid == target:
            return True
        if qid in path:
            return False
        return any(
            reaches_target(parent, path | {qid})
            for parent in parent_graph.get(qid, set())
        )

    accepted = {qid for qid in candidate_qids if reaches_target(qid, set())}
    normalized = {
        "results": {
            "bindings": [
                {"place": {"value": f"http://www.wikidata.org/entity/{qid}"}}
                for qid in sorted(accepted)
            ]
        }
    }
    return normalized, audits, "\n".join(request_notes)


def fetch_response(query: str, config: dict) -> dict:
    source = config["source"]
    url = f"{source['endpoint']}?{urlencode({'query': query})}"
    request = Request(
        url,
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": source["user_agent"],
        },
    )
    attempts = source["retry_attempts"]
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=source["request_timeout_seconds"]) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code not in RETRYABLE_STATUS or attempt == attempts - 1:
                raise ExtractionError(f"Wikidata HTTP {error.code} while fetching a category.") from error
            delay = error.headers.get("Retry-After", "")
            time.sleep(int(delay) if delay.isdecimal() else min(2 ** attempt, 8))
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == attempts - 1:
                raise ExtractionError("Wikidata query failed after retries.") from error
            time.sleep(min(2 ** attempt, 8))
    raise ExtractionError("Wikidata query could not be completed.")


def binding_value(row: dict, key: str) -> str:
    value = row.get(key, {}).get("value")
    if not isinstance(value, str):
        raise ExtractionError(f"Missing {key} in Wikidata response row.")
    return value


def point_from_wkt(value: str) -> tuple[float, float]:
    match = POINT_PATTERN.fullmatch(value)
    if match is None:
        raise ExtractionError(f"Invalid Wikidata coordinate: {value}")
    longitude, latitude = map(float, match.groups())
    return latitude, longitude


def english_name(value: str) -> bool:
    name = value.strip()
    if not name or not any(character.isalpha() for character in name):
        return False
    return all(
        "LATIN" in unicodedata.name(character, "")
        for character in name
        if character.isalpha()
    )


def in_bounds(latitude: float, longitude: float, config: dict) -> bool:
    limits = config["normalization"]
    return (
        limits["minimum_latitude"] <= latitude <= limits["maximum_latitude"]
        and limits["minimum_longitude"] <= longitude <= limits["maximum_longitude"]
    )


def make_poi(row: dict, category: str, source_id: str, fetched_at: str, config: dict) -> dict:
    item_match = ITEM_PATTERN.fullmatch(binding_value(row, "place"))
    kind_match = ITEM_PATTERN.fullmatch(binding_value(row, "kind"))
    if item_match is None or kind_match is None:
        raise ExtractionError("Wikidata response contains an invalid item URI.")
    item_id, kind_id = item_match.group(1), kind_match.group(1)
    latitude, longitude = point_from_wkt(binding_value(row, "location"))
    name = binding_value(row, "name").strip()
    if not english_name(name):
        raise ExtractionError("Wikidata item has no usable English label.")
    if not in_bounds(latitude, longitude, config):
        raise ExtractionError("Wikidata coordinate is outside Karnataka bounds.")
    return {
        "schemaVersion": "1.0",
        "poiId": f"wikidata-{item_id.lower()}",
        "displayName": name,
        "category": category,
        "location": {"latitude": latitude, "longitude": longitude},
        "facilities": {},
        "openingHours": None,
        "priceRange": None,
        "quality": {
            "state": "unverified",
            "confidence": config["normalization"]["quality_confidence"],
            "updatedAt": fetched_at,
            "lastVerifiedAt": None,
        },
        "evidence": [
            {
                "sourceRecordId": source_id,
                "fact": f"English label and coordinate; instance of {kind_id}; Karnataka administrative hierarchy.",
                "observedAt": fetched_at,
            }
        ],
        "extensions": {"itemId": item_id, "itemUri": f"https://www.wikidata.org/wiki/{item_id}"},
    }


def normalize_response(
    response: dict,
    permitted_item_ids: set[str],
    category: dict,
    source_id: str,
    fetched_at: str,
    config: dict,
    excluded_terms: list[str],
    seen_ids: set[str],
) -> tuple[list[dict], Counter]:
    rows = response.get("results", {}).get("bindings")
    if not isinstance(rows, list):
        raise ExtractionError(f"Invalid response for {category['name']}.")
    if len(rows) > config["source"]["max_results_per_category"]:
        raise ExtractionError(
            f"Result cap exceeded for {category['name']}; raise max_results_per_category.",
            code="result_cap_exceeded",
        )
    records = []
    counts = Counter()
    for row in rows:
        match = ITEM_PATTERN.fullmatch(row.get("place", {}).get("value", ""))
        if match is None or match.group(1) not in permitted_item_ids:
            counts["outside_karnataka_or_missing_admin"] += 1
            continue
        try:
            record = make_poi(row, category["name"], source_id, fetched_at, config)
        except ExtractionError as error:
            counts[str(error)] += 1
            continue
        if any(term.casefold() in record["displayName"].casefold() for term in excluded_terms):
            counts["excluded_platform_name"] += 1
            continue
        if record["poiId"] in seen_ids:
            counts["duplicate_item"] += 1
            continue
        seen_ids.add(record["poiId"])
        records.append(record)
    return records, counts


def source_record(source_id: str, fetched_at: str) -> dict:
    return {
        "schemaVersion": "1.0",
        "sourceRecordId": source_id,
        "sourceName": "Wikidata structured items for Karnataka",
        "sourceType": "open_dataset",
        "sourceUri": "https://query.wikidata.org/sparql",
        "maintainer": "AnantYatra data pipeline",
        "license": "CC0-1.0",
        "licenseReview": {
            "status": "approved",
            "reviewedAt": fetched_at,
            "reviewer": "AnantYatra engineering review",
            "rationale": "Wikidata's official licensing page places structured item data under CC0. This extract uses English item labels, P31 classes, P131 administrative hierarchy, and P625 coordinates; it excludes article text and descriptions. Internal source-use review permits training, evaluation, search, and display of these structured facts. Individual facts and training examples still require separate quality and human review.",
        },
        "sourceStatus": "active",
        "attributionText": "Wikidata contributors; structured data available under CC0 1.0.",
        "fetchedAt": fetched_at,
        "publishedAt": None,
        "lastVerifiedAt": None,
        "permittedUses": ["local_processing", "runtime_search", "training", "evaluation", "display", "attribution"],
        "refreshFrequency": "On demand; each fetch creates a dated snapshot.",
        "retentionPolicy": "Retain raw query responses, normalized records, queries, and hashes with each snapshot.",
        "extensions": {"licenseUri": "https://www.wikidata.org/wiki/Wikidata:Licensing"},
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_records(records: list[dict], source: dict) -> None:
    for schema_name, values in (
        ("poi.schema.json", records),
        ("source-record.schema.json", [source]),
    ):
        schema = json.loads((SCHEMA_DIR / schema_name).read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        for value in values:
            if not validator.is_valid(value):
                raise ExtractionError(f"Generated record failed {schema_name} validation.")


def write_snapshot(
    config: dict,
    responses: dict[str, dict],
    queries: dict[str, str],
    records: list[dict],
    source: dict,
    counts: Counter,
) -> Path:
    output_root = resolve_path(config["output"]["directory"])
    output_root.mkdir(parents=True, exist_ok=True)
    snapshot_id = source["sourceRecordId"]
    final_dir = output_root / snapshot_id
    if final_dir.exists():
        raise ExtractionError(f"Snapshot already exists: {final_dir}")
    temporary_dir = output_root / f".{snapshot_id}.partial"
    if temporary_dir.exists():
        raise ExtractionError(f"Partial snapshot already exists: {temporary_dir}")
    temporary_dir.mkdir()
    try:
        for category, response in responses.items():
            (temporary_dir / f"{category}.response.json").write_text(
                json.dumps(response, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        for category, query in queries.items():
            suffix = ".sparql" if "SELECT " in query else ".request.txt"
            (temporary_dir / f"{category}{suffix}").write_text(query, encoding="utf-8")
        (temporary_dir / "pois.jsonl").write_text(
            "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
            encoding="utf-8",
        )
        (temporary_dir / "source-record.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        file_hashes = {
            path.name: sha256_file(path)
            for path in sorted(temporary_dir.iterdir())
            if path.is_file()
        }
        report = {
            "schemaVersion": "1.0",
            "sourceRecordId": snapshot_id,
            "fetchedAt": source["fetchedAt"],
            "recordCount": len(records),
            "recordsByCategory": dict(sorted(Counter(record["category"] for record in records).items())),
            "excludedRows": dict(sorted(counts.items())),
            "sha256": file_hashes,
            "trainingExamplesCreated": 0,
            "qualityReviewState": "pending",
        }
        (temporary_dir / "report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        temporary_dir.rename(final_dir)
    except BaseException:
        shutil.rmtree(temporary_dir)
        raise
    return final_dir


def extract(config: dict, response_dir: Path | None = None) -> Path:
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    snapshot_stamp = fetched_at.replace("-", "").replace(":", "").replace(".", "")
    source_id = f"wikidata-karnataka-{snapshot_stamp.lower()}"
    source = source_record(source_id, fetched_at)
    with resolve_path(config["normalization"]["brand_policy_file"]).open("rb") as policy_file:
        excluded_terms = tomllib.load(policy_file)["excluded_platform_terms"]
    responses = {}
    queries = {}
    records = []
    counts = Counter()
    seen_ids = set()
    for index, category in enumerate(config["categories"]):
        if index and response_dir is None:
            time.sleep(config["source"]["delay_between_queries_seconds"])
        name = category["name"]
        print(f"Extracting {name} candidates", flush=True)
        query = build_query(config, category)
        if response_dir is None:
            response = fetch_response(query, config)
            membership, membership_audits, membership_query = fetch_membership(candidate_ids(response), config)
        else:
            response = json.loads((response_dir / f"{name}.response.json").read_text(encoding="utf-8"))
            membership = json.loads((response_dir / f"{name}.membership.response.json").read_text(encoding="utf-8"))
            membership_query = (response_dir / f"{name}.membership.request.txt").read_text(encoding="utf-8") if (response_dir / f"{name}.membership.request.txt").exists() else "Offline replay fixture; API audit response unavailable."
            membership_audits = []
            audit_index = 0
            while (response_dir / f"{name}.membership-api-{audit_index:03d}.response.json").exists():
                membership_audits.append(json.loads((response_dir / f"{name}.membership-api-{audit_index:03d}.response.json").read_text(encoding="utf-8")))
                audit_index += 1
        responses[name] = response
        responses[f"{name}.membership"] = membership
        for audit_index, audit in enumerate(membership_audits):
            responses[f"{name}.membership-api-{audit_index:03d}"] = audit
        queries[name] = query
        queries[f"{name}.membership"] = membership_query
        category_records, excluded = normalize_response(
            response, membership_ids(membership), category, source_id,
            fetched_at, config, excluded_terms, seen_ids
        )
        records.extend(category_records)
        counts.update(excluded)
        print(f"Accepted {len(category_records)} {name} POIs", flush=True)
    if not records:
        raise ExtractionError("No eligible Karnataka POIs were found; no snapshot was written.")
    records.sort(key=lambda record: record["poiId"])
    validate_records(records, source)
    return write_snapshot(config, responses, queries, records, source, counts)


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    snapshot_dir = extract(config, args.response_dir)
    report = json.loads((snapshot_dir / "report.json").read_text(encoding="utf-8"))
    print(json.dumps({"snapshotDirectory": str(snapshot_dir), **report}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ExtractionError, OSError, KeyError, TypeError) as error:
        raise SystemExit(f"Wikidata extraction failed: {error}") from error
