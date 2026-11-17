# Instructions for coding agents

Work only on generic non-sensitive code, synthetic sample data and publicly verifiable product documentation. Never read paths outside the approved repository or seek customer files, company-internal PPTs, credentials or private pricing tables. Do not upload or commit any confidential content. Do not create remote network connections unless explicitly approved for a defined public documentation or official price API endpoint.

Priority: Pricing Studio V0.1, AWS -> Huawei Cloud Public, region `eu-west-101`. Separate 1) vendor mapping; 2) SKU validation; 3) price source and retrieval; 4) cost calculation; 5) output formatting. Explicitly mark unknown SKU mappings and prices as `PENDING_REVIEW`, never fabricate values. Use only fictitious test data.

If a feature needs access to local confidential files, create an abstract interface and document how a separately executed local component would supply approved input. Do not implement any behavior that exfiltrates files.
