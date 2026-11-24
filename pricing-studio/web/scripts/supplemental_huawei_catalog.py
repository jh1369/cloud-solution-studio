"""Validate/query user-supplied public list prices, without official-price promotion."""
import argparse
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2] / "catalogs/huawei"
MODES = {"ONDEMAND", "MONTHLY", "YEARLY"}
SERVICES = {"ECS", "DDS", "DDS_STORAGE", "EVS", "OBS", "SFS"}
DECIMAL = re.compile(r"(?:0|[1-9]\d*)(?:\.\d+)?\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_catalog(data):
    require(isinstance(data, dict) and data.get("schemaVersion") == 1, "Unsupported schema")
    require(data.get("region") == "eu-west-101" and data.get("currency") == "USD", "Expected EU-Dublin/USD")
    require(data.get("provider") == "Huawei Cloud", "Unexpected provider")
    date.fromisoformat(data["receivedOn"])
    require(data.get("priceEffectiveOn") is None, "Receipt does not establish effective date")
    require(data.get("verification") == {
        "status": "USER_SUPPLIED_REFERENCE", "officialApiVerified": False,
        "officialVerifiedAt": None, "productionEligible": False,
    }, "Reference prices must not claim official API verification")
    sources = data.get("sources")
    require(isinstance(sources, list) and sources, "Missing provenance")
    source_ids = set()
    for source in sources:
        require(isinstance(source, dict) and source.get("id") not in source_ids, "Duplicate/invalid source")
        source_ids.add(source["id"])
        require(isinstance(source.get("title"), str) and source["title"], "Missing source title")
        require(re.fullmatch(r"[a-f0-9]{64}", source.get("sha256", "")), "Missing source fingerprint")
        require(source.get("priceEffectiveOn") is None, "Unestablished source effective date")
        date.fromisoformat(source["receivedOn"])
    items = data.get("items")
    require(isinstance(items, list) and items, "Empty reference catalog")
    ids = set()
    for item in items:
        require(isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"] not in ids, "Duplicate/invalid item")
        ids.add(item["id"])
        service = item.get("service")
        require(service in SERVICES, "Unsupported service")
        require(not {"verifiedAt", "productId", "officialWebsiteAmount", "evidence"}.intersection(item), "Official evidence must not be fabricated")
        if service in {"ECS", "DDS"}:
            require(type(item.get("vcpus")) is int and item["vcpus"] > 0, "Invalid vCPU")
            require(type(item.get("memoryGB")) is int and item["memoryGB"] > 0, "Invalid memory")
        if service == "ECS":
            require(isinstance(item.get("sku"), str) and item["sku"].startswith(("x1.", "ac8.")), "Unrecognized supplied ECS series")
        if service in {"DDS", "DDS_STORAGE"}:
            require(item.get("instanceType") == "Cluster" and item.get("nodeRole") in {"mongos", "shard", "config"}, "DDS node role is required")
        if service == "DDS":
            require(item.get("instanceClass") in {"General-purpose", "Enhanced II"}, "Unknown DDS class")
            require(item.get("quantityBasis") == "source-listed-billing-unit", "DDS replica equivalence is not established")
        prices = item.get("prices")
        require(isinstance(prices, list) and prices, "Missing prices")
        modes = set()
        for price in prices:
            require(isinstance(price, dict), "Invalid price")
            mode, status = price.get("billingMode"), price.get("status")
            require(mode in MODES and mode not in modes, "Duplicate/invalid billing mode")
            modes.add(mode)
            require(price.get("currency") == "USD", "Invalid price currency")
            require(type(price.get("perQuantity")) is int and price["perQuantity"] > 0, "Invalid quantity scale")
            require(price.get("sourceId") in source_ids and isinstance(price.get("locator"), str) and price["locator"], "Missing cell/row provenance")
            require(status in {"LISTED", "FREE", "NOT_LISTED"}, "Invalid price status")
            value = price.get("amount")
            if status == "NOT_LISTED":
                require(value is None, "Unlisted is not zero")
            else:
                require(isinstance(value, str) and DECIMAL.fullmatch(value), "Use exact nonnegative decimal strings")
                try:
                    rate = Decimal(value)
                except InvalidOperation as exc:
                    raise ValueError("Invalid decimal") from exc
                require(rate.is_finite() and rate <= Decimal("1e12"), "Invalid price range")
                require((rate == 0) == (status == "FREE"), "Zero must be explicitly free")
            unit = price.get("quantityUnit")
            suffix = {"ONDEMAND": "hour", "MONTHLY": "month", "YEARLY": "year"}[mode]
            expected = {"ECS": f"instance-{suffix}", "DDS": f"source-unit-{suffix}",
                        "DDS_STORAGE": f"GB-{suffix}", "EVS": f"GiB-{suffix}", "SFS": f"GB-{suffix}"}
            if service == "OBS":
                require(mode == "ONDEMAND" and unit in {"GB-month", "request", "not-specified"}, "OBS meter is not a subscription")
                if unit == "not-specified":
                    require(status in {"FREE", "NOT_LISTED"}, "Paid price requires its quantity unit")
            else:
                require(unit == expected[service] and price["perQuantity"] == 1, "Inconsistent price unit")
    return {
        "revision": data["revision"], "items": len(items),
        "prices": sum(len(item["prices"]) for item in items),
        "byService": dict(Counter(item["service"] for item in items)),
        "byStatus": dict(Counter(price["status"] for item in items for price in item["prices"])),
        "officialApiVerified": False, "productionEligible": False,
    }


def load_references(root=ROOT):
    root = Path(root).resolve()
    index = json.loads((root / "index.json").read_text())
    require(index.get("schemaVersion") == 1, "Unsupported index")
    result = []
    seen = set()
    for entry in index.get("catalogs", []):
        require(entry.get("revision") not in seen, "Duplicate revision")
        seen.add(entry["revision"])
        path = (root / entry["path"]).resolve()
        require(path.is_relative_to(root), "Catalog path escapes reference directory")
        raw = path.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == entry["sha256"], "Reference digest mismatch")
        data = json.loads(raw)
        summary = validate_catalog(data)
        require(all(entry.get(k) == summary[k] for k in ["revision", "items", "prices", "productionEligible"]), "Index/catalog mismatch")
        require(entry.get("region") == data["region"] and entry.get("currency") == data["currency"]
                and entry.get("receivedOn") == data["receivedOn"] and entry.get("status") == "USER_SUPPLIED_REFERENCE", "Index provenance mismatch")
        result.append(data)
    require(result, "No reference catalogs")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "lookup"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--service", choices=sorted(SERVICES))
    parser.add_argument("--sku")
    parser.add_argument("--node-role", choices=["mongos", "shard", "config"])
    args = parser.parse_args()
    catalogs = load_references(args.root)
    if args.command == "validate":
        output = [validate_catalog(catalog) for catalog in catalogs]
    else:
        output = [dict(revision=catalog["revision"], region=catalog["region"],
                       verification=catalog["verification"], sources=catalog["sources"],
                       items=[item for item in catalog["items"]
                              if (not args.service or item["service"] == args.service)
                              and (not args.sku or item.get("sku") == args.sku)
                              and (not args.node_role or item.get("nodeRole") == args.node_role)])
                  for catalog in catalogs]
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
