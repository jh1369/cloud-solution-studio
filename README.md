# Cloud Solution Studio

Local-first toolkit for cloud solution architects: pricing automation, presentation generation, interactive web demos, and (later) live cloud demos.

## Security boundary

This GitHub repository contains **only generic source code, public documentation links and synthetic sample data**. Never commit or upload internal Huawei materials, customer documents, real quotations, personal data, credentials, customer architectures, or internal configuration.

Confidential data stays on the local workstation **outside** the Git repository. Sending information to an external AI requires prior sanitization and approval. A private GitHub repository is still an external platform; repository privacy does not permit uploading internal data.

See [SECURITY.md](SECURITY.md) and [AGENTS.md](AGENTS.md).

## Workstreams

| Module | Scope | Status |
|---|---|---|
| Pricing Studio | AWS -> Huawei Cloud Public service mapping and list-price quotation (EU Dublin) | **V0.1 first** |
| PPT Studio | Local template and slide reuse | Planned |
| Web Demo Studio | Browser-based interactive mock demos | Planned |
| Cloud Live Lab | Read-only cloud API demo, isolated test accounts | Planned |

## Pricing Studio V0.1

Initial scope: accept *synthetic* AWS-style CSV, classify service mapping, and flag all prices as **pending** unless supported by an independently verified price record. Do not invent prices.

Run the currently included starter mapping CLI:

```bash
cd pricing-studio
python -m pip install -e .
pricing-studio sample_data/aws_usage_example.csv --output mapped.json
python -m unittest discover -s tests -v
```

The CLI is only an initial product mapping scaffold, **not a customer-ready quotation tool**. Future versions will add verified Huawei Cloud SKU matching, official price adapter, a review queue and a five-sheet Excel quotation export.

## Development workflow

1. Discuss general requirements and publicly documented service capabilities in ChatGPT.
2. Give Codex access only to approved generic source code and synthetic tests in this repository.
3. Process customer files and internal templates using a separate, access-controlled local runtime.
4. Validate mappings, price sources and all assumptions before presenting a quotation.

See [docs/ROADMAP.md](docs/ROADMAP.md).
