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
