"""Build a GPU-encoded POI index or query it with route filtering."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from planner import load_config, validate_schema
from retrieval import (
    E5SmallCudaProvider,
    build_documents,
    corpus_fingerprint,
    filter_by_route,
    load_index,
    save_index,
    search,
)
from route_geometry import decode_polyline

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--pois", required=True, type=Path)
    build.add_argument("--sources", required=True, type=Path)
    build.add_argument("--output", required=True, type=Path)
    build.add_argument("--config", type=Path, default=PROJECT_ROOT / "ai/configs/planner.toml")
    query = commands.add_parser("search")
    query.add_argument("--index", required=True, type=Path)
    query.add_argument("--pois", required=True, type=Path)
    query.add_argument("--sources", required=True, type=Path)
    query.add_argument("--query", required=True)
    query.add_argument("--route", required=True, type=Path)
    query.add_argument("--max-route-distance-km", type=float)
    query.add_argument("--limit", type=int)
    query.add_argument("--rrf-k", type=int)
    query.add_argument("--bm25-weight", type=float)
    query.add_argument("--semantic-weight", type=float)
    query.add_argument("--config", type=Path, default=PROJECT_ROOT / "ai/configs/planner.toml")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        config = load_config(args.config)
        retrieval_config = config["retrieval"]
        provider = E5SmallCudaProvider(
            retrieval_config["embedding_model"], retrieval_config["embedding_revision"]
        )
        if args.command == "build":
            pois = read_jsonl(args.pois)
            sources = read_jsonl(args.sources)
            for poi in pois:
                validate_schema(poi, "poi.schema.json")
            for source in sources:
                validate_schema(source, "source-record.schema.json")
            documents = build_documents(
                pois,
                sources,
                provider,
                expected_dimensions=retrieval_config["embedding_dimensions"],
            )
            save_index(
                args.output,
                documents,
                provider,
                corpus_fingerprint(pois, sources),
            )
            print(json.dumps({"indexedDocuments": len(documents)}))
            return 0

        model, fingerprint, documents = load_index(args.index)
        if model != {"id": provider.model_id, "revision": provider.revision}:
            raise ValueError("embedding_model_revision_mismatch")
        current_fingerprint = corpus_fingerprint(read_jsonl(args.pois), read_jsonl(args.sources))
        if fingerprint != current_fingerprint:
            raise ValueError("retrieval_index_stale_rebuild_required")
        route = json.loads(args.route.read_text(encoding="utf-8"))
        validate_schema(route, "route-alternative.schema.json")
        results = search(
            args.query,
            documents,
            provider.encode_query(args.query),
            limit=(args.limit or config["retrieval"]["index_limit"])
            * config["retrieval"]["overfetch_factor"],
            rrf_k=args.rrf_k or config["retrieval"]["rrf_k"],
            bm25_weight=args.bm25_weight if args.bm25_weight is not None else config["retrieval"]["bm25_weight"],
            semantic_weight=args.semantic_weight if args.semantic_weight is not None else config["retrieval"]["semantic_weight"],
        )
        filtered = filter_by_route(
            results,
            documents,
            decode_polyline(route["geometry"], precision=6),
            (args.max_route_distance_km or config["planner"]["max_route_distance_km"]) * 1000,
        )[: args.limit or config["retrieval"]["index_limit"]]
        print(json.dumps(filtered, ensure_ascii=False, indent=2))
        return 0
    except (OSError, json.JSONDecodeError):
        print(json.dumps({"errorCode": "input_file_unavailable_or_invalid_json"}), file=sys.stderr)
    except (ValueError, RuntimeError) as error:
        print(json.dumps({"errorCode": str(error)}), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
