import copy
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from catalog_updater.models import compare_catalogs, row_id
from catalog_updater.service import CatalogUpdater
from catalog_updater.store import CatalogStore
from catalog_updater.tcp import FetchResult
from tcp_synthetic import catalog, source, AT


class FictionalProvider:
    provider_id, parser_version = "tcp", "synthetic-1"

    def __init__(self, content=b"fictional-v1", price="1.00", revision="2026-10-01", mutate=None, fail=False):
        self.content, self.price, self.revision, self.mutate, self.fail = content, price, revision, mutate, fail
        self.parses = 0

    def discover(self):
        provenance = source(self.content, self.revision)
        return FetchResult(provenance["url"], self.content, "application/pdf", AT), provenance

    def parse(self, content, provenance):
        self.parses += 1
        if self.fail:
            raise ValueError("Synthetic parse failure")
        result = catalog(content, self.price, self.revision)
        if self.mutate: self.mutate(result)
        return result


class CatalogUpdateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = CatalogStore(Path(self.temp.name) / "catalogs.sqlite3")
        self.updater = CatalogUpdater(self.store, clock=lambda: AT)

    def tearDown(self):
        self.store.close(); self.temp.cleanup()

    def baseline(self):
        state = self.updater.check(FictionalProvider())
        self.assertEqual(state["status"], "PENDING_REVIEW")
        self.assertIsNone(state["currentVersion"])
        self.updater.approve("tcp", state["candidateVersion"], "synthetic-reviewer", "Fictional baseline checked")
        return self.store.active("tcp")

    def test_initial_catalog_requires_explicit_manual_baseline(self):
        state = self.updater.check(FictionalProvider())
        self.assertIn("INITIAL_BASELINE_REVIEW", state["reasons"])
        with self.assertRaises(ValueError): self.store.pin_for_quote("tcp")
        with self.assertRaises(ValueError): self.updater.approve("tcp", state["candidateVersion"], "", "")

    def test_ordinary_change_can_promote_without_rewriting_previous_version(self):
        old = self.baseline(); quote = self.store.pin_for_quote("tcp")
        state = self.updater.check(FictionalProvider(b"fictional-v2", "1.10"))
        self.assertEqual(state["status"], "UPDATED")
        self.assertEqual(state["diffCounts"]["priceChanged"], 1)
        self.assertEqual(self.store.active("tcp")["items"][0]["amount"], "1.10")
        self.assertEqual(quote["items"][0]["amount"], "1.00")
        self.assertEqual(self.store.version("tcp", old["versionId"]), old)

    def test_abnormal_change_and_failure_never_replace_active(self):
        old = self.baseline()
        for provider in [FictionalProvider(b"jump", "100.00"), FictionalProvider(b"failed", fail=True)]:
            state = self.updater.check(provider)
            self.assertIn(state["status"], ["PENDING_REVIEW", "CHECK_FAILED"])
            self.assertEqual(self.store.active("tcp"), old)

    def test_units_billing_rules_and_complex_records_require_review(self):
        old = self.baseline()
        for index, mutate in enumerate([lambda c: c["items"][0].update(unit="GiB-month"), lambda c: c.update(billingRulesHash="fictional-new-rule"), lambda c: c["items"][0].update(verification={"status": "PENDING_REVIEW", "reasons": ["TIER_RULE_REVIEW"]})]):
            state = self.updater.check(FictionalProvider(f"rules-{index}".encode(), mutate=mutate))
            self.assertEqual(state["status"], "PENDING_REVIEW")
            self.assertEqual(self.store.active("tcp"), old)

    def test_unchanged_digest_reuses_version_and_retains_check_timestamp(self):
        self.baseline(); provider = FictionalProvider()
        state = self.updater.check(provider)
        self.assertEqual(state["status"], "UNCHANGED")
        self.assertEqual(provider.parses, 0)
        self.assertEqual(state["lastCheckedAt"], AT)

    def test_diff_recognizes_added_removed_price_and_unit_changes(self):
        old = catalog(); new = copy.deepcopy(old)
        new["items"][0].update(amount="1.25", unit="month")
        extra = copy.deepcopy(new["items"][0]); extra["productLabel"] = "FICTIONAL IP B"; extra["id"] = row_id(extra)
        new["items"].append(extra)
        diff = compare_catalogs(old, new)
        self.assertEqual([len(diff[k]) for k in ["added", "removed", "priceChanged"]], [1, 0, 1])
        self.assertTrue(any("unit" in r["fields"] for r in diff["rulesChanged"]))
        self.assertEqual(len(compare_catalogs(new, old)["removed"]), 1)
        same = copy.deepcopy(old); same["items"][0]["amount"] = "1.000"
        self.assertFalse(compare_catalogs(old, same)["priceChanged"])

    def test_revision_rollback_and_stale_promotion_are_blocked(self):
        old = self.baseline()
        state = self.updater.check(FictionalProvider(b"older", "1.01", "2026-09-01"))
        self.assertIn("DOCUMENT_REVISION_ROLLBACK", state["reasons"])
        with self.assertRaises(ValueError): self.store.promote("tcp", old["versionId"], "stale-head", "synthetic", "test", AT)
        self.assertEqual(self.store.active("tcp"), old)

    def test_immutable_versions_and_pending_flags_survive_manual_approval(self):
        old = self.baseline(); changed = copy.deepcopy(old); changed["items"][0]["amount"] = "5.00"
        with self.assertRaises(ValueError): self.store.save_version(changed)
        def pending(c): c["items"][0]["verification"] = {"status": "PENDING_REVIEW", "reasons": ["MERGED_CELL_REVIEW"]}
        state = self.updater.check(FictionalProvider(b"pending", "1.10", mutate=pending))
        self.updater.approve("tcp", state["candidateVersion"], "synthetic-reviewer", "Approve design, retaining unavailable rows")
        self.assertEqual(self.store.active("tcp")["items"][0]["verification"]["status"], "PENDING_REVIEW")

    def test_duplicate_and_empty_catalog_fail_closed(self):
        self.baseline()
        for mutation in [lambda c: c["items"].append(copy.deepcopy(c["items"][0])), lambda c: c.update(items=[])]:
            state = self.updater.check(FictionalProvider(str(id(mutation)).encode(), mutate=mutation))
            self.assertEqual(state["status"], "CHECK_FAILED")
            self.assertIsNotNone(self.store.active("tcp"))

    def test_unapproved_successive_versions_are_also_diffed(self):
        self.updater.check(FictionalProvider())
        state=self.updater.check(FictionalProvider(b'next-draft','1.10'))
        self.assertEqual(state['diffCounts']['priceChanged'],1);self.assertEqual(state['diffCounts']['added'],0)
        self.assertIsNone(state['currentVersion'])

    def test_term_changes_are_billing_rule_changes_even_when_identity_changes(self):
        a=catalog();b=copy.deepcopy(a)
        b['items'][0].update(billingMode='RESERVED',termMonths=12,unit='month');b['items'][0]['id']=row_id(b['items'][0])
        diff=compare_catalogs(a,b);self.assertTrue(any('pricingPlans' in change['fields'] for change in diff['rulesChanged']))

    def test_old_catalog_cannot_be_approved_over_a_newer_candidate(self):
        old=self.baseline();self.updater.check(FictionalProvider(b'new-candidate','1.10'))
        with self.assertRaisesRegex(ValueError,'latest parsed candidate'):
            self.updater.approve('tcp',old['versionId'],'synthetic-reviewer','Stale approval attempt')
