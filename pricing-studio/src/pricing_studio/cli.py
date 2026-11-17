"""Synthetic AWS CSV importer and cautious product-family mapping starter.

This intentionally does not fetch or invent actual prices.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path

MAPPINGS = {
    "EC2": "ECS",
    "EBS": "EVS",
    "S3": "OBS",
    "RDS MySQL": "RDS for MySQL",
    "ElastiCache Redis": "DCS for Redis",
    "MSK Kafka": "DMS for Kafka",
    "ALB": "ELB",
    "EKS": "CCE",
}

REQUIRED = {"aws_service", "aws_sku", "aws_region", "quantity", "usage_hours"}


def parse_and_map(source: Path) -> list[dict]:
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError(f"Required columns missing: {sorted(REQUIRED - set(reader.fieldnames or []))}")
        results = []
        for line_num, row in enumerate(reader, start=2):
            service = row["aws_service"].strip()
            try:
                quantity = float(row["quantity"])
                hours = float(row["usage_hours"])
                if quantity < 0 or hours < 0:
                    raise ValueError("negative value")
            except ValueError as exc:
                raise ValueError(f"Row {line_num}: invalid quantity/usage_hours") from exc
            mapped = MAPPINGS.get(service)
            results.append({
                "line": line_num,
                "source": {"service": service, "sku": row["aws_sku"], "region": row["aws_region"], "quantity": quantity, "usage_hours": hours},
                "target": {"provider": "Huawei Cloud Public", "region": "eu-west-101", "product_family": mapped},
                "mapping_status": "PRODUCT_FAMILY_ONLY" if mapped else "PENDING_REVIEW",
                "sku_status": "PENDING_REVIEW",
                "public_list_price": None,
                "price_status": "PENDING_REVIEW",
                "estimate_status": "NOT_AVAILABLE",
            })
        return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Cloud Solution Studio Pricing Studio (safe starter)")
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output", type=Path, default=Path("mapped.json"))
    args = parser.parse_args()
    output = {"warning": "No official price has been obtained or verified. This is not a quotation.", "items": parse_and_map(args.input_csv)}
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(output['items'])} mapped items to {args.output}")

if __name__ == "__main__":
    main()
