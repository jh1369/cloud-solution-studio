# Cloud Solution Studio · Pricing Studio Web

Pricing Studio uses browser JavaScript and a Cloudflare Worker. Huawei quotes use independently verified public plans for pay-per-use, one-month and one-year billing in `eu-west-101`. Web `0.3.14-dev` adds ranked, evidenced AWS migration options for ECS, RDS, DCS, and CSS. [Development status](../../docs/DEVELOPMENT_STATUS.md)

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

The bundled public catalog has 448 pay-per-use and 401 plans each for one month and one year. The automatic matching rules cover the following components.

| Component | Exact match and review conditions |
| --- | --- |
| ECS | Match vCPU, memory, architecture, OS, compute class and explicit series. Generic requests use visible x86, Linux and General Computing assumptions. Specialized hosts, licenses and accelerators require review. |
| EVS | Match the disk class and keep per-disk capacity separate from metered usage. Generic SSD uses a disclosed GPSSD estimate. Performance, snapshots and inconsistent capacities require review. |
| DCS | Match Redis capacity, topology and supplied architecture, version, replicas, shards and verifiable performance against official European product specifications. Both automatic and manual pricing require an exact, verified EU-Dublin `USD` plan. |
| RDS | Match engine, version, shape, topology and explicit Cloud SSD for instance-only estimates. Storage, backups and database licensing require review. |
| ELB | Match the dedicated elastic `elbv3.professional` hourly instance meter. Check declared L4/L7 performance against documented limits. Solely requesting the dedicated instance fee allows an explicit elastic assumption. LCU, bound EIP and bandwidth are separate fees. [EU specifications](https://support.huaweicloud.com/eu/productdesc-elb/en-us_topic_0287737145.html) · [Billing items](https://support.huaweicloud.com/eu/price-elb/elb_billing_0003.html) |
| CCE | Match the exact Standard cluster SKU or the declared master count and worker capacity. Capacity selects the smallest covering documented tier. A generic Kubernetes cluster can use Standard with a visible assumption. Exact Autopilot management and explicitly purchased general-computing resource packages also have plans. Worker compute, disk and networking are separate fees. [EU flavors](https://support.huaweicloud.com/eu/api-cce/cce_02_0236.html) · [Billing items](https://support.huaweicloud.com/eu/price-cce/cce_03_0006.html) |
| NAT Gateway | Match a declared public or private gateway and tier, exact SKU or uniquely satisfying limits. Private instance-only pay-per-use is hourly. Public pay-per-use requires whole billed days, and public monthly/yearly plans have independent prices. Pricing uses the official billing-day boundary, with any partial billing day counted as a whole day. EIP, bandwidth and outbound traffic are separate fees. [EU specifications](https://support.huaweicloud.com/eu/productdesc-natgateway/en-us_topic_0086739763.html) · [Billing items](https://support.huaweicloud.com/eu/price-natgateway/nat_billing_0005.html) |
| EIP | Match Dynamic BGP dedicated fixed bandwidth (`19_bgp`), per-address monthly outbound volume (`12_bgp`) or unbound IPv4 reservation (`5_bgp`). Fixed bandwidth supports all three terms. Traffic and reservation are pay-per-use. [EIP billing and verified range](../../docs/HUAWEI_QUOTE_COVERAGE.md#0312-dev-eip-覆盖率复测) |
| OBS | Map the service family. Automatic pricing requires applicable public rates and verified units. |

Each eligible service checks the requested target region, billing mode and verified rate before pricing. A known count with omitted usage can use a disclosed full-month estimate for supported per-resource hourly or capacity rows. Aggregate usage keeps its source period. Manual selection checks the documented constraints. Changing billing after manual selection requires fresh confirmation. If the plan is unavailable, choose an eligible SKU or select **Match automatically**. Additional unpriced charges appear separately in the resource card and use the same input row number in Quotation. Pending amounts stay blank and are excluded from subtotals.

Use a clause such as `with EIP fixed bandwidth 10 Mbps` in an ECS, ELB or NAT specification to price the EIP separately. When a connection is also specified on a standalone row, use the same `eip_ref` in the CSV/XLSX column or type `eip_ref=demo-address` in each specification. Matching values link to the billed row. Conflicting values require review. Enter idle hours explicitly for reservation fees. A declared attachment shows the bound-address exemption.

Supported AWS usage worksheets with the Chinese product, specification, operation, hours and quantity headers can go directly from browser import to quotation. Recognized hourly billing meters price by source-period aggregate hours. The source quantity and original row remain in Input. [AWS operation field](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/billing-info-fields.html)

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
| ELB | Extend the verified dedicated elastic base plan to separate LCU, bandwidth and traffic billing. Require placement and performance evidence for additional deployment configurations. [EU billing items](https://support.huaweicloud.com/eu/price-elb/elb_billing_0003.html) |

## Model-assisted CSV and Excel on the user machine

Standard CSV and spreadsheet templates take the direct local parser. Use UTF-8 for CSV. Nonstandard uploads open an editable preview. On loopback, **Review AWS usage sheets with local model** also opens the preview for the recognized AWS billing layout. The model button requires a configured local runtime. The hosted Site supports the same manual preview and confirmation.

Install an approved local model runtime that implements OpenAI-compatible `/v1/chat/completions` and strict `json_schema` output. Acceptance used llama.cpp and Qwen2.5-1.5B-Instruct Q4_K_M on CPU. Obtain the runtime and weights through your approved software channel. Example local startup for an existing GGUF model

```bash
llama-server --host 127.0.0.1 --port 4813 --alias inventory-local -m /path/to/model.gguf -c 8192 \
  --offline --no-webui --log-disable --api-key-file /path/to/local-model-key
# In pricing-studio/web. Use an absolute path to an existing reviewed ZIP.
PRICING_OFFLINE_ARCHIVE=/path/to/existing.zip python3.12 scripts/build_worker.py
# Supply INVENTORY_MODEL_TOKEN to the Node process through your local secret store.
INVENTORY_MODEL_PORT=4813 INVENTORY_MODEL=inventory-local PORT=4814 node scripts/dev-server.mjs
```

Open `http://127.0.0.1:4814`, select Huawei Cloud and upload a file. In the preview, run the local model, inspect the original cells and proposed fields, adjust the included rows, and click **Confirm and quote**. Verify highlighted pricing fields or correct them in the preview. Rows with unverified fields can be exported as Pending alongside priced rows. The page caches up to four workbook analyses in memory, including verified batches. It retries a failed batch once and reuses completed batches when the user retries. The Input worksheet retains source sheet, physical row, original cells, applicable header and per-field source columns.

The review supports up to 10 sheets, 2,000 nonempty rows and 64 columns. The browser retains full source cells and sends bounded cell previews in batches of up to 24 rows and 20,000 serialized bytes. Repeated sheet headings provide context. The adapter validates strict JSON Schema output, exact row keys, source column references and numeric limits. It caps generation at 2,048 tokens per batch. Unknown or incomplete rows remain editable. Known headers, explicit units and documented AWS usage types ground counts, capacity and metered usage. Suggestions that lack such evidence require review. Both import paths use the same deterministic matching and price validation.

With the model enabled, the local Web server and model listen on the user's machine. The same-origin Node adapter forwards only to a configured `127.0.0.1` port via direct HTTP. It does not use a proxy or follow redirects. Use a trusted local runtime with telemetry disabled. Before handling sensitive data, require authentication at the model server and restrict its browser origins. Supply the matching credential through the local process environment as `INVENTORY_MODEL_TOKEN`. The hosted app has no external model configuration, upload endpoint or model credential. Any external integration would require explicit approval for the allowed columns, purpose, data residency, retention, credentials and audit controls.

The server adapter receives `{rows, header, knowledge, schema, signal}` and returns the structured proposal. The workbook endpoint uses the local OpenAI-compatible adapter. A separate server-only OpenAI API adapter targets the fixed HTTPS endpoint and requires explicit synthetic-test configuration. It has no route from file upload and uses a test transport in automated verification. Approved runtimes can implement the same contract.

## AWS source specifications and conditional quotes

EC2, RDS, ElastiCache and OpenSearch source instances are looked up by exact type in the public AWS specification snapshot. Each record retains the applicable official URL, extraction date and source document digest. The extractor accepts separately downloaded official HTML and generates the checked-in JavaScript module without a network request at application runtime. Verified vCPU, memory, architecture and family are available when the source tables establish them. Source storage and cache node memory remain source facts. [AWS EC2 specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-types.html) · [AWS RDS classes](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Types.html) · [AWS ElastiCache node types](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html) · [AWS OpenSearch instance types](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html)

Source billable instance hours remain cumulative hours for the original billing period. They cannot establish an instance count for a Huawei subscription. EC2 target plans require exact vCPU, memory, architecture and supported OS. Specialized or burstable source families need confirmation of the target performance assumption. Database engine, version, deployment and storage scope require independent evidence. Cache engine and topology also require evidence. A verified AWS profile can therefore coexist with several Huawei SKUs or a Pending target price.

**Review matching estimates** shows the condition and the number of rows sharing the same source configuration and selected Huawei plan. Confirming those rows triggers deterministic revalidation and preserves per-row usage. The webpage and Excel subtotal confirmed charges separately from conditional estimates. The Service Mapping worksheet records AWS evidence, candidate Huawei SKUs and conditions. The Quotation worksheet keeps Pending amounts blank.

**Review matching migration plans** applies a target design to an equivalent source group and reruns matching. Review the resulting priced SKU and billing basis to confirm. ECS keeps compatible architecture and OS and bounds both dimensions at 2×. AWS RDS defaults to MySQL 8.0 primary/standby with separate data disk and backup lines. CSS uses managed OpenSearch data-node prices and separate storage. DCS uses usable cache capacity and distinguishes aggregate source node hours from target whole-instance hours. Pairing and capacity assumptions require evidence before confirmation. [Coverage and price evidence](../../docs/HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测)

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
