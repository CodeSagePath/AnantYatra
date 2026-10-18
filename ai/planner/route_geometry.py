"""Small polyline6 geometry helpers used to find POIs near a supplied route."""

from __future__ import annotations

import math


def decode_polyline(encoded: str, precision: int = 6) -> list[tuple[float, float]]:
    scale = 10**precision
    coordinates = []
    latitude = 0
    longitude = 0
    index = 0

    while index < len(encoded):
        latitude_delta, index = _decode_component(encoded, index)
        longitude_delta, index = _decode_component(encoded, index)
        latitude += latitude_delta
        longitude += longitude_delta
        coordinates.append((latitude / scale, longitude / scale))

    if len(coordinates) < 2:
        raise ValueError("route_geometry_requires_two_points")
    return coordinates


def project_onto_route(
    point: tuple[float, float], route: list[tuple[float, float]]
) -> tuple[float, float]:
    segment_lengths = [
        _distance_meters(first, second)
        for first, second in zip(route, route[1:])
    ]
    total_length = sum(segment_lengths)
    if total_length <= 0:
        raise ValueError("route_geometry_has_zero_length")

    best_distance = math.inf
    best_progress = 0.0
    distance_before_segment = 0.0

    for first, second, segment_length in zip(route, route[1:], segment_lengths):
        projected, segment_fraction = _project_to_segment(point, first, second)
        distance = _distance_meters(point, projected)
        if distance < best_distance:
            best_distance = distance
            best_progress = (distance_before_segment + segment_length * segment_fraction) / total_length
        distance_before_segment += segment_length

    return best_distance, min(1.0, max(0.0, best_progress))


def coordinate_at_fraction(
    route: list[tuple[float, float]], fraction: float
) -> tuple[float, float]:
    if len(route) < 2:
        raise ValueError("route_geometry_requires_two_points")
    segment_lengths = [
        _distance_meters(first, second)
        for first, second in zip(route, route[1:])
    ]
    total_length = sum(segment_lengths)
    if total_length <= 0:
        raise ValueError("route_geometry_has_zero_length")

    remaining_distance = total_length * min(1.0, max(0.0, fraction))
    for start, end, segment_length in zip(route, route[1:], segment_lengths):
        if remaining_distance <= segment_length:
            segment_fraction = remaining_distance / segment_length if segment_length else 0
            return (
                start[0] + (end[0] - start[0]) * segment_fraction,
                start[1] + (end[1] - start[1]) * segment_fraction,
            )
        remaining_distance -= segment_length
    return route[-1]


class RouteProjectionIndex:
    """Index route segments by geographic cells for repeated POI projections."""

    def __init__(self, route: list[tuple[float, float]], max_distance_meters: float) -> None:
        if len(route) < 2:
            raise ValueError("route_geometry_requires_two_points")
        if max_distance_meters <= 0:
            raise ValueError("route_search_distance_must_be_positive")

        self._cell_size = 0.1
        self._total_length = 0.0
        self._segments: list[tuple[tuple[float, float], tuple[float, float], float, float]] = []
        self._cells: dict[tuple[int, int], list[int]] = {}
        latitude_padding = max_distance_meters / 111_320

        for start, end in zip(route, route[1:]):
            length = _distance_meters(start, end)
            start_progress = self._total_length
            self._segments.append((start, end, length, start_progress))
            self._total_length += length
            longitude_padding = _longitude_padding(
                start[0], end[0], latitude_padding, max_distance_meters
            )
            self._index_segment(start, end, latitude_padding, longitude_padding)

        if self._total_length <= 0:
            raise ValueError("route_geometry_has_zero_length")

    def project(self, point: tuple[float, float]) -> tuple[float, float]:
        cell = self._cell(point[0], point[1])
        segment_ids = self._cells.get(cell, [])
        best_distance = math.inf
        best_progress = 0.0

        for segment_id in segment_ids:
            start, end, length, progress_before = self._segments[segment_id]
            projected, fraction = _project_to_segment(point, start, end)
            distance = _distance_meters(point, projected)
            if distance < best_distance:
                best_distance = distance
                best_progress = (progress_before + length * fraction) / self._total_length

        return best_distance, min(1.0, max(0.0, best_progress))

    def _index_segment(
        self,
        start: tuple[float, float],
        end: tuple[float, float],
        latitude_padding: float,
        longitude_padding: float,
    ) -> None:
        min_latitude = min(start[0], end[0]) - latitude_padding
        max_latitude = max(start[0], end[0]) + latitude_padding
        min_longitude = min(start[1], end[1]) - longitude_padding
        max_longitude = max(start[1], end[1]) + longitude_padding
        for lat_cell in self._cell_range(min_latitude, max_latitude):
            for lon_cell in self._cell_range(min_longitude, max_longitude):
                self._cells.setdefault((lat_cell, lon_cell), []).append(
                    len(self._segments) - 1
                )

    def _cell_range(self, minimum: float, maximum: float) -> range:
        first = math.floor(minimum / self._cell_size)
        last = math.floor(maximum / self._cell_size)
        return range(first, last + 1)

    def _cell(self, latitude: float, longitude: float) -> tuple[int, int]:
        return (
            math.floor(latitude / self._cell_size),
            math.floor(longitude / self._cell_size),
        )


def _longitude_padding(
    start_latitude: float,
    end_latitude: float,
    latitude_padding: float,
    distance_meters: float,
) -> float:
    farthest_latitude = min(
        89.9,
        max(abs(start_latitude), abs(end_latitude)) + latitude_padding,
    )
    meters_per_longitude_degree = max(
        100,
        111_320 * math.cos(math.radians(farthest_latitude)),
    )
    return distance_meters / meters_per_longitude_degree


def _decode_component(encoded: str, index: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        if index >= len(encoded):
            raise ValueError("route_geometry_has_invalid_encoding")
        value = ord(encoded[index]) - 63
        index += 1
        result |= (value & 0x1F) << shift
        shift += 5
        if value < 0x20:
            break
    delta = ~(result >> 1) if result & 1 else result >> 1
    return delta, index


def _project_to_segment(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[tuple[float, float], float]:
    mean_latitude = math.radians((start[0] + end[0] + point[0]) / 3)
    meters_per_latitude = 111_320
    meters_per_longitude = 111_320 * math.cos(mean_latitude)

    def local_coordinates(coordinate: tuple[float, float]) -> tuple[float, float]:
        return (
            coordinate[1] * meters_per_longitude,
            coordinate[0] * meters_per_latitude,
        )

    point_xy = local_coordinates(point)
    start_xy = local_coordinates(start)
    end_xy = local_coordinates(end)
    delta_x = end_xy[0] - start_xy[0]
    delta_y = end_xy[1] - start_xy[1]
    segment_squared = delta_x * delta_x + delta_y * delta_y
    if segment_squared <= 0:
        return start, 0.0

    fraction = (
        (point_xy[0] - start_xy[0]) * delta_x
        + (point_xy[1] - start_xy[1]) * delta_y
    ) / segment_squared
    fraction = min(1.0, max(0.0, fraction))
    projected = (
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    )
    return projected, fraction


def _distance_meters(
    first: tuple[float, float], second: tuple[float, float]
) -> float:
    earth_radius_meters = 6_371_000
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    latitude_delta = lat2 - lat1
    longitude_delta = lon2 - lon1
    value = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_meters * math.atan2(math.sqrt(value), math.sqrt(1 - value))
