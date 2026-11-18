# Cloud Solution Studio · Pricing Studio Web V0.3 (TCP catalog/data phase)

Package `0.3.0-dev`, synchronized to GitHub and deployed to the existing private Site from Sites source `fff0d1f` (2026-11-17). Full browser acceptance and TCP quote calculation/mapping remain outstanding. Huawei quotations retain the existing engine. Huawei target billing choices are 按需 / 包月 / 包年, separated from AWS billing. The existing Python mapping CLI remains unchanged. This app uses browser JavaScript modules and a Cloudflare Worker; no duplicate Python quotation system has been introduced. The hosted Worker has no SQLite runtime; the local catalog updater uses SQLite only for catalog/history management.

## Features

- Chinese/English line-oriented resource descriptions; deterministic extraction, not an LLM.
- CSV / XLSX normalized inventory and browser-local text PDF AWS bill import (sample layout only, no OCR).
- Editable service mappings, resource counts, usage units and billing periods; per-row or batch human confirmation.
- Bilingual CN/EN interface and mapping review notes for CPU/memory/architecture, OS, database engines and storage. Unknown storage types require manual SKU selection. Resource counts must be positive integers.
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

No npm/pip install is required for these commands. `npm test` also runs Python catalogue, TCP PDF/update/scheduler and offline/version-archive checks; positive finance tests use synthetic prices. Upstream APIs are mocked, not contacted. The [acceptance record](../../docs/PRICING_MVP_ACCEPTANCE.md) separates automated results, live official-price verification and blocked real-browser E2E.

## Downloadable offline file

```bash
npm run build:offline
```

Output: `outputs/offline/Pricing-Studio-<package-version>-Offline.html` and `.zip`. Download the HTML directly, or unzip and double-click it in a modern Chrome/Edge/Firefox browser. No Node, Python, server, login or Internet is needed on the user's computer. The ZIP also includes a fictional CSV, bilingual instructions, third-party notices and SHA-256 manifest. Do not run it inside a chat/cloud-drive HTML preview.

Cloud `/workspace/...` paths are developer paths, not durable chat attachments. The Worker now packages `/downloads/pricing-studio-offline.zip` with `application/zip`, `Content-Disposition: attachment` and `no-store`; the web header has a bilingual download link. **Local preparation only: this route is not live until the next authorized deployment.** It retains the existing Site access gate; no public-access change is required. The downloaded HTML omits this server-only link.

The build embeds existing modules, styles, SheetJS, PDF.js/worker and the official catalogue into one classic-script HTML so `file://` does not need cross-file ES module imports or fetch. The same pricing engine is reused. Offline mode loads embedded data, disables live refresh and uses a CSP with `connect-src 'none'`; there are no automatic network uploads. Explicit links to the official calculator open only when clicked.

Original price evidence/timestamps and seven-day expiry are preserved. Expired/missing prices and unconfirmed mappings stay Pending. The package does not import arbitrary price JSON or manufacture fresh verification. Obtain an updated offline package or use the web app after expiry. Excel Assumptions identifies offline delivery. Close/reload clears resource rows; only language preference may persist.

Verification includes provider/Huawei compatibility, public-document detection, fictional real-PDF table parsing, version diff/review/rollback, frozen price snapshots, local schedule templates and offline/immutable archive checks. See DEVELOPMENT_STATUS for exact current counts. Cloud Browser file:// restrictions and preview-relay failures remain verification limits; unit/packaging tests do not replace browser acceptance.

For each completed version, run `npm run release:offline` after updating `package.json`. This runs tests and archives HTML/ZIP, bilingual instructions, source fingerprints/checksums and fictional sample data in `releases/pricing-studio/v<version>/` at the repository root. ZIP output is deterministic; changed content cannot replace an existing archive. Update the [version index](../../releases/pricing-studio/README.md). Share files downloaded from GitHub, not cloud workspace links. No automatic Push or deployment is added.

Local preview uses the same packaged Worker via a small Node HTTP adapter:

```bash
npm run dev
```

In this managed environment, use `sites-preview start /workspace/repos/cloud-solution-studio/pricing-studio/web` and open its exact returned URL. The relay currently fails before returning a URL; do not treat this as browser acceptance. On Node 24 behind an inherited environment proxy, use `NODE_USE_ENV_PROXY=1 npm run dev` (or prefix the managed preview command) so official refresh honors that proxy. Keep TLS verification enabled; no credentials or proxy values belong in source. A normal local machine without such a proxy does not need the prefix. Local preview does not deploy or Push.

Refresh the public catalogue only when needed and when access to the documented Huawei EU endpoints is approved:

```bash
python3.12 scripts/build_catalog.py
python3.12 scripts/build_worker.py
```

The refresh changes `public/catalog.json`; inspect its provenance and diff before committing. A price snapshot is not a real customer quote.

