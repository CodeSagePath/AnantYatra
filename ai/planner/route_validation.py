"""Validate daily itinerary legs against a configured Valhalla instance."""

from __future__ import annotations

import json
import os
from datetime import datetime, time, timedelta
from typing import Callable
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from planner import PlannerError, validate_schema
from route_geometry import coordinate_at_fraction, decode_polyline

RouteClient = Callable[[list[tuple[float, float]], str], list[dict]]


def validate_plan_route_legs(
    plan: dict,
    request: dict,
    route: dict,
    pois: list[dict],
    config: dict,
    route_client: RouteClient | None = None,
) -> dict:
    client = route_client or _request_valhalla
    points = decode_polyline(route["geometry"], precision=6)
    pois_by_id = {poi["poiId"]: poi for poi in pois}
    costing = _costing_for_mode(request["vehicle"]["mode"])
    day_count = request["durationDays"]
    timezone = ZoneInfo(config["planner"]["timezone"])
    day_start = time.fromisoformat(config["planner"]["day_start_local"])
    day_end = time.fromisoformat(config["planner"]["day_end_local"])
    max_driving_seconds = request.get("dailyDrivingLimitHours", 16) * 3600
    visit_seconds = config["planner"]["default_visit_minutes"] * 60
    validation_details = []

    for day in plan["days"]:
        day_index = day["dayNumber"] - 1
        start_fraction = day_index / day_count
        end_fraction = (day_index + 1) / day_count
        stops = day["stops"]
        ordered_pois = [_poi_for_stop(stop, pois_by_id) for stop in stops]
        locations = [coordinate_at_fraction(points, start_fraction)]
        locations.extend(
            (poi["location"]["latitude"], poi["location"]["longitude"])
            for poi in ordered_pois
        )
        locations.append(coordinate_at_fraction(points, end_fraction))

        legs = client(locations, costing)
        if len(legs) != len(locations) - 1:
            raise PlannerError("route_validation_leg_count_mismatch")
        _validate_leg_metrics(legs)

        day_date = datetime.fromisoformat(day["date"]).date()
        cursor = datetime.combine(day_date, day_start, tzinfo=timezone)
        driving_seconds = sum(leg["durationSeconds"] for leg in legs)
        if driving_seconds > max_driving_seconds:
            raise PlannerError("validated_route_exceeds_daily_driving_limit")

        day_legs = []
        waypoint_ids = [_day_boundary_id(day_index, day_count, start=True)]
        waypoint_ids.extend(stop["poiId"] for stop in stops)
        waypoint_ids.append(_day_boundary_id(day_index, day_count, start=False))
        for index, leg in enumerate(legs):
            day_legs.append(
                {
                    "from": waypoint_ids[index],
                    "to": waypoint_ids[index + 1],
                    "routeId": f"{route['routeId']}-day-{day['dayNumber']}-leg-{index + 1}",
                    "distanceMeters": leg["distanceMeters"],
                    "durationSeconds": leg["durationSeconds"],
                }
            )
            cursor += timedelta(seconds=leg["durationSeconds"])
            if index < len(stops):
                stops[index]["arrival"] = cursor.isoformat()
                cursor += timedelta(seconds=visit_seconds)
                stops[index]["departure"] = cursor.isoformat()

        if cursor.date() != day_date or cursor.timetz().replace(tzinfo=None) > day_end:
            raise PlannerError("validated_schedule_exceeds_day_window")
        day["legs"] = day_legs
        day["notes"] = [
            "All daily route legs were calculated by Valhalla for the requested travel mode."
        ]
        validation_details.append(
            {"dayNumber": day["dayNumber"], "legCount": len(day_legs), "drivingSeconds": driving_seconds}
        )

    plan["uncertainties"] = [
        note
        for note in plan["uncertainties"]
        if "Route legs for each day" not in note
        and "Route legs for this day" not in note
    ]
    plan["uncertainties"].append(
        "Valhalla checked route feasibility against the configured map snapshot; traffic, closures, weather, opening hours, and on-road safety can change."
    )
    if request["vehicle"]["mode"] == "bicycle":
        plan["uncertainties"].append(
            "A bicycle route profile is not a safety certification; verify road traffic, surface, elevation, and current access before riding."
        )
    plan["extensions"]["routeLegValidation"] = "valhalla_passed"
    plan["extensions"]["routeValidationEngine"] = "Valhalla"
    plan["extensions"]["routeValidationSnapshotId"] = route["snapshotId"]
    plan["extensions"]["validatedLegs"] = validation_details
    validate_schema(plan, "trip-plan.schema.json")
    return plan


def _poi_for_stop(stop: dict, pois_by_id: dict[str, dict]) -> dict:
    poi = pois_by_id.get(stop["poiId"])
    if not poi:
        raise PlannerError("plan_stop_missing_poi")
    return poi


def _costing_for_mode(mode: str) -> str:
    costings = {"car": "auto", "motorcycle": "motorcycle", "bicycle": "bicycle"}
    try:
        return costings[mode]
    except KeyError as error:
        raise PlannerError("route_validation_mode_unsupported") from error


def _validate_leg_metrics(legs: list[dict]) -> None:
    for leg in legs:
        if leg.get("distanceMeters", 0) <= 0 or leg.get("durationSeconds", 0) <= 0:
            raise PlannerError("route_validation_invalid_leg_metrics")


def _day_boundary_id(day_index: int, day_count: int, start: bool) -> str:
    boundary = day_index if start else day_index + 1
    if boundary == 0:
        return "route-origin"
    if boundary == day_count:
        return "route-destination"
    return f"route-progress-{boundary}-of-{day_count}"


def _request_valhalla(
    locations: list[tuple[float, float]], costing: str
) -> list[dict]:
    host = os.environ.get("ROUTING_HOST", "http://127.0.0.1:5005").rstrip("/")
    body = {
        "locations": [{"lat": latitude, "lon": longitude} for latitude, longitude in locations],
        "costing": costing,
        "directions_options": {"units": "kilometers"},
    }
    http_request = Request(
        f"{host}/route",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(http_request, timeout=45) as response:
            trip = json.load(response)["trip"]
    except (URLError, TimeoutError, KeyError, json.JSONDecodeError) as error:
        raise PlannerError("route_validation_engine_unavailable") from error

    if trip.get("status") != 0:
        raise PlannerError("route_validation_no_route_found")
    return [
        {
            "distanceMeters": leg["summary"]["length"] * 1000,
            "durationSeconds": leg["summary"]["time"],
        }
        for leg in trip.get("legs", [])
    ]
