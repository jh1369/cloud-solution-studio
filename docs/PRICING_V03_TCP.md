# Pricing Studio V0.3 — TCP catalog and auto-update

This is the **catalog/data phase**, on GitHub baseline `f8ea276` / V0.2.0-dev. The Huawei price engine stays unchanged. TCP automatic quote mapping/calculation is **not enabled**; a source-validated price is not an approved complete quotation. Alibaba/Tencent adapters are planned only.

## Implemented and next stages

- [x] Generic provider contracts, Huawei compatibility wrapper, TCP validation and frozen quote catalog snapshots.
- [x] Official PDF → structured catalog: ECS, EVS, EIP, ELB, OBS and RDS; EUR; EU-DE/EU-NL; exact decimal prices, units and tiers.
- [x] Separate Open Elastic, Reserved 12/24 and Reserved Upfront 12/24 records. Observed 36-month entries are retained with review flags, not silently converted or quoted.
- [x] Official page discovery, document SHA-256/revision/retrieval/version metadata, append-only versions and source PDFs in local SQLite.
- [x] Compare consecutive parsed versions and also validate against the approved baseline. Added/removed SKUs, amount changes, units/terms/tiers and document billing-rule changes are distinct.
- [x] Initial/abnormal/complex/failed cases enter review; no unapproved replacement of formal prices. Ordinary validated changes can promote after an approved baseline exists.
- [x] Synthetic regressions, then local daily cron/systemd/Windows Task Scheduler generators; no Codex process required.
- [x] Small bilingual catalog status card and check button. Hosted check detects official PDF changes only; local Web bridge performs full persistent ingestion.
- [ ] Human baseline review and resolution of merged/cross-page/duplicate/tier/ELB rules.
- [ ] TCP source-to-target SKU confirmation and quote-engine integration, including calendar-based storage usage, full upfront/term semantics and ancillary resources.
- [ ] End-to-end browser acceptance. Unit/HTTP/packaging checks are not browser acceptance.

## Official source and observed coverage

Discovery entry: https://www.t-cloud-public.com/en/prices/price-calculator ; the general price page also pointed to the same PDF when checked. The supplied October PDF was independently downloaded and matched the discovered file. No persistent hashed PDF URL is embedded in discovery code.

Observed revision: **2026-10-09**, 115 pages, 1,609,264 bytes; SHA-256 `c88c0aff01e08adeab9dda95f40414f9f8e41f7112e6ccc68895a5637c92603f`. Parsed price version: `tcp-2026-10-09-c88c0aff01e08ade-tcp-pdf-0.3.0-1`.

| Service | Unique region/plan/tier records | Structurally validated | Pending review | Not available |
| --- | ---: | ---: | ---: | ---: |
| ECS | 18338 | 1893 | 11322 | 5123 |
| EVS | 16 | 13 | 2 | 1 |
| EIP | 4 | 4 | 0 | 0 |
| ELB | 64 | 0 | 54 | 10 |
| OBS | 108 | 12 | 80 | 16 |
| RDS | 1818 | 1475 | 228 | 115 |
| Total | 20348 | 3397 | 11686 | 5265 |

Coverage is **6/6 target service families and 59 matching price tables**, not 100% of the entire provider offering. 20,420 expanded price cells reconcile to 20,348 unique records; 72 repeated price identities are preserved as review diagnostics with occurrence provenance. Structural pass rate is 16.7% of unique records. **Zero TCP versions have been approved in the real store.** All remain a catalog candidate, including structurally validated rows, until baseline review.

The reviewable compressed catalog and manifest live under `pricing-studio/catalogs/tcp/<version>/`. They contain public price facts/provenance, not a PDF copy, customer input or a quotation. Raw downloaded documents/database/check logs stay in ignored `web/outputs/`.

## Data contract and review

Each row has a stable internal ID, source label, actual flavor SKU when present, specification/OS fields, provider/region, billing mode/term, unit, decimal-string amount, raw tier, availability and verification reasons. Evidence includes official URL, SHA-256, revision/document version, retrieval time, physical PDF page(s), table/row/column and raw price/header. Label-derived IDs are not invented vendor SKU codes.

