import copy
from datetime import datetime, timedelta
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from catalog_updater.models import compare_catalogs, row_id
from catalog_updater.service import CatalogUpdater
from catalog_updater.store import CatalogStore
from catalog_updater.tcp import FetchResult, TCPProvider, PRICING_PAGE, validate_publication
from tcp_synthetic import catalog, source, pdf_bytes, AT, URL


class FictionalProvider:
    provider_id, parser_version = "tcp", "synthetic-1"
    validate_for_publication = staticmethod(validate_publication)

    def __init__(self, content=b"fictional-v1", price="1.00", revision="2026-10-01", mutate=None, failures=0, at=AT):
        self.content, self.price, self.revision = content, price, revision
        self.mutate, self.failures, self.at = mutate, failures, at
        self.parses = self.downloads = 0

    def discover(self):
        self.downloads += 1
        provenance = {**source(self.content, self.revision), "fetchedAt": self.at}
        return FetchResult(provenance["url"], self.content, "application/pdf", self.at), provenance

    def parse(self, content, provenance):
        self.parses += 1
        if self.parses <= self.failures:
            raise ValueError("Synthetic parse failure")
        result = catalog(content, self.price, self.revision)
        result["source"]["fetchedAt"] = provenance["fetchedAt"]
        result["items"][0]["evidence"]["fetchedAt"] = provenance["fetchedAt"]
        if self.mutate:
            self.mutate(result)
        return result


class CatalogUpdateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "catalogs.sqlite3"
        self.store = CatalogStore(self.path)
        self.now = AT
        self.delays = []
        self.updater = CatalogUpdater(self.store, clock=lambda: self.now, sleep=self.delays.append)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def baseline(self):
        state = self.updater.check(FictionalProvider())
        self.assertEqual((state["status"], state["effectiveState"], state["attempts"]), ("UPDATED", "ACTIVE", 1))
        self.assertEqual(state["lastVerifiedAt"], self.now)
        return self.store.last_published("tcp")

    def advance(self, **time):
        self.now = (datetime.fromisoformat(self.now) + timedelta(**time)).isoformat()

    def check_pdf(self, data):
        def fetch(url):
            if url == PRICING_PAGE:
                return FetchResult(url, f'<a href="{URL}">PDF</a>'.encode(), "text/html", self.now)
            return FetchResult(url, data, "application/pdf", self.now)
        return self.updater.check(TCPProvider(fetch))

    def test_initial_pdf_publishes_and_keeps_unavailable_rows(self):
        state = self.check_pdf(pdf_bytes())
        self.assertEqual((state["status"], state["effectiveState"]), ("UPDATED", "ACTIVE"))
        rows = self.store.pin_for_quote("tcp", self.now)["items"]
        self.assertIsNone(rows[2]["amount"])
        self.assertEqual(rows[2]["verification"]["status"], "UNAVAILABLE")
        self.assertEqual(rows[3]["amount"], "0.000000")

    def test_ordinary_change_keeps_old_version_and_quote_snapshot(self):
        old = self.baseline()
        quote = self.store.pin_for_quote("tcp", self.now)
        state = self.updater.check(FictionalProvider(b"fictional-v2", "1.10"))
        self.assertEqual(state["status"], "UPDATED")
        self.assertEqual(state["diffCounts"]["priceChanged"], 1)
        self.assertEqual(self.store.last_published("tcp")["items"][0]["amount"], "1.10")
        self.assertEqual(quote["items"][0]["amount"], "1.00")
        self.assertEqual(self.store.version("tcp", old["versionId"]), old)
        changed = copy.deepcopy(old)
        changed["items"][0]["amount"] = "7.00"
        with self.assertRaisesRegex(ValueError, "Immutable"):
            self.store.save_version(changed)

    def test_large_price_change_needs_two_downloads_and_new_revision(self):
        self.baseline()
        provider = FictionalProvider(b"jump", "100.00", "2026-10-02")
        state = self.updater.check(provider)
        self.assertEqual((state["status"], state["attempts"]), ("UPDATED", 2))
        self.assertEqual((provider.downloads, provider.parses), (2, 2))
        self.assertEqual(self.delays, [1])

    def test_persistent_anomaly_and_failed_check_block_new_quotes_without_renewing(self):
        old = self.baseline()
        self.advance(hours=1)
        for provider, expected in [(FictionalProvider(b"jump", "100.00"), "PENDING_VALIDATION"),
                                   (FictionalProvider(b"failed", failures=3), "CHECK_FAILED")]:
            state = self.updater.check(provider)
            self.assertEqual((state["status"], state["effectiveState"], state["attempts"]), (expected, "PENDING", 3))
            self.assertEqual(state["lastCheckedAt"], self.now)
            self.assertEqual(state["lastVerifiedAt"], AT)
            self.assertEqual(self.store.last_published("tcp"), old)
            self.assertIsNone(self.store.publication("tcp", self.now)["catalog"])
            with self.assertRaises(ValueError):
                self.store.pin_for_quote("tcp", self.now)

    def test_parse_failure_retries_and_recovers_then_unchanged_reverifies(self):
        provider = FictionalProvider(failures=1)
        state = self.updater.check(provider)
        self.assertEqual((state["status"], state["attempts"]), ("UPDATED", 2))
        self.advance(hours=8)
        provider = FictionalProvider(at=self.now)
        state = self.updater.check(provider)
        self.assertEqual(state["status"], "UNCHANGED")
        self.assertEqual(provider.parses, 0)
        self.assertEqual(state["lastVerifiedAt"], self.now)
        self.assertEqual(self.store.last_published("tcp")["source"]["fetchedAt"], AT)
        self.advance(hours=49)
        self.assertEqual(self.store.status("tcp", self.now)["effectiveState"], "STALE")

    def test_ordinary_pdf_price_change_does_not_change_billing_fingerprint(self):
        self.check_pdf(pdf_bytes())
        old = self.store.last_published("tcp")
        state = self.check_pdf(pdf_bytes(revision="02.10.2026", rate="0.120000"))
        self.assertEqual(state["status"], "UPDATED")
        self.assertEqual(self.store.last_published("tcp")["billingRulesHash"], old["billingRulesHash"])
        self.assertEqual(state["diffCounts"]["priceChanged"], 1)

    def test_service_section_billing_rules_detected_even_when_prices_match(self):
        self.check_pdf(pdf_bytes())
        new = pdf_bytes("Minimum billing duration is 600 seconds.", "02.10.2026")
        state = self.check_pdf(new)
        self.assertEqual((state["status"], state["effectiveState"]), ("PENDING_VALIDATION", "PENDING"))
        self.assertIn("BILLING_RULE_CHANGE", state["reasons"])
        self.assertIn("PARSE_DIAGNOSTICS", state["reasons"])
        self.assertEqual(state["diffCounts"]["priceChanged"], 0)
        candidate = self.store.version("tcp", state["candidateVersion"])
        self.assertEqual(candidate["billingRulesPages"], [1])

    def test_unit_sku_provenance_and_missing_valid_rows_fail_closed(self):
        for i, (mutation, expected) in enumerate([
            (lambda c: c["items"][0].update(unit="GiB-month"), "CHECK_FAILED"),
            (lambda c: c["items"][0].update(service="ECS", sku=None), "CHECK_FAILED"),
            (lambda c: c["source"].update(url="https://example.invalid/file.pdf"), "CHECK_FAILED"),
            (lambda c: c["items"][0]["evidence"].update(rawPrice="10"), "CHECK_FAILED"),
            (lambda c: c["items"][0].update(verification={"status": "PENDING_REVIEW", "reasons": ["TIER"]}), "PENDING_VALIDATION"),
            (lambda c: c.update(items=[]), "CHECK_FAILED"),
            (lambda c: c["items"].append(copy.deepcopy(c["items"][0])), "CHECK_FAILED"),
        ]):
            with self.subTest(i=i):
                state = self.updater.check(FictionalProvider(f"bad-{i}".encode(), mutate=mutation))
                self.assertEqual(state["status"], expected)
                self.assertIsNone(state["currentVersion"])
                self.assertIsNone(state["lastVerifiedAt"])

    def test_historical_version_and_older_revision_never_reactivate(self):
        old = self.baseline()
        self.updater.check(FictionalProvider(b"new", "1.10"))
        state = self.updater.check(FictionalProvider())
        self.assertEqual(state["status"], "PENDING_VALIDATION")
        self.assertIn("HISTORICAL_VERSION", state["reasons"])
        self.assertNotEqual(state["currentVersion"], old["versionId"])
        state = self.updater.check(FictionalProvider(b"rollback", "1.10", "2026-09-01"))
        self.assertIn("DOCUMENT_REVISION_ROLLBACK", state["reasons"])

    def test_new_unresolved_document_cannot_reenable_the_old_head(self):
        self.check_pdf(pdf_bytes())
        self.advance(hours=1)
        blocked = self.check_pdf(pdf_bytes("Minimum billing duration is 600 seconds.", "02.10.2026"))
        self.assertEqual(blocked["effectiveState"], "PENDING")
        state = self.check_pdf(pdf_bytes())
        self.assertIn("RETURN_TO_PREVIOUS_DOCUMENT", state["reasons"])
        self.assertEqual(state["lastVerifiedAt"], AT)
        self.assertIsNone(self.store.publication("tcp", self.now)["catalog"])

    def test_concurrent_stale_success_and_failure_cannot_replace_new_decision(self):
        old = self.baseline()
        stale, _, _ = self.store.check_base("tcp")
        self.advance(hours=1)
        newer = CatalogStore(self.path)
        try:
            state = CatalogUpdater(newer, clock=lambda: self.now).check(FictionalProvider(b"newer", "1.10"))
            for result in ("UPDATED", "CHECK_FAILED"):
                self.store.finish_check("tcp", stale, AT, result, {"verifiedAt": AT, "versionId": old["versionId"]}, old)
                self.assertEqual(self.store.status("tcp", self.now), state)
        finally:
            newer.close()

    def test_legacy_head_does_not_gain_verification_from_manual_check(self):
        old = catalog()
        self.store.save_version(old)
        with self.store.db:
            self.store.db.execute("INSERT INTO heads VALUES(?,?)", ("tcp", old["versionId"]))
            self.store.db.execute("INSERT INTO checks(provider,checked_at,result,payload) VALUES(?,?,?,?)", ("tcp", AT, "APPROVED", "{}"))
        state = self.store.status("tcp", self.now)
        self.assertEqual(state["effectiveState"], "PENDING")
        self.assertIsNone(state["lastVerifiedAt"])
        self.assertEqual(self.updater.check(FictionalProvider())["effectiveState"], "ACTIVE")

    def test_diff_recognizes_added_removed_price_and_unit_changes(self):
        old, new = catalog(), catalog()
        new["items"][0].update(amount="1.25", unit="month")
        extra = copy.deepcopy(new["items"][0])
        extra["productLabel"] = "FICTIONAL IP B"
        extra["id"] = row_id(extra)
        new["items"].append(extra)
        diff = compare_catalogs(old, new)
        self.assertEqual([len(diff[k]) for k in ["added", "removed", "priceChanged"]], [1, 0, 1])
        self.assertTrue(any("unit" in r["fields"] for r in diff["rulesChanged"]))

    def test_term_changes_are_billing_rule_changes_even_when_identity_changes(self):
        old, new = catalog(), catalog()
        new["items"][0].update(billingMode="RESERVED", termMonths=12, unit="month")
        new["items"][0]["id"] = row_id(new["items"][0])
        diff = compare_catalogs(old, new)
        self.assertTrue(any("pricingPlans" in change["fields"] for change in diff["rulesChanged"]))
