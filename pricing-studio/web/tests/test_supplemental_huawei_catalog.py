"""Public reference-data checks and fictional invalid-record counterexamples."""
import copy
from decimal import Decimal
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "supplemental", Path(__file__).parents[1] / "scripts/supplemental_huawei_catalog.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SupplementalHuaweiCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        [cls.catalog] = module.load_references()

    def item(self, identifier):
        return next(item for item in self.catalog["items"] if item["id"] == identifier)

    def test_complete_transcription_and_provenance(self):
        summary = module.validate_catalog(self.catalog)
        self.assertEqual(summary["byService"], {"ECS": 82, "DDS": 41, "DDS_STORAGE": 2, "EVS": 4, "OBS": 30, "SFS": 1})
        self.assertEqual((summary["items"], summary["prices"]), (160, 419))
        self.assertEqual(len(self.catalog["sources"]), 4)
        self.assertIsNone(self.catalog["priceEffectiveOn"])

    def test_supplied_x1_annual_is_not_monthly_times_ten(self):
        prices = {price["billingMode"]: price["amount"] for price in self.item("ecs:x1.4u.8g")["prices"]}
        self.assertEqual(prices, {"ONDEMAND": "0.13", "MONTHLY": "68.33", "YEARLY": "501.07"})
        self.assertNotEqual(Decimal(prices["YEARLY"]), Decimal(prices["MONTHLY"]) * 10)

    def test_ac8_large_and_physical_rows_are_preserved(self):
        item = self.item("ecs:ac8.96xlarge.4.physical")
        self.assertEqual((item["vcpus"], item["memoryGB"], item["physical"]), (384, 1536, True))
        self.assertEqual(item["prices"][1]["amount"], "8153.95")

    def test_dds_roles_and_independent_term_values(self):
        mongos = self.item("dds:general-purpose:mongos:4u16g")
        shard = self.item("dds:general-purpose:shard:4u16g")
        self.assertEqual(mongos["prices"][1]["amount"], "102.6")
        self.assertEqual(shard["prices"][1]["amount"], "307.793")
        enhanced = self.item("dds:enhanced-ii:shard:8u32g")
        self.assertEqual(enhanced["prices"][2]["amount"], "4397")
        self.assertEqual(enhanced["quantityBasis"], "source-listed-billing-unit")
        self.assertEqual(self.item("dds-storage:shard")["prices"][1]["amount"], "0.72")

    def test_evs_corrected_rates_and_gib_units(self):
        self.assertEqual(self.item("evs:SAS")["prices"][1]["amount"], "0.0475")
        self.assertEqual(self.item("evs:GPSSD")["prices"][1]["amount"], "0.104")
        self.assertEqual(self.item("evs:SAS")["prices"][0]["quantityUnit"], "GiB-hour")
        self.assertEqual(len(self.catalog["comparisons"]), 4)

    def test_obs_monthly_meter_remains_pay_per_use(self):
        [price] = self.item("obs:stored-single-az:standard")["prices"]
        self.assertEqual((price["billingMode"], price["quantityUnit"], price["amount"]), ("ONDEMAND", "GB-month", "0.0210"))
        self.assertEqual(self.item("obs:request-read:standard")["prices"][0]["perQuantity"], 10000)
        self.assertEqual(self.item("obs:request-write:standard")["prices"][0]["amount"], "0.0050")

    def test_free_unlisted_and_unspecified_units_are_distinct(self):
        missing = self.item("obs:stored-multi-az:standard")["prices"][0]
        self.assertEqual((missing["status"], missing["amount"]), ("NOT_LISTED", None))
        free = self.item("obs:traffic-obs-to-ecs:standard")["prices"][0]
        self.assertEqual((free["status"], free["amount"], free["quantityUnit"]), ("FREE", "0", "not-specified"))

    def test_sfs_has_no_fabricated_annual_rate(self):
        item = self.item("sfs:turbo:previous-generation:standard")
        self.assertEqual([(price["billingMode"], price["amount"]) for price in item["prices"]], [("ONDEMAND", "0.00013699"), ("MONTHLY", "0.09")])

    def test_malformed_reference_cannot_claim_official_verification(self):
        for changes in [{"officialApiVerified": True}, {"productionEligible": True}, {"officialVerifiedAt": "2026-11-24T00:00:00Z"}]:
            bad = copy.deepcopy(self.catalog)
            bad["verification"].update(changes)
            with self.assertRaises(ValueError):
                module.validate_catalog(bad)

    def test_invalid_rates_duplicates_and_units_are_rejected(self):
        for value in [-1, True, "NaN", "Infinity", "-1", "1e3", "1000000000001"]:
            bad = copy.deepcopy(self.catalog)
            bad["items"][0]["prices"][0]["amount"] = value
            with self.assertRaises(ValueError):
                module.validate_catalog(bad)
        bad = copy.deepcopy(self.catalog)
        bad["items"].append(copy.deepcopy(bad["items"][0]))
        with self.assertRaises(ValueError):
            module.validate_catalog(bad)
        bad = copy.deepcopy(self.catalog)
        bad["items"][0]["prices"][0]["quantityUnit"] = "GB-month"
        with self.assertRaises(ValueError):
            module.validate_catalog(bad)


if __name__ == "__main__":
    unittest.main()
