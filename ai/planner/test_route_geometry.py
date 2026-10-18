import math
import unittest

from route_geometry import RouteProjectionIndex, project_onto_route


class RouteProjectionIndexTests(unittest.TestCase):
    def test_indexed_projection_matches_full_route_projection(self):
        route = [
            (12.9716, 77.5946),
            (13.2, 77.1),
            (13.35, 76.6),
            (13.0, 76.1),
            (12.9, 75.5),
            (12.9141, 74.8560),
        ]
        points = [
            (13.18, 77.12),
            (13.31, 76.58),
            (12.91, 75.48),
        ]
        index = RouteProjectionIndex(route, max_distance_meters=15_000)

        for point in points:
            with self.subTest(point=point):
                expected_distance, expected_progress = project_onto_route(point, route)
                actual_distance, actual_progress = index.project(point)
                self.assertTrue(math.isclose(actual_distance, expected_distance, abs_tol=0.01))
                self.assertTrue(math.isclose(actual_progress, expected_progress, abs_tol=1e-6))

    def test_index_returns_outside_points_as_unmatched(self):
        index = RouteProjectionIndex(
            [(12.9716, 77.5946), (12.9141, 74.8560)],
            max_distance_meters=1_000,
        )

        distance, progress = index.project((15.0, 80.0))

        self.assertTrue(math.isinf(distance))
        self.assertEqual(progress, 0.0)


if __name__ == "__main__":
    unittest.main()
