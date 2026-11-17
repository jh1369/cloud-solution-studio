# TCP public catalog candidates

`tcp-2026-10-09-c88c0aff01e08ade-tcp-pdf-0.3.0-1/` contains the structured public-PDF result (`catalog.candidate.json.gz`) and its coverage/source manifest. Decompress with Python's `gzip` and parse as JSON. This is a **candidate, not an approved quotation catalog**; no real TCP baseline was approved by the agent.

Every record retains observed price, independent region/mode/term/unit/tier, official URL, full document SHA-256, revision/retrieval time and PDF page/row/column. Unavailable cells are null, not zero; review flags survive version approval. Source-validated records cannot be quoted without catalog approval and a current successful check. The current browser quote form remains Huawei-only.

The original public PDF, SQLite state and runtime logs are retained locally under ignored outputs, not published here. Only extracted public price facts and provenance are included. See `docs/PRICING_V03_TCP.md` at the repository root for limitations and review workflow.
