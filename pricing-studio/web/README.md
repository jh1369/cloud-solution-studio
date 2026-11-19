# Cloud Solution Studio · Pricing Studio Web

Pricing Studio uses browser JavaScript and a Cloudflare Worker. Huawei quotes use independently verified public plans for pay-per-use, one-month and one-year billing in `eu-west-101`. Web `0.3.10-dev` quotes DCS using the European product specifications and public prices without a Huawei Cloud account. [Development status](../../docs/DEVELOPMENT_STATUS.md)

## Features

- Chinese and English line-oriented resource descriptions with deterministic extraction and catalog matching.
- CSV / XLSX normalized inventory and browser-local text PDF AWS bill import (sample layout only, no OCR).
- Editable service mappings, resource counts, usage units and billing periods; per-row or batch human confirmation.
- Bilingual CN/EN interface and mapping review notes for CPU/memory/architecture, OS, database engines and storage. Unknown storage types require manual SKU selection. Resource counts must be positive integers.
- Official Huawei EU public catalogue and independent inquiry verification for pay-per-use, 1-month and 1-year plans. Source reserved/spot records never become Huawei target options.
- Monthly comparisons, independent annual subscription prices, first-term prepayment totals, optional discount, five-sheet XLSX export and downloadable price evidence.
- The hosted Site processes uploaded files in browser memory. Rate refresh sends allowlisted official product IDs. When explicitly enabled on the user machine, assisted import sends a bounded cell preview only to a loopback model. Reloading discards the in-memory quote.
- Source-period aggregate usage preserves unknown resource counts; no automatic month/year extrapolation.

## Huawei specification matching

The bundled public catalog has 441 pay-per-use and 400 plans each for one month and one year. It contains ECS, EVS, RDS, DCS, ELB, NAT Gateway and CCE. The automatic matching rules currently cover these components.

| Component | Exact match and review conditions |
| --- | --- |
| ECS | Match vCPU, memory, architecture, OS, compute class and explicit series. Generic requests use visible x86, Linux and General Computing assumptions. Specialized hosts, licenses and accelerators require review. |
| EVS | Match the disk class and keep per-disk capacity separate from metered usage. Generic SSD uses a disclosed GPSSD estimate. Performance, snapshots and inconsistent capacities require review. |
| DCS | Match Redis capacity, topology and supplied architecture, version, replicas, shards and verifiable performance against official European product specifications. Both automatic and manual pricing require an exact, verified EU-Dublin `USD` plan. |
| RDS | Match engine, version, shape, topology and explicit Cloud SSD for instance-only estimates. Storage, backups and database licensing require review. |
| NAT Gateway | Match a declared private NAT size (`small`, `medium`, `large`, `xlarge`) for an explicitly scoped instance-only estimate. |
| ELB, CCE and other services | Manual candidate selection where a catalog plan exists. ELB has one hourly SKU. OBS has no usable price rows. |

Each eligible service checks the requested target region, billing mode and verified rate before pricing. A known count with omitted usage can use a disclosed full-month estimate for supported per-resource rows. Aggregate usage keeps its source period. When billing changes after manual selection, the same SKU requires fresh confirmation. If the plan is unavailable, choose another SKU or select **Match automatically**. Pending lines have blank quote amounts and are excluded from subtotals.

## Official DCS product specifications

