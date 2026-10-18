"""Permission-aware hybrid retrieval for approved runtime POI facts."""

from __future__ import annotations

import hashlib
import json
import math
import re
import tomllib
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from route_geometry import project_onto_route

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _excluded_platform_terms() -> list[str]:
    policy_path = PROJECT_ROOT / "ai/configs/data-policy.toml"
    with policy_path.open("rb") as policy_file:
        return tomllib.load(policy_file).get("excluded_platform_terms", [])


class EmbeddingProvider(Protocol):
    model_id: str
    revision: str

    def encode_passages(self, texts: list[str]) -> list[list[float]]: ...

    def encode_query(self, text: str) -> list[float]: ...


@dataclass(frozen=True)
class RetrievalDocument:
    poi_id: str
    display_name: str
    category: str
    text: str
    latitude: float
    longitude: float
    evidence: tuple[dict, ...]
    source_ids: tuple[str, ...]
    content_hash: str
    vector: tuple[float, ...]


def approved_source_ids(sources: list[dict]) -> set[str]:
    return {
        source["sourceRecordId"]
        for source in sources
        if source.get("sourceStatus") == "active"
        and source.get("licenseReview", {}).get("status") == "approved"
        and {"runtime_search", "display"}.issubset(source.get("permittedUses", []))
    }


