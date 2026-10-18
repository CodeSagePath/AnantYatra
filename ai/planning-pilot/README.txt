AI TRIP PLANNING PILOT — BENGALURU 250 KM

Purpose

Turn the current POI fact lookup model work into a model-generated road-trip
planner. The model must choose and order stops, divide the journey into days,
and explain its choices from the supplied facts. Application code may fetch
route and place facts, enforce the output schema, and reject unsafe or
unsupported output. It must not select the itinerary on the model's behalf.

Initial geographic scope

- Bengaluru is the pilot anchor.
- Include destinations and stops on trips whose routed driving distance from
  the selected Bengaluru start point is at most 250 km. Keep this as a
  configurable limit; consider 200 km for the first data collection batch and
  expand toward 300 km after evaluation.
- Measure road distance using the selected vehicle's routing profile. Do not
  use a straight-line circle as the inclusion test.
- A route may cross a state boundary. Keep a place only when its source permits
  the intended use and the place falls within the chosen route-distance scope.
- Cars and motorcycles are in scope. Preserve the request and output fields so
  additional modes can be added later.

What the model learns

The supervised task is: given a traveler request, a routed journey, and a
bounded set of sourced POI facts, return a structured draft plan. The model
should learn preference interpretation, stop selection, ordering, day
allocation, trade-offs, and clear uncertainty. It should not learn changing
facts such as today's opening status, live fuel availability, traffic, weather,
or prices from its weights.

At inference, supply the model with:

1. The user's structured request: origin, destination, dates, duration,
   vehicle, daily driving limit, budget, interests, needs, exclusions, and pace.
2. A route result for that vehicle mode, including geometry and leg estimates.
3. A compact, route-relevant candidate POI list. Each candidate needs a stable
   POI ID, display name, category, coordinates, known facts, unknown fields,
   evidence IDs, and source freshness/quality.
4. The trip-plan output schema and the versioned guardrails.

The model returns the trip plan. Validators may reject it for invented IDs,
unsupported claims, missing evidence, incompatible needs, impossible day
windows, or invalid structure. Rejection should cause a retry with the specific
validation errors or a clear request for traveler input; code should not
silently replace the plan with a deterministic itinerary.

Training and data needs

The existing Qwen adapter learned POI fact lookup from a small Wikidata-derived
set. It has no trip-planning examples, so it is not a trip planner yet. Keep it
as a separate experiment. For the first planner pilot, use an instruction model
to generate plans from supplied facts, then consider a planning-specific QLoRA
adapter after a reviewed dataset and held-out evaluation suite exist.

Useful training records are complete, reviewed pairs of:

- A realistic request and constraints.
- A pinned route result for the correct vehicle mode.
- Candidate POIs with traceable facts and evidence IDs.
- A high-quality reference plan in the trip-plan schema.
- Human review decisions covering preference fit, constraint compliance,
  grounded details, schedule feasibility, and useful handling of unknowns.
- Source snapshots, source permissions, reviewer, scenario family, and split
  metadata.

Data sources and limits:

- The current Wikidata CC0 snapshot can supply reviewed structured place facts;
  it is not route or itinerary training data.
- The current OpenStreetMap source has a separate internal approval for
  training/evaluation, with ODbL offer and model attribution requirements for
  public model use. Keep source IDs and snapshot provenance in every case;
  individual POIs and reference itineraries still require human review.
- Add manually authored route-planning examples only when the underlying facts
  are independently supplied by sources permitted for training, or clearly
  mark fully fictional examples as synthetic software fixtures. Synthetic
  fixtures can test parsing and guardrails; they do not establish geographic
  usefulness and must not be presented as real travel recommendations.
- Add user requests, edits, accepted plans, or ratings only after explicit,
  purpose-specific model-training opt-in. Remove direct identifiers.
- Do not scrape map platforms, travel aggregators, reviews, or blogs without
  explicit rights for collection and model training. Keep platform/aggregator
  names out of model-facing examples. Real hotel, restaurant, fuel-station,
  and attraction names may remain when their source permits it.

Suggested collection targets (targets, not claims about current data):

- First pilot: 100 reviewed training examples across at least 10 scenario
  families. This is enough to test the data pipeline, not to claim reliable
  model quality.
- Before deciding whether fine-tuning helps: aim for 300 or more diverse,
  reviewed examples and a separate held-out suite of at least 50 cases. Keep
  cases grouped by route/corridor and scenario family to prevent near-duplicate
  leakage.
- Reserve the held-out suite before training. Do not tune prompts, weights, or
  examples against those answers.

Scenario coverage matrix

Cover these behaviors across the collection. Vary route, duration, vehicle,
pace, and preferences rather than duplicating wording around one route.

1. One-day, relaxed scenic drive; few stops and early arrival.
2. One-day, fast itinerary; several requested interests within driving limit.
3. Two-day trip with an overnight stay requested.
4. Multi-day trip with overnight stay explicitly not needed.
5. Whole-trip budget with unknown POI costs; do not fabricate prices.
6. Per-person budget with cost coverage incomplete.
7. Required restroom or accessibility facility unavailable in the evidence.
8. Food preference where candidate records do not prove dietary suitability.
9. Excluded category or named POI must not appear.
10. No suitable stop in one route segment; explain the gap.
11. Candidate POI lies outside the allowed route detour.
12. Candidate set contains duplicates or conflicting/stale facts.
13. Motorcycle request with realistic daily driving limit.
14. Car trip with fuel-range information and sourced fuel candidates.
15. Late departure makes requested stops infeasible.
16. Requested arrival-before-sunset cannot be verified from supplied data.
17. Traveler changes budget or pace after accepting a draft.
18. Traveler skips a stop mid-trip and asks for a revised remainder.
19. Destination changes after part of the route is complete.
20. User asks for a live fact absent from the supplied context; state that it is
    unknown instead of guessing.

Dataset split and evaluation

- Group by corridor, source snapshot, and scenario family before assigning
  train/validation/test. Near-identical requests or plans must stay together.
- Keep the evaluation suite separate from training data and freeze its version.
- Score exact POI-ID grounding, evidence linkage, user-constraint adherence,
  route/daily-time feasibility, preference fit, budget honesty, uncertainty,
  schema validity, and latency/VRAM on the target GPU.
- Hard failures: invented POI IDs, unsupported facility/opening/price claims,
  ignored required constraints, invalid output schema, or a plan presented as
  confirmed without traveler approval.
- Compare the base instruction model against the same model plus adapter using
  the same prompts, facts, and held-out cases. Keep an adapter only if it
  improves the reviewed metrics without worsening hard-failure rates.

Immediate next sequence

1. Agree the scope limit and what counts as the Bengaluru start point.
2. Build a source-approved route/POI snapshot for a few representative
   corridors. Runtime-only sources stay out of training.
3. Author and review the first real request/context/reference-plan examples.
4. Freeze held-out cases before training.
5. Run base-model inference and evaluation first; then fine-tune only if the
   measured failures are learnable from examples and the GPU can run it.
6. Integrate the model as the sole itinerary generator, retaining tools for
   fresh facts and validators for rejection/retry.

Current blocker

There are currently no reviewed trip-planning training examples or frozen
trip-planning evaluation cases. Wikidata and OSM snapshots supply place facts,
but no request-to-itinerary supervision. The current fact-lookup adapter
therefore must not be described as a trained trip planner.
