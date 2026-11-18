# Pricing Studio V0.3 — TCP catalog and auto-update

The Python updater publishes qualifying TCP catalogs automatically. Web + Worker provides the status interface and existing Huawei quotations. TCP quote mapping and calculation remain future work.

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

The earlier parser found **6 target service families and 59 price tables**. Its archived candidate accounts for 20,420 expanded cells and 20,348 unique records, with 72 repeated identities recorded with occurrence provenance. The counts above describe the archived parser version. The current automatic publication policy has been tested with fictional PDFs and prices.

The reviewable compressed catalog and manifest live under `pricing-studio/catalogs/tcp/<version>/`. They contain public price facts/provenance, not a PDF copy, customer input or a quotation. Raw downloaded documents/database/check logs stay in ignored `web/outputs/`.

## Data contract and automatic publication

Each row has a stable internal ID, source label, actual flavor SKU when present, specification/OS fields, provider/region, billing mode/term, unit, decimal-string amount, raw tier, availability and verification reasons. Evidence includes official URL, SHA-256, revision/document version, retrieval time, physical PDF page(s), table/row/column and raw price/header. Label-derived IDs are not invented vendor SKU codes.

`n.a.` is null/UNAVAILABLE, never zero; a printed numeric zero remains zero. Merged/cross-page cells, unmatched columns, footnotes, duplicate identities, tiers, capacity bundles and complex ELB/IOPS/license/backup rules stay Pending. Duplicate conflicts have no usable amount. Unknown layouts cannot silently remove rows or replace a catalog. Monthly usage-based GiB-month is not a Reserved monthly contract. No hourly multiplier creates an official subscription rate.

The Python publisher independently checks official discovery, PDF digest and revision, table structure, row identity, region, currency, unit, plan and price-cell evidence. ECS and RDS require an explicit flavor SKU. Other supported services use the official label plus plan dimensions as their internal identity. An initial catalog can publish when at least one eligible row survives validation and the document-level checks pass. Row-level Pending and Unavailable entries retain evidence.

Changes in supported rates can publish against the last published baseline. A move greater than 20%, a transition from zero or a newly usable rate in an existing row requires a newer document revision and a matching second official download and parse. Fetch failures and anomalies are retried up to three total attempts. Unresolved billing rule changes, malformed tables, SKU removal, more than 10% added identities, and document rollbacks keep the catalog Pending. The parser fingerprints the narrative in the price section, including prose in service sections outside price tables. Recognized terms such as minimum billing duration require deterministic support before that document can publish.

SQLite stores immutable PDFs and catalog JSON. One transaction records the check result and advances the version pointer on success. A stale concurrent result cannot overwrite a newer decision. The state exposes the latest check time, latest successful verification time, published and candidate versions and whether the published catalog can price a new quote. A failure, unresolved candidate or verification older than 48 hours leaves new quotes Pending. Old versions remain retrievable by explicit version ID. Historical approval records are retained as audit data and grant no current eligibility. Rechecking current official bytes can refresh successful verification while keeping the original evidence inside the catalog. When the parser version changes, the updater uses the same parser to compare the previous PDF if needed.

## Local commands

Run in `pricing-studio/web/` with Python 3.12; install `requirements-catalog.txt` in the approved local development environment if needed. No cloud credentials are used.

```bash
python3.12 -m pip install -r requirements-catalog.txt
python3.12 scripts/catalog_update.py check
python3.12 scripts/catalog_update.py status
python3.12 scripts/catalog_update.py export --version <candidate-version> --output outputs/tcp-candidate.json
```

After a check, export the state and matching effective catalog atomically.

```bash
python3.12 scripts/catalog_update.py publication --output outputs/tcp-publication.json
```

The publication contains `state` and `catalog`. For Pending or stale state, `catalog` is null. `export` without a version returns the effective catalog. `export --version <id>` retrieves immutable historical data explicitly. `parse --pdf <public-pdf> --source-url <official-url> --output outputs/parsed.json` remains a diagnostic tool for operator-supplied files with unverified provenance.

## Managed scheduling and delivery plan

Use a managed Linux VM with a persistent volume and a daily systemd timer. Run the Python updater under a dedicated account with outbound access to the official TCP site and scoped publication storage. Use a single scheduled writer, volume backups and run/failure alerts. Existing `schedule --scheduler systemd --output outputs/schedule` generates the starting timer and service. Adapt the production job to export publication state after every attempt, including a failed check.

Store immutable catalog objects by version and SHA-256 in R2 or equivalent object storage. Publish the catalog first, then replace one small current-state object with a conditional write so an older job cannot displace a newer decision. Publish Pending on failures. The Worker should read state and matching catalog together by version and hash, enforce the 48-hour limit at request time, and reject stale or mismatched state. Browser and Excel snapshots should pin the exact catalog version, source hash, verification time, assumptions and amounts. A managed job with ephemeral disks would need durable database storage and compatible locking or a replacement state store.

Managed scheduling, cloud publication and Worker storage integration are planned. The local Web bridge currently uses fixed CLI commands for `/api/catalog/tcp/status` and `/check`. The hosted Worker only detects PDF changes and reports packaged status. Detection cannot renew successful verification.

## Validation and known limits

Core PDF/update tests ran before schedule integration. Tests use fictional prices/rows and a generated real miniature PDF, independently test money/unit/term distinctions, malformed/merged/cross-page rows, zero vs n.a., duplicate conflicts, source discovery, update gates, immutable/pinned versions, rollback, failed fetch/parse, and provider compatibility. Public-PDF extraction is a separate real-data smoke check. Regression counts and browser/deployment results belong in DEVELOPMENT_STATUS.

Tier charge boundaries, free tiers, physical/GPU licensing, RDS ancillary storage and ELB LCU composition still need deterministic rules. For TCP automatic quotes, start with exact mapping for a small set of simple SKUs in one region, then reconcile units, calendar usage, ancillary resources and Excel evidence before expanding.
