Consent ledger records contain sensitive, pseudonymous references and must be
stored in access-controlled storage. The configured training path is
ai/data/private/consent-records.jsonl, which is excluded from Git. Use the
versioned schema at ai/schemas/v1/consent-record.schema.json. Never put names,
email addresses, phone numbers, or raw precise location history in this ledger.

The training loader accepts user-derived examples only when each referenced
consent record exists, has purpose "model_training", and remains "granted".
Withdrawal blocks later training runs. Follow ai/data/GOVERNANCE.txt for removal
and adapter review steps.

Phase 10 feedback and training-candidate JSONL files belong in the ignored
ai/data/private/ directory and use owner-only file/directory permissions. Each
feedback submission is stored independently from canonical POI data. A
training-origin candidate must point to a granted consent record; candidates
are rechecked at export time so later withdrawal blocks future datasets.