The browser uses a reviewed snapshot of the European DCS Basic Redis specifications dated 2025-11-03. It records exact SKU, capacity, topology, replicas, shards, documented versions, known performance limits and a source table link. The corresponding architecture notes identify the same `xu1` codes as x86. Regional scope and engine versions come from the European tables. [European product specifications](https://support.huaweicloud.com/eu/productdesc-dcs/dcs-pd-0522002.html) · [Official architecture annotations](https://support.huaweicloud.com/intl/en-us/productdesc-dcs/dcs-pd-0522002.html)

After matching one documented flavor, the browser joins its exact `spec_code` and resource type to the selected mode in the EU-Dublin catalog. The existing price engine verifies the SKU, product identity, region, `USD`, billing mode, unit, official inquiry evidence and verification time. The existing Worker refreshes rates with allowlisted product IDs through the European calculator. Both the snapshot and rate refresh work without an IAM token or account. [Public calculator](https://www.huaweicloud.com/eu/pricing/calculator.html)

When topology is unspecified for Redis, the matcher tries the documented single-node shape and shows the assumption. Unspecified versions use the SKU shared by the documented versions. Architecture, replica and shard assumptions come from the selected flavor. Multiple eligible variants remain Pending until the user specifies the distinguishing parameter or confirms a manual choice. Any explicit version, architecture or topology requirement still has to match.

Workbook Service Mapping retains the selected or candidate specification and its revision. Public Pricing retains the independent rate evidence and verification time. The quote is a regional estimate. Confirm stock and placement at purchase. Explicit AZ or multi-AZ requirements, unsupported variants and unpriced or expired plans remain Pending.

Future adapters share this evidence contract and add only service-specific fields and an explicit price code link.

| Service | Official dimensions and minimum extension |
| --- | --- |
| ECS | Normalize flavor ID, vCPU, memory, CPU architecture, flavor class and AZ status. Join the flavor to a verified OS or license price variant. [ECS flavor details](https://support.huaweicloud.com/eu/api-ecs/en-us_topic_0020212656.html) |
| RDS | Normalize engine and version, instance class, topology, vCPU, memory and AZ status. Join the instance SKU and retain separate storage, backup and licensing charges. [RDS flavor API](https://support.huaweicloud.com/intl/en-us/api-rds/rds_06_0002.html) |
| ELB | Normalize load balancer flavor ID, layer, performance limits and AZ evidence. Join the instance plan and verify separate capacity, bandwidth or traffic billing. [ELB flavor API](https://support.huaweicloud.com/intl/en-us/api-elb/ListFlavors.html) |

## Model-assisted CSV and Excel on the user machine

Standard CSV and spreadsheet templates still take the direct local parser. Use UTF-8 for CSV. Nonstandard uploads open an editable preview. The model button is enabled only when the Web + Worker stack is running locally with a configured model. The hosted Site supports the same manual preview and confirmation.

Install an approved local model runtime that implements OpenAI-compatible `/v1/chat/completions` and strict `json_schema` output. Acceptance used llama.cpp and Qwen2.5-1.5B-Instruct Q4_K_M on CPU. Obtain the runtime and weights through your approved software channel. Example local startup for an existing GGUF model

```bash
llama-server --host 127.0.0.1 --port 4813 --alias inventory-local -m /path/to/model.gguf -c 8192 \
  --cors-origins http://127.0.0.1:4814 --no-cors-credentials
# In pricing-studio/web. Use an absolute path to an existing reviewed ZIP.
PRICING_OFFLINE_ARCHIVE=/path/to/existing.zip python3.12 scripts/build_worker.py
INVENTORY_MODEL_PORT=4813 INVENTORY_MODEL=inventory-local PORT=4814 node scripts/dev-server.mjs
```

Open `http://127.0.0.1:4814`, select Huawei Cloud and upload a file. In the preview, run the local model, inspect the original cells and proposed fields, adjust the included rows, and click **Confirm and quote**. Verify highlighted pricing fields or correct them in the preview. Rows with unverified fields can be exported as Pending alongside priced rows. The page keeps up to four successful analyses in memory for repeated imports. The Input worksheet retains source sheet, row, original cells and any applicable header.

The model receives sheet names and a cell preview bounded to 10 sheets, 60 nonempty rows, 20 columns and 12,000 serialized characters. It proposes source fields and header mappings in a JSON Schema. Known column names and explicit units ground counts, capacity and metered usage. Other proposed field assignments require review. Omitted rows stay visible, and timeouts preserve editable source cells. Complex ranges, unsupported encodings and unfamiliar fields may need manual cleanup or a standard template. After confirmation, both import paths use the same deterministic matching and price validation.

With the model enabled, the local Web server and model listen on the user's machine. The same-origin Node adapter forwards only to a configured `127.0.0.1` port via direct HTTP. It does not use a proxy or follow redirects. Use a trusted local runtime with telemetry disabled. Before handling sensitive data, require authentication at the model server and restrict its browser origins. Supply the matching credential through the local process environment as `INVENTORY_MODEL_TOKEN`. The hosted app has no external model configuration, upload endpoint or model credential. Any external integration would require explicit approval for the allowed columns, purpose, data residency, retention, credentials and audit controls.

The server adapter receives `{rows, schema, signal}` and returns the structured proposal. The shipped adapter uses local OpenAI-compatible chat completions. Alternate approved local adapters can implement the same interface and share the same request limits, preview validation and quote engine.

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

Verification includes provider/Huawei compatibility, public-document detection, fictional real-PDF table parsing, version diff/review/rollback, frozen price snapshots, local schedule templates and offline/immutable archive checks. See DEVELOPMENT_STATUS for exact current counts. The acceptance record lists browser tests of the single-page bundle, native file opening and the preview relay separately.

For each completed version, run `npm run release:offline` after updating `package.json`. This runs tests and archives HTML/ZIP, bilingual instructions, source fingerprints/checksums and fictional sample data in `releases/pricing-studio/v<version>/` at the repository root. ZIP output is deterministic; changed content cannot replace an existing archive. Update the [version index](../../releases/pricing-studio/README.md). Share files downloaded from GitHub, not cloud workspace links. No automatic Push or deployment is added.

Local preview uses the same packaged Worker via a small Node HTTP adapter:

```bash
npm run dev
```

In this managed environment, use `sites-preview start /workspace/repos/cloud-solution-studio/pricing-studio/web` and open its exact returned URL. The relay currently fails before returning a URL. The [acceptance record](../../docs/PRICING_BROWSER_ACCEPTANCE.md) describes the independent loopback browser test. On Node 24 behind an inherited environment proxy, use `NODE_USE_ENV_PROXY=1 npm run dev` (or prefix the managed preview command) so official refresh honors that proxy. Keep TLS verification enabled; no credentials or proxy values belong in source. A normal local machine without such a proxy does not need the prefix. Local preview does not deploy or Push.

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

Region `eu-west-101`, currency USD. Target modes: `ONDEMAND` (按需), `MONTHLY` (包月, one month), `YEARLY` (包年, one year). `scripts/build_catalog.py` reads only the public EU calculator `productInfo` endpoint and verifies `officialWebsiteAmount` with `/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`. No credentials, account sessions or private quotations are used. Each price records the official product ID, SKU, request, response, source and timestamp. Snapshots expire after seven days. Mode switches validate the new plan independently. Explicit manual choices require fresh confirmation; exact automated matches may be recalculated. Absent prices remain Pending. `POST /api/rates` re-queries only allowlisted product IDs; no client-supplied remote URLs or prices are accepted.

The catalogue supports simple hourly resources and EVS GB-hour (a size-1 inquiry). Monthly and yearly plans are independently queried with `chargingMode=0`, `periodType=2/3`, `periodNum=1`; pay-per-use uses `chargingMode=1` and one-hour usage. The server groups mixed-mode refreshes into separate inquiries. A catalogue match is a proposed design, never a guarantee of AWS feature equivalence. Explicit specifications and disclosed estimates can be automatically priced for the supported components. Conflicts and incomplete mappings require review.

Tiered traffic/storage, Kafka parameters not yet modeled, logs, commitments, Huawei spot or reserved-like target calculations remain outside this tool’s scope. Other unsupported services remain Pending even when a monthly or yearly mode is selected. S3→OBS service-family mapping is available; an OBS storage amount is **not** fabricated from an unrelated hourly price. Unknown Huawei target billing modes remain Pending; unknown AWS source billing does not block an independently specified Huawei target plan. Reference hours convert GB-month to GB-hour only when explicitly using that unit. Only pay-per-use/monthly annual scenarios repeat a month twelve times. A yearly plan uses its independently verified annual rate; its monthly comparison is the annual amount divided by twelve, never a monthly payment offer. Monthly and yearly prepaid first-term totals are shown separately from postpaid usage. EVS subscriptions use an explicit per-disk GB capacity and target quantity; aggregate instance-hours or GB-month totals never establish subscription counts or capacity. All totals of incomplete quotes are partial subtotals.

## Validation and privacy

Money uses HALF_UP cents per line and cent-based subtotals shared by UI and Excel. Annual pay-per-use/monthly scenarios multiply the unrounded monthly calculation by 12 and then round once. Yearly amortization divides the rounded annual term by 12 per line. Thus monthly cents × 12 may differ from the annual estimate; this policy is exported in Assumptions and does not promise invoice amounts.

Synthetic tests cover description parsing, unit conversion, decimals, unknown counts, source-period aggregates, unsupported billing, mapping confirmation, expired prices and evidence/product identity. Worker tests cover request validation, upstream failures and static asset serving. No real PDF, bill, account identifier, customer inventory or quotation is included. PDF parser tests use synthetic text.

Third-party browser libraries: SheetJS CE 0.20.3 (Apache-2.0), Mozilla PDF.js 3.11.174 (Apache-2.0), vendored from vendor/CDN distribution. No third-party browser scripts or fonts are loaded at runtime.

Shared project state: [../../docs/DEVELOPMENT_STATUS.md](../../docs/DEVELOPMENT_STATUS.md).


## TCP catalog publication

Install `requirements-catalog.txt` for Python PDF parsing. `python3.12 scripts/catalog_update.py check` discovers the official TCP Service Description, retries validation failures and publishes eligible versions to SQLite. Initial publication uses the same checks. Row-level Pending and Unavailable prices retain their source evidence.

Local `npm run dev` connects the catalog card to the Python updater. Last check, last successful verification, version and effective state are separate. Use `publication --output outputs/tcp-publication.json` to export an atomic state/catalog pair. Historical versions remain available by explicit version ID. The hosted Worker currently detects changes and reads packaged status. The managed scheduler and cloud delivery are planned. [TCP operator guide and hosting plan](../../docs/PRICING_V03_TCP.md)
