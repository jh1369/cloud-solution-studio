"""Fictional adapter responses; no network requests or real quote inputs."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("catalog", Path(__file__).parents[1] / "scripts/build_catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


def plan(mode="ONDEMAND", size=False):
    return dict(id="SYNTHETIC", productId="SYNTHETIC", sku="GPSSD" if size else "synthetic.vm",
                billingMode=mode, service="EVS" if size else "ECS", size=size,
                cloudServiceType="fictional.service", resourceType="fictional.resource", usageFactor="Duration")


class CatalogAdapterTest(unittest.TestCase):
    def test_public_nat_uses_calculator_day_measure_and_preserves_billing_source(self):
        nat = dict(resourceSpecCode="natgateway_small", resourceType="hws.resource.type.natgateway",
                   cloudServiceType="hws.service.type.natgateway", productSpecSysDesc="Type:small",
                   planList=[dict(billingMode="ONDEMAND", productId="SYNTHETIC", amount=2.5,
                                  usageFactor="duration", measureUnit=0)])
        product_info = {"urlPath": "nat", "region": catalog.REGION, "product": {"natgateway_natgateway": [nat]}}
        with patch.object(catalog, "fetch", return_value=product_info):
            [daily] = catalog.get("nat")
        self.assertEqual(daily["unit"], "day")

        def respond(url, payload):
            self.assertEqual(payload["productInfos"][0]["usageMeasureId"], 0)
            self.assertEqual(payload["productInfos"][0]["usageValue"], 1)
            return {"currency": "USD", "productRatingResult": [dict(id="0", productId="SYNTHETIC", officialWebsiteAmount=2.5)]}

        with patch.object(catalog, "fetch", side_effect=respond):
            [verified] = catalog.verify([daily])
        self.assertEqual(verified["evidence"]["billingSource"], catalog.PUBLIC_NAT_DAILY)

    def test_independent_contract_requests_and_amounts(self):
        for mode, rate, period in [("ONDEMAND", .125, None), ("MONTHLY", 37, 2), ("YEARLY", 333, 3)]:
            with self.subTest(mode=mode):
                def response(url, payload):
                    self.assertEqual(url, catalog.BASE + catalog.INQUIRY)
                    self.assertEqual(payload["chargingMode"], 1 if period is None else 0)
                    self.assertEqual(payload.get("periodType"), period)
                    self.assertEqual(payload.get("periodNum"), None if period is None else 1)
                    self.assertEqual(payload["productInfos"][0]["productNum"], 1)
                    return {"currency": "USD", "productRatingResult": [{"id": "0", "productId": "SYNTHETIC", "officialWebsiteAmount": rate}]}
                with patch.object(catalog, "fetch", side_effect=response):
                    self.assertEqual(catalog.verify([plan(mode)])[0]["rate"], rate)

    def test_duplicate_or_noncanonical_response_ids_are_rejected(self):
        quote = dict(id="0", productId="SYNTHETIC", officialWebsiteAmount=.125)
        for quotes in [[quote, quote], [dict(quote, id="00")], [dict(quote, id="-1")], [dict(quote, id="9")]]:
            with patch.object(catalog, "fetch", return_value={"currency": "USD", "productRatingResult": quotes}):
                self.assertEqual(catalog.verify([plan()]), [])

    def test_invalid_price_or_identity_is_never_verified(self):
        for rate in [True, -1, float("nan"), float("inf"), "0.125", 1e13]:
            with patch.object(catalog, "fetch", return_value={"currency": "USD", "productRatingResult": [dict(id="0", productId="SYNTHETIC", officialWebsiteAmount=rate)]}):
                self.assertEqual(catalog.verify([plan()]), [])
        with patch.object(catalog, "fetch", return_value={"currency": "EUR", "productRatingResult": []}):
            with self.assertRaises(ValueError):
                catalog.verify([plan()])

    def test_storage_inquiry_is_one_gb_not_full_resource_usage(self):
        def response(url, payload):
            product = payload["productInfos"][0]
            self.assertEqual(product["resourceSize"], 1)
            self.assertEqual(product["resouceSizeMeasureId"], 17)
            self.assertEqual(product["usageValue"], 1)
            return {"currency": "USD", "productRatingResult": []}
        with patch.object(catalog, "fetch", side_effect=response):
            self.assertEqual(catalog.verify([plan(size=True)]), [])
