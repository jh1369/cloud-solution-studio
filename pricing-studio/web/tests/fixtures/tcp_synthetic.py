"""Fictional rows and a minimal real PDF with ruled tables; never real quotations."""
from catalog_updater.models import digest, row_id

URL = "https://www.t-cloud-public.com/_Resources/fictional-service-description.pdf"
AT = "2026-11-17T12:00:00+00:00"


def source(content=b"fictional-v1", revision="2026-10-01"):
    return {"url": URL, "discoveryPage": "https://www.t-cloud-public.com/en/prices/price-calculator", "sha256": digest(content), "fetchedAt": AT, "documentVersion": revision, "revisionDate": revision}


def catalog(content=b"fictional-v1", price="1.00", revision="2026-10-01"):
    evidence = source(content, revision)
    row = {"provider": "tcp", "service": "EIP", "productLabel": "FICTIONAL Elastic IP", "sku": None, "specification": {}, "region": "EU-DE", "billingMode": "OPEN_ELASTIC", "termMonths": None, "tierIndex": 0, "tier": None, "unit": "hour", "amount": price, "currency": "EUR", "availability": "AVAILABLE", "rules": {"upfront": False, "rawUnit": "h"}, "verification": {"status": "AUTO_VALIDATED", "reasons": []}, "evidence": {**evidence, "pages": [1], "rawPrice": price, "rawHeader": "price EU-DE in Euro"}}
    row["id"] = row_id(row)
    return {"schemaVersion": 1, "provider": "tcp", "parserVersion": "synthetic-1", "versionId": "synthetic-" + digest(content), "source": evidence, "currency": "EUR", "billingRulesHash": digest("synthetic-stable-billing-rules"), "items": [row], "diagnostics": [], "coverage": {"documentPages": 1, "synthetic": True}}


def pdf_bytes(billing_note=None, revision="01.10.2026", rate="0.111000", *, volume=False, notes=()):
    commands = []
    def text(x, y, value, size=8):
        value = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(f"BT /F1 {size} Tf {x} {y} Td ({value}) Tj ET")
    text(20, 240, "FICTIONAL TEST DOCUMENT")
    text(20, 225, "Last revised: " + revision)
    text(20, 210, "6 Prices", 10)
    text(20, 190, "6.4.3 Elastic Volume Service" if volume else "6.5.2 Elastic IP", 10)
    if billing_note:
        text(20, 180, billing_note)
    xs, ys = [20, 240, 320, 425, 530], [170, 145, 120, 95]
    for x in xs:
        commands.append(f"{x} 95 m {x} 170 l S")
    for y in ys:
        commands.append(f"20 {y} m 530 {y} l S")
    first, second, unit = ("FICTIONAL VOLUME A", "FICTIONAL VOLUME B", "GiB/month") if volume else ("FICTIONAL IP A", "FICTIONAL IP B", "h")
    for y, values in [(154, ["Name", "charging unit", "price EU-DE in Euro", "price EU-NL in Euro"]), (129, [first, unit, rate, "0.222000"]), (104, [second, unit, "n.a.", "0.000000"])]:
        for x, value in zip(xs, values):
            text(x + 3, y, value, 7)
    for i, note in enumerate(notes):
        text(20, 80 - 12 * i, note)
    stream = "\n".join(commands).encode()
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 560 280] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
    data, offsets = b"%PDF-1.4\n", [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data)); data += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(data)
    data += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode()
    data += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets[1:])
    return data + f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
