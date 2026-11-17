"""Provider-neutral version and row contracts, exact price parsing and diffing."""
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from datetime import datetime, date
from typing import Protocol

SCHEMA_VERSION = 1


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value).encode()).hexdigest()


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00ad", "")).strip()


def amount(value):
    raw = clean(value)
    if re.fullmatch(r"n\s*\.\s*a\s*\.?|[-–—]", raw, re.I):
        return None, "UNAVAILABLE"
    if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", raw):
        return None, "PRICE_PARSE_REVIEW"
    try:
        value = Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None, "PRICE_PARSE_REVIEW"
    if not value.is_finite() or not 0 <= value <= Decimal("1e12"):
        return None, "PRICE_PARSE_REVIEW"
    return format(value, "f"), None


def row_id(row):
    # Units, amounts and rules are deliberately outside identity, so changes are diffable.
    identity = {k: row.get(k) for k in ("provider", "service", "region", "productLabel", "sku", "specification", "billingMode", "termMonths", "tierIndex")}
    return "price-" + digest(identity)[:32]


def validate_catalog(catalog):
    if not isinstance(catalog, dict):
        raise ValueError("Catalog is missing")
    if catalog.get("schemaVersion") != SCHEMA_VERSION or not catalog.get("provider"):
        raise ValueError("Unsupported catalog contract")
    source = catalog.get("source", {})
    if not re.fullmatch(r"[a-f0-9]{64}", source.get("sha256", "")) or not source.get("url") or not source.get("fetchedAt"):
        raise ValueError("Catalog source evidence missing")
    date.fromisoformat(source["revisionDate"])
    datetime.fromisoformat(source["fetchedAt"])
    if not catalog.get("versionId") or not catalog.get("items"):
        raise ValueError("Empty catalog is never promotable")
    ids = set()
    for row in catalog["items"]:
        if row.get("id") in ids or row.get("id") != row_id(row):
            raise ValueError("Duplicate or invalid price identity")
        ids.add(row["id"])
        if row.get("provider") != catalog["provider"] or row.get("verification", {}).get("status") not in {"AUTO_VALIDATED", "PENDING_REVIEW", "UNAVAILABLE"}:
            raise ValueError("Invalid price verification")
        if row.get("amount") is not None and amount(row["amount"])[1]:
            raise ValueError("Invalid decimal price")
        if row["verification"]["status"] == "AUTO_VALIDATED" and (row.get("amount") is None or not row.get("unit") or not row.get("region")):
            raise ValueError("Incomplete price cannot be validated")
        if row["verification"]["status"] == "AUTO_VALIDATED" and row["verification"].get("reasons"):
            raise ValueError("Review flags cannot be marked automatically validated")
        if not row.get("evidence", {}).get("pages"):
            raise ValueError("Page provenance missing")
    return catalog


def compare_catalogs(before, after):
    old = {r["id"]: r for r in before.get("items", [])} if before else {}
    new = {r["id"]: r for r in after["items"]}
    diff = {"added": [], "removed": [], "priceChanged": [], "rulesChanged": []}
    for key in sorted(new.keys() - old.keys()):
        diff["added"].append(new[key])
    for key in sorted(old.keys() - new.keys()):
        diff["removed"].append(old[key])
    for key in sorted(old.keys() & new.keys()):
        a, b = old[key], new[key]
        if a.get("amount") != b.get("amount"):
            # Formatting 0.10 -> 0.100 is not a price change.
            if a.get("amount") is None or b.get("amount") is None or Decimal(a["amount"]) != Decimal(b["amount"]):
                diff["priceChanged"].append({"id": key, "before": a.get("amount"), "after": b.get("amount")})
        fields = ("unit", "currency", "tier", "rules", "availability", "verification")
        changed = [name for name in fields if a.get(name) != b.get(name)]
        if changed:
            diff["rulesChanged"].append({"id": key, "fields": changed, "before": {f: a.get(f) for f in changed}, "after": {f: b.get(f) for f in changed}})
    if before and before.get("billingRulesHash") != after.get("billingRulesHash"):
        diff["rulesChanged"].append({"id": "DOCUMENT_BILLING_RULES", "fields": ["billingRulesHash"], "before": before.get("billingRulesHash"), "after": after.get("billingRulesHash")})
    def plans(rows):
        grouped = {}
        for row in rows:
            key = digest({k: row.get(k) for k in ("provider", "service", "region", "productLabel", "sku", "specification")})
            grouped.setdefault(key, set()).add(canonical({k: row.get(k) for k in ("billingMode", "termMonths", "unit", "tier")}))
        return grouped
    a, b = plans(old.values()), plans(new.values())
    for key in sorted(a.keys() & b.keys()):
        if a[key] != b[key]:
            diff["rulesChanged"].append({"id": "plans-" + key, "fields": ["pricingPlans"], "before": sorted(a[key]), "after": sorted(b[key])})
    return diff


class PricingProviderAdapter(Protocol):
    provider_id: str
    parser_version: str

    def discover(self): ...

    def parse(self, content: bytes, source: dict) -> dict: ...
