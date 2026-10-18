Deterministic planner baseline

The planner consumes a schema-valid Trip Request, Route Alternative, POIs,
and source records. It only considers POIs whose source is active, has an
approved license review, and permits both runtime_search and display.

Run the planner against input JSON and JSONL files:

    ./ai/scripts/plan-trip.sh \
      --request /path/to/request.json \
      --route /path/to/route.json \
      --pois /path/to/pois.jsonl \
      --sources ai/data/source-register.jsonl \
      --output /path/to/draft-plan.json

Run the deterministic scenario tests:

    ./ai/scripts/test-planner.sh

The first baseline filters to route-corridor POIs, enforces requested
facilities, ranks configured interest/category matches, and places a limited
number of stops across trip days. When accommodation is requested, it reserves
one approved hotel candidate near each overnight route boundary when data is
available. Missing stays become explicit requirement gaps. Budget and specific
dietary suitability are reported as uncertain when price/menu facts are
missing. The output is always a draft. By default it does not calculate daily
route legs; pass `--validate-route-legs` to query the configured Valhalla
service, replace route-derived arrival estimates with sequential leg and visit
times, and reject infeasible daily schedules. This validates daily legs, not
stop detours away from the supplied route. Day boundaries are evenly spaced
along the supplied route and remain estimates.

The route planner screen exposes trip planning through “Build a day-by-day
trip plan”. The server obtains a route, then `model_cli.py` supplies the request,
route, and approved runtime POI evidence to Qwen. The model chooses stops,
orders them, and assigns them to days. The application checks the returned
schema, POI IDs, evidence, preferences, and schedule, then asks Valhalla to
recalculate daily legs and rejects infeasible output. It does not silently
replace a rejected model plan with the deterministic planner. Display names
are resolved from the exact POI records.

Run the local GPU-only model path (Valhalla must already be reachable):

    ./ai/scripts/plan-model-trip.sh REQUEST ROUTE POIS SOURCES OUTPUT

The script uses `ai/.venv/bin/python` for the model and
`ai/data-tools/.venv/bin/python` for validation. Set `AI_MODEL_ID`,
`AI_MODEL_REVISION`, or `AI_MODEL_ADAPTER` to select a model revision or
adapter. It uses 4-bit NF4 inference and refuses to fall back to CPU. The
default candidate limit is 8, selected across route progress, with up to three
evidence facts per place to bound the prompt. It uses PyTorch SDPA attention,
4-bit NF4 weights, and a 512-token generation cap for the 4 GB GPU. The
existing adapter still contains POI fact lookup training only; no
trip-planning adapter has been trained.

The deterministic baseline remains available via `plan-trip.sh` for software
comparison. It is not used as a fallback in the model path. Treat route times
and imported place records as estimates and verify current conditions before
travel. A model-generated draft is not a confirmed itinerary.

Trip requests support car, motorcycle, and bicycle modes. The caller must
provide route geometry, distance, and duration calculated for the same mode.
When a route alternative includes its canonical mode, the planner rejects a
mismatch. Older route alternatives without a mode remain accepted for car and
motorcycle compatibility; bicycle requests require an explicit matching route
mode. Bicycle-specific safety, surface, elevation, and rest rules are not yet
modeled; bicycle support here only consumes a mode-matched route.

A local Valhalla profile smoke check is available at
`./ai/scripts/test-valhalla-local.sh`. It expects a local service at
`http://127.0.0.1:5006` by default; set `VALHALLA_URL` to use another address.
It checks auto, motorcycle, and bicycle route responses for Bengaluru–
Mangaluru and prints aggregate distance/time only. The planner does not start
Valhalla automatically. The route API returns a planner route alternative
with canonical mode, engine/snapshot provenance, per-leg metrics, and OSM
attribution. The `POST /api/routes/ai-plan` endpoint obtains a mode-matched
route and invokes this planner with daily Valhalla leg validation. The OSM
source has an internal engineering approval for runtime search, display,
attribution, and distribution through the guarded data-offer endpoint; this
is not legal advice. Imported POIs remain unverified, so plans remain drafts.
Training and evaluation uses remain blocked. The tests use synthetic records.
The planner does not call the language model; this rules baseline is needed
before model behavior can be measured against it.

Hybrid POI retrieval

