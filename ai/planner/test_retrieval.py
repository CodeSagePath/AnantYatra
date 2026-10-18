"""Tests for permission gates, hybrid ranking, provenance, and route filtering."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from retrieval import (
    RetrievalDocument,
    approved_source_ids,
    build_documents,
    corpus_fingerprint,
    filter_by_route,
    load_index,
    save_index,
    search,
    retrieval_metrics,
)


class FakeProvider:
    model_id = "test/fake"
    revision = "test-revision"

    def encode_passages(self, texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0] if "quiet" in text else [0.0, 1.0] for text in texts]

    def encode_query(self, text: str) -> list[float]:
        return [1.0, 0.0]


def doc(poi_id: str, text: str, vector: tuple[float, ...], lat: float = 0.0) -> RetrievalDocument:
    evidence = ({"sourceRecordId": "approved", "fact": text, "observedAt": "2026-01-01T00:00:00Z"},)
    return RetrievalDocument(
        poi_id=poi_id,
        display_name=poi_id,
        category="restaurant",
        text=text,
        latitude=lat,
        longitude=0.0,
        evidence=evidence,
        source_ids=("approved",),
        content_hash=f"hash-{poi_id}",
        vector=vector,
    )


class RetrievalTests(unittest.TestCase):
    def test_only_sources_approved_for_search_and_display_are_eligible(self) -> None:
        sources = [
            {"sourceRecordId": "approved", "sourceStatus": "active", "licenseReview": {"status": "approved"}, "permittedUses": ["runtime_search", "display"]},
            {"sourceRecordId": "pending", "sourceStatus": "active", "licenseReview": {"status": "pending"}, "permittedUses": ["runtime_search", "display"]},
            {"sourceRecordId": "training-only", "sourceStatus": "active", "licenseReview": {"status": "approved"}, "permittedUses": ["training"]},
        ]
        self.assertEqual(approved_source_ids(sources), {"approved"})

    def test_index_builder_discards_unapproved_evidence_and_retains_provenance(self) -> None:
        poi = {
            "poiId": "rest-1",
            "displayName": "Quiet Garden",
            "category": "restaurant",
            "location": {"latitude": 12.0, "longitude": 77.0},
            "facilities": {"parking": "available"},
            "evidence": [
                {"sourceRecordId": "approved", "fact": "family dining", "observedAt": "2026-01-01T00:00:00Z"},
                {"sourceRecordId": "pending", "fact": "unreviewed claim", "observedAt": "2026-01-02T00:00:00Z"},
            ],
        }
        sources = [
            {"sourceRecordId": "approved", "sourceStatus": "active", "licenseReview": {"status": "approved"}, "permittedUses": ["runtime_search", "display"]},
            {"sourceRecordId": "pending", "sourceStatus": "active", "licenseReview": {"status": "pending"}, "permittedUses": ["runtime_search", "display"]},
        ]
        documents = build_documents([poi], sources, FakeProvider())
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0].source_ids, ("approved",))
        self.assertNotIn("unreviewed claim", documents[0].text)
        self.assertEqual(documents[0].display_name, "Quiet Garden")

    def test_index_builder_excludes_platform_brand_terms_from_indexed_text(self) -> None:
        poi = {
            "poiId": "rest-2",
            "displayName": "Quiet Garden",
            "category": "restaurant",
            "location": {"latitude": 12.0, "longitude": 77.0},
            "evidence": [
                {"sourceRecordId": "approved", "fact": "Google Maps listing says family dining", "observedAt": "2026-01-01T00:00:00Z"},
                {"sourceRecordId": "approved", "fact": "Family dining with parking", "observedAt": "2026-01-02T00:00:00Z"},
            ],
        }
        sources = [{"sourceRecordId": "approved", "sourceStatus": "active", "licenseReview": {"status": "approved"}, "permittedUses": ["runtime_search", "display"]}]
        documents = build_documents([poi], sources, FakeProvider())
        self.assertEqual(len(documents), 1)
        self.assertNotIn("Google", documents[0].text)
        self.assertEqual(len(documents[0].evidence), 1)

    def test_rrf_combines_lexical_and_semantic_rankings_and_keeps_evidence(self) -> None:
        documents = [
            doc("lexical", "quiet family vegetarian parking", (0.0, 1.0)),
            doc("semantic", "calm place with child friendly facilities", (1.0, 0.0)),
            doc("other", "fuel station", (0.0, 1.0)),
        ]
        results = search("quiet family parking", documents, [1.0, 0.0], limit=3)
        self.assertEqual(results[0]["poiId"], "lexical")
        self.assertIn("semantic", [item["poiId"] for item in results[:2]])
        self.assertEqual(results[0]["evidence"][0]["sourceRecordId"], "approved")
        self.assertEqual(results[0]["sourceIds"], ["approved"])

    def test_route_filter_runs_after_retrieval_and_preserves_rank_order(self) -> None:
        documents = [doc("near", "quiet restaurant", (1.0, 0.0)), doc("far", "quiet restaurant", (1.0, 0.0), lat=1.0)]
        results = search("quiet", documents, [1.0, 0.0], limit=2)
        filtered = filter_by_route(results, documents, [(0.0, 0.0), (0.0, 1.0)], 1000)
        self.assertEqual([item["poiId"] for item in filtered], ["near"])
        self.assertLessEqual(filtered[0]["routeDistanceMeters"], 1000)

    def test_index_round_trip_preserves_model_revision_and_provenance(self) -> None:
        provider = FakeProvider()
        original = [doc("one", "quiet stop", (1.0, 0.0))]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "index.json"
            save_index(path, original, provider, "snapshot-hash")
            metadata, fingerprint, loaded = load_index(path)
        self.assertEqual(metadata["revision"], provider.revision)
        self.assertEqual(fingerprint, "snapshot-hash")
        self.assertEqual(loaded[0].source_ids, ("approved",))
        self.assertEqual(loaded[0].evidence[0]["observedAt"], "2026-01-01T00:00:00Z")

    def test_corpus_fingerprint_changes_when_source_snapshot_changes(self) -> None:
        pois = [{"poiId": "one"}]
        first = [{"sourceRecordId": "source", "sourceStatus": "active"}]
        changed = [{"sourceRecordId": "source", "sourceStatus": "withdrawn"}]
        self.assertNotEqual(corpus_fingerprint(pois, first), corpus_fingerprint(pois, changed))

    def test_retrieval_metrics_support_baseline_comparison(self) -> None:
        results = [{"poiId": "a"}, {"poiId": "b"}, {"poiId": "c"}]
        metrics = retrieval_metrics(results, {"b", "c"}, k=2)
        self.assertEqual(metrics["recallAtK"], 0.5)
        self.assertEqual(metrics["reciprocalRank"], 0.5)


if __name__ == "__main__":
    unittest.main()
