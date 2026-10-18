"""Generate a draft itinerary with a local GPU-hosted instruction model."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path

from route_geometry import RouteProjectionIndex, decode_polyline

ROOT = Path(__file__).resolve().parents[2]
MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"
MODEL_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--route", required=True, type=Path)
    parser.add_argument("--pois", required=True, type=Path)
    parser.add_argument("--sources", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--revision", default=MODEL_REVISION)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--max-candidates", type=int, default=8)
    parser.add_argument("--max-route-distance-km", type=float, default=10.0)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    return parser.parse_args()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def approved_runtime_source_ids(sources: list[dict]) -> set[str]:
    return {
        source["sourceRecordId"]
        for source in sources
        if source.get("sourceStatus") == "active"
        and source.get("licenseReview", {}).get("status") == "approved"
        and {"runtime_search", "display"}.issubset(source.get("permittedUses", []))
    }


def excluded_platform_terms() -> list[str]:
    policy = ROOT / "ai/configs/data-policy.toml"
    with policy.open("rb") as policy_file:
        return tomllib.load(policy_file)["excluded_platform_terms"]


def _contains_blocked_term(value: str, terms: list[str]) -> bool:
    lowered = value.casefold()
    return any(term.casefold() in lowered for term in terms)


def _normalize(value: str) -> str:
    return " ".join(value.casefold().replace("_", " ").split())


def _allowed_reason(poi: dict, request: dict, category_aliases: dict) -> str:
    category = _normalize(poi["category"])
    name = _normalize(poi["displayName"])
    score = 0
    for interest in request.get("preferences", {}).get("interests", []):
        normalized = _normalize(interest)
        categories = {
            _normalize(value)
            for value in category_aliases.get(normalized, [normalized])
        }
        score += 10 if category in categories else 0
        score += 2 if normalized in name else 0
    for preference in request.get("preferences", {}).get("food", []):
        normalized = _normalize(preference)
        categories = {
            _normalize(value)
            for value in category_aliases.get(normalized, ["restaurant"])
        }
        score += 5 if category in categories else 0
    readable_category = poi["category"].replace("_", " ")
    if score:
        return (
            "Matches a selected trip preference and is near the supplied route "
            f"({readable_category})."
        )
    return f"A nearby route candidate in the {readable_category} category."


def _candidate_payload(
    poi: dict,
    request: dict,
    category_aliases: dict,
    source_ids: set[str],
    blocked_terms: list[str],
    route_index: RouteProjectionIndex,
    max_distance_meters: float,
) -> dict | None:
    if _contains_blocked_term(poi.get("displayName", ""), blocked_terms):
        return None
    evidence = [
        {"evidenceId": f"{poi['poiId']}:evidence:{index}", **item}
        for index, item in enumerate(poi.get("evidence", []))
        if item.get("sourceRecordId") in source_ids
        and not _contains_blocked_term(item.get("fact", ""), blocked_terms)
    ][:3]
    if not evidence:
        return None

    coordinates = poi["location"]
    distance, fraction = route_index.project(
        (coordinates["latitude"], coordinates["longitude"])
    )
    if distance > max_distance_meters:
        return None

    return {
        "poiId": poi["poiId"],
        "displayName": poi["displayName"],
        "category": poi["category"],
        "location": coordinates,
        "facilities": poi.get("facilities", {}),
        "openingHours": poi.get("openingHours"),
        "priceRange": poi.get("priceRange"),
        "quality": poi.get("quality", {}),
        "allowedReason": _allowed_reason(poi, request, category_aliases),
        "routeDistanceMeters": round(distance),
        "routeProgress": round(fraction, 4),
        "evidence": evidence,
    }


def find_model_candidates(
    pois: list[dict],
    sources: list[dict],
    route_points: list[tuple[float, float]],
    request: dict,
    *,
    max_count: int = 80,
    max_route_distance_meters: float = 10_000,
    blocked_terms: list[str] | None = None,
) -> list[dict]:
    if max_count < 1 or max_route_distance_meters <= 0:
        raise ValueError("invalid_candidate_limits")
    route_index = RouteProjectionIndex(route_points, max_route_distance_meters)
    source_ids = approved_runtime_source_ids(sources)
    terms = blocked_terms if blocked_terms is not None else excluded_platform_terms()
    with (ROOT / "ai/configs/planner.toml").open("rb") as config_file:
        category_aliases = tomllib.load(config_file).get("interest_categories", {})
    candidates = [
        candidate
        for poi in pois
        if (candidate := _candidate_payload(
            poi,
            request,
            category_aliases,
            source_ids,
            terms,
            route_index,
            max_route_distance_meters,
        ))
        is not None
    ]
    candidates.sort(key=lambda poi: (poi["routeProgress"], poi["poiId"]))
    return _sample_route_coverage(candidates, max_count)


def _sample_route_coverage(candidates: list[dict], max_count: int) -> list[dict]:
    if len(candidates) <= max_count:
        return candidates
    if max_count == 1:
        return [candidates[len(candidates) // 2]]
    indexes = [round(i * (len(candidates) - 1) / (max_count - 1)) for i in range(max_count)]
    return [candidates[index] for index in indexes]


def build_messages(
    request: dict,
    route: dict,
    candidates: list[dict],
    system_prompt: str,
    output_schema: dict,
) -> list[dict[str, str]]:
    route_context = {
        key: route[key]
        for key in (
            "routeId", "mode", "snapshotId", "distanceMeters", "durationSeconds", "legs"
        )
        if key in route
    }
    task = {
        "task": "Generate the complete draft itinerary. You choose the POIs, their order, and day allocation.",
        "request": request,
        "route": route_context,
        "candidatePois": candidates,
        "outputSchema": output_schema,
        "outputRules": [
            "Return only one JSON object that conforms to outputSchema.",
            "Use only exact candidate POI IDs and their evidence IDs.",
            "Use the exact candidate evidence facts; missing facts are unknown.",
            "For each selected stop, copy its allowedReason exactly into reason.",
            "Set schemaVersion to 1.0, revision to 1, status to draft, and copy the exact requestId and routeId.",
            "Create exactly one day per requested duration day, with consecutive dayNumber values and dates starting at request.startDate.",
            "Set every stop arrival and departure as a valid local-offset datetime within that day's 08:00-20:00 window, in the order you chose.",
            "Set each day's legs to an empty array; the routing validator supplies route legs after generation.",
            "Do not claim the trip is confirmed, currently open, safe, or live-traffic checked.",
            "When a requirement cannot be verified, leave the affected stop out and explain the gap or uncertainty.",
            "Do not mention travel platforms, aggregators, or map brands.",
        ],
    }
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(task, ensure_ascii=False)},
    ]


def parse_generated_json(text: str) -> dict:
    object_start = text.find("{")
    array_start = text.find("[")
    starts = [position for position in (object_start, array_start) if position >= 0]
    start = min(starts) if starts else -1
    if start < 0:
        raise ValueError("model_output_missing_json")
    try:
        value, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as error:
        raise ValueError("model_output_invalid_json") from error
    if not isinstance(value, dict):
        raise ValueError("model_output_not_object")
    return value


def attach_provenance(
    plan: dict,
    candidates: list[dict],
    sources: list[dict],
    request: dict,
    route: dict,
    model_id: str,
) -> dict:
    if not isinstance(plan.get("days"), list):
        raise ValueError("model_output_days_missing")
    if plan.get("extensions") is not None and not isinstance(plan["extensions"], dict):
        raise ValueError("model_output_extensions_invalid")
    candidates_by_id = {candidate["poiId"]: candidate for candidate in candidates}
    source_by_id = {source["sourceRecordId"]: source for source in sources}
    evidence_source_by_id = {}
    selected_ids = set()
    for day in plan.get("days", []):
        if not isinstance(day, dict) or not isinstance(day.get("stops"), list):
            raise ValueError("model_output_day_invalid")
        day["legs"] = []
        for stop in day.get("stops", []):
            if not isinstance(stop, dict):
                raise ValueError("model_output_stop_invalid")
            poi_id = stop.get("poiId")
            candidate = candidates_by_id.get(poi_id)
            if candidate is None or poi_id in selected_ids:
                raise ValueError("model_output_unknown_or_repeated_poi")
            selected_ids.add(poi_id)
            stop["reason"] = candidate["allowedReason"]
            allowed_evidence = {
                item["evidenceId"]: item["sourceRecordId"]
                for item in candidate["evidence"]
            }
            evidence_ids = stop.get("evidenceIds", [])
            if not evidence_ids or any(item not in allowed_evidence for item in evidence_ids):
                raise ValueError("model_output_invalid_poi_evidence")
            evidence_source_by_id.update(
                {item: allowed_evidence[item] for item in evidence_ids}
            )

    model_notes = plan.pop("notes", None)
    extensions = plan.setdefault("extensions", {})
    if model_notes is not None:
        extensions["modelNotes"] = model_notes
    if "uncertainties" not in plan:
        plan["uncertainties"] = [
            "Current opening hours, availability, prices, traffic, and safety were not verified by the supplied place records."
        ]
    extensions.update(
        {
            "planner": "local-instruction-model-v1",
            "modelId": model_id,
            "candidateCount": len(candidates),
            "routeLegValidation": "not_run",
            "evidenceSourceById": evidence_source_by_id,
            "sourceSnapshots": {
                source_id: _snapshot_metadata(source_by_id[source_id])
                for source_id in sorted(set(evidence_source_by_id.values()))
            },
        }
    )
    plan["schemaVersion"] = "1.0"
    plan["requestId"] = request.get("requestId", "request-unidentified")
    plan["revision"] = 1
    plan["status"] = "draft"
    plan["routeId"] = route["routeId"]
    return plan


def _snapshot_metadata(source: dict) -> dict:
    extensions = source.get("extensions", {})
    return {
        "license": source.get("license"),
        "attributionText": source.get("attributionText"),
        "sourceUri": source.get("sourceUri"),
        "licenseReviewState": source.get("licenseReview", {}).get("status"),
        "fetchedAt": source.get("fetchedAt"),
        "publishedAt": source.get("publishedAt"),
        "lastVerifiedAt": source.get("lastVerifiedAt"),
        "snapshotTimestamp": extensions.get("snapshotTimestamp"),
        "sha256": extensions.get("sha256"),
    }


def generate(messages: list[dict[str, str]], args: argparse.Namespace) -> str:
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    except ImportError as error:
        raise RuntimeError("gpu_model_dependencies_missing") from error
    if not torch.cuda.is_available():
        raise RuntimeError("cuda_unavailable_refusing_cpu_fallback")

    device = torch.cuda.current_device()
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    load_options = {
        "quantization_config": quantization,
        "device_map": {"": device},
        "low_cpu_mem_usage": True,
        "revision": args.revision,
        "attn_implementation": "sdpa",
    }
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision)
    model = AutoModelForCausalLM.from_pretrained(args.model, **load_options)
    if args.adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, str(args.adapter))
    encoded = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
        return_dict=True,
    ).to(f"cuda:{device}")
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            max_new_tokens=args.max_new_tokens,
            do_sample=False,
            use_cache=True,
            logits_to_keep=1,
        )
    return tokenizer.decode(
        output[0][encoded["input_ids"].shape[-1]:], skip_special_tokens=True
    )


def run(args: argparse.Namespace) -> dict:
    request = read_json(args.request)
    route = read_json(args.route)
    pois = read_jsonl(args.pois)
    sources = read_jsonl(args.sources)
    if request.get("vehicle", {}).get("mode") != route.get("mode"):
        raise ValueError("request_route_mode_mismatch")
    route_points = decode_polyline(route["geometry"], precision=6)
    candidates = find_model_candidates(
        pois,
        sources,
        route_points,
        request,
        max_count=args.max_candidates,
        max_route_distance_meters=args.max_route_distance_km * 1000,
    )
    if not candidates:
        raise ValueError("model_candidate_set_empty")

    guardrails_path = ROOT / "ai/prompts/trip-planning-guardrails-v1.txt"
    schema_path = ROOT / "ai/schemas/v1/trip-plan.schema.json"
    messages = build_messages(
        request,
        route,
        candidates,
        guardrails_path.read_text(encoding="utf-8"),
        json.loads(schema_path.read_text(encoding="utf-8")),
    )
    generated = generate(messages, args)
    plan = parse_generated_json(generated)
    return attach_provenance(
        plan, candidates, sources, request, route, args.model
    )


def main() -> int:
    args = parse_args()
    try:
        plan = run(args)
    except (OSError, json.JSONDecodeError, KeyError, ValueError, RuntimeError) as error:
        code = str(error) or "model_plan_failed"
        print(json.dumps({"errorCode": code}), file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
