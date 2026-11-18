"""Fetch, validate and publish official public price catalogs."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit
from catalog_updater.models import digest
from catalog_updater.service import CatalogUpdater, utc_now
from catalog_updater.store import CatalogStore
from catalog_updater.tcp import TCPProvider, official_url

ROOT = Path(__file__).resolve().parents[1]


def publish(args, store, updater):
    from catalog_updater.publication import S3PublicationStorage, publish_to_storage

    endpoint = urlsplit(args.endpoint_url)
    if (endpoint.scheme != "https" or not endpoint.hostname or endpoint.username is not None
            or endpoint.password is not None or endpoint.query or endpoint.fragment or endpoint.path not in {"", "/"}):
        raise ValueError("Publication requires an HTTPS object-storage endpoint")
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError:
        raise ValueError("Install requirements-publication.txt to use publish") from None

    config = Config(connect_timeout=5, read_timeout=20, retries={"mode": "standard", "total_max_attempts": 3},
                    request_checksum_calculation="when_required", response_checksum_validation="when_required",
                    s3={"addressing_style": "path"})
    try:
        with closing(boto3.client("s3", endpoint_url=args.endpoint_url, region_name=args.region, config=config)) as client:
            storage = S3PublicationStorage(client, args.bucket)
            return publish_to_storage(store, updater, TCPProvider(), storage)
    except (BotoCoreError, ClientError):
        raise OSError("TCP object-storage request failed") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "status", "parse", "export", "publication", "publish", "schedule"])
    parser.add_argument("--scheduler", choices=["cron", "systemd", "windows"])
    parser.add_argument("--provider", choices=["tcp"], default="tcp")
    parser.add_argument("--database", type=Path, default=ROOT / "outputs/catalogs/catalogs.sqlite3")
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--source-url")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--version")
    parser.add_argument("--bucket")
    parser.add_argument("--endpoint-url")
    parser.add_argument("--region", default="auto", help="Object-storage region (auto for R2)")
    args = parser.parse_args(argv)
    if args.command == "publication" and not args.output:
        parser.error("publication requires --output <path>")
    if args.command == "publish" and not (args.bucket and args.endpoint_url):
        parser.error("publish requires --bucket and --endpoint-url")
    if args.command == "schedule":
        from catalog_updater.schedule import render_schedule
        if not args.scheduler or not args.output:
            parser.error("schedule requires --scheduler --output <directory>")
        definitions = render_schedule(args.scheduler, ROOT, sys.executable)
        args.output.mkdir(parents=True, exist_ok=True)
        for name, value in definitions.items():
            (args.output / name).write_text(value)
        print(json.dumps({"scheduler": args.scheduler, "installed": False, "files": [str(args.output / name) for name in definitions]}))
        return 0
    if args.command == "parse":
        if not args.pdf or not args.source_url or not args.output:
            parser.error("parse requires --pdf --source-url --output")
        data = args.pdf.read_bytes()
        source = {"url": official_url(args.source_url), "sha256": digest(data), "fetchedAt": utc_now(), "retrieval": "OPERATOR_SUPPLIED_PUBLIC_DOCUMENT"}
        result = TCPProvider().parse(data, source)
        # A local file's hash is not proof that it was downloaded from the official site.
        result["source"]["retrieval"] = "OPERATOR_SUPPLIED_REQUIRES_SOURCE_REVIEW"
        for row in result["items"]:
            if row["verification"]["status"] != "UNAVAILABLE":
                row["verification"]["status"] = "PENDING_REVIEW"
                row["verification"]["reasons"].append("LOCAL_SOURCE_REVIEW")
    else:
        store = CatalogStore(args.database)
        try:
            updater = CatalogUpdater(store)
            if args.command == "check":
                result = updater.check(TCPProvider())
            elif args.command == "publish":
                result = publish(args, store, updater)
            elif args.command == "publication":
                result = store.publication(args.provider)
            elif args.command == "export":
                result = store.version(args.provider, args.version) if args.version else store.publication(args.provider)["catalog"]
                if result is None:
                    raise ValueError("No requested/effective catalog exists")
            else:
                result = store.status(args.provider)
        finally:
            store.close()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output.parent, delete=False) as handle:
                temporary = Path(handle.name)
                json.dump(result, handle, ensure_ascii=False, indent=2)
            temporary.replace(args.output)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    summary = result["state"] if args.command == "publication" else {k: v for k, v in result.items() if k != "items"}
    print(json.dumps(summary, ensure_ascii=False))
    return 2 if result.get("status") == "CHECK_FAILED" else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(json.dumps({"status": "FAILED", "error": str(error)[:500]}), file=sys.stderr)
        raise SystemExit(2)
