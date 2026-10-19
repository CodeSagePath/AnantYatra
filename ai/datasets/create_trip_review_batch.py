"""Create pending human-review packets from pinned corridor candidate data."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLANNER_DIR = PROJECT_ROOT / "ai/planner"
sys.path.insert(0, str(PLANNER_DIR))

from planner import load_config, plan_trip, validate_schema

SOURCE_ID = "osmfr-karnataka-20261017"
START_DATE = "2026-11-07"
SCENARIOS = (
    {
        "family": "simple-scenic",
        "duration_days": 1,
        "interests": ["scenic"],
        "categories": ["attraction", "viewpoint", "restaurant", "fuel_station"],
        "request": "Plan a relaxed one-day car trip from Bengaluru to {destination}. Prefer scenic stops. Suggest no more than two stops, and do not assume opening hours or facilities.",
    },
    {
        "family": "fuel-range-unknown-availability",
        "duration_days": 1,
        "interests": ["fuel"],
        "categories": ["fuel_station", "restaurant", "hotel"],
        "vehicle": {"mode": "motorcycle", "fuelType": "petrol", "usableRangeKm": 180},
        "request": "Plan a one-day car trip from Bengaluru to {destination}. The vehicle has about 180 km usable range. Suggest a route-relevant fuel stop, but do not claim live fuel availability.",
    },
    {
        "family": "overnight-request",
        "duration_days": 2,
        "interests": ["stay"],
        "categories": ["hotel", "restaurant", "fuel_station"],
        "accommodation_needed": True,
        "request": "Plan a two-day car trip from Bengaluru to {destination}, with one overnight stay near the middle of the route. Do not assume room availability, price, or facilities.",
    },
    {
        "family": "required-accessible-toilet",
        "duration_days": 1,
        "interests": ["scenic", "food"],
        "categories": ["restroom", "restaurant", "attraction", "hotel"],
        "required_facilities": ["toilets", "wheelchair_accessible"],
        "request": "Plan a one-day car trip from Bengaluru to {destination}. I need a stop with a wheelchair-accessible toilet. If the supplied facts cannot confirm both, say so and do not guess.",
    },
    {
        "family": "avoid-restaurants",
        "duration_days": 1,
        "interests": ["scenic"],
        "categories": ["attraction", "viewpoint", "fuel_station", "hotel"],
        "avoid": ["restaurant"],
        "vehicle": {"mode": "motorcycle"},
        "request": "Plan a one-day car trip from Bengaluru to {destination}. Avoid restaurants and food stops; prefer one route-relevant scenic or attraction stop. Do not invent details that are absent from the supplied facts.",
    },
)
CORRIDORS = {
    "bengaluru-chikkamagaluru": "Chikkamagaluru",
    "bengaluru-madikeri": "Madikeri",
    "bengaluru-mysuru": "Mysuru",
    "bengaluru-shivamogga": "Shivamogga",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corridors-dir", required=True, type=Path)
    parser.add_argument("--sources", required=True, type=Path)
    parser.add_argument("--config", default=PROJECT_ROOT / "ai/configs/planner.toml", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def pick_candidates(rows: list[dict], scenario: dict, limit: int = 12) -> list[dict]:
    categories = scenario["categories"]
    if scenario["family"] == "fuel-range-unknown-availability":
        fuel_candidates = [row for row in rows if row["poi"]["category"] == "fuel_station"]
        if not fuel_candidates:
            return []
        midpoint = 0.58
        return [
            min(
                fuel_candidates,
                key=lambda row: (
                    abs(row["routeFraction"] - midpoint),
                    row["poi"]["poiId"],
                ),
            )["poi"]
        ]
    if scenario["family"] == "overnight-request":
        hotels = [row for row in rows if row["poi"]["category"] == "hotel"]
        if not hotels:
            return []
        hotel = min(hotels, key=lambda row: abs(row["routeFraction"] - 0.5))
        hotel_fraction = hotel["routeFraction"]
        selected = [hotel["poi"]]
        before_hotel = [
            row
            for row in rows
            if row["poi"]["category"] == "restaurant"
            and row["routeFraction"] < min(0.5, hotel_fraction)
        ]
        after_hotel = [
            row
            for row in rows
            if row["poi"]["category"] == "fuel_station"
            and row["routeFraction"] > max(0.5, hotel_fraction)
        ]
        if before_hotel:
            selected.append(
                min(before_hotel, key=lambda row: abs(row["routeFraction"] - 0.25))["poi"]
            )
        if after_hotel:
            selected.append(
                min(after_hotel, key=lambda row: abs(row["routeFraction"] - 0.75))["poi"]
            )
        return selected[:limit]

    eligible = [
        row["poi"]
        for row in rows
        if row["poi"]["category"] in categories
    ]
    selected = []
    selected_ids = set()
    target_fractions = (0.18, 0.36, 0.54, 0.72, 0.9)
    for target_fraction in target_fractions:
        for category in categories:
            choices = [
                row
                for row in rows
                if row["poi"]["category"] == category
                and row["poi"]["poiId"] not in selected_ids
            ]
            if not choices:
                continue
            choice = min(
                choices,
                key=lambda row: (
                    abs(row["routeFraction"] - target_fraction),
                    row["poi"]["poiId"],
                ),
            )
            selected.append(choice["poi"])
            selected_ids.add(choice["poi"]["poiId"])
            if len(selected) >= limit:
                return selected

    remaining = [
        poi
        for poi in eligible
        if poi["poiId"] not in selected_ids
    ]
    selected.extend(remaining[: max(0, limit - len(selected))])
    return selected


def build_request(case_id: str, destination: str, scenario: dict) -> dict:
    return {
        "schemaVersion": "1.0",
        "requestId": case_id,
        "origin": {"label": "Bengaluru"},
        "destination": {"label": destination},
        "startDate": START_DATE,
        "durationDays": scenario["duration_days"],
        "travelerCount": 2,
        "vehicle": scenario.get("vehicle", {"mode": "car"}),
        "dailyDrivingLimitHours": 6,
        "preferences": {
            "interests": scenario["interests"],
            "food": [],
            "requiredFacilities": scenario.get("required_facilities", []),
            "avoid": scenario.get("avoid", []),
            "pace": "relaxed",
            "accommodationNeeded": scenario.get("accommodation_needed", False),
        },
        "safety": {
            "profile": "balanced",
            "preferArrivalBeforeSunset": True,
        },
    }


def build_case(
    corridor_id: str,
    destination: str,
    scenario: dict,
    route: dict,
    rows: list[dict],
    sources: list[dict],
    config: dict,
) -> dict:
    case_id = f"{corridor_id}-{scenario['family']}"
    candidates = pick_candidates(rows, scenario)
    request = build_request(case_id, destination, scenario)
    plan = plan_trip(request, route, candidates, sources, config)
    validate_schema(request, "trip-request.schema.json")
    validate_schema(plan, "trip-plan.schema.json")
    return {
        "draftSchemaVersion": "trip-planning-draft-1.0",
        "exampleId": case_id,
        "scenarioFamily": scenario["family"],
        "corridorId": corridor_id,
        "sourceSnapshotId": f"{SOURCE_ID}+{route['snapshotId']}",
        "request": request,
        "route": route,
        "candidatePois": candidates,
        "proposedPlan": plan,
        "draftPlanOrigin": "deterministic planner baseline; not a human-approved reference",
        "geographicScopeReview": (
            "outside_300km_pilot_ceiling"
            if route["distanceMeters"] > 300_000
            else "within_300km_pilot_ceiling"
        ),
        "sourceReview": {
            "sourceRecordIds": [SOURCE_ID],
            "trainingUseApproved": True,
            "reviewReference": "ODbL training approval is conditional on public data offer and attribution",
            "poiQualityReview": "pending",
        },
        "humanReview": {
            "status": "pending",
            "reviewerToken": "PENDING",
            "reviewedAt": None,
            "issues": [
                "Check every selected POI against its OSM evidence and current reality.",
                "Validate each proposed stop-to-stop route leg with the same vehicle profile.",
                "Review the plan for usefulness, schedule feasibility, and appropriate uncertainty.",
            ],
        },
        "notes": [
            "Review packet only; not accepted by the training pipeline.",
            "The source snapshot permits training conditionally, but POI quality is unverified.",
            "Opening hours, live availability, prices, and untagged facilities remain unknown.",
            "Do not promote this case to training/evaluation until a reviewer records approval and corrections.",
            *(
                ["Route exceeds the proposed 300 km core pilot ceiling; review as an extension case."]
                if route["distanceMeters"] > 300_000
                else []
            ),
        ],
    }


def create_batch(args: argparse.Namespace) -> list[dict]:
    sources = read_jsonl(args.sources)
    config = load_config(args.config)
    cases = []
    for corridor_id, destination in CORRIDORS.items():
        for scenario in SCENARIOS:
            mode = scenario.get("vehicle", {}).get("mode", "car")
            folder = corridor_id if mode == "car" else f"{corridor_id}-{mode}"
            corridor_dir = args.corridors_dir / folder
            route = json.loads((corridor_dir / "route.json").read_text(encoding="utf-8"))
            rows = read_jsonl(corridor_dir / "candidates.jsonl")
            validate_schema(route, "route-alternative.schema.json")
            cases.append(
                build_case(corridor_id, destination, scenario, route, rows, sources, config)
            )
    return cases


def main() -> None:
    args = parse_args()
    cases = create_batch(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(case, ensure_ascii=False, sort_keys=True) + "\n" for case in cases),
        encoding="utf-8",
    )
    print(json.dumps({"output": str(args.output), "draftCount": len(cases), "humanApproved": 0}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, KeyError, ValueError) as error:
        raise SystemExit(f"trip review batch creation failed: {error}") from error
