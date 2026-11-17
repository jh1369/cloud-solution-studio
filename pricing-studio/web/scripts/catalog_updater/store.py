"""Append-only local source/catalog versions plus transactional active pointers."""
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from .models import canonical, digest


class CatalogStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS documents(provider TEXT,sha TEXT,url TEXT,metadata TEXT,pdf BLOB,PRIMARY KEY(provider,sha));
        CREATE TABLE IF NOT EXISTS versions(provider TEXT,id TEXT,sha TEXT,parser TEXT,catalog TEXT,PRIMARY KEY(provider,id));
        CREATE TABLE IF NOT EXISTS heads(provider TEXT PRIMARY KEY,version TEXT);
        CREATE TABLE IF NOT EXISTS checks(id INTEGER PRIMARY KEY AUTOINCREMENT,provider TEXT,checked_at TEXT,result TEXT,payload TEXT);
        CREATE TABLE IF NOT EXISTS approvals(id INTEGER PRIMARY KEY AUTOINCREMENT,provider TEXT,version TEXT,reviewer TEXT,reason TEXT,at TEXT);
        """)

    def close(self):
        self.db.close()

    def save_document(self, provider, source, content):
        if digest(content) != source["sha256"]:
            raise ValueError("Source digest mismatch")
        existing = self.db.execute("SELECT pdf FROM documents WHERE provider=? AND sha=?", (provider, source["sha256"])).fetchone()
        if existing and bytes(existing[0]) != content:
            raise ValueError("Document digest collision")
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO documents VALUES(?,?,?,?,?)", (provider, source["sha256"], source["url"], canonical(source), content))

    def save_version(self, catalog):
        existing = self.version(catalog["provider"], catalog["versionId"])
        if existing and canonical(existing) != canonical(catalog):
            raise ValueError("Immutable catalog version cannot be overwritten")
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?)", (catalog["provider"], catalog["versionId"], catalog["source"]["sha256"], catalog["parserVersion"], canonical(catalog)))

    def version(self, provider, version):
        row = self.db.execute("SELECT catalog FROM versions WHERE provider=? AND id=?", (provider, version)).fetchone()
        return json.loads(row[0]) if row else None

    def for_document(self, provider, sha, parser):
        row = self.db.execute("SELECT catalog FROM versions WHERE provider=? AND sha=? AND parser=?", (provider, sha, parser)).fetchone()
        return json.loads(row[0]) if row else None

    def active(self, provider):
        row = self.db.execute("SELECT version FROM heads WHERE provider=?", (provider,)).fetchone()
        return self.version(provider, row[0]) if row else None

    def latest(self, provider):
        row = self.db.execute("SELECT catalog FROM versions WHERE provider=? ORDER BY rowid DESC LIMIT 1", (provider,)).fetchone()
        return json.loads(row[0]) if row else None

    def promote(self, provider, version, expected_head, reviewer, reason, at):
        if not self.version(provider, version):
            raise ValueError("Unknown catalog version")
        try:
            self.db.execute("BEGIN IMMEDIATE")
            current = self.db.execute("SELECT version FROM heads WHERE provider=?", (provider,)).fetchone()
            if (current[0] if current else None) != expected_head:
                raise ValueError("Active catalog changed; re-review candidate")
            self.db.execute("INSERT INTO heads VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET version=excluded.version", (provider, version))
            self.db.execute("INSERT INTO approvals(provider,version,reviewer,reason,at) VALUES(?,?,?,?,?)", (provider, version, reviewer, reason, at))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def record_check(self, provider, checked_at, result, payload):
        with self.db:
            self.db.execute("INSERT INTO checks(provider,checked_at,result,payload) VALUES(?,?,?,?)", (provider, checked_at, result, canonical(payload)))

    def status(self, provider):
        row = self.db.execute("SELECT * FROM checks WHERE provider=? ORDER BY id DESC LIMIT 1", (provider,)).fetchone()
        active = self.active(provider)
        payload = json.loads(row["payload"]) if row else {}
        return {"provider": provider, "lastCheckedAt": row["checked_at"] if row else None, "currentVersion": active["versionId"] if active else None, "status": row["result"] if row else "NEVER_CHECKED", "candidateVersion": payload.get("versionId"), "documentRevision": payload.get("source", {}).get("revisionDate"), "reasons": payload.get("reasons", []), "coverage": payload.get("coverage"), "diffCounts": {k: len(v) for k, v in payload.get("diff", {}).items()}, "source": payload.get("source")}

    def pin_for_quote(self, provider):
        # Returns a detached immutable-version value, never a live reference to heads.
        active = self.active(provider)
        if not active:
            raise ValueError("No approved catalog for this provider")
        return {"provider": provider, "catalogVersion": active["versionId"], "sourceSHA256": active["source"]["sha256"], "items": active["items"]}
