"""Archive a versioned offline delivery; no Git, network, deployment or credentials."""
import json
from pathlib import Path
import shutil
import tempfile
from build_offline import ROOT, VERSION, HTML_NAME, ZIP_NAME, build


def archive_release(destination=None):
    destination = Path(destination) if destination is not None else ROOT.parents[1] / "releases/pricing-studio" / ("v" + VERSION)
    with tempfile.TemporaryDirectory() as temporary:
        staged = Path(temporary)
        build(staged)
        manifest = json.loads((staged / "MANIFEST.json").read_text())
        (staged / "README.md").write_text(f"""# Pricing Studio {VERSION} — offline package

Download [{ZIP_NAME}]({ZIP_NAME}?raw=true), unzip, then open `{HTML_NAME}` in modern Chrome/Edge/Firefox. No install, server or sign-in. Share the downloaded ZIP/HTML with colleagues.

下载 ZIP，解压后双击 HTML；可直接把 ZIP 或 HTML 分享给同事，无需安装或账号。此版本为候选版，完整浏览器验收仍未完成。

Official public-price snapshot: `{manifest['catalogueVerifiedAt']}`. Each rate keeps its original seven-day validity. Expired/missing/unconfirmed items remain Pending. Offline live refresh is unavailable; packaging never renews prices. No customer information or credentials included.

`MANIFEST.json` records exact version, source fingerprints and artifact checksums. This directory is immutable: a changed delivery requires a new package version. See the project DEVELOPMENT_STATUS for test evidence and limits.
""")
        files = {p.name: p.read_bytes() for p in staged.iterdir() if p.is_file()}
        if destination.exists():
            existing = {p.name: p.read_bytes() for p in destination.iterdir() if p.is_file()}
            if existing != files or any(p.is_dir() for p in destination.iterdir()):
                raise ValueError("Version archive already exists with different content; bump package version instead of overwriting it")
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(staged, destination)
    return destination


if __name__ == "__main__":
    print(archive_release())
