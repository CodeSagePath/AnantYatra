import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGER = PROJECT_ROOT / "scripts/package-osm-offer.py"


class OsmDataOfferTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.pbf = self.root / "snapshot.osm.pbf"
        self.pois = self.root / "pois.jsonl"
        self.sources = self.root / "sources.jsonl"
        self.output = self.root / "offer.tar.gz"
        self.pbf.write_bytes(b"pinned source snapshot")
        self.pois.write_text('{"poiId":"sample"}\n', encoding="utf-8")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def source_record(self, review_status, permitted_uses):
        return {
            "schemaVersion": "1.0",
            "sourceRecordId": "sample-osm",
            "sourceName": "sample OSM source",
            "sourceType": "open_dataset",
            "sourceUri": "https://example.test/sample.osm.pbf",
            "maintainer": "test",
            "license": "ODbL-1.0",
            "licenseReview": {"status": review_status},
            "sourceStatus": "active",
            "attributionText": "© OpenStreetMap contributors.",
            "permittedUses": permitted_uses,
            "extensions": {"snapshotTimestamp": "2026-10-17T00:00:00Z"},
        }

    def write_source(self, record):
        self.sources.write_text(json.dumps(record) + "\n", encoding="utf-8")

    def run_packager(self):
        return subprocess.run(
            [
                sys.executable,
                str(PACKAGER),
                "--pbf",
                str(self.pbf),
                "--pois",
                str(self.pois),
                "--sources",
                str(self.sources),
                "--source-id",
                "sample-osm",
                "--output",
                str(self.output),
                "--release-approved",
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_release_archive_contains_pinned_data_notice_and_rebuild_inputs(self):
        self.write_source(self.source_record("approved", ["distribution"]))

        result = self.run_packager()

        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads(Path(f"{self.output}.manifest.json").read_text())
        self.assertFalse(manifest["draftOnly"])
        with tarfile.open(self.output, "r:gz") as archive:
            names = set(archive.getnames())
            self.assertIn("source.osm.pbf", names)
            self.assertIn("derived-pois.jsonl", names)
            self.assertIn("source-record.json", names)
            self.assertIn("rebuild/extract_osm_pois.py", names)
            offer = archive.extractfile("OFFER.txt").read().decode("utf-8")
            self.assertIn("ODbL", offer)

    def test_release_archive_is_blocked_without_approved_distribution(self):
        self.write_source(self.source_record("pending", ["local_processing"]))

        result = self.run_packager()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source_not_approved_for_distribution", result.stderr)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
