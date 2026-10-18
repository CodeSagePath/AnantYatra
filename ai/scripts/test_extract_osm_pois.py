"""Unit tests for bicycle-support POI extraction rules."""

import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from extract_osm_pois import build_category_map, facility_tags, load_config  # noqa: E402


class BicyclePoiExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        config = load_config(PROJECT_ROOT / "ai/configs/karnataka-osm-extract.toml")
        self.categories = build_category_map(config)

    def test_maps_cycle_infrastructure_categories(self) -> None:
        examples = {
            ("amenity", "bicycle_repair_station"): "bicycle_repair",
            ("shop", "bicycle"): "bicycle_shop",
            ("amenity", "bicycle_parking"): "bicycle_parking",
            ("amenity", "drinking_water"): "drinking_water",
            ("man_made", "water_tap"): "drinking_water",
        }

        for tags, expected in examples.items():
            with self.subTest(tags=tags):
                self.assertEqual(self.categories[tags], expected)

    def test_drinking_water_amenity_is_exposed_as_available_facility(self) -> None:
        self.assertEqual(
            facility_tags({"amenity": "drinking_water"}),
            {"drinking_water": "available"},
        )

    def test_water_tap_requires_explicit_drinking_water_tag(self) -> None:
        self.assertEqual(facility_tags({"man_made": "water_tap"}), {})
        self.assertEqual(
            facility_tags({"man_made": "water_tap", "drinking_water": "yes"}),
            {"drinking_water": "available"},
        )


if __name__ == "__main__":
    unittest.main()
