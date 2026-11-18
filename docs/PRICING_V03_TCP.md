# Pricing Studio V0.3 — TCP catalog and auto-update

The Python updater publishes qualifying TCP catalogs automatically. Web + Worker provides the status interface and existing Huawei quotations. TCP quote mapping and calculation remain future work.

## Official source and verified baseline

On 2026-11-18, the updater discovered the current Service Description through the official calculator. The PDF revision was **2026-10-09**, with 115 pages and 1,609,264 bytes. Its SHA-256 was `c88c0aff01e08adeab9dda95f40414f9f8e41f7112e6ccc68895a5637c92603f`. [Official calculator](https://www.t-cloud-public.com/en/prices/price-calculator) · [Verified public PDF](https://www.t-cloud-public.com/_Resources/Persistent/5/b/4/9/5b49ccec9ceef6d52f461deff50098200b81665f/t-cloud-public-servicedescription.pdf)

The first automated `check → publication` in isolated SQLite returned `UPDATED` and `ACTIVE` on its first attempt. The published `currentVersion` was `tcp-2026-10-09-c88c0aff01e08ade-tcp-pdf-0.3.0-3`. First `lastVerifiedAt` was `2026-11-18T14:57:49.092132+00:00`. A second official download returned `UNCHANGED` and advanced `lastVerifiedAt` to `2026-11-18T14:58:38.490856+00:00`. The entire published catalog, including its initial retrieval time and row evidence, matched the first publication. The published catalog became `STALE` in a test clock simulation 48 hours and one second after verification, and the saved quote snapshot retained its original catalog.

| Service | Validated prices | Pending | Unavailable | Main Pending reasons |
| --- | ---: | ---: | ---: | --- |
| ECS | 1,893 | 11,322 | 5,123 | Merged and cross-page cells, unsupported terms, special fees and footnotes |
| EVS | 9 | 6 | 1 | GP SSD v2 minimum capacity and included IOPS/throughput |
| RDS | 1,475 | 228 | 115 | Incomplete explicit flavor evidence, footnotes and ancillary rates |
| EIP | 4 | 0 | 0 | — |
| ELB | 0 | 54 | 10 | LCU and composite charging rules |
| OBS | 8 | 84 | 16 | Tiers, capacity bundles and early deletion |
| **Total** | **3,389** | **11,694** | **5,265** | |

Counts are unique region/plan/tier price records across 59 tables. The JavaScript Provider Adapter independently accepted the same per-service counts. Repeated price identities account for 72 of the 20,420 expanded cells. Unit-price eligibility is the input to the future TCP quote flow.

The previous parser held the entire catalog because it treated the page 104 KMS active-key-version rule as document-wide. The parser now requires the numbered KMS heading and the explicit KMS clause before excluding that clause from global checks. Page 93 notes are attached to the exact EVS products they name, and OBS early deletion rates are held for conditional fee handling. Notes with an unresolved scope still block document publication. The storage and security pricing guides independently corroborate the scope of these rules. [EVS GP SSD v2 announcement](https://www.t-cloud-public.com/en/support/release-notes/general-purpose-ssd-v2) · [Storage pricing](https://www.t-cloud-public.com/en/prices/pricing-models/storage) · [Security pricing](https://www.t-cloud-public.com/en/prices/pricing-models/security)

### Independent PDF samples

Expected cells were read from the PDF with Poppler and checked against published amounts, units, billing mode, region and page evidence. ECS samples use open Linux. Reserved means EUR per month and upfront means EUR for the stated term.

| Service | SKU or exact official label | Region | Plan | EUR rate | PDF page |
| --- | --- | --- | --- | --- | ---: |
| ECS | `s2.large.1` | EU-DE | Open Elastic | 0.095230/hour | 49 |
| ECS | `s2.large.1` | EU-DE | Reserved 12 months | 43.53/month | 49 |
| ECS | `s2.large.1` | EU-DE | Reserved Upfront 12 months | 485.00/term | 49 |
| RDS | `db.n1.medium.2.mys` | EU-NL | Open Elastic | 0.030524/hour | 81 |
| RDS | `db.n1.medium.2.mys` | EU-DE | Reserved 12 months | 18.82/month | 81 |
| RDS | `db.n1.medium.2.mys` | EU-NL | Reserved Upfront 12 months | 173.80/term | 81 |
| EVS | EVS High I/O | EU-DE | Open Elastic | 0.066000/GiB-month | 93 |
| EVS | EVS High I/O | EU-NL | Open Elastic | 0.059400/GiB-month | 93 |
| EIP | Elastic IP | EU-NL | Open Elastic | 0.004400/hour | 95 |

The older candidate remains archived under `pricing-studio/catalogs/tcp/`. The raw PDF, SQLite and publication JSON from verification were kept in the test workspace.

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
