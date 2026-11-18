"""TCP official-page discovery and conservative PDF table extraction."""
from bisect import bisect_right
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
OPEN_UNITS = {
    "ECS": {"hour"}, "RDS": {"hour"}, "EIP": {"hour"},
    "EVS": {"GiB-month", "piece"}, "OBS": {"GiB-month", "GiB"},
}
UNSUPPORTED_BILLING = re.compile(
    r"\b(?:min(?:imum)?\.?\s+(?:billing|charging)|minimum\s+(?:charge|duration)|"
    r"(?:billing|charging)\s+(?:interval|increment|granularity)|"
    r"(?:billed|charged)\s+(?:per|in increments of)|rounded?\s+up|prorat(?:a|ed|ion)|"
    r"min\.\s*\d+|[\d,.]+\s+(?:IOPS|MiB/s)\s+free\s+and)\b",
    re.I,
)


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
        raise ValueError("Service Description discovery is missing or ambiguous")
    return next(iter(parser.links))


def heading_service(title):
    title = title.lower()
    for name, pattern in [("ECS", "elastic cloud server"), ("RDS", "relational database service"), ("OBS", "object storage service"), ("EVS", "elastic volume service"), ("EIP", "elastic ip"), ("ELB", r"(?:elastic\s+)?load\s*balanc")]:
        if re.search(pattern, title):
            return name
    return None


def column_plan(header, raw_unit):
    header = re.sub(r"EU-\s*(DE|NL)", r"EU-\1", clean(header), flags=re.I)
    if not re.fullmatch(
            r"(?:price EU-(?:DE|NL) in euro|EU-(?:DE|NL) (?:open elastic in euro\s*/\s*hour|"
            r"reserved (?:12|24|36) months? in euro\s*/\s*month|"
            r"reserved upfront (?:12|24|36) months? in euro))", header, re.I):
        return None
    region = re.search(r"EU-(DE|NL)", header, re.I)
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
        early_deletion = table["service"] == "OBS" and label.lower().endswith("early deletion fee")
        if table["service"] == "ELB" or early_deletion or re.search(r"\bper\b|\bLCU\b|\bIOPS\b|\bbackup\b|\brestore\b|\bphysical\b|\bGPU\b", label, re.I):
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
    unknown = [i for i, h in enumerate(headings) if i not in price_cols and re.search(r"euro|eur\b|€|EU-\s*(?:DE|NL)", h, re.I)]
    flags = (["ROW_WIDTH_REVIEW"] if malformed else []) + (["UNRECOGNIZED_PRICE_HEADER"] if unknown else [])
    error = {"reasons": flags, "page": table["page"], "rows": malformed, "columns": unknown} if flags else None
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


def simple_price_contract(row):
    service, mode, unit = row["service"], row["billingMode"], row["unit"]
    if mode == "OPEN_ELASTIC":
        return row["termMonths"] is None and unit in OPEN_UNITS.get(service, set())
    reserved_unit = {"RESERVED": "month", "RESERVED_UPFRONT": "term"}.get(mode)
    return service in {"ECS", "RDS"} and row["termMonths"] in {12, 24} and unit == reserved_unit