The experimental retrieval index builds BM25 text ranks plus normalized
E5-small-v2 passage embeddings and merges them with configurable RRF. Its
builder admits only active sources with an approved license review and both
runtime_search and display permission. Platform/aggregator brand terms from
ai/configs/data-policy.toml are excluded from indexed passage text; real place
names remain eligible. Every result carries its source IDs, evidence facts,
observed timestamps, and content hash. Route-corridor filtering runs after
retrieval, with configurable overfetch to compensate for excluded off-route
results.

Build and query with a CUDA-enabled ai/.venv:

    ./ai/scripts/retrieve-pois.sh build \
      --pois ai/data/approved/pois.jsonl \
      --sources ai/data/source-register.jsonl \
      --output ai/data/approved/retrieval-index.json
    ./ai/scripts/retrieve-pois.sh search \
      --index ai/data/approved/retrieval-index.json \
      --pois ai/data/approved/pois.jsonl \
      --sources ai/data/source-register.jsonl \
      --query "quiet family stop with vegetarian food and parking" \
      --route /path/to/route.json

Search compares a fingerprint of the current POI/source snapshot with the index
and refuses stale indexes. Rebuild after any source, permission, evidence, or
POI change; writing the new index replaces old vectors, including records no
longer eligible.
The OSM source is approved for runtime search and display, so it may be indexed
with attribution; imported POIs remain unverified. This retrieval path is an
experimental CLI and is not enabled in normal trip planning. No quality
improvement is claimed until a permitted corpus and frozen evaluation set can
compare it with the baseline. RRF does not verify current hours,
availability, road safety, or suitability.

Trip progress and safe revision core

trip_lifecycle.py applies versioned trip events for confirmation, completed or
skipped stops, delays, completion, and cancellation. State revisions use an
expected revision number to reject stale updates; event IDs are idempotent and
cannot be reused with different content. Location is absent by default.

propose_plan_revision preserves completed and user-confirmed stops, omits
skipped stops, computes added/removed/rescheduled stop IDs, and calls required
POI and route validation functions on the merged proposal. It returns a draft
proposal only after both validations pass. accept_plan_revision activates it
only after a separate user-acceptance event. These pure functions do not yet
provide database persistence, an HTTP API, or a production POI/detour validator.
The initial AI planning endpoint validates daily route legs, but is not yet
connected to the lifecycle revision workflow. Do not treat test callbacks as
production validation.

Feedback categories are in ai/configs/feedback-taxonomy.json. The category
vocabulary can be versioned and edited without changing Python code. If a
feedback event opts into training, it must include a consentRecordId reference;
the feedback-loop helper verifies the referenced ledger record and stores the
event privately. Authenticated app/API integration remains outstanding.

Phase 10 feedback and release utilities

feedback_loop.py provides a locked, idempotent append-only JSONL event store
intended for ai/data/private/feedback-events.jsonl and separate review/candidate
ledgers. Keep private directories owner-only. Feedback starts pending; review
decisions are separate append-only events. Aggregation counts distinct
pseudonymous reporter tokens and only flags records for human verification.
The server must issue those tokens; client-provided tokens do not prove
independence.

Verified opening-hours/facility corrections are applied to a copy of a POI only
after feedback review and active runtime/display source permission checks. The
copy retains the prior value in extensions.factHistory and appends new evidence.
The app/runtime POI store is not connected yet.

Training candidates describe accepted itineraries, meaningful edits, or failed
plans. User-origin candidates require granted model-training consent and
training-approved sources. A separate human approval is required before they
become training-example records. Withdrawn consent excludes a candidate from
the export. Feed approved output through ai/scripts/build-dataset.sh; the
existing grouped split and frozen-test protections still apply.

model_release.py verifies adapter file hashes, base-model identity, identical
evaluation-suite hashes, hard gates, non-regressing scenario pass rate, a
bounded p95 latency regression, and human approval before promotion. The prior
adapter remains rollback-available; rollback verifies its files before changing
the active registry pointer. The registry is stored under ignored ai/runs.
These utilities are not wired to authenticated server APIs, a live POI store,
or app rollout controls.

For later adapter training, use ai/scripts/retrain.sh. It requires a reviewed
retraining decision, the matching dataset release, and the matching frozen
evaluation suite. Thresholds are in ai/configs/karnataka-qlora.toml. A reviewed
defer decision exits without a training run.
