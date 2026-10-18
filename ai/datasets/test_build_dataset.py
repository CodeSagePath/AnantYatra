"""Tests for group-based dataset splitting and frozen test protection."""

import json
import tempfile
import unittest
from pathlib import Path

from build_dataset import split_records, validate_review_and_sources, write_dataset


def example(example_id: str, corridor: str, family: str, snapshot: str) -> dict:
    return {
        "exampleId": example_id,
        "messages": [{"role": "user", "content": example_id}],
        "extensions": {
            "dataset": {
                "corridorId": corridor,
                "scenarioFamily": family,
                "sourceSnapshotId": snapshot,
            }
        },
    }


class DatasetSplitTests(unittest.TestCase):
    def test_related_corridor_scenario_snapshot_examples_stay_together(self):
        records = [
            example("a1", "blr-mng", "family", "snap-a"),
            example("a2", "blr-mng", "family", "snap-a"),
            example("b", "blr-mys", "solo", "snap-b"),
            example("c", "blr-udd", "bike", "snap-c"),
        ]

        splits = split_records(records, seed=42)
        memberships = {
            record["exampleId"]: split
            for split, rows in splits.items()
            for record in rows
        }
        self.assertEqual(memberships["a1"], memberships["a2"])

    def test_frozen_test_set_cannot_be_replaced_implicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            records = [
                example("a", "a", "one", "snap-a"),
                example("b", "b", "two", "snap-b"),
                example("c", "c", "three", "snap-c"),
            ]
            write_dataset(records, output_dir, seed=42, refresh_frozen_test=False)
            first_test = (output_dir / "test.jsonl").read_bytes()
            test_group = json.loads(first_test.splitlines()[0])["extensions"]["dataset"]
            changed = records + [
                example(
                    "d",
                    test_group["corridorId"],
                    test_group["scenarioFamily"],
                    test_group["sourceSnapshotId"],
                )
            ]
            with self.assertRaisesRegex(ValueError, "Frozen test set differs"):
                write_dataset(changed, output_dir, seed=42, refresh_frozen_test=False)
            self.assertEqual((output_dir / "test.jsonl").read_bytes(), first_test)

    def test_manifest_records_hashes_and_split_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            records = [
                example("a", "a", "one", "snap-a"),
                example("b", "b", "two", "snap-b"),
                example("c", "c", "three", "snap-c"),
            ]
            write_dataset(records, output_dir, seed=42, refresh_frozen_test=False)
            manifest = json.loads((output_dir / "manifest.json").read_text())
            self.assertTrue(manifest["testSetFrozen"])
            self.assertEqual(set(manifest["sha256"]), {"train.jsonl", "validation.jsonl", "test.jsonl"})

    def test_pending_source_is_rejected_for_training(self):
        record = example("draft", "corridor", "family", "snapshot")
        record["provenance"] = {"sourceRecordIds": ["pending-source"]}
        record["extensions"]["dataset"]["reviewedBy"] = "reviewer-1"
        source = {
            "sourceStatus": "active",
            "permittedUses": ["local_processing"],
            "licenseReview": {"status": "pending"},
        }

        with self.assertRaisesRegex(ValueError, "not approved for training"):
            validate_review_and_sources([record], {"pending-source": source})

    def test_model_cannot_be_named_as_human_reviewer(self):
        record = example("draft", "corridor", "family", "snapshot")
        record["provenance"] = {"sourceRecordIds": ["approved-source"]}
        record["extensions"]["dataset"]["reviewedBy"] = "assistant"

        with self.assertRaisesRegex(ValueError, "reviewed by a human"):
            validate_review_and_sources([record], {})


if __name__ == "__main__":
    unittest.main()
