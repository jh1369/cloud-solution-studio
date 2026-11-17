import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from catalog_updater.models import amount, validate_catalog
from catalog_updater.tcp import TCPProvider, column_plan, discover_pdf, official_url, parse_table, reconcile_duplicates
from tcp_synthetic import source, pdf_bytes


class TCPPDFTest(unittest.TestCase):
    def table(self, rows, service="EVS", page=1):
        return {"page": page, "index": 0, "service": service, "rows": rows}

    def test_price_zero_is_distinct_from_na_and_invalid(self):
        self.assertEqual(amount("0.000000"), ("0.000000", None))
        for value in ["n.a.", "n. a.", "N.A."]:
            self.assertEqual(amount(value), (None, "UNAVAILABLE"))
        for value in ["-1", "NaN", "Infinity", "0.1*", "1,20.00", ""]:
            self.assertEqual(amount(value)[1], "PRICE_PARSE_REVIEW")
        self.assertEqual(amount("1,234.56")[0], "1234.56")

    def test_independent_modes_units_and_regions(self):
        for header, mode, months, unit in [("EU-DE Open Elastic in Euro/hour", "OPEN_ELASTIC", None, "hour"), ("EU-NL Reserved 12 months in euro/month", "RESERVED", 12, "month"), ("EU-DE Reserved 24 months in euro/month", "RESERVED", 24, "month"), ("EU-NL Reserved Upfront 24 months in euro", "RESERVED_UPFRONT", 24, "term")]:
            plan = column_plan(header, "")
            self.assertEqual((plan["billingMode"], plan["termMonths"], plan["unit"]), (mode, months, unit))
        self.assertEqual(column_plan("price EU-\nDE in Euro", "GiB/month")["unit"], "GiB-month")

    def test_official_link_discovery_is_hash_path_independent(self):
        for path in ["/_Resources/new/hash/ServiceDescription.pdf", "/other/current-service-description.pdf"]:
            self.assertEqual(discover_pdf(f'<a href="{path}">Service description</a>'), "https://www.t-cloud-public.com" + path)
        self.assertEqual(discover_pdf('<a href="/current-service-description.pdf">A</a><a href="/current-service-description.pdf">B</a>'), "https://www.t-cloud-public.com/current-service-description.pdf")
        for html in ["<p>no PDF</p>", '<a href="/a-service-description.pdf">A</a><a href="/b-service-description.pdf">B</a>', '<a href="https://evil.example/service-description.pdf">x</a>']:
            with self.assertRaises(ValueError): discover_pdf(html)
        for url in ["http://www.t-cloud-public.com/x.pdf", "https://127.0.0.1/x.pdf", "https://u:p@www.t-cloud-public.com/x.pdf"]:
            with self.assertRaises(ValueError): official_url(url)

    def test_merged_cells_and_cross_page_rows_stay_pending(self):
        headers = ["Name", "vCPU", "GiB RAM", "Operating System", "EU-DE Open Elastic in Euro/hour"]
        first = self.table([headers, ["synth.large.2", "2", "4", "Linux", "1.00"], [None, None, None, "Windows", "2.00"]], "ECS")
        rows, _, carry = parse_table(first, source())
        self.assertEqual(rows[0]["verification"]["status"], "AUTO_VALIDATED")
        self.assertIn("MERGED_CELL_REVIEW", rows[1]["verification"]["reasons"])
        second = self.table([headers, [None, None, None, "Other OS", "3.00"]], "ECS", 2)
        rows, _, _ = parse_table(second, source(), carry)
        self.assertIn("CROSS_PAGE_REVIEW", rows[0]["verification"]["reasons"])
        self.assertEqual(rows[0]["evidence"]["pages"], [1, 2])

    def test_tiers_and_mismatched_price_cells_are_review_only(self):
        headers = ["Name", "charging unit", "Tier", "price EU-DE in Euro", "price EU-NL in Euro"]
        table = self.table([headers, ["FICTIONAL OBS", "GiB/month", "0 to 5\n6 to 100", "0.000000\n0.123000", "n.a."]], "OBS")
        rows, _, _ = parse_table(table, source())
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["amount"], "0.000000")
        self.assertEqual(rows[0]["verification"]["status"], "PENDING_REVIEW")
        self.assertEqual(rows[2]["verification"]["status"], "UNAVAILABLE")
        table["rows"][1][3] = "0.123"
        rows, _, _ = parse_table(table, source())
        self.assertIn("TIER_ALIGNMENT_REVIEW", rows[0]["verification"]["reasons"])

    def test_duplicates_preserve_all_occurrences_without_a_valid_price(self):
        rows, _, _ = parse_table(self.table([["Name", "charging unit", "price EU-DE in Euro"], ["FICTIONAL volume", "GiB/month", ".1"]]), source())
        rows[0]["amount"] = "0.10"
        other = copy.deepcopy(rows[0]); other["amount"] = "0.20"
        merged, diagnostics = reconcile_duplicates([rows[0], other])
        self.assertEqual(len(merged), 1); self.assertIsNone(merged[0]["amount"])
        self.assertEqual(merged[0]["verification"]["status"], "PENDING_REVIEW")
        self.assertEqual(len(merged[0]["evidence"]["occurrences"]), 2)
        self.assertTrue(diagnostics)

    def test_actual_fictional_pdf_to_catalog_includes_page_and_source(self):
        data = pdf_bytes(); result = TCPProvider().parse(data, source(data))
        validate_catalog(result)
        self.assertEqual(len(result["items"]), 4)
        self.assertEqual(result["source"]["revisionDate"], "2026-10-01")
        self.assertEqual(result["items"][0]["amount"], "0.111000")
        self.assertEqual(result["items"][2]["verification"]["status"], "UNAVAILABLE")
        self.assertEqual(result["items"][3]["amount"], "0.000000")
        self.assertEqual(result["items"][0]["evidence"]["pages"], [1])

    def test_missing_columns_are_reported_instead_of_silently_discarded(self):
        table=self.table([["Name","charging unit","price EU-DE in Euro"],["FICTIONAL volume","h"]])
        rows,error,_=parse_table(table,source());self.assertEqual(rows,[]);self.assertEqual(error['reasons'],['ROW_WIDTH_REVIEW'])
