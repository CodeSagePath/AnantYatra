#!/usr/bin/env python3
"""Build a reproducible ODbL data-offer archive for a pinned OSM snapshot."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_ID = "osmfr-karnataka-20261017"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_source_record(path: Path, source_id: str) -> dict:
    for line in path.read_text(encoding="utf-8").splitlines():
        source = json.loads(line)
        if source.get("sourceRecordId") == source_id:
            if source.get("license") != "ODbL-1.0":
                raise ValueError("source_license_must_be_odbl_1_0")
            return source
    raise ValueError("source_record_not_found")


def build_archive(args: argparse.Namespace) -> Path:
    source = read_source_record(args.sources, args.source_id)
    if args.release_approved and (
        source.get("sourceStatus") != "active"
        or source.get("licenseReview", {}).get("status") != "approved"
        or "distribution" not in source.get("permittedUses", [])
    ):
        raise ValueError("source_not_approved_for_distribution")
    files = {
        "source.osm.pbf": args.pbf,
        "derived-pois.jsonl": args.pois,
        "rebuild/extract_osm_pois.py": ROOT / "ai/scripts/extract_osm_pois.py",
        "rebuild/karnataka-osm-extract.toml": ROOT / "ai/configs/karnataka-osm-extract.toml",
    }
    for archive_name, path in files.items():
        if not path.is_file():
            raise FileNotFoundError(f"offer_input_unavailable:{archive_name}")

    hashes = {name: sha256(path) for name, path in files.items()}
    metadata = {
        "schemaVersion": "1.0",
        "sourceRecordId": args.source_id,
        "sourceSnapshot": source.get("extensions", {}).get("snapshotTimestamp"),
        "license": "ODbL-1.0",
        "sourceStatus": source.get("sourceStatus"),
        "sourceReviewStatus": source.get("licenseReview", {}).get("status"),
        "permittedUses": source.get("permittedUses", []),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sha256": hashes,
        "draftOnly": not args.release_approved,
    }
    attribution = source.get("attributionText") or (
        "© OpenStreetMap contributors. Data available under ODbL 1.0. "
        "https://www.openstreetmap.org/copyright"
    )
    offer_text = f"""OpenStreetMap Karnataka data offer

{attribution}

The OSM source snapshot and the POI database extracted from it in this
archive are offered under the Open Database License (ODbL) 1.0:
https://opendatacommons.org/licenses/odbl/1-0/

Source snapshot: {source.get('sourceUri', 'not recorded')}
Snapshot time: {metadata['sourceSnapshot'] or 'not recorded'}
Source record: {args.source_id}

The accompanying source.osm.pbf is the pinned database used to create the
derived POI database. The rebuild directory contains the extraction script
and its configuration. Run the script against that PBF to recreate the
derived POI file; the source record and SHA-256 manifest are included for
provenance checks.

This archive is marked draftOnly={str(metadata['draftOnly']).lower()}. A draft
archive is prepared for compliance review and must not be published. A
release archive is created only when the source register approves distribution.
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.output, "w:gz") as archive:
        for archive_name, path in files.items():
            archive.add(path, arcname=archive_name, recursive=False)
        _add_bytes(archive, "source-record.json", _json_bytes(source))
        _add_bytes(archive, "manifest.json", _json_bytes(metadata))
        _add_bytes(archive, "OFFER.txt", offer_text.encode("utf-8"))
    args.output.with_suffix(args.output.suffix + ".manifest.json").write_bytes(
        _json_bytes(metadata)
    )
    return args.output


def _add_bytes(archive: tarfile.TarFile, name: str, content: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.mode = 0o644
    info.size = len(content)
    archive.addfile(info, io.BytesIO(content))


def _json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pbf",
        type=Path,
        default=ROOT / "ai/data/raw/osm/karnataka/karnataka-2026-10-17.osm.pbf",
    )
    parser.add_argument(
        "--pois",
        type=Path,
        default=ROOT / "ai/data/processed/karnataka-2026-10-17/pois.jsonl",
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=ROOT / "ai/data/source-register.jsonl",
    )
    parser.add_argument("--source-id", default=DEFAULT_SOURCE_ID)
    parser.add_argument(
        "--release-approved",
        action="store_true",
        help="Create a public-ready archive only when distribution is approved in the source register.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "ai/data/processed/osm-odbl-offer/karnataka-2026-10-17.tar.gz",
    )
    return parser.parse_args()


if __name__ == "__main__":
    try:
        print(build_archive(parse_args()))
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(str(error)) from error