`n.a.` is null/UNAVAILABLE, never zero; a printed numeric zero remains zero. Merged/cross-page cells, unmatched columns, footnotes, duplicate identities, tiers, capacity bundles and complex ELB/IOPS/license/backup rules stay Pending. Duplicate conflicts have no usable amount. Unknown layouts cannot silently remove rows or replace a catalog. Monthly usage-based GiB-month is not a Reserved monthly contract. No hourly multiplier creates an official subscription rate.

`PricingProviderAdapter` and `CatalogUpdater` are generic. `public/providers.mjs` delegates Huawei validation/calculation to the existing engine. TCP price validation additionally requires an approved version, row/source evidence and a successful/current check within 48 hours. A pending/failed update blocks new TCP price validation; pinned historical quotes remain unchanged. TCP calculation intentionally throws until mapping/cost integration is implemented. Future adapters must use their own currencies, regions and billing contracts; unknown providers have no fallback.

Local SQLite retains immutable source bytes and catalog JSON, check history, manual approval events and a transactional approved-version pointer. Quote snapshot helpers copy the exact version/rates; subsequent updates do not mutate those snapshots or exported Excel. This is catalog persistence, not a second Python quotation engine.

Automatic policy: initial baseline requires review; new diagnostics, removal, billing-rule changes, complex changed rows, revision rollback, >20% price movement or >10% added records require review. Comparisons include the preceding candidate and approved baseline. A failed fetch/parse or concurrent-head conflict never overwrites the approved pointer. Approving a version does not clear row-level Pending flags. Parser changes require a new parser version.

## Local commands

Run in `pricing-studio/web/` with Python 3.12; install `requirements-catalog.txt` in the approved local development environment if needed. No cloud credentials are used.

```bash
python3.12 -m pip install -r requirements-catalog.txt
python3.12 scripts/catalog_update.py check
python3.12 scripts/catalog_update.py status
python3.12 scripts/catalog_update.py export --version <candidate-version> --output outputs/tcp-candidate.json
```

First inspect the source PDF/candidate. Only a human reviewer should then run:

```bash
python3.12 scripts/catalog_update.py approve --version <candidate-version> --reviewer <reviewer-label> --reason "Source and proposed baseline checked; row Pending retained"
```

`parse --pdf <public-pdf> --source-url <official-url> --output outputs/parsed.json` is an offline inspection tool: operator-supplied files are explicitly marked for source review, not treated as authenticated downloads.

Generate the schedule **on the computer where it will run**, so interpreter/project paths match that computer:

```bash
python3.12 scripts/catalog_update.py schedule --scheduler cron --output outputs/schedule
# Or: --scheduler systemd / --scheduler windows
```

Linux cron: use `crontab -e` and merge the reviewed generated lines into the existing crontab; preserve unrelated jobs. Daily 07:00 Europe/Berlin; cron implementation must support CRON_TZ. systemd: copy the generated service/timer to the user's systemd directory, then `systemctl --user daemon-reload` and `systemctl --user enable --now pricing-studio-tcp.timer`. Windows: import generated XML in Task Scheduler under the intended local user; runs daily at 07:00 in that computer's time zone. No passwords are stored in the files. A network-connected, running local machine is required. **Generators do not install/start tasks; no daily job was installed on the user's computer by this task.**

Local Web (`npm run dev`) uses `/api/catalog/tcp/status` and `/check` to invoke fixed local CLI commands and persist state. On Windows, `PRICING_CATALOG_PYTHON` can specify the Python executable. Hosted Worker performs URL discovery/hash comparison only; results live in the current browser session, and new documents need local parsing/review before publication. Offline HTML displays the packaged status and disables network checks. No client inventory is sent to these endpoints.

## Validation and known limits

Core PDF/update tests ran before schedule integration. Tests use fictional prices/rows and a generated real miniature PDF, independently test money/unit/term distinctions, malformed/merged/cross-page rows, zero vs n.a., duplicate conflicts, source discovery, update gates, immutable/pinned versions, rollback, failed fetch/parse, and provider compatibility. Public-PDF extraction is a separate real-data smoke check. Regression counts and browser/deployment results belong in DEVELOPMENT_STATUS.

The live initial baseline was not approved by the agent. Complex tier charge boundaries/free tiers, physical/GPU/licensing, RDS ancillary storage and ELB LCU composition need human work. EIP coverage currently covers IP charges, not a complete outbound-traffic/network design. No Alibaba/Tencent implementation, user cron installation, authenticated TCP API, or full TCP automatic quote flow is claimed.
