"""TCP official-page discovery and conservative PDF table extraction."""
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
import re
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from .models import SCHEMA_VERSION, amount, canonical, clean, digest, row_id, validate_catalog

PRICING_PAGE = "https://www.t-cloud-public.com/en/prices/price-calculator"
OFFICIAL_HOSTS = {"www.t-cloud-public.com", "t-cloud-public.com"}
SERVICES = {"ECS", "EVS", "EIP", "ELB", "OBS", "RDS"}


def official_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in OFFICIAL_HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Only approved HTTPS TCP public URLs are allowed")
    return url


@dataclass(frozen=True)
class FetchResult:
    url: str
    body: bytes
    content_type: str
    fetched_at: str


class OfficialRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        official_url(newurl)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch_public(url, limit=32 * 1024 * 1024):
    official_url(url)
    request = Request(url, headers={"User-Agent": "PricingStudioCatalogUpdater/0.3", "Accept": "application/pdf,text/html"})
    with build_opener(OfficialRedirect()).open(request, timeout=30) as response:
        official_url(response.geturl())
        content = response.read(limit + 1)
        if len(content) > limit:
            raise ValueError("Official response exceeds size limit")
        return FetchResult(response.geturl(), content, response.headers.get_content_type(), datetime.now(timezone.utc).isoformat())


