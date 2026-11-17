# Cloud Solution Studio · Pricing Studio Web V0.1.1

Pricing Studio V0.1.1, synchronized from the deployed private Sites version into the canonical repository. Huawei target billing choices are 按需 / 包月 / 包年, separated from the original AWS billing record. The existing Python mapping CLI remains in the parent module. This web app runs browser JavaScript modules and a Cloudflare Worker. The repository does not yet integrate the separate Python/openpyxl/SQLite prototype; neither Python nor SQLite runs inside this Worker.

## Features

- Chinese/English line-oriented resource descriptions; deterministic extraction, not an LLM.
- CSV / XLSX normalized inventory and browser-local text PDF AWS bill import (sample layout only, no OCR).
- Editable service mappings, resource counts, usage units and billing periods; per-row or batch human confirmation.
- Official Huawei EU public catalogue and independent inquiry verification for pay-per-use, 1-month and 1-year plans. Source reserved/spot records never become Huawei target options.
- Monthly comparisons, independent annual subscription prices, first-term prepayment totals, optional discount, five-sheet XLSX export and downloadable price evidence.
- All original files and text remain in browser memory. The server receives only official Huawei product IDs when refreshing rates; it does not receive AWS account identifiers or uploaded files. Refreshing discards the in-memory quote.
- Source-period aggregate usage preserves unknown resource counts; no automatic month/year extrapolation.

## Commands

Run from `pricing-studio/web/` with Python 3.12 and Node.js 20+:

```bash
python3.12 scripts/build_worker.py
node --test tests/*.test.mjs
# Or, build and test together:
npm test
```

No npm/pip install is required for these commands. They use the checked-in official public price snapshot and do not query cloud APIs.

Refresh the public catalogue only when needed and when access to the documented Huawei EU endpoints is approved:

```bash
python3.12 scripts/build_catalog.py
python3.12 scripts/build_worker.py
```

The refresh changes `public/catalog.json`; inspect its provenance and diff before committing. A price snapshot is not a real customer quote.

`public/` contains tracked browser source/assets and `worker.mjs` contains the server source. `scripts/build_worker.py` embeds them into `dist/server/index.js`, with no filesystem reads at runtime. Generated `dist/` is ignored. Hosting identity, credentials and the original Site's `.openai/hosting.json` are deliberately excluded from GitHub.

For a separately authorized Sites deployment, create the local `.openai/hosting.json` for the selected Site and follow the Sites publishing workflow. Building/testing does not deploy or Push. No GitHub action auto-deploys this version.

See [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) for the original deployed source commit and SHA-256 checksums of every unchanged runtime asset and the Worker source. Only build/test layout and documentation were adapted during synchronization. The one repository test in the parent Python module is a different suite.

## Official price contract

Region `eu-west-101`, currency USD. Target modes: `ONDEMAND` (按需), `MONTHLY` (包月, one month), `YEARLY` (包年, one year). `scripts/build_catalog.py` reads only the public EU calculator `productInfo` endpoint and verifies `officialWebsiteAmount` with `/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`. No credentials, account sessions or private quotations are used. Each price records the official product ID, SKU, request, response, source and timestamp. Snapshots expire after seven days. Mode switches clear mapping confirmation and reuse a matching target SKU only when that billing plan exists; absent prices remain Pending with no fallback to an hourly price. `POST /api/rates` re-queries only allowlisted product IDs; no client-supplied remote URLs or prices are accepted.

The catalogue supports simple hourly resources and EVS GB-hour (a size-1 inquiry). Monthly and yearly plans are independently queried with `chargingMode=0`, `periodType=2/3`, `periodNum=1`; pay-per-use uses `chargingMode=1` and one-hour usage. The server groups mixed-mode refreshes into separate inquiries. A catalogue match is a proposed design, never a guarantee of AWS feature equivalence. Users must confirm architecture, OS/licensing, database engine/version/topology, units and ancillary resources. All amounts remain Pending until those conditions are satisfied.

Tiered traffic/storage, Kafka parameters not yet modeled, logs, commitments, Huawei spot or reserved-like target calculations remain outside this tool’s scope. Other unsupported services remain Pending even when a monthly or yearly mode is selected. S3→OBS service-family mapping is available; an OBS storage amount is **not** fabricated from an unrelated hourly price. Unknown Huawei target billing modes remain Pending; unknown AWS source billing does not block an independently specified Huawei target plan. Reference hours convert GB-month to GB-hour only when explicitly using that unit. Only pay-per-use/monthly annual scenarios repeat a month twelve times. A yearly plan uses its independently verified annual rate; its monthly comparison is the annual amount divided by twelve, never a monthly payment offer. Monthly and yearly prepaid first-term totals are shown separately from postpaid usage. EVS subscriptions use an explicit per-disk GB capacity and target quantity; aggregate instance-hours or GB-month totals never establish subscription counts or capacity. All totals of incomplete quotes are partial subtotals.

## Validation and privacy

Synthetic tests cover description parsing, unit conversion, decimals, unknown counts, source-period aggregates, unsupported billing, mapping confirmation, expired prices and evidence/product identity. Worker tests cover request validation, upstream failures and static asset serving. No real PDF, bill, account identifier, customer inventory or quotation is included. PDF parser tests use synthetic text.

Third-party browser libraries: SheetJS CE 0.20.3 (Apache-2.0), Mozilla PDF.js 3.11.174 (Apache-2.0), vendored from vendor/CDN distribution. No third-party browser scripts or fonts are loaded at runtime.

Shared project state: [../../docs/DEVELOPMENT_STATUS.md](../../docs/DEVELOPMENT_STATUS.md).
