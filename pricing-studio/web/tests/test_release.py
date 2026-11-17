"""Versioned, immutable offline delivery checks; no Git or network writes."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import release_offline as release


class OfflineReleaseTest(unittest.TestCase):
    def test_version_and_source_fingerprints_match_the_delivery(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = release.archive_release(Path(temp) / ("v" + release.VERSION))
            manifest = json.loads((folder / "MANIFEST.json").read_text())
            self.assertEqual(manifest["version"], release.VERSION)
            self.assertEqual(manifest["entry"], release.HTML_NAME)
            self.assertIn(f'V{release.VERSION}</span>', (folder / release.HTML_NAME).read_text())
            for name, checksum in manifest["sha256"].items():
                self.assertEqual(hashlib.sha256((folder / name).read_bytes()).hexdigest(), checksum)
            for name, checksum in manifest["sourceSHA256"].items():
                self.assertEqual(hashlib.sha256((release.ROOT / name).read_bytes()).hexdigest(), checksum)
            self.assertTrue((folder / release.ZIP_NAME).exists())

    def test_repeated_builds_are_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = release.archive_release(Path(temp) / "version")
            before = {p.name: p.read_bytes() for p in folder.iterdir()}
            release.archive_release(folder)
            self.assertEqual(before, {p.name: p.read_bytes() for p in folder.iterdir()})

    def test_existing_version_is_never_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = release.archive_release(Path(temp) / "version")
            archive = folder / release.ZIP_NAME
            archive.write_bytes(b"fictional changed archive")
            with self.assertRaisesRegex(ValueError, "bump package version"):
                release.archive_release(folder)
            self.assertEqual(archive.read_bytes(), b"fictional changed archive")
