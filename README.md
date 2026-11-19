# Cloud Solution Studio

Local-first tools for cloud solution architects. Pricing Studio V0.3 supports AWS-to-Huawei Cloud Public quotations and TCP pay-per-use estimates for selected ECS, EVS and RDS configurations in EU-DE. Both workflows use the existing inventory import and five-sheet Excel export. Huawei additionally supports deterministic SKU matching and optional model-assisted normalization on the user machine. The TCP publisher and Worker reader support private object storage. The private Site uses an expiring verified snapshot for its initial TCP release. [Verified status](docs/DEVELOPMENT_STATUS.md)

## Security boundary

This repository contains only generic source code, public product/price metadata, and synthetic test data. Never commit customer documents or customer-derived inventories, internal PPTs, real quotations/discounts, personal data, credentials, customer architectures, or internal configuration. A public price snapshot is not a customer quotation.

Confidential data stays outside the Git repository in an approved access-controlled runtime. Original uploaded documents, extracted billing text, generated quotations, databases, cloud credentials, Sites deployment identity, and generated Worker bundles are not included in this synchronization.

See [SECURITY.md](SECURITY.md), [AGENTS.md](AGENTS.md) and the shared [development status](docs/DEVELOPMENT_STATUS.md). Push requires explicit authorization for the relevant changes; the user authorized this V0.1.1 synchronization, not future automatic uploads.

## Workstreams

| Module | Scope | Current state |
| --- | --- | --- |
| Pricing Studio | AWS → Huawei Cloud Public, `eu-west-101` | Huawei catalog matching and optional local inventory normalization. TCP quote support in EU-DE |
| PPT Studio | Local template/slide reuse | Planned; placeholder README only |
| Web Demo Studio | Generic interactive solution mockups | Planned; placeholder README only |
| Cloud Live Lab | Read-only APIs for isolated approved test accounts | Planned; placeholder README only |

## Repository layout

```text
pricing-studio/
  pyproject.toml              # Existing Python CLI, package version 0.1.0
  src/pricing_studio/         # CSV → JSON product-family mapping starter
  sample_data/               # Fictional AWS inventory
  tests/                     # Python starter test
  web/                       # Pricing Studio 0.3.3-dev, Web + Worker
    public/                  # Browser code, vendored libraries, public price evidence
    worker.mjs               # Huawei price refresh and TCP catalog routes
    scripts/                 # Catalogue verification and Worker build helpers
    tests/                   # Synthetic web/Worker/export and catalogue-adapter tests
    SOURCE_PROVENANCE.json   # Historical V0.1.1 migration hashes
```

The web app uses browser JavaScript and a Cloudflare Worker. Python 3.12 runs the catalog updater with SQLite and can publish the validated TCP catalog through an S3-compatible client. The Worker reads the private bucket binding directly. The original Python CLI declares `Python >=3.10` and uses the standard library.

## Pricing Studio Web V0.3.15-dev

Implemented:

