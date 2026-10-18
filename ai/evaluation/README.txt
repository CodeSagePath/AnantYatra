WHOLE-PLANNER EVALUATION

Run reviewed scenario cases in JSONL format:

    ./ai/scripts/evaluate-planner.sh \
      --cases /path/to/reviewed-planner-cases.jsonl \
      --output /path/to/evaluation-report.json

Each case follows ai/schemas/v1/planner-evaluation-case.schema.json. It
contains the request, a pinned route, candidate POIs and their source records,
plus reviewed exact/forbidden POI ID expectations and expected requirement
gaps. Each source must be active, license-reviewed, and explicitly approved
for evaluation; planner input contracts are validated as each case runs. Keep
the case set separate from training and validation inputs; record its frozen
version and snapshot provenance with the dataset release manifest.

The report measures planner failures, expected stop selection, forbidden and
invented POI IDs, evidence grounding, route-leg validation, time feasibility,
required-facility adherence, requirement-gap agreement, budget cost coverage,
and latency. It reports user preference review and GPU metrics as unavailable
for the deterministic baseline.

Release hard gates are zero invented POI IDs and validated route legs for every
day. The present deterministic planner emits draft plans with routeLegValidation
set to not_run and no per-day route legs, so it correctly fails the route gate.
Do not release such a plan as confirmed. A Valhalla leg-validation integration
is required before that gate can pass.

No frozen held-out evaluation cases are included yet. Phase 5's source review
and human review gates must be completed before real cases can be committed or
used to compare an adapter. The evaluator's unit-test fixtures are synthetic
software tests, not a quality benchmark or model evaluation result. Establish
numeric release thresholds after evaluating a representative human-reviewed
baseline suite.
