"""Fictional PDF, SQLite updater and conditional object storage for integration tests."""
from base64 import b64encode
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from catalog_updater.models import digest
from catalog_updater.publication import StoredObject, publish_to_storage
from catalog_updater.service import CatalogUpdater
from catalog_updater.store import CatalogStore
from catalog_updater.tcp import FetchResult, PRICING_PAGE, TCPProvider
from tcp_synthetic import AT, URL, pdf_bytes


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        self.writes = []
        self.before_put = lambda key, body: None

    def get(self, key, limit):
        item = self.objects.get(key)
        if item and len(item.body) > limit:
            raise ValueError("Fictional object exceeds limit")
        return item

    def put(self, key, body, expected_etag):
        self.before_put(key, body)
        current = self.objects.get(key)
        if (current.etag if current else None) != expected_etag:
            return False
        self.objects[key] = StoredObject(body, digest(body))
        self.writes.append((key, json.loads(body)))
        return True


class PublicationFixture:
    def __init__(self, path):
        self.store = CatalogStore(path)
        self.storage = MemoryStorage()
        self.time = AT
        self.updater = CatalogUpdater(self.store, clock=lambda: self.time, sleep=lambda _: None)

    def advance(self, **duration):
        self.time = (datetime.fromisoformat(self.time) + timedelta(**duration)).isoformat()

    def publish(self, data=None, *, failure=False):
        return publish_to_storage(self.store, self.updater, self.provider(data, failure=failure),
                                  self.storage, lambda: self.time)

    def provider(self, data=None, *, failure=False):
        if data is None:
            data = pdf_bytes()

        def fetch(url):
            if url == PRICING_PAGE:
                return FetchResult(url, f'<a href="{URL}">PDF</a>'.encode(), "text/html", self.time)
            if failure:
                raise OSError("Fictional source unavailable")
            return FetchResult(url, data, "application/pdf", self.time)

        return TCPProvider(fetch)


if __name__ == "__main__":
    with TemporaryDirectory() as directory:
        fixture = PublicationFixture(Path(directory) / "prices.sqlite3")
        fixture.publish()
        print(json.dumps({"now": fixture.time, "pdf": b64encode(pdf_bytes()).decode(), "objects": {
            key: {"text": item.body.decode(), "etag": item.etag}
            for key, item in fixture.storage.objects.items()
        }}))
        fixture.store.close()
