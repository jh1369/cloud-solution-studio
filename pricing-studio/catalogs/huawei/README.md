# Huawei Cloud EU-Dublin supplemental price database

`index.json` identifies immutable reference snapshots and their SHA-256 digests.
The `2026-11-24.1` snapshot contains the public list prices supplied by the owner
on 24 November 2026: **160 configurations/meters and 419 price observations**.
It is available for catalog lookup and later price reconciliation.

| Service | Configurations/meters | Included information |
| --- | ---: | --- |
| ECS | 82 | X1 and aC8, including the two explicitly labelled physical aC8 rows; original hourly/monthly/yearly rates |
| DDS | 41 | General-purpose / Enhanced II; mongos, shard and config kept separate |
| DDS storage | 2 | Cluster shard/config storage, three billing modes |
| EVS | 4 | High I/O, Ultra-high I/O, General Purpose SSD and Extreme SSD |
| OBS | 30 | Standard/IA/Archive storage, requests and the traffic entries visible in the screenshot |
| SFS | 1 | Previous-generation SFS Turbo Standard, hourly and monthly rates |

## Query and validation

From `pricing-studio/web`:

```bash
python3.12 scripts/supplemental_huawei_catalog.py validate
python3.12 scripts/supplemental_huawei_catalog.py lookup --service ECS --sku x1.4u.8g
python3.12 scripts/supplemental_huawei_catalog.py lookup --service DDS --node-role shard
```

The lookup returns the reference status and source metadata with the records.
Amounts are exact decimal strings. Each price has a billing mode, quantity unit,
quantity scale and a source cell/table locator. Source-file hashes establish
which supplied evidence was transcribed; the input documents and images are not
part of this database.

## Price meaning

- OBS Standard single-AZ is **USD 0.0210/GB-month**, billed pay per use. A monthly
  metering unit does not make it a monthly subscription. Do not multiply that
  amount by hours.
- EVS uses the screenshot's **GiB** units. Its High I/O monthly price is 0.0475
  and GPSSD is 0.104. The snapshot records four differences from the previous
  API-verified catalog without replacing that catalog's evidence.
- X1's supplied independent yearly rates are preserved, for example 4u/8g is
  68.33 monthly and 501.07 yearly. No monthly-to-annual multiplier is applied.
- DDS mongos is a router and must not substitute for shard/config pricing.
  The table does not establish node-to-billable-unit or replica equivalence.
  Supplied yearly amounts are retained even where they differ from a simple
  multiple of the monthly rate, such as Enhanced II shard 8u/32g.
- SFS Standard is 0.00013699/GB-hour or 0.09/GB-month. No annual price was supplied.
- `FREE` is an explicit zero; `NOT_LISTED` preserves a slash in the screenshot
  and is not zero or proof of regional unavailability. Free traffic entries
  preserve the displayed scope without inventing a quantity unit.

## Verification and runtime boundary

This is **user-supplied public list-price reference data**, not an independently
API-verified price catalog. `receivedOn` records receipt, not official
verification or an effective price date. Product IDs, OS/license variants,
regional stock and missing billing-unit semantics are not inferred.

The production Web/Worker and offline quotation engine continue to use
`pricing-studio/web/public/catalog.json` and its official-source, per-mode
inquiry, unit and expiry checks. This reference database does **not** replace
that file, extend its timestamps or bypass its validation. Promoting references
to automatic quotes requires matching official product identities, independent
inquiry evidence and support for the relevant service meter.

This change is a database revision, not a new Web/offline application release.
The deployed application and existing offline release remain at 0.3.19-dev.
