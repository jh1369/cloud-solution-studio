"""Package the existing browser app as one double-clickable HTML. No network/build deps."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?", VERSION):
    raise ValueError("A safe semantic package version is required")
HTML_NAME = f"Pricing-Studio-{VERSION}-Offline.html"
ZIP_NAME = f"Pricing-Studio-{VERSION}-Offline.zip"
MODULES = ["engine", "i18n", "ui", "excel"]
CSP = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; base-uri 'none'; object-src 'none'"


def json_literal(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def classic_source(source):
    """Handle this app's named imports/exports only; fail on unsupported syntax."""
    def named_import(match):
        names, module = match.groups()
        if module not in MODULES:
            raise ValueError(f"Unsupported offline import: {module}")
        names = re.sub(r"(\w+)\s+as\s+(\w+)", r"\1:\2", names)
        return f"const {{{names}}}=__module_{module};"
    exports = re.findall(r"^export (?:const|function|class) (\w+)", source, flags=re.M)
    source = re.sub(r"^import\s*\{([^}]+)\}\s*from\s*['\"]\./(\w+)\.mjs['\"];?", named_import, source, flags=re.M)
    source = re.sub(r"^export (?=(?:const|function|class)\s)", "", source, flags=re.M)
    if re.search(r"^\s*(?:import|export)\s", source, flags=re.M):
        raise ValueError("Unsupported module syntax; offline build stopped")
    return source, exports


def script_tag(source):
    # HTML's parser recognizes closing tags even inside JS strings/comments.
    return "<script>\n" + re.sub(r"</script", r"<\\/script", source, flags=re.I) + "\n</script>"


