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
