PHASE 5 DATASET WORKFLOW

The intake contains only complete examples that have passed human quality
review and source-rights review. Each record uses the training-example schema
and adds an extensions.dataset object with:

- corridorId: normalized corridor or corridor group
- scenarioFamily: a stable family for near-duplicate cases
- sourceSnapshotId: immutable route/POI fact snapshot identifier
- reviewedBy: the human reviewer identifier

Keep intake files outside Git until they contain only approved, permitted
material. Do not add personal or user-submitted travel data without explicit
model-training consent. Do not treat a generated example as reviewed.

Build grouped splits with:

    ./ai/scripts/build-dataset.sh \
      --input /path/to/reviewed-intake.jsonl \
      --output-dir ai/models/datasets/releases/<release-id> \
      --seed 42

Extract route-specific POI candidates from the pinned OSM POI snapshot with:

    ai/data-tools/.venv/bin/python ai/datasets/extract_corridor_candidates.py \
      --pois ai/models/datasets/processed/karnataka-2026-10-17/pois.jsonl \
      --sources ai/data/source-register.jsonl \
      --route /path/to/pinned-route.json \
      --route-source-id osmfr-karnataka-20261017 \
      --max-distance-km 10 \
      --output /path/to/candidates.jsonl

This output is a route-ordered candidate POI set, not a trip plan or training
example. The sidecar manifest records source IDs, license, category counts,
hash, and the pending quality-review state. Every candidate source must be
approved for training. OSM-derived output requires an ODbL data offer and OSM
attribution before public model use.

The builder validates the JSON Schema, human-review metadata, active training
source permissions, platform-brand terms, unique IDs, and duplicate user
prompts. It groups examples by corridor, scenario family, and source snapshot
so related examples cannot cross the train/validation/test boundary. It writes
train.jsonl, validation.jsonl, test.jsonl, and a manifest with split IDs,
snapshot IDs, and SHA-256 hashes.

An existing test.jsonl is frozen. A changed test split fails unless the
reviewer explicitly reruns with --refresh-frozen-test after recording the
reason for the new evaluation version. Never use validation/test examples for
training. Point the QLoRA [data].train_file setting at the generated train.jsonl
only after reviewing the manifest.

Recommended review fields for each answer: constraint compliance, route and
time feasibility, evidence support, facility certainty, budget handling,
appropriate refusal/uncertainty, and usefulness. Check every named place
against the linked snapshot; unsupported details must be removed or marked
unknown. Keep a separate human review record with reviewer, date, outcome,
issues, and correction history.

Recommended scenario families include vehicle type, schedule pace, budget,
dietary/family constraints, excessive detours, unknown facilities/hours,
weather/road uncertainty, late departure, skipped stops, changed destination,
and active re-planning. Reserve later interstate cases to test state-boundary
behavior without mixing them into a same-corridor near-duplicate group.

No seed examples are shipped as approved training data. The OSM source review
now permits training/evaluation subject to ODbL data-offer and attribution
requirements for any public model use. Each POI and complete request-to-plan
example still requires human quality review. The Phase 4 synthetic planner
tests are software tests, not model training or evaluation cases.
