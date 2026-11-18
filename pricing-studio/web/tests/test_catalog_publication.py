"""Test the online publisher without a cloud account or live prices."""
from contextlib import redirect_stdout
import io
from importlib.util import find_spec
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from tcp_publication_fixture import PublicationFixture
from tcp_synthetic import pdf_bytes
from catalog_updater.models import digest
from catalog_updater.publication import STATE_KEY, S3PublicationStorage, StoredObject


class CatalogPublicationTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.fixture = PublicationFixture(Path(directory.name) / "prices.sqlite3")
        self.addCleanup(self.fixture.store.close)
        self.storage = self.fixture.storage

    def current(self):
        return json.loads(self.storage.objects[STATE_KEY].body)

    def test_first_publication_then_unchanged_reuses_immutable_bytes(self):
        first = self.fixture.publish()
        reference = first["catalog"]
        key = f'tcp/catalogs/{reference["sha256"]}.json'
        stored = self.storage.objects[key]
        self.assertEqual([k for k, _ in self.storage.writes], [STATE_KEY, key, STATE_KEY])
        self.assertEqual(self.storage.writes[0][1]["phase"], "CHECKING")
        self.assertEqual(self.current(), first)
        self.assertEqual(first["currentVersion"], reference["versionId"])
        self.assertEqual((reference["sha256"], reference["size"]), (digest(stored.body), len(stored.body)))
        local = self.fixture.store.publication("tcp", self.fixture.time)["catalog"]
        self.assertEqual(json.loads(stored.body)["items"],
                         [row for row in local["items"] if row["verification"]["status"] == "AUTO_VALIDATED"])
        self.assertEqual(len(local["items"]), 4)
        self.assertEqual(len(json.loads(stored.body)["items"]), 3)
        self.fixture.advance(hours=1)
        second = self.fixture.publish()
        self.assertEqual((second["status"], second["effectiveState"]), ("UNCHANGED", "ACTIVE"))
        self.assertEqual(second["catalog"], reference)
        self.assertEqual(second["lastVerifiedAt"], self.fixture.time)
        self.assertEqual(self.storage.objects[key], stored)
        self.assertEqual([k for k, _ in self.storage.writes].count(key), 1)

    def test_check_failure_replaces_active_pointer_without_reverifying_or_destroying_history(self):
        first = self.fixture.publish()
        snapshot = self.fixture.store.pin_for_quote("tcp", self.fixture.time)
        self.fixture.advance(hours=1)
        failed = self.fixture.publish(failure=True)
        self.assertEqual((failed["status"], failed["effectiveState"], failed["catalog"]),
                         ("CHECK_FAILED", "PENDING", None))
        self.assertEqual(failed["lastVerifiedAt"], first["lastVerifiedAt"])
        self.assertEqual(failed["currentVersion"], snapshot["catalogVersion"])
        self.assertEqual(self.current(), failed)
        self.assertEqual(len(self.storage.objects), 2)

    def test_interrupted_final_update_leaves_pending_and_retries(self):
        first = self.fixture.publish()
        self.fixture.advance(hours=1)

        def interrupt_decision(key, body):
            if key == STATE_KEY and json.loads(body)["phase"] == "DECISION":
                raise OSError("Fictional interruption before pointer commit")

        self.storage.before_put = interrupt_decision
        changed = pdf_bytes(revision="02.10.2026", rate="0.112000")
        with self.assertRaisesRegex(OSError, "interruption"):
            self.fixture.publish(changed)
        self.assertEqual((self.current()["phase"], self.current()["effectiveState"], self.current()["catalog"]),
                         ("CHECKING", "PENDING", None))
        self.assertEqual(len(self.storage.objects), 3)
        self.storage.before_put = lambda key, body: None
        recovered = self.fixture.publish(changed)
        self.assertEqual(recovered["effectiveState"], "ACTIVE")
        self.assertNotEqual(recovered["currentVersion"], first["currentVersion"])
        self.assertEqual(len(self.storage.objects), 3)
        old = json.loads(self.storage.objects[f'tcp/catalogs/{first["catalog"]["sha256"]}.json'].body)
        self.assertEqual(old["items"][0]["amount"], "0.111000")

    def test_cannot_publish_when_immutable_readback_is_corrupt(self):
        first = self.fixture.publish()
        key = f'tcp/catalogs/{first["catalog"]["sha256"]}.json'
        stored = self.storage.objects[key]
        self.storage.objects[key] = StoredObject(b"{}", stored.etag)
        with self.assertRaisesRegex(ValueError, "Immutable TCP catalog"):
            self.fixture.publish()
        self.assertEqual(self.current()["phase"], "CHECKING")
        self.assertIsNone(self.current()["catalog"])
        self.assertEqual(self.storage.objects[key].body, b"{}")

    def test_delayed_writer_cannot_overwrite_concurrent_pending_decision(self):
        self.fixture.publish()
        original = self.current()
        self.fixture.advance(hours=1)
        newer = {}

        def race(key, body):
            if key != STATE_KEY or json.loads(body)["phase"] != "DECISION":
                return
            self.storage.before_put = lambda key, body: None
            self.fixture.advance(hours=1)
            newer.update(self.fixture.publish(failure=True))

        self.storage.before_put = race
        result = self.fixture.publish()
        self.assertEqual(result, {"status": "SUPERSEDED", "sequence": original["sequence"] + 1})
        self.assertEqual(self.current(), newer)
        self.assertEqual(newer["effectiveState"], "PENDING")
        self.assertIsNone(newer["catalog"])

    def test_older_database_cannot_replace_the_remote_guard(self):
        self.fixture.publish()
        with TemporaryDirectory() as directory:
            older = PublicationFixture(Path(directory) / "older.sqlite3")
            self.addCleanup(older.store.close)
            older.storage = self.storage
            with self.assertRaisesRegex(ValueError, "Remote TCP state is ahead"):
                older.publish()
        self.assertEqual(self.current()["effectiveState"], "ACTIVE")


