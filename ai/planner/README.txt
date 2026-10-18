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
production consent verification and event storage remain to be integrated.
