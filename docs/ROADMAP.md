# Roadmap

The shared [development status](DEVELOPMENT_STATUS.md) records inspected code, test evidence and synchronization state. Checkboxes below distinguish the integrated web implementation from the existing Python starter; they do not assert customer-ready completeness.

## Pricing Studio V0.1.1 — current integrated web version

- [x] Safe repository scaffold and fictional AWS input fixture.
- [x] Python CSV → JSON product-family mapping starter (package 0.1.0), retained.
- [x] Integrate deployed web V0.1.1 sources with runtime-asset provenance; exclude generated Worker, hosting identity and customer files.
- [x] Browser-local CSV/XLSX input, line-oriented rule-based descriptions and supported text-PDF billing layout.
- [x] Candidate target SKU selection and human confirmation; AWS source billing separated from Huawei target billing.
- [x] Independently verified public pricing for supported pay-per-use, one-month and one-year plans, including region, currency, units, timestamps and inquiry evidence.
- [x] Supported monthly/annual scenarios, manual discount, prepaid first-term totals and explicit annual amortization.
- [x] Five-sheet Excel export with Pending blanks and evidence.
- [x] Rebuild in the canonical repository and run 42 web tests plus 1 existing Python test; compare copied runtime SHA-256 values with deployed V0.1.1.
- [ ] Verify the signed-in browser import → mode switch → official refresh → Excel flow end to end.
- [ ] Expand SKU validation for architecture, OS/licensing, engines/versions, AZ topology and service equivalence; recommendations remain proposed designs.
- [ ] Add pricing models for unsupported/tiered storage, logs, traffic and Kafka parameters; keep unknown prices Pending.
- [ ] Formalize BSS authenticated adapter injection without discovering or persisting credentials.
- [ ] Fix NaN/Infinity and quantity/unit semantics in the Python starter under a separate implementation task.
- [ ] Decide and document integration of the original Python 3.12/openpyxl/SQLite prototype; those runtime/storage capabilities are not currently in this repository.
- [ ] Make positive web test fixtures independent of public snapshot expiry, while retaining explicit expiry tests.
- [ ] Add CI/documentation checks if requested; no automatic Push, data uploads or deployment.

## V0.2 PPT Studio

- [ ] Local slide index/preview, template reuse, PowerPoint automation.

## V0.3 Web Demo Studio

- [ ] Generic solution demonstrations: migration, auto scaling, disaster recovery.

## V0.4 Cloud Live Lab

- [ ] Read-only API adapter for approved test accounts; secrets only in approved secure runtime.
