"""Fetch, verify and publish immutable price catalogs without an approval step."""
from datetime import datetime, timezone
from decimal import Decimal
import time
from .models import compare_catalogs, validate_catalog, canonical, digest

MAX_ATTEMPTS = 3
PRICE_CHANGE_ANOMALY = "PRICE_CHANGE_ANOMALY"


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def publication_reasons(active, previous, candidate, diff):
    reasons = []
    if any(candidate["source"]["revisionDate"] < baseline["source"]["revisionDate"]
           for baseline in (active, previous) if baseline):
        reasons.append("DOCUMENT_REVISION_ROLLBACK")
    if any(d.get("severity") == "error" for d in candidate.get("diagnostics", [])):
        reasons.append("PARSE_DIAGNOSTICS")
    if not any(row["verification"]["status"] == "AUTO_VALIDATED" for row in candidate["items"]):
        reasons.append("NO_VALIDATED_PRICES")
    if diff["removed"]:
        reasons.append("SKU_REMOVAL")
    if any(set(change["fields"]) - {"availability", "verification"} for change in diff["rulesChanged"]):
        reasons.append("BILLING_RULE_CHANGE")
    if active and Decimal(len(diff["added"])) / len(active["items"]) > Decimal("0.10"):
        reasons.append("SKU_COUNT_ANOMALY")
    validated_ids = {row["id"] for row in candidate["items"] if row["verification"]["status"] == "AUTO_VALIDATED"}
    for change in diff["priceChanged"]:
        if change["id"] not in validated_ids:
            continue
        a, b = change["before"], change["after"]
        # A row becoming unavailable or invalid may publish as Pending. It has no usable rate.
        if b is None:
            continue
        if a is None or Decimal(a) == 0 or abs(Decimal(b) - Decimal(a)) / Decimal(a) > Decimal("0.20"):
            reasons.append(PRICE_CHANGE_ANOMALY)
    return sorted(set(reasons))


class CatalogUpdater:
    def __init__(self, store, clock=utc_now, sleep=time.sleep):
        self.store, self.clock, self.sleep = store, clock, sleep

    def check(self, provider):
        provider_id = provider.provider_id
        sequence, head, previous = self.store.check_base(provider_id)
        corroboration = None
        observed_documents = set()
        for attempt in range(1, MAX_ATTEMPTS + 1):
            if attempt > 1:
                self.sleep(attempt - 1)
            checked_at = self.clock()
            candidate = None
            payload = {"attempts": attempt}
            try:
                fetched, source = provider.discover()
                payload["source"] = source
                if (fetched.url, fetched.fetched_at) != (source["url"], source["fetchedAt"]):
                    raise ValueError("Retrieval evidence differs from fetched document")
                self.store.save_document(provider_id, source, fetched.body)
                observed_documents.add(source["sha256"])
                existing = self.store.for_document(provider_id, source["sha256"], provider.parser_version)
                if existing and attempt == 1:
                    parsed = existing
                else:
                    # Keep the first retrieval time in immutable provenance, including on reparse.
                    retained = existing["source"] if existing else source
                    parsed = validate_catalog(provider.parse(fetched.body, retained))
                    if existing and canonical(parsed) != canonical(existing):
                        raise ValueError("Repeated parsing differs from immutable catalog")
                if parsed["provider"] != provider_id or parsed["parserVersion"] != provider.parser_version:
                    raise ValueError("Unexpected provider or parser version")
                provider.validate_for_publication(parsed, source, self.clock())
                candidate = parsed
                # Compare the old source with the same parser after a parser upgrade.
                active = self.comparable_head(provider, head, candidate)
                diff = compare_catalogs(active, candidate)
                reasons = publication_reasons(active, previous, candidate, diff)
                if len(observed_documents) > 1:
                    reasons.append("SOURCE_CHANGED_DURING_RECHECK")
                if head and previous and source["sha256"] == head["source"]["sha256"] != previous["source"]["sha256"]:
                    reasons.append("RETURN_TO_PREVIOUS_DOCUMENT")
                if head and head["source"]["sha256"] != source["sha256"] and self.store.was_published(provider_id, source["sha256"]):
                    reasons.append("HISTORICAL_VERSION")
                # A price-only anomaly may publish after a second independent official download
                # and identical reparse, with a newer document revision.
                if reasons == [PRICE_CHANGE_ANOMALY] and active:
                    evidence = (source["url"], source["sha256"], digest(diff))
                    if evidence == corroboration and candidate["source"]["revisionDate"] > active["source"]["revisionDate"]:
                        reasons = []
                        payload["priceRecheck"] = "CONFIRMED"
                    corroboration = evidence
                else:
                    corroboration = None
                payload.update(versionId=candidate["versionId"], source=candidate["source"], retrieval=source,
                               coverage=candidate.get("coverage"), diff=compare_catalogs(previous or active, candidate),
                               reasons=reasons)
                result = "PENDING_VALIDATION" if reasons else (
                    "UNCHANGED" if head and head["versionId"] == candidate["versionId"] else "UPDATED")
            except Exception as error:
                corroboration = None
                result = "CHECK_FAILED"
                payload.update(reasons=["FETCH_OR_VALIDATION_FAILED"], errorType=type(error).__name__, message=str(error)[:500])
            if result in {"UPDATED", "UNCHANGED"}:
                break
        finished_at = self.clock()
        if result in {"UPDATED", "UNCHANGED"}:
            payload["verifiedAt"] = finished_at
        self.store.finish_check(provider_id, sequence, checked_at, result, payload, candidate)
        return self.store.status(provider_id, now=finished_at)

    def comparable_head(self, provider, head, candidate):
        if not head or head["parserVersion"] == candidate["parserVersion"]:
            return head
        if head["source"]["sha256"] == candidate["source"]["sha256"]:
            return candidate
        content = self.store.document(provider.provider_id, head["source"]["sha256"])
        if content is None:
            raise ValueError("Prior PDF is missing for parser migration")
        return validate_catalog(provider.parse(content, head["source"]))
