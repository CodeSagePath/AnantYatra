"""Schema-first, deterministic itinerary candidate planner."""

from __future__ import annotations

import json
import tomllib
from datetime import date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from jsonschema import Draft202012Validator, FormatChecker

from route_geometry import decode_polyline, project_onto_route

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = PROJECT_ROOT / "ai/schemas/v1"


class PlannerError(ValueError):
    """A stable planner failure code suitable for API mapping."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def load_config(config_path: Path) -> dict:
    with config_path.open("rb") as config_file:
        return tomllib.load(config_file)


@lru_cache(maxsize=None)
def load_validator(schema_name: str) -> Draft202012Validator:
    schema_path = SCHEMA_DIR / schema_name
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=FormatChecker())


def validate_schema(value: dict, schema_name: str) -> None:
    errors = sorted(
        load_validator(schema_name).iter_errors(value),
        key=lambda error: list(map(str, error.absolute_path)),
    )
    if errors:
        error_type = schema_name.removesuffix(".schema.json").replace("-", "_")
        raise PlannerError(f"invalid_{error_type}")


def approved_runtime_source_ids(sources: list[dict]) -> set[str]:
    approved = set()
    for source in sources:
        validate_schema(source, "source-record.schema.json")
        uses = set(source["permittedUses"])
        if (
            source["sourceStatus"] == "active"
            and source["licenseReview"]["status"] == "approved"
            and {"runtime_search", "display"}.issubset(uses)
        ):
            approved.add(source["sourceRecordId"])
    return approved


def plan_trip(
    request: dict,
    route: dict,
    pois: list[dict],
    sources: list[dict],
    config: dict,
) -> dict:
    validate_schema(request, "trip-request.schema.json")
    validate_schema(route, "route-alternative.schema.json")
    for poi in pois:
        validate_schema(poi, "poi.schema.json")

    start_date = request.get("startDate")
    if not start_date:
        raise PlannerError("start_date_required_for_scheduled_plan")

    runtime_source_ids = approved_runtime_source_ids(sources)
    route_points = decode_polyline(route["geometry"], precision=6)
    matches = find_route_candidates(pois, runtime_source_ids, route_points, request, config)
    selected, requirement_gaps = select_daily_stops(matches, request, config)
    plan = build_draft_plan(
        request, route, selected, len(matches), requirement_gaps, config
    )
    sources_by_id = {source["sourceRecordId"]: source for source in sources}
    used_source_ids = sorted(
        set(plan["extensions"]["evidenceSourceById"].values())
    )
    plan["extensions"]["sourceSnapshots"] = {
        source_id: source_snapshot_metadata(sources_by_id[source_id])
        for source_id in used_source_ids
    }
    validate_schema(plan, "trip-plan.schema.json")
    return plan


def find_route_candidates(
    pois: list[dict],
    approved_source_ids: set[str],
    route_points: list[tuple[float, float]],
    request: dict,
    config: dict,
) -> list[dict]:
    limits = config["planner"]
    max_distance_meters = limits["max_route_distance_km"] * 1000
    required_facilities = set(request["preferences"]["requiredFacilities"])
    category_aliases = config.get("interest_categories", {})
    avoided_categories = {
        _normalize(category)
        for value in request["preferences"]["avoid"]
        for category in category_aliases.get(_normalize(value), [value])
    }
    candidates = []

    for poi in pois:
        evidence = [
            (index, item)
            for index, item in enumerate(poi["evidence"])
            if item["sourceRecordId"] in approved_source_ids
        ]
        if not evidence or _normalize(poi["category"]) in avoided_categories:
            continue
        if any(
            poi.get("facilities", {}).get(facility, "unknown") != "available"
            for facility in required_facilities
        ):
            continue

        coordinates = poi["location"]
        distance, fraction = project_onto_route(
            (coordinates["latitude"], coordinates["longitude"]), route_points
        )
        if distance > max_distance_meters:
            continue

        candidate = dict(poi)
        candidate["_routeDistanceMeters"] = distance
        candidate["_routeFraction"] = fraction
        candidate["_evidenceId"] = f"{poi['poiId']}:evidence:{evidence[0][0]}"
        candidate["_evidenceSourceRecordId"] = evidence[0][1]["sourceRecordId"]
        candidate["_preferenceScore"] = preference_score(poi, request, config)
        candidates.append(candidate)

    return sorted(
        candidates,
        key=lambda item: (
            -item["_preferenceScore"],
            item["_routeFraction"],
            item["poiId"],
        ),
    )


def preference_score(poi: dict, request: dict, config: dict) -> int:
    category = _normalize(poi["category"])
    name = _normalize(poi["displayName"])
    mapping = config.get("interest_categories", {})
    score = 0
    for interest in request["preferences"]["interests"]:
        normalized_interest = _normalize(interest)
        categories = {
            _normalize(value)
            for value in mapping.get(normalized_interest, [normalized_interest])
        }
        score += 10 if category in categories else 0
        score += 2 if normalized_interest in name else 0
    for preference in request["preferences"]["food"]:
        normalized_food = _normalize(preference)
        categories = {
            _normalize(value)
            for value in mapping.get(normalized_food, ["restaurant"])
        }
        score += 5 if category in categories else 0
    return score


def select_daily_stops(
    candidates: list[dict], request: dict, config: dict
) -> tuple[list[dict], list[str]]:
    days = request["durationDays"]
    max_per_day = config["planner"]["max_stops_per_day"]
    spacing = config["planner"]["minimum_fraction_spacing"]
    selected = []
    selected_ids = set()
    requirement_gaps = []
    per_day_counts = [0] * days
    fractions_by_day = [[] for _ in range(days)]

    if request["preferences"].get("accommodationNeeded"):
        for night in range(1, days):
            hotel_options = [
                candidate
                for candidate in candidates
                if candidate["category"] == "hotel"
                and candidate["poiId"] not in selected_ids
                and abs(candidate["_routeFraction"] - night / days)
                <= config["planner"]["overnight_candidate_fraction"]
            ]
            if not hotel_options or per_day_counts[night - 1] >= max_per_day:
                requirement_gaps.append(f"overnight_stay_day_{night}")
                continue

            hotel = min(
                hotel_options,
                key=lambda item: (
                    abs(item["_routeFraction"] - night / days),
                    -item["_preferenceScore"],
                    item["poiId"],
                ),
            )
            hotel["_dayNumber"] = night
            hotel["_scheduleFractionWithinDay"] = 0.8
            hotel["_overnightStay"] = True
            selected.append(hotel)
            selected_ids.add(hotel["poiId"])
            per_day_counts[night - 1] += 1
            fractions_by_day[night - 1].append(hotel["_routeFraction"])

    for candidate in candidates:
        if candidate["poiId"] in selected_ids:
            continue
        fraction = min(candidate["_routeFraction"], 0.999999)
        candidate["_routeFraction"] = fraction
        day_index = min(days - 1, int(fraction * days))
        if per_day_counts[day_index] >= max_per_day:
            continue
        if any(
            abs(fraction - existing_fraction) < spacing
            for existing_fraction in fractions_by_day[day_index]
        ):
            continue
        candidate["_dayNumber"] = day_index + 1
        candidate["_scheduleFractionWithinDay"] = fraction * days - day_index
        candidate["_overnightStay"] = False
        selected.append(candidate)
        selected_ids.add(candidate["poiId"])
        per_day_counts[day_index] += 1
        fractions_by_day[day_index].append(fraction)

    return (
        sorted(selected, key=lambda item: (item["_routeFraction"], item["poiId"])),
        requirement_gaps,
    )


def build_draft_plan(
    request: dict,
    route: dict,
    selected: list[dict],
    candidate_count: int,
    requirement_gaps: list[str],
    config: dict,
) -> dict:
    days = []
    evidence_index = {}
    scheduled_selected = []
    schedule_excluded_ids = []
    start_day = date.fromisoformat(request["startDate"])
    timezone = ZoneInfo(config["planner"]["timezone"])
    local_start = time.fromisoformat(config["planner"]["day_start_local"])
    local_end = time.fromisoformat(config["planner"]["day_end_local"])
    daily_route_seconds = route["durationSeconds"] / request["durationDays"]
    driving_limit = request.get("dailyDrivingLimitHours")
    if driving_limit and daily_route_seconds > driving_limit * 3600:
        raise PlannerError("route_exceeds_daily_driving_limit")

    for day_number in range(1, request["durationDays"] + 1):
        days.append(
            {
                "dayNumber": day_number,
                "date": (start_day + timedelta(days=day_number - 1)).isoformat(),
                "legs": [],
                "stops": [],
                "notes": [
                    "Route legs for this day still require separate Valhalla validation."
                ],
            }
        )

    for poi in selected:
        day_number = poi["_dayNumber"]
        day_index = day_number - 1
        within_day_fraction = poi["_scheduleFractionWithinDay"]
        day_start = datetime.combine(
            start_day + timedelta(days=day_index), local_start, tzinfo=timezone
        )
        arrival = day_start + timedelta(
            seconds=daily_route_seconds * within_day_fraction
        )
        if poi["_overnightStay"]:
            departure = datetime.combine(
                start_day + timedelta(days=day_number), local_start, tzinfo=timezone
            )
        else:
            departure = arrival + timedelta(
                minutes=config["planner"]["default_visit_minutes"]
            )
        day_end = datetime.combine(
            start_day + timedelta(days=day_index), local_end, tzinfo=timezone
        )
        if arrival >= day_end or (not poi["_overnightStay"] and departure > day_end):
            schedule_excluded_ids.append(poi["poiId"])
            if poi["_overnightStay"]:
                requirement_gaps.append(f"overnight_stay_day_{day_number}")
            continue

        evidence_id = poi["_evidenceId"]
        evidence_index[evidence_id] = poi["_evidenceSourceRecordId"]
        reason = build_reason(poi, request, config)
        days[day_index]["stops"].append(
            {
                "poiId": poi["poiId"],
                "arrival": arrival.isoformat(),
                "departure": departure.isoformat(),
                "reason": reason,
                "evidenceIds": [evidence_id],
            }
        )
        scheduled_selected.append(poi)

    uncertainties = [
        "This is a draft. Route legs for each day and every selected stop still need Valhalla validation.",
        "Stop times are estimates based on position along the supplied route; detours, traffic, opening hours, and availability are not included.",
        "POI quality remains source-reported and may be unverified or stale.",
    ]
    if not selected:
        uncertainties.append(
            "No candidates passed the approved-source, facility, and route-corridor filters."
        )
    if requirement_gaps:
        uncertainties.append(
            "No approved stay candidate was found for: "
            + ", ".join(requirement_gaps)
            + "."
        )
    if schedule_excluded_ids:
        uncertainties.append(
            "Some candidates were omitted because their estimated time falls outside the configured day schedule."
        )
    if request["preferences"].get("food"):
        uncertainties.append(
            "Dietary preferences are not verified by the available POI fields; restaurant category alone does not confirm menu options."
        )
    if request["preferences"].get("pace"):
        uncertainties.append(
            "The requested trip pace is not yet used to adjust stop count or visit duration."
        )
    if request.get("budget"):
        uncertainties.append(
            "Budget fit has not been calculated by this planner baseline."
        )
    if request["safety"].get("accessibilityNeeds"):
        uncertainties.append(
            "Accessibility needs are not fully verified unless each need is represented by a required facility field."
        )
    if request["safety"].get("preferArrivalBeforeSunset", True):
        uncertainties.append(
            "Sunset time is not calculated; the configured day schedule is not a daylight guarantee."
        )

    plan = {
        "schemaVersion": "1.0",
        "requestId": request.get("requestId", "request-unidentified"),
        "revision": 1,
        "status": "draft",
        "routeId": route["routeId"],
        "days": days,
        "uncertainties": uncertainties,
        "extensions": {
            "snapshotId": route["snapshotId"],
            "candidateCountAfterFilters": candidate_count,
            "selectedPoiCount": len(scheduled_selected),
            "requirementGaps": requirement_gaps,
            "scheduleExcludedPoiIds": schedule_excluded_ids,
            "routeLegValidation": "not_run",
            "planner": "deterministic-baseline-v1",
            "evidenceSourceById": evidence_index,
        },
    }
    validate_schema(plan, "trip-plan.schema.json")
    validate_plan_semantics(plan, scheduled_selected)
    return plan


def build_reason(poi: dict, request: dict, config: dict) -> str:
    category = poi["category"].replace("_", " ")
    score = preference_score(poi, request, config)
    if score:
        return f"Matches a selected trip preference and is near the supplied route ({category})."
    return f"A nearby route candidate in the {category} category."


def source_snapshot_metadata(source: dict) -> dict:
    extensions = source.get("extensions", {})
    return {
        "license": source["license"],
        "licenseReviewState": source["licenseReview"]["status"],
        "fetchedAt": source["fetchedAt"],
        "publishedAt": source.get("publishedAt"),
        "lastVerifiedAt": source.get("lastVerifiedAt"),
        "snapshotTimestamp": extensions.get("snapshotTimestamp"),
        "sha256": extensions.get("sha256"),
    }


def validate_plan_semantics(plan: dict, selected: list[dict]) -> None:
    allowed_ids = {poi["poiId"] for poi in selected}
    seen_ids = set()
    for day in plan["days"]:
        for stop in day["stops"]:
            if stop["poiId"] not in allowed_ids:
                raise PlannerError("plan_references_unknown_poi")
            if stop["poiId"] in seen_ids:
                raise PlannerError("plan_repeats_poi")
            seen_ids.add(stop["poiId"])
            if not stop["evidenceIds"]:
                raise PlannerError("plan_stop_missing_evidence")


def _normalize(value: str) -> str:
    return " ".join(value.casefold().replace("_", " ").split())
