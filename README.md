# Cloud Solution Studio

Local-first tools for cloud solution architects. The current implementation focus is **Pricing Studio V0.3 (TCP catalog/data phase)**, with AWS-to-Huawei Cloud Public mapping, independently verified public pricing and Excel export. V0.2.0-dev (`f8ea276`) is the inspected GitHub baseline. V0.3 adds TCP PDF catalog ingestion and safe updates while retaining Huawei quotations. TCP quote mapping/calculation is not enabled yet. The user authorized this task's GitHub sync and automatic deployment of checked versions to the existing private Site. V0.3 data-phase source is synchronized (`8777743`) and deployed (Sites source `fff0d1f`); see the [verified status](docs/DEVELOPMENT_STATUS.md).

## Security boundary

This repository contains only generic source code, public product/price metadata, and synthetic test data. Never commit customer documents or customer-derived inventories, internal PPTs, real quotations/discounts, personal data, credentials, customer architectures, or internal configuration. A public price snapshot is not a customer quotation.

Confidential data stays outside the Git repository in an approved access-controlled runtime. Original uploaded documents, extracted billing text, generated quotations, databases, cloud credentials, Sites deployment identity, and generated Worker bundles are not included in this synchronization.

See [SECURITY.md](SECURITY.md), [AGENTS.md](AGENTS.md) and the shared [development status](docs/DEVELOPMENT_STATUS.md). Push requires explicit authorization for the relevant changes; the user authorized this V0.1.1 synchronization, not future automatic uploads.

## Workstreams

| Module | Scope | Current state |
| --- | --- | --- |
| Pricing Studio | AWS → Huawei Cloud Public, `eu-west-101` | V0.3 TCP catalog/update phase; Huawei engine retained; TCP quotation integration and browser acceptance outstanding |
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
  web/                       # Pricing Studio 0.3.1-dev candidate, Web + Worker
    public/                  # Browser code, vendored libraries, public price evidence
    worker.mjs               # Server source; official pricing refresh endpoint
    scripts/                 # Catalogue verification and Worker build helpers
    tests/                   # Synthetic web/Worker/export and catalogue-adapter tests
    SOURCE_PROVENANCE.json   # Historical V0.1.1 migration hashes
```

The web app uses browser JavaScript and a Cloudflare Worker. Python 3.12 runs its build/catalogue scripts. The existing Python CLI currently declares `Python >=3.10` and uses the standard library. The separately developed Python/openpyxl/SQLite prototype has **not** been integrated here; neither Python nor SQLite runs inside the Worker.

## Pricing Studio Web V0.2 — private candidate

Implemented:

- Rule-based Chinese/English resource descriptions, CSV/XLSX inventory import, and the supported text-based AWS billing PDF layout; no OCR or general-purpose LLM parsing.
- Editable target SKU suggestions and explicit human confirmation. Product-family similarity does not guarantee architecture, OS/licensing, engine, topology or feature equivalence.
- AWS source billing retained separately from Huawei target **按需 / 包月 / 包年**. Source reserved/spot does not become a target billing choice.
- Independently verified public price plans: 441 pay-per-use, 400 one-month and 400 one-year records in the checked-in snapshot. Unsupported services/modes and missing/expired prices remain Pending.
- Monthly calculations, independent annual subscription prices, first-term prepayment, explicitly labeled annual amortization, and manual discount scenarios.
- Five-sheet Excel export: Input, Service Mapping, Public Pricing, Quotation, Assumptions. Pending amounts stay blank; incomplete totals are partial subtotals.
- Browser-local file parsing. Only allowlisted Huawei product IDs go to the server when refreshing prices; original files, AWS account IDs and descriptions are not uploaded by that flow.

Build and run tests from the repository root, with Python 3.12 and Node.js 20+:

```bash
cd pricing-studio/web
npm test
```

No dependency installation or cloud credentials are needed. `npm test` builds the ignored `dist/server/index.js` and runs the relevant JavaScript and Python catalog/packaging regressions. Positive financial tests use fictional rates/resources; Worker tests mock the upstream API. This command does not refresh prices or deploy. See the [MVP acceptance record](docs/PRICING_MVP_ACCEPTANCE.md) for the separate official-API check and outstanding browser acceptance.

Download the `0.3.1-dev` candidate ZIP, extract it and open the HTML in your browser. The ZIP includes a fictional inventory CSV. The candidate supports Huawei quotations and shows TCP catalog status. Two checks are open, covering native offline file use and the authenticated production site. The private site currently runs `0.3.0-dev`. [Download the offline ZIP](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/releases/pricing-studio/v0.3.1-dev/Pricing-Studio-0.3.1-dev-Offline.zip) · [Browser checklist and sample files](docs/PRICING_BROWSER_ACCEPTANCE.md) · [Version archive](releases/pricing-studio/README.md)

Each delivery keeps the original per-price verification times. To archive a new version, update `pricing-studio/web/package.json` and run `npm run release:offline` in that directory. The command tests, builds and creates an immutable HTML and ZIP archive.

See [the web README](pricing-studio/web/README.md) for build-only commands, approved official catalogue refresh, pricing limits and deployment instructions. Hosting configuration is intentionally omitted; building or pushing to GitHub does not deploy the existing Site.

The private deployed V0.1.1 source originated at Sites source commit `9e85f66f8dfff63dcf03882e4e51a53c82d03d74`. `SOURCE_PROVENANCE.json` records that historical migration. Current V0.2 sources differ from those hashes and were explicitly authorized for a private Sites deployment; GitHub synchronization is separate from that private deployment.

## TCP catalog ingestion and updates

See [V0.3 plan, coverage, safety model and commands](docs/PRICING_V03_TCP.md). The offline processing scripts discover the current PDF from the official calculator page, preserve exact public prices/provenance, compare versions and queue uncertain data. Local SQLite stores immutable source/catalog versions and approved pointers; it is not a Python quotation engine. Daily local schedule generators run independently of Codex once installed by the user. The browser's new catalog card shows status and checks for document changes; hosted checks do not parse/promote prices. Full TCP automatic quoting is a later phase. Public candidate data are under `pricing-studio/catalogs/tcp/`; original PDF/database/runtime logs stay ignored.

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
