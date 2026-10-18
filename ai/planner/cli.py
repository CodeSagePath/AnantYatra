"""Command-line entry point for the deterministic planner baseline."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from planner import PlannerError, load_config, plan_trip, validate_plan_guardrails
from route_validation import validate_plan_route_legs


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--route", required=True, type=Path)
    parser.add_argument("--pois", required=True, type=Path)
    parser.add_argument("--sources", type=Path, default=Path("ai/data/source-register.jsonl"))
    parser.add_argument("--config", type=Path, default=Path("ai/configs/planner.toml"))
    parser.add_argument(
        "--model-plan",
        type=Path,
        help="Validate a model-generated plan instead of selecting stops deterministically.",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--validate-route-legs",
        action="store_true",
        help="Check each scheduled day against the configured Valhalla routing service.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        request = read_json(args.request)
        route = read_json(args.route)
        pois = read_jsonl(args.pois)
        sources = read_jsonl(args.sources)
        config = load_config(args.config)
        result = (
            read_json(args.model_plan)
            if args.model_plan
            else plan_trip(
                request=request,
                route=route,
                pois=pois,
                sources=sources,
                config=config,
            )
        )
        validate_plan_guardrails(
            result,
            request=request,
            route=route,
            pois=pois,
            sources=sources,
            config=config,
        )
        if args.validate_route_legs:
            result = validate_plan_route_legs(
                result,
                request=request,
                route=route,
                pois=pois,
                config=config,
            )
            validate_plan_guardrails(
                result,
                request=request,
                route=route,
                pois=pois,
                sources=sources,
                config=config,
            )
    except PlannerError as error:
        print(json.dumps({"errorCode": error.code}), file=sys.stderr)
        return 1
    except json.JSONDecodeError:
        print(json.dumps({"errorCode": "invalid_json_input"}), file=sys.stderr)
        return 1
    except OSError:
        print(json.dumps({"errorCode": "input_file_unavailable"}), file=sys.stderr)
        return 1
    except ValueError:
        print(json.dumps({"errorCode": "invalid_planner_input"}), file=sys.stderr)
        return 1

    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
