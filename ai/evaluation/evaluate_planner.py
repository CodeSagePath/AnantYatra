"""Run whole-planner scenario cases and report safety and quality metrics."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
from datetime import date, datetime, time as clock_time, timedelta
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

PLANNER_DIR = Path(__file__).resolve().parents[1] / "planner"
sys.path.insert(0, str(PLANNER_DIR))

from planner import (  # noqa: E402
    PlannerError,
    approved_runtime_source_ids,
    build_reason,
    load_config,
    plan_trip,
    validate_schema,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CASE_SCHEMA_PATH = PROJECT_ROOT / "ai/schemas/v1/planner-evaluation-case.schema.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", required=True, type=Path, help="Evaluation JSONL")
    parser.add_argument("--config", type=Path, default=PROJECT_ROOT / "ai/configs/planner.toml")
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def load_cases(path: Path) -> list[dict]:
    schema = json.loads(CASE_SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    cases = []
    seen_ids = set()
    with path.open(encoding="utf-8") as case_file:
        for line_number, line in enumerate(case_file, start=1):
            if not line.strip():
                continue
            try:
                case = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            errors = list(validator.iter_errors(case))
            if errors:
                raise ValueError(f"Invalid evaluation case at {path}:{line_number}.")
            if case["caseId"] in seen_ids:
                raise ValueError(f"Duplicate caseId '{case['caseId']}' in {path}.")
            validate_evaluation_sources(case)
            seen_ids.add(case["caseId"])
            cases.append(case)
    if not cases:
        raise ValueError(f"Evaluation case file is empty: {path}")
    return cases


def validate_evaluation_sources(case: dict) -> None:
    sources_by_id = {}
    for source in case["input"]["sources"]:
        validate_schema(source, "source-record.schema.json")
        source_id = source["sourceRecordId"]
        if source_id in sources_by_id:
            raise ValueError(f"Duplicate evaluation source '{source_id}' in {case['caseId']}.")
        review = source["licenseReview"]
        if (
            source["sourceStatus"] != "active"
            or review["status"] != "approved"
            or "evaluation" not in source["permittedUses"]
        ):
            raise ValueError(
                f"Source '{source_id}' in {case['caseId']} is not approved for evaluation."
            )
        sources_by_id[source_id] = source
    for poi in case["input"]["pois"]:
        for evidence in poi.get("evidence", []):
            source_id = evidence["sourceRecordId"]
            if source_id not in sources_by_id:
                raise ValueError(
                    f"POI evidence source '{source_id}' is missing from {case['caseId']}."
                )


def plan_case(case: dict, config: dict) -> tuple[dict | None, float, str | None]:
    started = time.perf_counter()
    try:
        plan = plan_trip(
            request=case["input"]["request"],
            route=case["input"]["route"],
            pois=case["input"]["pois"],
            sources=case["input"]["sources"],
            config=config,
        )
        return plan, (time.perf_counter() - started) * 1000, None
    except PlannerError as error:
        return None, (time.perf_counter() - started) * 1000, error.code


def score_plan(
    case: dict,
    plan: dict | None,
    latency_ms: float,
    failure_code: str | None,
    config: dict,
) -> dict:
    if plan is None:
        return {
            "caseId": case["caseId"],
            "passed": False,
            "failureCode": failure_code,
            "latencyMs": round(latency_ms, 3),
            "selectedPoiIds": [],
            "inventedPoiIds": [],
            "unsupportedEvidenceIds": [],
            "forbiddenPoiIds": [],
            "exactPoiMatch": False,
            "routeLegsValidated": False,
            "timeFeasible": False,
            "requiredFacilitiesRespected": False,
            "requirementGapsMatch": False,
            "recommendationClaimsGrounded": False,
            "pricesEvidenceBacked": False,
            "draftOnly": False,
        }

    input_data = case["input"]
    request = input_data["request"]
    pois_by_id = {poi["poiId"]: poi for poi in input_data["pois"]}
    runtime_sources = approved_runtime_source_ids(input_data["sources"])
    selected_stops = [stop for day in plan["days"] for stop in day["stops"]]
    selected_ids = [stop["poiId"] for stop in selected_stops]
    selected_set = set(selected_ids)
    invented_ids = sorted(selected_set - set(pois_by_id))
    evidence_by_id = plan.get("extensions", {}).get("evidenceSourceById", {})
    unsupported_evidence = []
    for stop in selected_stops:
        poi = pois_by_id.get(stop["poiId"])
        for evidence_id in stop["evidenceIds"]:
            source_id = evidence_by_id.get(evidence_id)
            poi_sources = {evidence["sourceRecordId"] for evidence in poi["evidence"]} if poi else set()
            if source_id not in runtime_sources or source_id not in poi_sources:
                unsupported_evidence.append(evidence_id)

    expectations = case["expectations"]
    exact_ids = set(expectations["exactPoiIds"])
    forbidden_ids = set(expectations["forbiddenPoiIds"])
    forbidden_selected = sorted(selected_set & forbidden_ids)
    required_facilities = request["preferences"].get("requiredFacilities", [])
    facilities_ok = all(
        all(pois_by_id.get(poi_id, {}).get("facilities", {}).get(facility) == "available"
            for facility in required_facilities)
        for poi_id in selected_ids
    )
    claims_grounded = all(
        stop["reason"] == build_reason(pois_by_id[stop["poiId"]], request, config)
        for stop in selected_stops
        if stop["poiId"] in pois_by_id
    ) and not invented_ids
    prices_backed = all(
        stop.get("estimatedCost") is None
        or stop.get("estimatedCost") == pois_by_id.get(stop["poiId"], {}).get("priceRange")
        for stop in selected_stops
    )
    draft_only = plan["status"] == "draft"
    time_ok = plan_times_are_feasible(plan, request, pois_by_id, config)
    route_validated = (
        plan.get("extensions", {}).get("routeLegValidation")
        in {"passed", "valhalla_passed"}
        and all(day["legs"] for day in plan["days"])
        and all(
            leg["routeId"] == input_data["route"]["routeId"]
            or leg["routeId"].startswith(f"{input_data['route']['routeId']}-day-")
            for day in plan["days"]
            for leg in day["legs"]
        )
    )
    expected_gaps = set(expectations.get("expectedRequirementGaps", []))
    actual_gaps = set(plan.get("extensions", {}).get("requirementGaps", []))
    checks = {
        "noInventedPoiIds": not invented_ids,
        "evidenceGrounded": not unsupported_evidence,
        "noForbiddenPoiIds": not forbidden_selected,
        "exactPoiMatch": selected_set == exact_ids,
        "routeLegsValidated": route_validated,
        "timeFeasible": time_ok,
        "requiredFacilitiesRespected": facilities_ok,
        "requirementGapsMatch": expected_gaps == actual_gaps,
        "recommendationClaimsGrounded": claims_grounded,
        "pricesEvidenceBacked": prices_backed,
        "draftOnly": draft_only,
    }
    return {
        "caseId": case["caseId"],
        "passed": all(checks.values()),
        "failureCode": None,
        "latencyMs": round(latency_ms, 3),
        "selectedPoiIds": selected_ids,
        "inventedPoiIds": invented_ids,
        "unsupportedEvidenceIds": sorted(set(unsupported_evidence)),
        "forbiddenPoiIds": forbidden_selected,
        "checks": checks,
        "budgetedRequest": "budget" in request,
        "stopsWithEstimatedCost": sum(stop.get("estimatedCost") is not None for stop in selected_stops),
        "stopCount": len(selected_stops),
    }


def plan_times_are_feasible(
    plan: dict, request: dict, pois_by_id: dict[str, dict], config: dict
) -> bool:
    if not request.get("startDate"):
        return False
    first_day = date.fromisoformat(request["startDate"])
    last_day = first_day.toordinal() + request["durationDays"] - 1
    day_start = clock_time.fromisoformat(config["planner"]["day_start_local"])
    day_end = clock_time.fromisoformat(config["planner"]["day_end_local"])
    for day in plan["days"]:
        day_date = date.fromisoformat(day["date"])
        if not first_day <= day_date or day_date.toordinal() > last_day:
            return False
        previous_departure = None
        for stop in day["stops"]:
            arrival = datetime.fromisoformat(stop["arrival"])
            departure = datetime.fromisoformat(stop["departure"])
            if (
                departure <= arrival
                or arrival.date() != day_date
                or arrival.time() < day_start
                or arrival.time() >= day_end
                or (previous_departure is not None and arrival < previous_departure)
            ):
                return False
            poi = pois_by_id.get(stop["poiId"], {})
            overnight_departure = (
                request["preferences"].get("accommodationNeeded")
                and poi.get("category") == "hotel"
                and departure.date() == day_date + timedelta(days=1)
                and departure.time() == day_start
            )
            same_day_departure = departure.date() == day_date and departure.time() <= day_end
            if not (overnight_departure or same_day_departure):
                return False
            previous_departure = departure
    return True


def summarize(results: list[dict]) -> dict:
    completed = [result for result in results if result.get("checks")]
    checks = [
        "noInventedPoiIds",
        "evidenceGrounded",
        "noForbiddenPoiIds",
        "exactPoiMatch",
        "routeLegsValidated",
        "timeFeasible",
        "requiredFacilitiesRespected",
        "requirementGapsMatch",
        "recommendationClaimsGrounded",
        "pricesEvidenceBacked",
        "draftOnly",
    ]
    latency = [result["latencyMs"] for result in results]
    budget_requests = [result for result in completed if result["budgetedRequest"]]
    budgeted_stops = sum(result["stopCount"] for result in budget_requests)
    costs_covered = sum(result["stopsWithEstimatedCost"] for result in budget_requests)
    return {
        "caseCount": len(results),
        "failedPlanningCount": sum(result["failureCode"] is not None for result in results),
        "scenarioPassCount": sum(result.get("passed", False) for result in results),
        "hardGates": {
            "zeroInventedPoiIds": sum(len(result["inventedPoiIds"]) for result in results) == 0,
            "allEvidenceGrounded": sum(len(result["unsupportedEvidenceIds"]) for result in results) == 0,
            "allRouteLegsValidated": all(result.get("checks", {}).get("routeLegsValidated", False) for result in results),
            "allRecommendationClaimsGrounded": all(result.get("checks", {}).get("recommendationClaimsGrounded", False) for result in results),
            "noUnsupportedPriceEstimates": all(result.get("checks", {}).get("pricesEvidenceBacked", False) for result in results),
            "allPlansRemainDraft": all(result.get("checks", {}).get("draftOnly", False) for result in results),
        },
        "checkPassCounts": {
            check: sum(result.get("checks", {}).get(check, False) for result in results)
            for check in checks
        },
        "budget": {
            "requestsWithBudget": len(budget_requests),
            "stopsWithEstimatedCost": costs_covered,
            "budgetedStops": budgeted_stops,
            "costCoverage": round(costs_covered / budgeted_stops, 4) if budgeted_stops else None,
        },
        "latencyMs": {
            "mean": round(statistics.mean(latency), 3) if latency else None,
            "p95": round(sorted(latency)[max(0, math.ceil(len(latency) * 0.95) - 1)], 3)
            if latency
            else None,
        },
        "humanPreferenceReview": "not_available",
        "gpuMetrics": "not_applicable_to_deterministic_baseline",
    }


def run(cases: list[dict], config: dict) -> dict:
    results = []
    for case in cases:
        plan, latency, failure = plan_case(case, config)
        results.append(score_plan(case, plan, latency, failure, config))
    return {
        "evaluationVersion": "1.0",
        "planner": "deterministic-baseline-v1",
        "summary": summarize(results),
        "cases": results,
    }


def main() -> int:
    args = parse_args()
    report = run(load_cases(args.cases), load_config(args.config))
    rendered = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SystemExit(f"planner evaluation failed: {error}") from error
