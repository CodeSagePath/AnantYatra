import unittest
from unittest.mock import patch

from extract_corridor_candidates import extract_candidates


class CorridorCandidateExtractionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.route = {
            "geometry": "encoded-route",
            "routeId": "bengaluru-mysuru",
            "snapshotId": "route-snapshot-1",
            "distanceMeters": 144_000,
        }
        self.sources = {
            "osm": {
                "sourceRecordId": "osm",
                "sourceStatus": "active",
                "licenseReview": {"status": "approved"},
                "permittedUses": ["training"],
                "license": "ODbL-1.0",
            }
        }
        self.pois = [
            {
                "poiId": "nearby",
                "category": "restaurant",
                "location": {"latitude": 1.0, "longitude": 1.0},
                "evidence": [{"sourceRecordId": "osm"}],
            },
            {
                "poiId": "far-away",
                "category": "hotel",
                "location": {"latitude": 2.0, "longitude": 2.0},
                "evidence": [{"sourceRecordId": "osm"}],
            },
        ]

    def test_keeps_only_nearby_pois_and_marks_odbl(self) -> None:
        class Projection:
            def __init__(self, _route_points, _buffer):
                pass

            def project(self, point):
                return (100.0, 0.5) if point[0] == 1.0 else (11_000.0, 0.7)

        with (
            patch("extract_corridor_candidates.validate_schema"),
            patch("extract_corridor_candidates.decode_polyline", return_value=[]),
            patch("extract_corridor_candidates.RouteProjectionIndex", Projection),
        ):
            candidates, source_ids, license_name = extract_candidates(
                self.pois, self.route, self.sources, "osm", 10_000
            )

        self.assertEqual([row["poi"]["poiId"] for row in candidates], ["nearby"])
        self.assertEqual(source_ids, ["osm"])
        self.assertEqual(license_name, "ODbL-1.0")

    def test_rejects_nearby_poi_from_unapproved_training_source(self) -> None:
        self.sources["runtime-only"] = {
            "sourceRecordId": "runtime-only",
            "sourceStatus": "active",
            "licenseReview": {"status": "approved"},
            "permittedUses": ["runtime_search", "display"],
            "license": "ODbL-1.0",
        }
        self.pois[0]["evidence"] = [{"sourceRecordId": "runtime-only"}]

        class Projection:
            def __init__(self, _route_points, _buffer):
                pass

            def project(self, _point):
                return 100.0, 0.5

        with (
            patch("extract_corridor_candidates.validate_schema"),
            patch("extract_corridor_candidates.decode_polyline", return_value=[]),
            patch("extract_corridor_candidates.RouteProjectionIndex", Projection),
            self.assertRaisesRegex(ValueError, "source_not_approved_for_training"),
        ):
            extract_candidates(self.pois, self.route, self.sources, "osm", 10_000)


if __name__ == "__main__":
    unittest.main()
