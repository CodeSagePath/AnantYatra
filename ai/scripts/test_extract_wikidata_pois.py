"""Checks for licensed Karnataka POI extraction and snapshot provenance."""

import json
import tempfile
import unittest
from pathlib import Path

from extract_wikidata_pois import (
    ExtractionError,
    build_query,
    extract,
    load_config,
    normalize_response,
    administrative_parents,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def row(qid: str, name: str, longitude: float, latitude: float) -> dict:
    return {
        "place": {"value": f"http://www.wikidata.org/entity/{qid}"},
        "name": {"value": name},
        "location": {"value": f"Point({longitude} {latitude})"},
        "kind": {"value": "http://www.wikidata.org/entity/Q34038"},
    }


def response(rows: list[dict]) -> dict:
    return {"results": {"bindings": rows}}


class WikidataExtractorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_config(PROJECT_ROOT / "ai/configs/karnataka-wikidata.toml")
        self.config["categories"] = [{"name": "attraction", "instance_of": ["Q34038"]}]
        self.config["source"]["max_results_per_category"] = 10
        self.fetched_at = "2026-10-18T12:00:00Z"
        self.source_id = "wikidata-karnataka-test"

    def test_query_limits_geography_and_admin_parent_parser(self) -> None:
        candidates = build_query(self.config, self.config["categories"][0])

        self.assertIn("wikibase:box", candidates)
        self.assertIn("wd:Q34038", candidates)
        self.assertIn("LIMIT 11", candidates)
        entity = {"claims": {"P131": [{"mainsnak": {"datavalue": {"value": {"id": "Q2981389"}}}}]}}
        self.assertEqual(administrative_parents(entity), {"Q2981389"})

    def test_filters_outside_places_and_platform_names(self) -> None:
        candidates = response([
            row("Q672241", "Jog Falls", 74.8123, 14.2293),
            row("Q38188", "Outside waterfall", 76.05, 11.48),
            row("Q222", "Google Maps Cafe", 75.2, 14.1),
            row("Q333", "ಕನ್ನಡ Falls", 75.3, 14.2),
        ])

        records, counts = normalize_response(
            candidates,
            {"Q672241", "Q222", "Q333"},
            self.config["categories"][0],
            self.source_id,
            self.fetched_at,
            self.config,
            ["Google Maps"],
            set(),
        )

        self.assertEqual([record["displayName"] for record in records], ["Jog Falls"])
        self.assertEqual(records[0]["quality"]["state"], "unverified")
        self.assertIsNone(records[0]["openingHours"])
        self.assertIsNone(records[0]["priceRange"])
        self.assertEqual(counts["outside_karnataka_or_missing_admin"], 1)
        self.assertEqual(counts["excluded_platform_name"], 1)

    def test_replays_and_writes_a_valid_reviewable_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            response_dir = root / "responses"
            response_dir.mkdir()
            self.config["output"]["directory"] = str(root / "snapshots")
            (response_dir / "attraction.response.json").write_text(
                json.dumps(response([row("Q672241", "Jog Falls", 74.8123, 14.2293)])),
                encoding="utf-8",
            )
            (response_dir / "attraction.membership.response.json").write_text(
                json.dumps(response([{"place": {"value": "http://www.wikidata.org/entity/Q672241"}}])),
                encoding="utf-8",
            )

            snapshot = extract(self.config, response_dir)

            records = [json.loads(line) for line in (snapshot / "pois.jsonl").read_text().splitlines()]
            report = json.loads((snapshot / "report.json").read_text())
            source = json.loads((snapshot / "source-record.json").read_text())
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["poiId"], "wikidata-q672241")
            self.assertEqual(records[0]["evidence"][0]["sourceRecordId"], source["sourceRecordId"])
            self.assertEqual(report["trainingExamplesCreated"], 0)
            self.assertEqual(report["qualityReviewState"], "pending")
            self.assertIn("pois.jsonl", report["sha256"])
            self.assertIn("training", source["permittedUses"])

    def test_rejects_truncated_results(self) -> None:
        self.config["source"]["max_results_per_category"] = 1
        with self.assertRaises(ExtractionError) as raised:
            normalize_response(
                response([
                    row("Q672241", "Jog Falls", 74.8123, 14.2293),
                    row("Q222", "Another Falls", 74.9, 14.3),
                ]),
                {"Q672241", "Q222"},
                self.config["categories"][0],
                self.source_id,
                self.fetched_at,
                self.config,
                [],
                set(),
            )
        self.assertEqual(raised.exception.code, "result_cap_exceeded")


if __name__ == "__main__":
    unittest.main()
