"""Offline artifact checks. These are NOT real-browser/file:// acceptance."""
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("offline", Path(__file__).parents[1] / "scripts/build_offline.py")
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.external, self.scripts, self.current = [], [], None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.current = [attrs, ""]
            if "src" in attrs:
                self.external.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.external.append(attrs.get("href"))

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append(self.current)
            self.current = None

    def handle_data(self, value):
        if self.current is not None:
            self.current[1] += value


class OfflinePackageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.html, cls.archive = offline.build(Path(cls.temp.name))
        cls.page = Page(cls.html.read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_one_html_has_no_external_runtime_or_module_scripts(self):
        self.assertEqual(self.page.external, [])
        self.assertEqual(len(self.page.scripts), 5)
        self.assertFalse(any(attrs.get("type") == "module" for attrs, _ in self.page.scripts))
        html = self.html.read_text()
        self.assertIn("connect-src 'none'", html)
        self.assertIn('id="offline-date"', html)
        self.assertNotIn('id="download-offline"', html)
        self.assertIn("Live price refresh unavailable offline", html)

    def test_every_embedded_classic_script_parses_without_module_loader(self):
        for attrs, source in self.page.scripts:
            if attrs.get("type") == "application/json":
                continue
            result = subprocess.run(["node", "--check"], input=source, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr[:1000])

    def test_original_prices_evidence_and_expiry_are_not_reverified_by_packaging(self):
        embedded = next(source for attrs, source in self.page.scripts if attrs.get("id") == "offline-catalog")
        self.assertEqual(json.loads(embedded), json.loads((offline.ROOT / "public/catalog.json").read_text()))
        self.assertEqual(json.loads(embedded)["ttlDays"], 7)

    def test_zip_is_allowlisted_and_checksums_match_actual_files(self):
        with zipfile.ZipFile(self.archive) as archive:
            self.assertEqual(set(archive.namelist()), {offline.HTML_NAME, "READ-ME.txt", "THIRD_PARTY_NOTICES.md", "aws-fictional-mvp.csv", "MANIFEST.json"})
            manifest = json.loads(archive.read("MANIFEST.json"))
            self.assertEqual(manifest["entry"], offline.HTML_NAME)
            for name, checksum in manifest["sha256"].items():
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), checksum)
            self.assertEqual(archive.read(offline.HTML_NAME), self.html.read_bytes())
            self.assertIn("S3,Standard", archive.read("aws-fictional-mvp.csv").decode())
        with self.assertRaises(ValueError):
            offline.classic_source("import dangerous from './unsupported.mjs';")