def validate_publication(catalog, source, now):
    """Verify that a parsed candidate is backed by official discovery and exact row evidence."""
    validate_catalog(catalog)
    observed = catalog["source"]
    for entry in (source, observed):
        official_url(entry["url"])
        discovery = urlsplit(official_url(entry["discoveryPage"]))
        if discovery.path.rstrip("/") != urlsplit(PRICING_PAGE).path:
            raise ValueError("Official calculator discovery evidence required")
    if observed["sha256"] != source["sha256"]:
        raise ValueError("Catalog does not match the current official PDF")
    fetched = datetime.fromisoformat(source["fetchedAt"])
    prior_fetch = datetime.fromisoformat(observed["fetchedAt"])
    if not prior_fetch <= fetched <= datetime.fromisoformat(now) or observed["revisionDate"] > fetched.date().isoformat():
        raise ValueError("Invalid official document timestamps")
    if catalog.get("currency") != "EUR" or not re.fullmatch(r"[a-f0-9]{64}", catalog.get("billingRulesHash", "")):
        raise ValueError("Catalog currency or billing rule evidence is missing")
    for row in catalog["items"]:
        if row["verification"]["status"] != "AUTO_VALIDATED":
            continue
        evidence = row["evidence"]
        for field in ("url", "sha256", "documentVersion", "revisionDate", "fetchedAt"):
            if evidence.get(field) != observed[field]:
                raise ValueError("Row source evidence differs from catalog source")
        if not all(type(page) is int and 0 < page <= catalog["coverage"]["documentPages"] for page in evidence["pages"]):
            raise ValueError("Invalid PDF page evidence")
        if (row["currency"] != "EUR" or row["availability"] != "AVAILABLE" or not row["productLabel"]
                or row.get("tier") or not simple_price_contract(row)):
            raise ValueError("Invalid auto-validated price contract")
        plan = column_plan(evidence["rawHeader"], row["rules"]["rawUnit"])
        rate, failure = amount(evidence["rawPrice"])
        if failure or rate != row["amount"] or not plan or any(row[key] != value for key, value in plan.items()):
            raise ValueError("Price or billing plan differs from PDF evidence")
        if row["service"] in {"ECS", "RDS"} and not re.fullmatch(r"[a-z][a-z0-9-]*(?:\.[a-z0-9]+){2,}", row.get("sku") or "", re.I):
            raise ValueError("Explicit flavor SKU required")


def price_section_text(lines, table_boxes):
    """Keep billing prose (including after service headings) independently of numeric price cells."""
    for words in lines.values():
        outside = [word for word in words if not any(
            x0 <= (word["x0"] + word["x1"]) / 2 <= x1 and top <= (word["top"] + word["bottom"]) / 2 <= bottom
            for x0, top, x1, bottom in table_boxes)]
        line = " ".join(word["text"] for word in sorted(outside, key=lambda w: w["x0"]))
        if line and not re.match(r"^(?:Last revised:|Page\s+\d+\s*/\s*\d+\b)", line, re.I):
            yield line


def scoped_billing_evidence(prose, rows):
    """Separate explicit KMS and EVS notes from rules of unknown scope."""
    volumes = {row["productLabel"].casefold() for row in rows if row["service"] == "EVS"}
    section, general, volume_notes, diagnostics = "", [], {}, []
    for page, text in prose:
        heading = re.match(r"^6(?:\.\d+)+\s+(.+)$", text)
        if heading:
            section = heading[1].casefold()
        elif re.match(r"^(?:back to|zurück zu)\b", text, re.I):
            section = ""
        note = {"page": page, "text": text}
        label, _, terms = text.partition(":")
        if (section == "elastic volume service" and label.casefold() in volumes
                and UNSUPPORTED_BILLING.search(terms)):
            volume_notes.setdefault(label.casefold(), []).append(note)
            continue
        kms_clause = re.match(r"^KMS CMKs are billed per active key version\.\s*", text, re.I)
        if section == "key management service" and kms_clause:
            diagnostics.append({"code": "OUT_OF_SCOPE_KMS_BILLING", "severity": "info",
                                "pages": [page], "evidence": kms_clause[0].strip()})
            text = text[kms_clause.end():]
        if text:
            general.append((page, text))

    # Preserve the fingerprint of all remaining prose and locate ambiguous terms,
    # including terms wrapped across lines or pages.
    starts, parts, offset = [], [], 0
    for _, text in general:
        starts.append(offset)
        parts.append(text)
        offset += len(text) + 1
    fingerprint_text = " ".join(parts)
    blocking_pages = set()
    for rule in UNSUPPORTED_BILLING.finditer(fingerprint_text):
        first = bisect_right(starts, rule.start()) - 1
        last = bisect_right(starts, rule.end() - 1) - 1
        blocking_pages.update(page for page, _ in general[first:last + 1])
    if blocking_pages:
        diagnostics.append({"code": "UNSUPPORTED_DOCUMENT_BILLING_RULE", "severity": "error",
                            "pages": sorted(blocking_pages)})
    for row in rows:
        if row["service"] != "EVS":
            continue
        notes = volume_notes.get(row["productLabel"].casefold())
        if notes:
            row["evidence"]["billingNotes"] = notes
            row["verification"]["reasons"] = sorted(set(row["verification"]["reasons"] + ["SKU_BILLING_RULE_REVIEW"]))
            if row["verification"]["status"] != "UNAVAILABLE":
                row["verification"]["status"] = "PENDING_REVIEW"
    return fingerprint_text, diagnostics


