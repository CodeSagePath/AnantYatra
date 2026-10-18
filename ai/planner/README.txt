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
missing. The output is always a draft. It does not calculate daily route legs
or stop detours; those must be sent to Valhalla and validated before a plan
can be confirmed. Generated arrival times are estimates from position on the
supplied route and its overall duration.

The current Karnataka OSM source is pending license review and is not
eligible for runtime search or display. The test cases use synthetic records
only. The planner does not call the language model; this rules baseline is
needed before model behavior can be measured against it.

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
The current OSM source is pending review, so it will be excluded. This retrieval
path is an experimental CLI and is not enabled in normal trip planning. No
quality improvement is claimed until a permitted corpus and frozen evaluation
set can compare it with the baseline. RRF does not verify current hours,
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
provide database persistence, an HTTP API, a real POI validator, or a Valhalla
callback. Do not treat test callbacks as production validation.

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