@unittest.skipUnless(find_spec("boto3"), "Install requirements-publication.txt for the S3 adapter test")
class S3PublicationStorageTest(unittest.TestCase):
    def test_cli_uses_configured_destination_and_closes_client(self):
        from catalog_update import main

        with TemporaryDirectory() as directory:
            path = Path(directory) / "prices.sqlite3"
            fixture = PublicationFixture(path)
            fixture.store.close()
            output = io.StringIO()
            client = Mock()
            with (patch("boto3.client", return_value=client) as connect,
                  patch("catalog_updater.publication.S3PublicationStorage", return_value=fixture.storage),
                  patch("catalog_update.TCPProvider", return_value=fixture.provider()),
                  redirect_stdout(output)):
                result = main(["publish", "--database", str(path), "--bucket", "fictional-bucket",
                               "--endpoint-url", "https://storage.example"])
            self.assertEqual(result, 0)
            self.assertEqual(connect.call_args.kwargs["endpoint_url"], "https://storage.example")
            client.close.assert_called_once_with()
            self.assertEqual(json.loads(output.getvalue())["effectiveState"], "ACTIVE")

    def test_s3_reads_bounded_bytes_and_writes_create_or_compare_etag(self):
        import boto3
        from botocore.response import StreamingBody
        from botocore.stub import Stubber

        client = boto3.client("s3", region_name="eu-central-1", endpoint_url="https://storage.example",
                              aws_access_key_id="fictional", aws_secret_access_key="fictional")
        adapter = S3PublicationStorage(client, "fictional-bucket")
        address = {"Bucket": "fictional-bucket", "Key": STATE_KEY}
        body = {"Body": b"{}", "ContentType": "application/json", "CacheControl": "no-store"}
        with Stubber(client) as stub:
            stub.add_client_error("get_object", "NoSuchKey", http_status_code=404, expected_params=address)
            stub.add_response("put_object", {}, {**address, **body, "IfNoneMatch": "*"})
            stub.add_response("get_object", {
                "ContentLength": 2, "ETag": '"one"', "Body": StreamingBody(io.BytesIO(b"{}"), 2),
            }, address)
            stub.add_client_error("put_object", "PreconditionFailed", http_status_code=412,
                                  expected_params={**address, **body, "IfMatch": '"one"'})
            self.assertIsNone(adapter.get(STATE_KEY, 10))
            self.assertTrue(adapter.put(STATE_KEY, b"{}", None))
            self.assertEqual(adapter.get(STATE_KEY, 10), StoredObject(b"{}", '"one"'))
            self.assertFalse(adapter.put(STATE_KEY, b"{}", '"one"'))
            stub.assert_no_pending_responses()
        client.close()