class TCPProvider:
    provider_id = "tcp"
    parser_version = "tcp-pdf-0.3.0-3"
    validate_for_publication = staticmethod(validate_publication)

    def __init__(self, fetch=fetch_public):
        self.fetch = fetch

    def discover(self):
        page = self.fetch(PRICING_PAGE)
        pdf_url = discover_pdf(page.body.decode("utf-8"), page.url)
        pdf = self.fetch(pdf_url)
        if pdf.content_type != "application/pdf" or not pdf.body.startswith(b"%PDF-"):
            raise ValueError("Discovered response is not a PDF")
        return pdf, {"url": official_url(pdf.url), "discoveryPage": page.url, "sha256": digest(pdf.body), "fetchedAt": pdf.fetched_at}

    def parse(self, content, source):
        import pdfplumber
        if digest(content) != source["sha256"]:
            raise ValueError("PDF digest differs from provenance")
        tables, billing_prose, rule_pages = [], [], []
        context, root_section, in_prices = None, None, False
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
                    in_prices = True
                if not in_prices:
                    continue
                words_by_line = {}
                for word in page.extract_words():
                    words_by_line.setdefault(round(word["top"] / 3) * 3, []).append(word)
                headings = []
                for top, words in sorted(words_by_line.items()):
                    line = " ".join(w["text"] for w in sorted(words, key=lambda w: w["x0"]))
                    match = re.match(r"^(6\.\d+\.\d+)(?:\.\d+)*\s+(.+)", line)
                    if match:
                        headings.append((top, match[1], heading_service(match[2])))
                cursor, price_boxes = 0, []
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
                    price_boxes.append(table.bbox)
                    tables.append({"page": page_no, "index": index, "service": context, "rows": rows, "reviewReasons": flags})
                for _, section, service in headings[cursor:]:
                    if section != root_section:
                        context, root_section = service, section
                    elif service:
                        context = service
                prose = list(price_section_text(dict(sorted(words_by_line.items())), price_boxes))
                if prose:
                    billing_prose.extend((page_no, clean(line)) for line in prose)
                    rule_pages.append(page_no)
        items, diagnostics, previous = [], [], None
        for table in tables:
            rows, error, previous = parse_table(table, source, previous)
            items.extend(rows)
            if error:
                error["severity"] = "error"
                diagnostics.append(error)
        if not billing_prose:
            raise ValueError("Pricing section evidence is missing")
        billing_text, rule_diagnostics = scoped_billing_evidence(billing_prose, items)
        diagnostics.extend(rule_diagnostics)
        for row in items:
            if row["verification"]["status"] == "AUTO_VALIDATED" and not simple_price_contract(row):
                row["verification"] = {"status": "PENDING_REVIEW", "reasons": ["UNIT_OR_BILLING_CONTRACT_UNSUPPORTED"]}
        captured = len(items)
        items, duplicate_diagnostics = reconcile_duplicates(items)
        diagnostics.extend(duplicate_diagnostics)
        catalog = {"schemaVersion": SCHEMA_VERSION, "provider": "tcp", "parserVersion": self.parser_version, "versionId": f"tcp-{revised}-{source['sha256'][:16]}-{self.parser_version}", "source": source, "currency": "EUR", "regions": ["EU-DE", "EU-NL"], "billingRulesHash": digest(billing_text), "billingRulesPages": rule_pages, "items": items, "diagnostics": diagnostics, "coverage": {"documentPages": pages, "tables": len(tables), "expandedPriceCells": captured, "uniqueRecords": len(items), "duplicateRecords": captured-len(items), "billingPlans": {f"{mode}:{term or 0}": sum(r['billingMode']==mode and r['termMonths']==term for r in items) for mode, term in sorted({(r['billingMode'],r['termMonths']) for r in items}, key=lambda x:(x[0],x[1] or 0))}, "services": {name: {"total": sum(r['service'] == name for r in items), **{s: sum(r['service'] == name and r['verification']['status'] == s for r in items) for s in ['AUTO_VALIDATED', 'PENDING_REVIEW', 'UNAVAILABLE']}} for name in sorted(SERVICES)}}}
        return validate_catalog(catalog)
