Pending POI Q&A training drafts

Files in this directory are review material only. They are not approved
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
