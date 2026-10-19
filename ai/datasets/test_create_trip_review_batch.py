import unittest

from create_trip_review_batch import pick_candidates


def candidate(poi_id: str, category: str, fraction: float) -> dict:
    return {
        "routeFraction": fraction,
        "poi": {"poiId": poi_id, "category": category},
    }


class TripReviewBatchCandidateTests(unittest.TestCase):
    def test_fuel_range_case_has_one_route_ordered_fuel_option(self) -> None:
        rows = [
            candidate("fuel-early", "fuel_station", 0.2),
            candidate("fuel-mid", "fuel_station", 0.58),
            candidate("fuel-late", "fuel_station", 0.9),
            candidate("hotel-mid", "hotel", 0.58),
        ]

        result = pick_candidates(
            rows,
            {"family": "fuel-range-unknown-availability", "categories": ["fuel_station"]},
        )

        self.assertEqual([poi["poiId"] for poi in result], ["fuel-mid"])

    def test_overnight_case_has_at_most_one_hotel_option(self) -> None:
        rows = [
            candidate("hotel-early", "hotel", 0.2),
            candidate("hotel-mid", "hotel", 0.5),
            candidate("hotel-late", "hotel", 0.8),
            candidate("restaurant-mid", "restaurant", 0.51),
            candidate("fuel-mid", "fuel_station", 0.52),
        ]

        result = pick_candidates(
            rows,
            {
                "family": "overnight-request",
                "categories": ["hotel", "restaurant", "fuel_station"],
            },
        )

        self.assertEqual(sum(poi["category"] == "hotel" for poi in result), 1)
        self.assertIn("hotel-mid", [poi["poiId"] for poi in result])


if __name__ == "__main__":
    unittest.main()
