Training data format

Place reviewed, permitted examples in train.jsonl. Each non-empty line is one
JSON object conforming to ai/schemas/v1/training-example.schema.json. It has
schemaVersion "1.0", a stable exampleId, a messages array in the Qwen chat
format, and required provenance. The final message must have role "assistant".
Earlier messages may include "system" and "user".

Example shape (illustrative only; do not use this as a real training example):

{"schemaVersion":"1.0","exampleId":"illustration-only-001","messages":[{"role":"system","content":"Follow the supplied trip facts and constraints."},{"role":"user","content":"Plan a trip using only the supplied route and POI facts."},{"role":"assistant","content":"Return a structured plan grounded in the supplied IDs."}],"provenance":{"sourceRecordIds":["curated-example-set-v1"],"permittedUse":"training","reviewState":"approved","brandScanStatus":"passed","consentState":"not_applicable","reviewedAt":"2026-10-18T00:00:00Z"}}

The training script masks prompt tokens and computes loss on the final
assistant response. It rejects examples without approved training provenance,
consent state, or a passed brand scan. It also scans model-facing messages
against ai/configs/data-policy.toml before loading the model. Keep source,
licence, snapshot, and review details in the linked source records; internal
provenance may retain attribution and organization names.
Do not put copied platform material, copied reviews, or unlicensed blog text
in training examples. Real hotel, restaurant, fuel station, and attraction
names are allowed when their sources permit that use.

The sample above is only a schema illustration. It is not suitable training
data. The first run requires a reviewed ai/data/train.jsonl file.