`public/` contains tracked browser source/assets and `worker.mjs` contains the server source. `scripts/build_worker.py` embeds them into `dist/server/index.js`, with no filesystem reads at runtime. Generated `dist/` is ignored. Hosting identity, credentials and the original Site's `.openai/hosting.json` are deliberately excluded from GitHub.

For a separately authorized Sites deployment, create the local `.openai/hosting.json` for the selected Site and follow the Sites publishing workflow. Building/testing does not deploy or Push. No GitHub action auto-deploys this version.

See [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) for historical V0.1.1 migration checksums; current V0.2 modified sources are not byte-identical to that baseline. The one test in the parent Python mapping module is a separate, unchanged suite.

## Official price contract

Region `eu-west-101`, currency USD. Target modes: `ONDEMAND` (按需), `MONTHLY` (包月, one month), `YEARLY` (包年, one year). `scripts/build_catalog.py` reads only the public EU calculator `productInfo` endpoint and verifies `officialWebsiteAmount` with `/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`. No credentials, account sessions or private quotations are used. Each price records the official product ID, SKU, request, response, source and timestamp. Snapshots expire after seven days. Mode switches clear mapping confirmation and reuse a matching target SKU only when that billing plan exists; absent prices remain Pending with no fallback to an hourly price. `POST /api/rates` re-queries only allowlisted product IDs; no client-supplied remote URLs or prices are accepted.

The catalogue supports simple hourly resources and EVS GB-hour (a size-1 inquiry). Monthly and yearly plans are independently queried with `chargingMode=0`, `periodType=2/3`, `periodNum=1`; pay-per-use uses `chargingMode=1` and one-hour usage. The server groups mixed-mode refreshes into separate inquiries. A catalogue match is a proposed design, never a guarantee of AWS feature equivalence. Users must confirm architecture, OS/licensing, database engine/version/topology, units and ancillary resources. All amounts remain Pending until those conditions are satisfied.

Tiered traffic/storage, Kafka parameters not yet modeled, logs, commitments, Huawei spot or reserved-like target calculations remain outside this tool’s scope. Other unsupported services remain Pending even when a monthly or yearly mode is selected. S3→OBS service-family mapping is available; an OBS storage amount is **not** fabricated from an unrelated hourly price. Unknown Huawei target billing modes remain Pending; unknown AWS source billing does not block an independently specified Huawei target plan. Reference hours convert GB-month to GB-hour only when explicitly using that unit. Only pay-per-use/monthly annual scenarios repeat a month twelve times. A yearly plan uses its independently verified annual rate; its monthly comparison is the annual amount divided by twelve, never a monthly payment offer. Monthly and yearly prepaid first-term totals are shown separately from postpaid usage. EVS subscriptions use an explicit per-disk GB capacity and target quantity; aggregate instance-hours or GB-month totals never establish subscription counts or capacity. All totals of incomplete quotes are partial subtotals.

## Validation and privacy

Money uses HALF_UP cents per line and cent-based subtotals shared by UI and Excel. Annual pay-per-use/monthly scenarios multiply the unrounded monthly calculation by 12 and then round once. Yearly amortization divides the rounded annual term by 12 per line. Thus monthly cents × 12 may differ from the annual estimate; this policy is exported in Assumptions and does not promise invoice amounts.

Synthetic tests cover description parsing, unit conversion, decimals, unknown counts, source-period aggregates, unsupported billing, mapping confirmation, expired prices and evidence/product identity. Worker tests cover request validation, upstream failures and static asset serving. No real PDF, bill, account identifier, customer inventory or quotation is included. PDF parser tests use synthetic text.

Third-party browser libraries: SheetJS CE 0.20.3 (Apache-2.0), Mozilla PDF.js 3.11.174 (Apache-2.0), vendored from vendor/CDN distribution. No third-party browser scripts or fonts are loaded at runtime.

Shared project state: [../../docs/DEVELOPMENT_STATUS.md](../../docs/DEVELOPMENT_STATUS.md).


## TCP V0.3 data phase

See [the V0.3 design and operator guide](../../docs/PRICING_V03_TCP.md). Install `requirements-catalog.txt` only for local PDF processing. `python3.12 scripts/catalog_update.py check` discovers the Service Description from the official calculator page and saves a candidate/history in ignored local SQLite. No real initial baseline has been approved. The candidate artifact under `pricing-studio/catalogs/tcp/` is review data, not a usable complete quotation.

Local `npm run dev` connects the catalog-status card to the persistent CLI updater. Hosted Worker checks discover/download/hash only, and cannot parse/promote prices or install daily jobs. `schedule --scheduler cron|systemd|windows --output <directory>` generates local daily configuration without installing it; run this on the actual scheduler computer. Offline HTML includes the packaged status and disables live checking. TCP source validation requires an approved/current version and successful check within 48 hours; old quote snapshots do not mutate. Alibaba/Tencent adapters are not implemented.
