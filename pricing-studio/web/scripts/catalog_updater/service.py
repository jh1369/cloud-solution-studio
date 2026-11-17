"""Generic update orchestration and a conservative automatic-promotion policy."""
from datetime import datetime, timezone
from decimal import Decimal
from .models import compare_catalogs, validate_catalog, canonical


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def review_reasons(previous, candidate, diff, max_price_change=Decimal("0.20"), max_added_fraction=Decimal("0.10")):
    reasons = []
    if not previous:
        reasons.append("INITIAL_BASELINE_REVIEW")
    elif candidate["source"]["revisionDate"] < previous["source"]["revisionDate"]:
        reasons.append("DOCUMENT_REVISION_ROLLBACK")
    if candidate.get("diagnostics") and (not previous or canonical(candidate["diagnostics"]) != canonical(previous.get("diagnostics", []))):
        reasons.append("PARSE_DIAGNOSTICS_REVIEW")
    if diff["removed"]:
        reasons.append("SKU_REMOVAL_REVIEW")
    if diff["rulesChanged"]:
        reasons.append("BILLING_RULE_REVIEW")
    if previous and Decimal(len(diff["added"])) / max(len(previous["items"]), 1) > max_added_fraction:
        reasons.append("SKU_COUNT_ANOMALY")
    affected = {r["id"] for r in diff["added"]} | {r["id"] for r in diff["priceChanged"]}
    if any(r["id"] in affected and r["verification"]["status"] == "PENDING_REVIEW" for r in candidate["items"]):
        reasons.append("COMPLEX_PRICE_REVIEW")
    for change in diff["priceChanged"]:
        a, b = change["before"], change["after"]
        if a is None or b is None or Decimal(a) == 0 or abs(Decimal(b) - Decimal(a)) / Decimal(a) > max_price_change:
            reasons.append("PRICE_CHANGE_ANOMALY")
    return sorted(set(reasons))


class CatalogUpdater:
    def __init__(self, store, clock=utc_now):
        self.store, self.clock = store, clock

    def check(self, provider):
        at, payload = self.clock(), {}
        try:
            fetched, source = provider.discover()
            payload["source"] = source
            self.store.save_document(provider.provider_id, source, fetched.body)
            existing = self.store.for_document(provider.provider_id, source["sha256"], provider.parser_version)
            active = self.store.active(provider.provider_id)
            if existing:
                payload.update(versionId=existing["versionId"], coverage=existing.get("coverage"), source={**source, "revisionDate": existing["source"]["revisionDate"], "documentVersion": existing["source"]["documentVersion"]})
                result = "UNCHANGED" if active and active["versionId"] == existing["versionId"] else "PENDING_REVIEW"
                payload["reasons"] = [] if result == "UNCHANGED" else ["EXISTING_CANDIDATE_OR_ROLLBACK_REVIEW"]
            else:
                candidate = validate_catalog(provider.parse(fetched.body, source))
                if candidate["provider"] != provider.provider_id or candidate["parserVersion"] != provider.parser_version or candidate["source"]["sha256"] != source["sha256"]:
                    raise ValueError("Provider result differs from retrieved document contract")
                previous = self.store.latest(provider.provider_id)
                diff = compare_catalogs(previous, candidate)
                approval_diff = compare_catalogs(active, candidate)
                reasons = sorted(set(review_reasons(active, candidate, approval_diff) + (review_reasons(previous, candidate, diff) if previous else [])))
                self.store.save_version(candidate)
                payload.update(versionId=candidate["versionId"], source=candidate["source"], diff=diff, approvalBaseVersion=active["versionId"] if active else None, comparisonBaseVersion=previous["versionId"] if previous else None, coverage=candidate.get("coverage"), reasons=reasons)
                result = "PENDING_REVIEW" if reasons else "UPDATED"
                if not reasons:
                    try:
                        self.store.promote(provider.provider_id, candidate["versionId"], active["versionId"] if active else None, "automatic-validation", "Ordinary validated change within configured policy", at)
                    except ValueError:
                        result = "PENDING_REVIEW"
                        payload["reasons"] = ["CONCURRENT_HEAD_CHANGE_REVIEW"]
        except Exception as error:
            result = "CHECK_FAILED"
            payload.update(reasons=["FETCH_OR_PARSE_FAILED"], errorType=type(error).__name__, message=str(error)[:500])
        self.store.record_check(provider.provider_id, self.clock(), result, payload)
        return self.store.status(provider.provider_id)

    def approve(self, provider_id, version, reviewer, reason):
        if not reviewer.strip() or not reason.strip():
            raise ValueError("Explicit reviewer and reason are required")
        catalog = validate_catalog(self.store.version(provider_id, version))
        latest = self.store.latest(provider_id)
        if not latest or latest["versionId"] != version:
            raise ValueError("Only the latest parsed candidate can be approved; historical snapshots stay immutable")
        if any(d.get("severity") == "error" for d in catalog.get("diagnostics", [])):
            raise ValueError("Unresolved parse diagnostics prohibit promotion")
        active = self.store.active(provider_id)
        self.store.promote(provider_id, version, active["versionId"] if active else None, reviewer, reason, self.clock())
        # Approval does not clear any row-level Pending/complex-rule flags.
        self.store.record_check(provider_id, self.clock(), "APPROVED", {"versionId": version, "source": catalog["source"], "coverage": catalog.get("coverage"), "reasons": ["ROW_PENDING_FLAGS_RETAINED"]})
        return self.store.status(provider_id)
