Training data format

Place reviewed, permitted examples in ai/models/datasets/train.jsonl. Each non-empty line is one
JSON object conforming to ai/schemas/v1/training-example.schema.json. It has
schemaVersion "1.0", a stable exampleId, a messages array in the Qwen chat
format, and required provenance. The final message must have role "assistant".
Earlier messages may include "system" and "user".

The training script prepends the versioned system guardrails in
ai/prompts/trip-planning-guardrails-v1.txt to every example. Examples may add
scenario-specific system context, but must not weaken the supplied-facts,
evidence, uncertainty, and no-invention rules. Training run metadata records
the exact guardrail prompt hash.

Example shape (illustrative only; do not use this as a real training example):

{"schemaVersion":"1.0","exampleId":"illustration-only-001","messages":[{"role":"system","content":"Follow the supplied trip facts and constraints."},{"role":"user","content":"Plan a trip using only the supplied route and POI facts."},{"role":"assistant","content":"Return a structured plan grounded in the supplied IDs."}],"provenance":{"sourceRecordIds":["curated-example-set-v1"],"permittedUse":"training","reviewState":"approved","brandScanStatus":"passed","consentState":"not_applicable","reviewedAt":"2026-10-18T00:00:00Z"}}

The training script masks prompt tokens and computes loss on the final
assistant response. It rejects examples without approved training provenance,
an active linked source with an approved training-use license review, required
user-consent records, or a passed brand scan. It also scans model-facing
messages against ai/configs/data-policy.toml before loading the model. Keep
source, licence, snapshot, and review details in ai/data/source-register.jsonl;
internal provenance may retain attribution and organization names.
Do not put copied platform material, copied reviews, or unlicensed blog text
in training examples. Real hotel, restaurant, fuel station, and attraction
names are allowed when their sources permit that use.

The sample above is only a schema illustration. It is not suitable training
data and does not yet reference a real source register record. See
ai/data/GOVERNANCE.txt before adding sources or user data. The first real run
requires reviewed training examples and active, approved source records.
