Consent ledger records contain sensitive, pseudonymous references and must be
stored in access-controlled storage. The configured training path is
ai/data/private/consent-records.jsonl, which is excluded from Git. Use the
versioned schema at ai/schemas/v1/consent-record.schema.json. Never put names,
email addresses, phone numbers, or raw precise location history in this ledger.

The training loader accepts user-derived examples only when each referenced
consent record exists, has purpose "model_training", and remains "granted".
Withdrawal blocks later training runs. Follow ai/data/GOVERNANCE.txt for removal
and adapter review steps.
