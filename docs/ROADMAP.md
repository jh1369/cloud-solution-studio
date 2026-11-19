# Roadmap

The shared [development status](DEVELOPMENT_STATUS.md) records inspected code, test evidence and synchronization state. Checkboxes below distinguish the integrated web implementation from the existing Python starter; they do not assert customer-ready completeness.

## Pricing Studio V0.3 — Huawei inventory and quotation

- [x] Use service-specific dimensions and exact catalog matching for ECS, EVS, DCS and scoped RDS instance estimates.
- [x] Review bounded nonstandard CSV and multi-sheet Excel imports with structured output from a configured local model. Preserve source evidence through export.
- [x] Verify imported counts, capacity and usage against their source columns or explicit units. Retain header evidence and require review of uncertain pricing inputs.
- [x] Match explicit ECS series and public or private NAT gateway sizes. Use billed days for public pay-per-use and hours for private pay-per-use. Keep manually chosen SKUs through billing changes when an equivalent plan exists.
- [x] Quote DCS without a Huawei Cloud account using the European product specifications and independently verified EU-Dublin public prices. Keep exact flavor evidence and Pending reasons in the five-sheet export. [Metadata and matching rules](../pricing-studio/web/README.md#official-dcs-product-specifications)
- [x] Match documented dedicated elastic ELB and CCE management specs. Show unpriced LCU, worker and network costs as separate Pending charges. [Coverage results](HUAWEI_QUOTE_COVERAGE.md#0311-dev-覆盖率复测)
- [ ] Extend verified EU-Dublin coverage for RDS disks and backups, ELB LCU, EIP and OBS. [Coverage priorities](HUAWEI_QUOTE_COVERAGE.md#后续优先级)
- [ ] Revalidate the updated import schema with a local language model in the release environment.
- [ ] Expand supported vendor layouts, service-specific dimensions and verified ancillary price coverage using fictional fixtures and public evidence.

## Pricing Studio V0.3 — TCP catalog automation

- [x] Discover the latest official TCP Service Description and preserve PDF, hash, revision and cell evidence.
- [x] Automatically publish a validated initial baseline and later safe versions. Retry anomalies and keep unresolved rows Pending.
- [x] Track last check, last verified time, catalog version and effective state. Freeze the version used by each quote.
- [x] Export a consistent state/catalog pair and expose the four state fields in the Web status card.
- [x] Publish verified TCP rows and evidence through the conditional object-store adapter. Verify that the Worker rejects expired, incomplete and conflicting publications in local integration.
- [ ] Run the publisher daily on managed Linux with a persistent SQLite disk, an approved private R2 bucket and the Worker binding. Use the current official PDF to verify two runs and a failure in the hosted environment.
- [ ] Extend deterministic checks for merged and cross-page rows, service-specific charging rules, tiers and composite fees.
- [x] Quote simple ECS, EVS and RDS pay-per-use lines in EU-DE from an imported AWS inventory. Verify browser totals, Pending rows and Excel evidence against an active official catalog.
- [ ] Extend quotation coverage for reserved and upfront plans, storage, ancillary charges and missing resources. Preserve unknown amounts as Pending.

[Catalog contracts, status and hosting plan](PRICING_V03_TCP.md)

## Pricing Studio V0.2 — private candidate (single-Agent default)

Current policy is Token-Efficient Development Mode: one primary Agent by default, Subagents only after a new user-approved efficiency justification. The Agent A/B/C items below record the previous task assignments, not active parallel execution or permission to restart them. V0.2 changes are locally integrated and regression-tested; real-browser acceptance remains blocked by the preview relay. The user explicitly authorized synchronizing the current V0.2 candidate and versioned offline files to GitHub. Historical V0.2 deployment used Sites source 64eaa80. V0.3 subsequently deployed the download endpoint and TCP status card under the standing authorization above; the current snapshot is in DEVELOPMENT_STATUS.

- [x] Lead read the actual project rules, roadmap and shared status; preserved existing UI work.
- [x] Launch 3 real Subagents with exclusive ownership boundaries recorded in root AGENTS.
- [x] Integrate prior pricing work locally: strict evidence/tariffs/time/unit/Pending and precision checks; core mapping review notes. Architecture/version/topology equivalence still needs human review.
- [x] Integrate prior purple-neon CN/EN UI and import/confirmation/export wiring locally; automated presentation checks pass. Real-browser behavior is not yet accepted.
- [x] Integrate independent fictional-price/resource regressions; add CSV/XLSX, five-Sheet and cent-safe subtotal checks.
- [x] Single primary Agent reviewed/integrated local diffs: 72 JS + 4 Python adapter tests pass; no new Subagents. Live official API 9/9; openpyxl exports 3/3.
- [x] Record results, unresolved issues and next steps in DEVELOPMENT_STATUS and PRICING_MVP_ACCEPTANCE; GitHub changes remain local; the separately authorized private Sites deployment succeeded.
- [ ] P0: complete real-browser import → confirmation → three modes → refresh → download after preview relay recovery; current relay timeout is an environment blocker, not an E2E pass.

- [x] User-authorized V0.2 private candidate deployment: original Site/audience/URL preserved, native deployment succeeded; cloud browser reached the sign-in gate, so signed-in UI acceptance remains open.

- [x] Downloadable offline HTML/ZIP reuses the web pricing engine; all assets/catalogue embedded, original expiry and Pending enforced, no live refresh.
- [ ] Validate actual double-click file import/download in a user browser; Cloud Browser forbids file:// and native input is unavailable.

- [x] Prepare same-origin ZIP attachment endpoint and bilingual download button; 73 JS + 8 Python checks pass locally.
- [ ] Obtain deployment authorization and publish the download repair; previous workspace links did not deliver usable chat attachments.

- [x] Require standalone HTML/ZIP for every completed version; package-derived naming, deterministic rebuilds, immutable archives, source/artifact fingerprints and release index.
- [x] Authorized GitHub sync completed (source f3aae16); GitHub SHA/tree and real ZIP HTTP 200 / byte/hash equality verified. The hosted download-button update remains undeployed.

## Pricing Studio V0.1.1 — historical baseline

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
- [x] Make positive web test fixtures independent of public snapshot expiry, while retaining explicit expiry tests (V0.2 local integration).
- [ ] Add CI/documentation checks if requested; no automatic Push, data uploads or deployment.

## Future workstream — PPT Studio

- [ ] Local slide index/preview, template reuse, PowerPoint automation.

## Future Web Demo Studio

- [ ] Generic solution demonstrations: migration, auto scaling, disaster recovery.

## V0.4 Cloud Live Lab

- [ ] Read-only API adapter for approved test accounts; secrets only in approved secure runtime.
