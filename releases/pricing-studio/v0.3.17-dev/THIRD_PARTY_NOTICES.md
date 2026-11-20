# Vendored browser dependencies

This synchronization preserves the exact vendored distributions used by the deployed V0.1.1 app. Their existing copyright/license headers are retained. These are source dependencies served locally by the app, not remote scripts loaded at runtime.

| Dependency | Version | License | Original distribution |
| --- | --- | --- | --- |
| SheetJS Community Edition | 0.20.3 | Apache-2.0 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js |
| Mozilla PDF.js | 3.11.174 | Apache-2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js |
| Mozilla PDF.js worker | 3.11.174 | Apache-2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js |

SHA-256 values for the distributions are included in `SOURCE_PROVENANCE.json`. Review and test dependency updates as separate changes. PDF parsing sets `isEvalSupported: false`; no general OCR or unbounded document parser is claimed.

Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0
