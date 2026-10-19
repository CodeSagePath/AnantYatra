"""Validate proposed review-packet legs with a mode-matched Valhalla server."""

from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "ai/planner"))

from planner import PlannerError, load_config, validate_plan_guardrails
from route_validation import validate_plan_route_legs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--sources", default=Path("ai/data/source-register.jsonl"), type=Path)
    parser.add_argument("--config", default=Path("ai/configs/planner.toml"), type=Path)
    parser.add_argument("--routing-host", default=os.environ.get("ROUTING_HOST", "http://127.0.0.1:5005"))
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def validate_case(case: dict, sources: list[dict], config: dict) -> dict:
    proposed_plan = copy.deepcopy(case["proposedPlan"])
    try:
        validated_plan = validate_plan_route_legs(
            proposed_plan,
            case["request"],
            case["route"],
            case["candidatePois"],
            config,
        )
        validate_plan_guardrails(
            validated_plan,
            case["request"],
            case["route"],
            case["candidatePois"],
            sources,
            config,
        )
    except PlannerError as error:
        case["routeValidationReview"] = {
            "status": "failed",
            "errorCode": error.code,
            "engine": "Valhalla",
            "snapshotId": case["route"]["snapshotId"],
        }
    else:
        case["proposedPlan"] = validated_plan
        case["routeValidationReview"] = {
            "status": "passed",
            "engine": "Valhalla",
            "snapshotId": case["route"]["snapshotId"],
            "validatedLegs": validated_plan["extensions"]["validatedLegs"],
        }
    return case


def main() -> None:
    args = parse_args()
    os.environ["ROUTING_HOST"] = args.routing_host
    config = load_config(args.config)
    sources = read_jsonl(args.sources)
    cases = [validate_case(case, sources, config) for case in read_jsonl(args.input)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(case, ensure_ascii=False, sort_keys=True) + "\n" for case in cases),
        encoding="utf-8",
    )
    passed = sum(case["routeValidationReview"]["status"] == "passed" for case in cases)
    print(json.dumps({"output": str(args.output), "caseCount": len(cases), "routeValidated": passed}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, KeyError, ValueError) as error:
        raise SystemExit(f"trip review route validation failed: {error}") from error
