import unittest
from pathlib import Path
from pricing_studio.cli import parse_and_map

HERE = Path(__file__).resolve().parents[1]

class MappingTests(unittest.TestCase):
    def test_synthetic_input_has_no_unverified_prices(self):
        rows = parse_and_map(HERE / "sample_data" / "aws_usage_example.csv")
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[0]["target"]["product_family"], "ECS")
        self.assertTrue(all(row["public_list_price"] is None for row in rows))
        self.assertTrue(all(row["price_status"] == "PENDING_REVIEW" for row in rows))

if __name__ == "__main__":
    unittest.main()