def build_documents(
    pois: list[dict],
    sources: list[dict],
    provider: EmbeddingProvider,
    expected_dimensions: int | None = None,
) -> list[RetrievalDocument]:
    allowed_sources = approved_source_ids(sources)
    blocked_terms = [term.casefold() for term in _excluded_platform_terms()]
    prepared = []
    seen_poi_ids = set()
    for poi in pois:
        evidence = tuple(
            item for item in poi.get("evidence", [])
            if item.get("sourceRecordId") in allowed_sources
            and not any(term in item.get("fact", "").casefold() for term in blocked_terms)
        )
        if not evidence:
            continue
        if any(term in poi["displayName"].casefold() for term in blocked_terms):
            continue
        if poi["poiId"] in seen_poi_ids:
            raise ValueError("duplicate_poi_id")
        seen_poi_ids.add(poi["poiId"])
        facts = " ".join(item["fact"] for item in evidence)
        facilities = " ".join(
            f"{name.replace('_', ' ')} {value}"
            for name, value in sorted(poi.get("facilities", {}).items())
        )
        text = " ".join(
            part for part in (poi["displayName"], poi["category"], facilities, facts)
            if part
        )
        if any(term in text.casefold() for term in blocked_terms):
            continue
        prepared.append((poi, text, evidence))

    vectors = provider.encode_passages([f"passage: {text}" for _, text, _ in prepared])
    if len(vectors) != len(prepared):
        raise ValueError("embedding_count_mismatch")
    if len({len(vector) for vector in vectors}) > 1:
        raise ValueError("embedding_dimension_mismatch")
    if expected_dimensions is not None and any(
        len(vector) != expected_dimensions for vector in vectors
    ):
        raise ValueError("embedding_dimension_mismatch")

    documents = []
    for (poi, text, evidence), vector in zip(prepared, vectors, strict=True):
        if not vector or any(not math.isfinite(value) for value in vector):
            raise ValueError("invalid_embedding_vector")
        payload = json.dumps(
            {
                "poiId": poi["poiId"],
                "displayName": poi["displayName"],
                "category": poi["category"],
                "location": poi["location"],
                "facilities": poi.get("facilities", {}),
                "evidence": evidence,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
        documents.append(
            RetrievalDocument(
                poi_id=poi["poiId"],
                display_name=poi["displayName"],
                category=poi["category"],
                text=text,
                latitude=poi["location"]["latitude"],
                longitude=poi["location"]["longitude"],
                evidence=evidence,
                source_ids=tuple(sorted({item["sourceRecordId"] for item in evidence})),
                content_hash=hashlib.sha256(payload).hexdigest(),
                vector=tuple(_normalize(vector)),
            )
        )
    return documents


def corpus_fingerprint(pois: list[dict], sources: list[dict]) -> str:
    snapshot = json.dumps(
        {"pois": pois, "sources": sources},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(snapshot).hexdigest()


def save_index(
    path: Path,
    documents: list[RetrievalDocument],
    provider: EmbeddingProvider,
    input_fingerprint: str,
) -> None:
    payload = {
        "schemaVersion": "1.0",
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "embeddingModel": {"id": provider.model_id, "revision": provider.revision},
        "corpusFingerprint": input_fingerprint,
        "documents": [asdict(document) for document in documents],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_index(path: Path) -> tuple[dict, str, list[RetrievalDocument]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    documents = [
        RetrievalDocument(
            **{
                **row,
                "evidence": tuple(row["evidence"]),
                "source_ids": tuple(row["source_ids"]),
                "vector": tuple(row["vector"]),
            }
        )
        for row in payload["documents"]
    ]
    return payload["embeddingModel"], payload["corpusFingerprint"], documents


def search(
    query: str,
    documents: list[RetrievalDocument],
    query_vector: list[float],
    *,
    limit: int = 20,
    rrf_k: int = 60,
    bm25_weight: float = 1.0,
    semantic_weight: float = 1.0,
) -> list[dict]:
    if limit < 1 or rrf_k < 1 or bm25_weight < 0 or semantic_weight < 0:
        raise ValueError("invalid_retrieval_config")
    if bm25_weight + semantic_weight == 0:
        raise ValueError("retrieval_weights_cannot_both_be_zero")
    lexical = _bm25_rank(query, documents)
    semantic = _semantic_rank(query_vector, documents)
    lexical_rank = {poi_id: rank for rank, poi_id in enumerate(lexical, start=1)}
    semantic_rank = {poi_id: rank for rank, poi_id in enumerate(semantic, start=1)}
    by_id = {document.poi_id: document for document in documents}
    results = []
    for poi_id in set(lexical_rank) | set(semantic_rank):
        score = bm25_weight / (rrf_k + lexical_rank[poi_id]) if poi_id in lexical_rank else 0
        score += semantic_weight / (rrf_k + semantic_rank[poi_id]) if poi_id in semantic_rank else 0
        document = by_id[poi_id]
        results.append(
            {
                "poiId": poi_id,
                "displayName": by_id[poi_id].display_name,
                "category": by_id[poi_id].category,
                "score": score,
                "bm25Rank": lexical_rank.get(poi_id),
                "semanticRank": semantic_rank.get(poi_id),
                "evidence": list(document.evidence),
                "sourceIds": list(document.source_ids),
                "contentHash": document.content_hash,
            }
        )
    return sorted(results, key=lambda item: (-item["score"], item["poiId"]))[:limit]


def filter_by_route(
    results: list[dict],
    documents: list[RetrievalDocument],
    route_points: list[tuple[float, float]],
    max_distance_meters: float,
) -> list[dict]:
    by_id = {document.poi_id: document for document in documents}
    filtered = []
    for result in results:
        document = by_id[result["poiId"]]
        distance, fraction = project_onto_route(
            (document.latitude, document.longitude), route_points
        )
        if distance <= max_distance_meters:
            filtered.append({**result, "routeDistanceMeters": distance, "routeFraction": fraction})
    return filtered


def retrieval_metrics(results: list[dict], relevant_poi_ids: set[str], k: int) -> dict:
    """Measure one ranked list against human-reviewed relevant POI IDs."""
    if k < 1:
        raise ValueError("invalid_metric_cutoff")
    ranked_ids = [result["poiId"] for result in results[:k]]
    hits = [index for index, poi_id in enumerate(ranked_ids, start=1) if poi_id in relevant_poi_ids]
    return {
        "recallAtK": len(set(ranked_ids) & relevant_poi_ids) / max(1, len(relevant_poi_ids)),
        "reciprocalRank": 1 / hits[0] if hits else 0.0,
        "relevantCount": len(relevant_poi_ids),
        "returnedCount": len(ranked_ids),
        "cutoff": k,
    }


def _bm25_rank(query: str, documents: list[RetrievalDocument]) -> list[str]:
    query_terms = set(_tokens(query))
    if not query_terms:
        return [document.poi_id for document in sorted(documents, key=lambda item: item.poi_id)]
    tokenized = {document.poi_id: _tokens(document.text) for document in documents}
    lengths = [len(tokens) for tokens in tokenized.values()]
    average_length = sum(lengths) / max(1, len(lengths))
    document_frequency = Counter(
        term for tokens in tokenized.values() for term in set(tokens)
    )
    k1, b = 1.5, 0.75
    scores = {}
    for document in documents:
        tokens = tokenized[document.poi_id]
        frequencies = Counter(tokens)
        score = 0.0
        for term in query_terms:
            frequency = frequencies[term]
            if frequency == 0:
                continue
            idf = math.log(1 + (len(documents) - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
            denominator = frequency + k1 * (1 - b + b * len(tokens) / max(average_length, 1))
            score += idf * frequency * (k1 + 1) / denominator
        scores[document.poi_id] = score
    return sorted(scores, key=lambda poi_id: (-scores[poi_id], poi_id))


def _semantic_rank(query_vector: list[float], documents: list[RetrievalDocument]) -> list[str]:
    normalized = _normalize(query_vector)
    if not normalized:
        raise ValueError("empty_query_embedding")
    scores = {}
    for document in documents:
        if len(document.vector) != len(normalized):
            raise ValueError("embedding_dimension_mismatch")
        scores[document.poi_id] = sum(a * b for a, b in zip(normalized, document.vector, strict=True))
    return sorted(scores, key=lambda poi_id: (-scores[poi_id], poi_id))


def _tokens(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else []


class E5SmallCudaProvider:
    """Pinned E5-small-v2 encoder that refuses CPU inference."""

    model_id = "intfloat/e5-small-v2"
    revision = "b092564f663f3501ee814ca64e464abce9b6eda7"

    def __init__(
        self,
        model_id: str = "intfloat/e5-small-v2",
        revision: str = "b092564f663f3501ee814ca64e464abce9b6eda7",
    ) -> None:
        if model_id != "intfloat/e5-small-v2":
            raise RuntimeError("unsupported_embedding_model")
        try:
            import torch
            from transformers import AutoModel, AutoTokenizer
        except ImportError as error:
            raise RuntimeError("embedding_dependencies_missing") from error
        if not torch.cuda.is_available():
            raise RuntimeError("cuda_required_for_embedding")
        self.model_id = model_id
        self.revision = revision
        self._torch = torch
        self._tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
        self._model = AutoModel.from_pretrained(model_id, revision=revision).to("cuda").eval()

    def encode_passages(self, texts: list[str]) -> list[list[float]]:
        return self._encode(texts)

    def encode_query(self, text: str) -> list[float]:
        return self._encode([f"query: {text}"])[0]

    def _encode(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        torch = self._torch
        tokens = self._tokenizer(
            texts, padding=True, truncation=True, max_length=512, return_tensors="pt"
        ).to("cuda")
        with torch.inference_mode():
            hidden = self._model(**tokens).last_hidden_state
            mask = tokens["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            normalized = torch.nn.functional.normalize(pooled, p=2, dim=1)
        return normalized.float().cpu().tolist()