class PriceLinks(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links = base, set()

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href", "")
        name = unquote(urlsplit(href).path).lower()
        if tag == "a" and name.endswith(".pdf") and re.search(r"service[-_ ]?description|servicedescription", name):
            self.links.add(official_url(urljoin(self.base, href)))


def discover_pdf(html, page_url=PRICING_PAGE):
    official_url(page_url)
    parser = PriceLinks(page_url)
    parser.feed(html)
    if len(parser.links) != 1:
        raise ValueError("Service Description discovery is missing or ambiguous; manual review required")
    return next(iter(parser.links))


def heading_service(title):
    title = title.lower()
    for name, pattern in [("ECS", "elastic cloud server"), ("RDS", "relational database service"), ("OBS", "object storage service"), ("EVS", "elastic volume service"), ("EIP", "elastic ip"), ("ELB", r"(?:elastic\s+)?load\s*balanc")]:
        if re.search(pattern, title):
            return name
    return None


def column_plan(header, raw_unit):
    header = re.sub(r"EU-\s*(DE|NL)", r"EU-\1", clean(header), flags=re.I)
    region = re.search(r"EU-(DE|NL)", header, re.I)
    if not region or not re.search("euro", header, re.I):
        return None
    term = re.search(r"(12|24|36)\s*months?", header, re.I)
    mode = "RESERVED_UPFRONT" if "upfront" in header.lower() else "RESERVED" if "reserved" in header.lower() else "OPEN_ELASTIC"
    if mode == "RESERVED_UPFRONT":
        unit = "term"
    elif re.search(r"euro\s*/\s*month", header, re.I):
        unit = "month"
    elif re.search(r"euro\s*/\s*hour", header, re.I):
        unit = "hour"
    else:
        unit = {"h": "hour", "hour": "hour", "GiB/month": "GiB-month", "Piece": "piece", "GiB": "GiB", "IOPS/month": "IOPS-month"}.get(clean(raw_unit))
    return {"region": region[0].upper(), "billingMode": mode, "termMonths": int(term[1]) if term else None, "unit": unit}


def split_tiers(value):
    raw = clean(value)
    if not raw or re.fullmatch(r"n\s*\.\s*a\s*\.?", raw, re.I):
        return [None]
    return [clean(line) for line in str(value).splitlines() if clean(line)]


def parse_table(table, source, previous=None):
    """Rows and cells remain auditable; merged/cross-page values are never auto-valid."""
    headers, data = table["rows"][0], table["rows"][1:]
    headings = [clean(h).lower() for h in headers]
    unit_col = next((i for i, h in enumerate(headings) if "charging" in h and "unit" in h), None)
    tier_col = next((i for i, h in enumerate(headings) if h == "tier"), None)
    price_cols = [i for i, h in enumerate(headers) if column_plan(h, "h")]
    if not price_cols:
        return [], {"reasons": ["UNRECOGNIZED_PRICE_HEADER"], "page": table["page"]}, None
    metadata_cols = [i for i in range(min(price_cols)) if i not in (unit_col, tier_col)]
    signature = canonical([table["service"], headings])
    carry = previous.get("values", {}) if previous and previous["signature"] == signature and previous["page"] == table["page"] - 1 else {}
    carry_page = previous["page"] if carry else None
    items, malformed = [], []
    for row_index, cells in enumerate(data, start=1):
        if len(cells) != len(headers):
            malformed.append(row_index)
            continue
        values, inherited = {}, False
        for i in metadata_cols:
            if cells[i] is None or clean(cells[i]) == "":
                values[i] = carry.get(i, "")
                inherited = True
            else:
                values[i] = clean(cells[i])
        reasons = list(table.get("reviewReasons", []))
        if inherited:
            reasons.append("MERGED_CELL_REVIEW")
            if carry_page:
                reasons.append("CROSS_PAGE_REVIEW")
        if not values.get(0):
            values[0] = f"Unresolved row {table['page']}:{table['index']}:{row_index}"
            reasons.append("MISSING_SPECIFICATION")
        label = values[0]
        if re.search(r"[*†‡¹²³]|\bsee\b|\bnote\b", " ".join(str(c or "") for c in cells), re.I):
            reasons.append("FOOTNOTE_REVIEW")
        tiers = split_tiers(cells[tier_col]) if tier_col is not None else [None]
        if any(tier is not None for tier in tiers):
            reasons.append("TIER_RULE_REVIEW")
        spec = {clean(headers[i]): values[i] for i in metadata_cols if i != 0}
        sku_match = re.search(r"\b[a-z][a-z0-9-]*\.(?:[a-z0-9]+\.)+[a-z0-9]+\b", " ".join(values.values()), re.I)
        if table["service"] in {"ECS", "RDS"} and (not sku_match or not any("cpu" in k.lower() for k in spec)):
            reasons.append("SPECIFICATION_REVIEW")
        if table["service"] == "ELB" or re.search(r"\bper\b|\bLCU\b|\bIOPS\b|\bbackup\b|\brestore\b|\bphysical\b|\bGPU\b", label, re.I):
            reasons.append("COMPLEX_RULE_REVIEW")
        for col in price_cols:
            plan = column_plan(headers[col], cells[unit_col] if unit_col is not None else "")
            price_lines = [clean(v) for v in str(cells[col] or "").splitlines() if clean(v)]
            aligned = len(price_lines) == len(tiers)
            unavailable = amount(cells[col])[1] == "UNAVAILABLE"
            if not aligned and not unavailable:
                selected = [(None, clean(cells[col]))]
            else:
                selected = [(tier, price_lines[i] if aligned else clean(cells[col])) for i, tier in enumerate(tiers)]
            for tier_index, (tier, raw) in enumerate(selected):
                flags = list(reasons)
                rate, failure = amount(raw)
                if failure and failure != "UNAVAILABLE":
                    flags.append(failure)
                if not aligned and not unavailable:
                    flags.append("TIER_ALIGNMENT_REVIEW")
                if not plan["unit"] or plan["billingMode"] != "OPEN_ELASTIC" and plan["termMonths"] not in {12, 24}:
                    flags.append("UNIT_OR_TERM_REVIEW")
                if table["service"] == "OBS" and plan["billingMode"] != "OPEN_ELASTIC":
                    flags.append("CAPACITY_BUNDLE_REVIEW")
                flags = sorted(set(flags))
                row = {"provider": "tcp", "service": table["service"], **plan, "productLabel": label, "sku": sku_match[0] if sku_match else None, "specification": spec, "tierIndex": tier_index, "tier": {"raw": tier, "interpretation": "REQUIRES_REVIEW"} if tier else None, "amount": rate, "currency": "EUR", "availability": "NOT_AVAILABLE" if failure == "UNAVAILABLE" else "UNKNOWN" if rate is None else "AVAILABLE", "rules": {"termMonths": plan["termMonths"], "upfront": plan["billingMode"] == "RESERVED_UPFRONT", "rawUnit": clean(cells[unit_col]) if unit_col is not None else clean(headers[col])}, "verification": {"status": "UNAVAILABLE" if failure == "UNAVAILABLE" else "PENDING_REVIEW" if flags else "AUTO_VALIDATED", "reasons": flags}, "evidence": {"url": source["url"], "sha256": source["sha256"], "documentVersion": source["documentVersion"], "revisionDate": source["revisionDate"], "fetchedAt": source["fetchedAt"], "pages": sorted({table["page"], *([carry_page] if inherited and carry_page else [])}), "table": table["index"], "row": row_index, "column": col, "rawPrice": raw, "rawHeader": clean(headers[col])}}
                row["id"] = row_id(row)
                items.append(row)
        carry = values
        # Inheritance within this page is distinct from a cross-page continuation.
        if not inherited:
            carry_page = None
    error = {"reasons": ["ROW_WIDTH_REVIEW"], "page": table["page"], "rows": malformed} if malformed else None
    return items, error, {"signature": signature, "page": table["page"], "values": carry}


def reconcile_duplicates(items):
    unique, diagnostics = {}, []
    for row in items:
        if row["id"] not in unique:
            unique[row["id"]] = row
            continue
        first = unique[row["id"]]
        occurrences = first["evidence"].setdefault("occurrences", [{k: first["evidence"][k] for k in ("pages", "table", "row", "column", "rawPrice")}])
        occurrences.append({k: row["evidence"][k] for k in ("pages", "table", "row", "column", "rawPrice")})
        conflict = first["amount"] != row["amount"] or first["rules"] != row["rules"]
        reason = "DUPLICATE_CONFLICT_REVIEW" if conflict else "DUPLICATE_SKU_REVIEW"
        first["verification"]["reasons"] = sorted(set(first["verification"]["reasons"] + [reason]))
        if first["verification"]["status"] != "UNAVAILABLE":
            first["verification"]["status"] = "PENDING_REVIEW"
        if conflict:
            first["amount"], first["availability"] = None, "UNKNOWN"
        diagnostics.append({"code": reason, "severity": "review", "id": row["id"], "pages": row["evidence"]["pages"]})
    return list(unique.values()), diagnostics


class TCPProvider:
    provider_id = "tcp"
    parser_version = "tcp-pdf-0.3.0-1"

    def __init__(self, fetch=fetch_public):
        self.fetch = fetch

    def discover(self):
        page = self.fetch(PRICING_PAGE)
        pdf_url = discover_pdf(page.body.decode("utf-8"), page.url)
        pdf = self.fetch(pdf_url)
        if not pdf.body.startswith(b"%PDF-"):
            raise ValueError("Discovered response is not a PDF")
        return pdf, {"url": official_url(pdf.url), "discoveryPage": page.url, "sha256": digest(pdf.body), "fetchedAt": pdf.fetched_at}

    def parse(self, content, source):
        import pdfplumber
        if digest(content) != source["sha256"]:
            raise ValueError("PDF digest differs from provenance")
        tables, billing_text, rule_pages = [], [], []
        context, root_section, in_prices, in_rules = None, None, False, False
        with pdfplumber.open(BytesIO(content)) as pdf:
            revision = re.search(r"Last\s+revised\s*:\s*(\d{2}\.\d{2}\.\d{4})", pdf.pages[0].extract_text() or "", re.I)
            if not revision:
                raise ValueError("Document revision date is missing")
            revised = datetime.strptime(revision[1], "%d.%m.%Y").date().isoformat()
            source = {**source, "documentVersion": revised, "revisionDate": revised}
            pages = len(pdf.pages)
            for page_no, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if re.search(r"(?m)^6\s+Prices\s*$", text):
                    in_prices, in_rules = True, True
                if not in_prices:
                    continue
                if in_rules:
                    part = re.split(r"(?m)^6\.2\s", text, maxsplit=1)[0]
                    part = re.sub(r"Last revised:[^\n]*|Page\s+\d+\s*/\s*\d+", "", part)
                    billing_text.append(clean(part)); rule_pages.append(page_no)
                    if re.search(r"(?m)^6\.2\s", text):
                        in_rules = False
                words_by_line = {}
                for word in page.extract_words():
                    words_by_line.setdefault(round(word["top"] / 3) * 3, []).append(word)
                headings = []
                for top, words in sorted(words_by_line.items()):
                    line = " ".join(w["text"] for w in sorted(words, key=lambda w: w["x0"]))
                    match = re.match(r"^(6\.\d+\.\d+)(?:\.\d+)*\s+(.+)", line)
                    if match:
                        headings.append((top, match[1], heading_service(match[2])))
                cursor = 0
                for index, table in enumerate(page.find_tables()):
                    while cursor < len(headings) and headings[cursor][0] < table.bbox[1]:
                        _, section, service = headings[cursor]
                        if section != root_section:
                            context, root_section = service, section
                        elif service:
                            context = service
                        cursor += 1
                    rows = table.extract()
                    if context not in SERVICES or not rows:
                        continue
                    if not any(column_plan(h, "h") for h in rows[0]) and not any(re.search(r"euro|eur\b|€", str(h), re.I) for h in rows[0]):
                        continue
                    below = page.crop((0, table.bbox[3], page.width, page.height)).extract_text() if table.bbox[3] < page.height else ""
                    flags = ["FOOTNOTE_REVIEW"] if re.search(r"(?im)^\s*(?:\*|note:|\d+\))", below or "") else []
                    tables.append({"page": page_no, "index": index, "service": context, "rows": rows, "reviewReasons": flags})
                for _, section, service in headings[cursor:]:
                    if section != root_section:
                        context, root_section = service, section
                    elif service:
                        context = service
        items, diagnostics, previous = [], [], None
        for table in tables:
            rows, error, previous = parse_table(table, source, previous)
            items.extend(rows)
            if error:
                error["severity"] = "error"
                diagnostics.append(error)
        captured = len(items)
        items, duplicate_diagnostics = reconcile_duplicates(items)
        diagnostics.extend(duplicate_diagnostics)
        catalog = {"schemaVersion": SCHEMA_VERSION, "provider": "tcp", "parserVersion": self.parser_version, "versionId": f"tcp-{revised}-{source['sha256'][:16]}-{self.parser_version}", "source": source, "currency": "EUR", "regions": ["EU-DE", "EU-NL"], "billingRulesHash": digest(billing_text), "billingRulesPages": rule_pages, "items": items, "diagnostics": diagnostics, "coverage": {"documentPages": pages, "tables": len(tables), "expandedPriceCells": captured, "uniqueRecords": len(items), "duplicateRecords": captured-len(items), "billingPlans": {f"{mode}:{term or 0}": sum(r['billingMode']==mode and r['termMonths']==term for r in items) for mode, term in sorted({(r['billingMode'],r['termMonths']) for r in items}, key=lambda x:(x[0],x[1] or 0))}, "services": {name: {"total": sum(r['service'] == name for r in items), **{s: sum(r['service'] == name and r['verification']['status'] == s for r in items) for s in ['AUTO_VALIDATED', 'PENDING_REVIEW', 'UNAVAILABLE']}} for name in sorted(SERVICES)}}}
        return validate_catalog(catalog)
