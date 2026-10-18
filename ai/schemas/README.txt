AnantYatra AI data contracts

Version 1 contracts live in v1/ as JSON Schema Draft 2020-12 files. They
define the initial input, fact records, model output, active trip state and
event, configurable feedback taxonomy and event, source provenance, reviewed
training-example, and training consent shapes. Phase 10 adds separate
feedback-review, verified POI-correction, training-candidate and review,
model-release, release-registry, and retraining-decision contracts.

The model-facing trip plan refers to places through poiId. Resolve displayName
from the approved POI store after validating the ID. Do not let the model
invent a business name. Dynamic travel facts and evidence remain in runtime
records and are not memorized as current truth in model weights.

The initial mode vocabulary is car and motorcycle. Add future modes, including
bicycle and public transport, through a reviewed vocabulary and a compatible
schema version. Keep user-selectable feedback categories in a versioned
vocabulary so categories can be added, removed, or replaced without changing
the training code.

Source organization names and required attribution belong in the internal
provenance record. Keep platform/aggregator brand names out of extracted
recommendation text and training examples, while preserving legal attribution
where required. Real place names remain valid recommendation content when the
source license permits that use.

When changing a contract incompatibly, add a new schema version and migration.
Do not silently reinterpret existing training examples or saved trip records.
