"""Local public catalog CLI. No quotation calculations or cloud credentials."""
import argparse
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from catalog_updater.models import digest
from catalog_updater.service import CatalogUpdater, utc_now
from catalog_updater.store import CatalogStore
from catalog_updater.tcp import TCPProvider, official_url

ROOT = Path(__file__).resolve().parents[1]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "status", "parse", "export", "publication", "schedule"])
    parser.add_argument("--scheduler", choices=["cron", "systemd", "windows"])
    parser.add_argument("--provider", choices=["tcp"], default="tcp")
    parser.add_argument("--database", type=Path, default=ROOT / "outputs/catalogs/catalogs.sqlite3")
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--source-url")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--version")
    args = parser.parse_args(argv)
    if args.command == "publication" and not args.output:
        parser.error("publication requires --output <path>")
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