- Rule-based Chinese and English resource descriptions, CSV/XLSX inventory import, and the supported text-based AWS billing PDF layout.
- Editable target SKU suggestions and explicit human confirmation. Product-family similarity does not guarantee architecture, OS/licensing, engine, topology or feature equivalence.
- Huawei online estimates match ECS, EVS, Redis DCS, scoped RDS, dedicated elastic ELB, CCE management, public and private NAT, and Dynamic BGP EIP charges. The browser links documented specs to verified EU-Dublin plans. The Worker refreshes prices through the public calculator without a Huawei Cloud account. [Matching rules](pricing-studio/web/README.md#huawei-specification-matching)
- AWS source billing retained separately from Huawei target **按需 / 包月 / 包年**. Source reserved/spot does not become a target billing choice.
- The checked-in snapshot contains 543 pay-per-use, 495 one-month and 494 one-year price plans. Public NAT pay-per-use uses billed days. EIP prices fixed bandwidth, graduated outbound GB and unbound reservation hours separately.
- Monthly calculations, independent annual subscription prices, first-term prepayment, explicitly labeled annual amortization, and manual discount scenarios.
- Five-sheet Excel export includes Input, Service Mapping, Public Pricing, Quotation and Assumptions. Service Mapping retains specification evidence. Quotation records related Pending charges with blank amounts and a reference to the same input row.
- Browser-local file parsing. Only allowlisted Huawei product IDs go to the server when refreshing prices; original files, AWS account IDs and descriptions are not uploaded by that flow.
- The local Web + Worker workspace uses a loopback model to review nonstandard CSV and multi-sheet XLSX in batches. Standard templates take the existing direct import path. Each source row retains its sheet, row, cells and field evidence. Official AWS EC2, RDS, ElastiCache and OpenSearch instance records supplement model suggestions. The hosted workspace supports manual review with the same source records. [Local model configuration](pricing-studio/web/README.md#model-assisted-csv-and-excel-on-the-user-machine)
- The same Huawei price engine calculates confirmed charges and conditional estimates separately. A review action can confirm rows with the same source type, target plan and conditions while preserving each row's metered usage. Both statuses and Pending charges are visible in the five-sheet export. [AWS source specification evidence](pricing-studio/web/README.md#aws-source-specifications-and-conditional-quotes)
- AWS migration review ranks verified ECS choices, keeps RDS and CSS storage separate, and shows DCS node-to-instance metering evidence. Grouped target-design fields preserve source values and identify assumptions. [Migration coverage](docs/HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测)
- Huawei's browser regression export produces stage-specific aggregate counts, with separate primary and ancillary Pending reasons. The owner can share the statistics after privately validating a reference workbook. [Real regression history](docs/HUAWEI_REAL_REGRESSION.md)

Build and run tests from the repository root, with Python 3.12 and Node.js 20+:

```bash
cd pricing-studio/web
npm test
```

No dependency installation or cloud credentials are needed. `npm test` builds the ignored `dist/server/index.js` and runs the relevant JavaScript and Python catalog/packaging regressions. Positive financial tests use fictional rates/resources; Worker tests mock the upstream API. This command does not refresh prices or deploy. See the [MVP acceptance record](docs/PRICING_MVP_ACCEPTANCE.md) for the separate official-API check and outstanding browser acceptance.

The `0.3.1-dev` offline candidate ZIP includes a standalone HTML file and a fictional CSV. The development status records the current private Site version and its acceptance results. [Download the offline ZIP](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/releases/pricing-studio/v0.3.1-dev/Pricing-Studio-0.3.1-dev-Offline.zip) · [Development status](docs/DEVELOPMENT_STATUS.md) · [Version archive](releases/pricing-studio/README.md)

Each delivery keeps the original per-price verification times. To archive a new version, update `pricing-studio/web/package.json` and run `npm run release:offline` in that directory. The command tests, builds and creates an immutable HTML and ZIP archive.

See [the web README](pricing-studio/web/README.md) for build-only commands, approved official catalogue refresh, pricing limits and deployment instructions. Hosting configuration is intentionally omitted; building or pushing to GitHub does not deploy the existing Site.

The private deployed V0.1.1 source originated at Sites source commit `9e85f66f8dfff63dcf03882e4e51a53c82d03d74`. `SOURCE_PROVENANCE.json` records that historical migration. Current V0.2 sources differ from those hashes and were explicitly authorized for a private Sites deployment; GitHub synchronization is separate from that private deployment.

## TCP catalog ingestion and updates

The TCP updater discovers the current official PDF, validates supported prices and updates SQLite automatically. The `publish` command uses the same SQLite state to deliver immutable validated rows and a conditional current-state pointer to private R2. The Worker provides read-only status and catalog endpoints and enforces a 48-hour verification window. Online TCP quotation uses eligible EU-DE rates. Managed scheduling and the production storage binding remain pending. [TCP design, operator commands and hosting plan](docs/PRICING_V03_TCP.md)

## Existing Python mapping CLI

This starter has a different input schema from the web app: `aws_service,aws_sku,aws_region,quantity,usage_hours`. It only emits family mappings and Pending prices, not quotations.

Without installing dependencies, run from the repository root:

```bash
cd pricing-studio
PYTHONPATH=src python3.12 -m unittest discover -s tests -v
mkdir -p outputs
PYTHONPATH=src python3.12 -m pricing_studio.cli sample_data/aws_usage_example.csv --output outputs/mapped.json
```

There is 1 existing Python test. Its known NaN/Infinity and quantity/unit validation limitations remain documented and unchanged by the V0.1.1 web synchronization.

## Development and handoff

ChatGPT handles requirements, solution design, public service-capability analysis and technical review. Codex handles implementation, testing and state updates. Read and update [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) for each task; record added/changed/deleted features, test evidence, open issues and next steps. Update this README and [docs/ROADMAP.md](docs/ROADMAP.md) when architecture changes. Do not infer that planned features, another checkout, or a test count from a different version is already integrated.
