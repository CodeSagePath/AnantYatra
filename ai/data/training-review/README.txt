Pending POI Q&A and trip-planning drafts

Files in `ai/models/datasets/review/` are review material only. They are not approved
training examples and must not be passed to the QLoRA trainer yet.

The Wikidata batch was generated deterministically from one dated POI snapshot.
Each draft asks the model to repeat the listed name, category, and coordinates,
while explicitly treating facilities, opening hours, and price as unknown.
All linked source facts are marked unverified. No travel itinerary, road
distance, live availability, or facility claim is taught by this batch.

Before promotion, review the source facts and answers, reject incorrect or
low-value rows, and record a human reviewer and review date. Then combine this
fact-grounding batch with curated, route-validated trip examples from sources
approved for training. This batch alone is not sufficient to train a useful
trip planner.

Trip-planning review batch

The first trip-planning batch contains 20 pending review packets: five scenario
families across each of four Bengaluru corridors, with car and motorcycle
route contexts. Recreate it from the pinned route and candidate files with:

    ai/data-tools/.venv/bin/python ai/datasets/create_trip_review_batch.py \
      --corridors-dir ai/models/datasets/processed/karnataka-2026-10-17/training-candidate-corridors \
      --sources ai/data/source-register.jsonl \
      --output ai/models/datasets/private/training-review/trip-planning-drafts-2026-10-19.jsonl

Validate proposed stop-to-stop legs and schedules with the matching local
Valhalla service, keeping the result as a separate review file:

    ai/data-tools/.venv/bin/python ai/datasets/validate_trip_review_batch.py \
      --input ai/models/datasets/private/training-review/trip-planning-drafts-2026-10-19.jsonl \
      --output ai/models/datasets/private/training-review/trip-planning-drafts-2026-10-19-route-checked.jsonl \
      --routing-host http://127.0.0.1:5006

The 2026-10-19 route-validation pass completed for all 20 cases against the
local Valhalla 3.5.1 service and pinned tile snapshot. All 20 also passed the
planner guardrails after route-derived stop times were applied. This does not
verify current POI existence, opening hours, facilities, or traveler
preference fit; human review remains pending for every case.

Each `proposedPlan` is a deterministic planner baseline, not a gold answer or
an AI-generated answer. All 20 cases remain pending. POIs in the source
snapshot are marked unverified. Reviewers must correct or replace each
proposal, record their decision, and reject unsuitable cases. Never feed this
batch directly to the trainer or evaluation suite.