def build(output_dir):
    public = ROOT / "public"
    catalog = json.loads((public / "catalog.json").read_text())
    # Keep official evidence and per-item verification times unchanged, including expired entries.
    if catalog.get("region") != "eu-west-101" or catalog.get("currency") != "USD":
        raise ValueError("Unsupported catalogue region/currency")
    html = (public / "index.html").read_text()
    # The downloaded copy cannot download itself from a nonexistent local server.
    html = re.sub(r'<a id="download-offline"[^>]*>.*?</a>', '', html, flags=re.S)
    html, links = re.subn(r'<link rel="stylesheet"[^>]+>', lambda _: "<style>" + (public / "style.css").read_text() + "</style>", html)
    html, scripts = re.subn(r'<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*</script>', "", html)
    if links != 1 or scripts != 3:
        raise ValueError("Entry HTML changed; review offline packaging before rebuilding")
    html = re.sub(r"(?m)^[ \t]+$", "", html)
    html = re.sub(r'<meta name="app-build" content="[^"]+">', f'<meta name="app-build" content="offline-{VERSION}">', html, count=1)
    html = re.sub(r'<span class="version">[^<]+</span>', f'<span class="version">V{VERSION}</span>', html, count=1)
    html = html.replace('<meta name="viewport"', '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n<meta name="viewport"', 1)
    banner = '<section class="offline-banner" role="note"><strong data-i18n="offline.title"></strong><p data-i18n="offline.note"></p><small id="offline-date"></small></section>'
    html = html.replace('<main>', '<main>' + banner, 1)
    html = html.replace('</head>', '<style>.offline-banner{border:1px solid #775392;background:#211431;border-radius:16px;padding:16px 20px;margin:0 0 24px;color:#e3d2f1}.offline-banner p{margin:7px 0;color:#c3b1d4}.offline-banner small{color:#b4a0c6}</style></head>', 1)
    payload = '<script id="offline-catalog" type="application/json">' + json_literal(catalog) + '</script>'
    config = "window.PRICING_STUDIO_OFFLINE={catalog:JSON.parse(document.getElementById('offline-catalog').textContent),pdfWorkerURL:URL.createObjectURL(new Blob([" + json_literal((public / 'vendor/pdf.worker.min.js').read_text()) + "],{type:'text/javascript'}))};"
    modules = []
    for name in MODULES:
        source, exports = classic_source((public / f"{name}.mjs").read_text())
        modules.append(f"const __module_{name}=(()=>{{\n{source}\nreturn {{{','.join(exports)}}};\n}})();")
    app, exports = classic_source((public / "app.mjs").read_text())
    if exports:
        raise ValueError("Unexpected app exports")
    bundle = "(async()=>{\n'use strict';\n" + "\n".join(modules) + "\n" + app + "\n})();"
    embedded = payload + script_tag((public / "vendor/xlsx.full.min.js").read_text()) + script_tag((public / "vendor/pdf.min.js").read_text()) + script_tag(config) + script_tag(bundle)
    html = html.replace('</body>', embedded + '</body>', 1)
    if re.search(r'<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"', html):
        raise ValueError("External runtime asset remains")
    output_dir.mkdir(parents=True, exist_ok=True)
    files = {
        HTML_NAME: html.encode(),
        "aws-fictional-mvp.csv": (ROOT / "tests/fixtures/aws-fictional-mvp.csv").read_bytes(),
        "THIRD_PARTY_NOTICES.md": (ROOT / "THIRD_PARTY_NOTICES.md").read_bytes(),
        "READ-ME.txt": ("""Cloud Solution Studio / Pricing Studio V0.2 — 离线文件版 / Offline

1. 解压 ZIP 后，用 Chrome / Edge / Firefox 打开 Pricing-Studio-V0.2-Offline.html。
   或直接下载该 HTML 并双击打开。不要在压缩包预览器或网盘的 HTML 预览窗口中运行。
2. 无需安装 Python、Node、插件或登录。断网也能使用。中英文可切换。
3. 先点“试用虚构示例”，或选择随包 aws-fictional-mvp.csv。清单在本地浏览器内解析。
   支持文字描述、CSV、XLSX 和原有布局的文字 PDF（非 OCR）。
4. 核对目标 SKU、架构/OS/数据库/存储、资源数量及用量，选择按需/包月/包年并确认。
   输入是累计用量时，不要重复乘资源台数。未知规格或价格保持 Pending。
5. 设置手动折扣情景，点击“导出 Excel”；包含五个 Sheet。Pending 金额为空，部分小计不是完整报价。
6. 重要：离线 HTML 使用内置的官方公开目录快照，不进行后台联网，不上传原文件。
   本包不含客户资料或云凭证。公开快照不是客户真实报价。
   每条单价从原 verifiedAt 起 7 天有效；不会因打包、复制或重启延长。过期后 Pending。
   离线版不能在线核价，届时需要获取更新的离线包或使用网页版核价；不会编造或借用其他模式价格。
7. 关闭/刷新会清空当前清单；导出 Excel 后自行保管。语言偏好可由浏览器保存。
   仅含所选计价项；磁盘、网络、备份、税及其他配套费用请单列。

Unzip, then double-click the HTML in a modern Chrome, Edge or Firefox browser.
No server, installation, sign-in or Internet is required. The single HTML includes all runtime assets.
Use the fictional sample, confirm the design, select independent Huawei billing modes and export Excel.
Original files stay in browser memory. Only language preference is saved.
The embedded official snapshot retains its ORIGINAL per-rate seven-day expiry.
Expired, missing and unconfirmed items stay Pending. Live refresh is unavailable in this file.
Get an updated package after expiry. Partial subtotals are not complete commercial quotations.
""").encode("utf-8-sig"),
    }
    files["READ-ME.txt"] = files["READ-ME.txt"].decode("utf-8-sig").replace("Pricing Studio V0.2", f"Pricing Studio {VERSION}").replace("Pricing-Studio-V0.2-Offline.html", HTML_NAME).encode("utf-8-sig")
    inputs = [*public.glob("*.mjs"), public / "index.html", public / "style.css", public / "catalog.json", *sorted((public / "vendor").glob("*.js")), ROOT / "package.json", Path(__file__).resolve(), ROOT / "THIRD_PARTY_NOTICES.md", ROOT / "tests/fixtures/aws-fictional-mvp.csv"]
    manifest = {"format": 1, "version": VERSION, "entry": HTML_NAME, "catalogueVerifiedAt": catalog.get("verifiedAt"), "priceTTLDays": catalog.get("ttlDays"), "sourceSHA256": {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(inputs)}, "sha256": {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}}
    files["MANIFEST.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    for name, value in files.items():
        (output_dir / name).write_bytes(value)
    with zipfile.ZipFile(output_dir / ZIP_NAME, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in files.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, value)
    return output_dir / HTML_NAME, output_dir / ZIP_NAME


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs/offline")
    args = parser.parse_args()
    for path in build(args.output_dir):
        print(f"{path} ({path.stat().st_size:,} bytes)")
