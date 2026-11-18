"""Append-only source and catalog versions with transactional publication state."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
from .models import canonical, digest

SUCCESS = ("UPDATED", "UNCHANGED")
MAX_AGE = timedelta(hours=48)


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
        CREATE INDEX IF NOT EXISTS checks_provider_id ON checks(provider, id);
        """)

    def close(self):
        self.db.close()

    def document(self, provider, sha):
        row = self.db.execute("SELECT pdf FROM documents WHERE provider=? AND sha=?", (provider, sha)).fetchone()
        return bytes(row[0]) if row else None

    def save_document(self, provider, source, content):
        if digest(content) != source["sha256"]:
            raise ValueError("Source digest mismatch")
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO documents VALUES(?,?,?,?,?)", (provider, source["sha256"], source["url"], canonical(source), content))
            if self.document(provider, source["sha256"]) != content:
                raise ValueError("Document digest collision")

    def save_version(self, catalog):
        with self.db:
            self._save_version(catalog)

    def _save_version(self, catalog):
        serialized = canonical(catalog)
        provider, version = catalog["provider"], catalog["versionId"]
        self.db.execute("INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?)",
                        (provider, version, catalog["source"]["sha256"], catalog["parserVersion"], serialized))
        existing = self.db.execute("SELECT catalog FROM versions WHERE provider=? AND id=?", (provider, version)).fetchone()
        if existing[0] != serialized:
            raise ValueError("Immutable catalog version cannot be overwritten")

    def version(self, provider, version):
        row = self.db.execute("SELECT catalog FROM versions WHERE provider=? AND id=?", (provider, version)).fetchone()
        return json.loads(row[0]) if row else None

    def for_document(self, provider, sha, parser):
        row = self.db.execute("SELECT catalog FROM versions WHERE provider=? AND sha=? AND parser=? ORDER BY rowid DESC LIMIT 1",
                              (provider, sha, parser)).fetchone()
        return json.loads(row[0]) if row else None

    def last_published(self, provider):
        row = self.db.execute("SELECT version FROM heads WHERE provider=?", (provider,)).fetchone()
        return self.version(provider, row[0]) if row else None

    def was_published(self, provider, sha):
        return self.db.execute("""
            SELECT 1 FROM checks WHERE provider=? AND result IN ('UPDATED','UNCHANGED','APPROVED')
            AND json_extract(payload,'$.source.sha256')=? LIMIT 1
        """, (provider, sha)).fetchone() is not None

    def _last(self, provider):
        return self.db.execute("SELECT * FROM checks WHERE provider=? ORDER BY id DESC LIMIT 1", (provider,)).fetchone()

    def check_base(self, provider):
        with self.db:
            self.db.execute("BEGIN")
            row = self._last(provider)
            prior = self.db.execute("SELECT catalog FROM versions WHERE provider=? ORDER BY rowid DESC LIMIT 1", (provider,)).fetchone()
            return (row["id"] if row else None, self.last_published(provider), json.loads(prior[0]) if prior else None)

    def finish_check(self, provider, sequence, checked_at, result, payload, candidate):
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            last = self._last(provider)
            if (last["id"] if last else None) != sequence:
                return
            if candidate:
                self._save_version(candidate)
            if result in SUCCESS:
                self.db.execute("INSERT INTO heads VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET version=excluded.version",
                                (provider, candidate["versionId"]))
            self.db.execute("INSERT INTO checks(provider,checked_at,result,payload) VALUES(?,?,?,?)",
                            (provider, checked_at, result, canonical(payload)))

    def status(self, provider, now=None):
        return self.publication(provider, now)["state"]

    def publication(self, provider, now=None):
        with self.db:
            self.db.execute("BEGIN")
            row = self._last(provider)
            active = self.last_published(provider)
            verified = self.db.execute("""
                SELECT json_extract(payload,'$.verifiedAt') FROM checks
                WHERE provider=? AND result IN ('UPDATED','UNCHANGED')
                AND json_extract(payload,'$.verifiedAt') IS NOT NULL ORDER BY id DESC LIMIT 1
            """, (provider,)).fetchone()
        payload = json.loads(row["payload"]) if row else {}
        result = row["result"] if row else "NEVER_CHECKED"
        version = active["versionId"] if active else None
        last_verified = verified[0] if verified else None
        effective = "UNINITIALIZED" if not row and not version else "PENDING"
        if result in SUCCESS and version and payload.get("versionId") == version and last_verified and payload.get("verifiedAt") == last_verified:
            verified_time = datetime.fromisoformat(last_verified)
            now = datetime.fromisoformat(now) if now else datetime.now(timezone.utc)
            effective = "ACTIVE" if timedelta(0) <= now - verified_time <= MAX_AGE else "STALE"
        state = {
            "provider": provider, "lastCheckedAt": row["checked_at"] if row else None,
            "lastVerifiedAt": last_verified, "currentVersion": version, "effectiveState": effective,
            "status": result, "candidateVersion": payload.get("versionId"),
            "documentRevision": payload.get("source", {}).get("revisionDate"),
            "reasons": payload.get("reasons", []), "coverage": payload.get("coverage"),
            "diffCounts": {k: len(v) for k, v in payload.get("diff", {}).items()},
            "source": payload.get("source"), "attempts": payload.get("attempts"),
        }
        return {"state": state, "catalog": active if effective == "ACTIVE" else None}

    def pin_for_quote(self, provider, now=None):
        publication = self.publication(provider, now)
        active = publication["catalog"]
        if not active:
            raise ValueError("No effective catalog for a new quote")
        return {"provider": provider, "catalogVersion": active["versionId"], "sourceSHA256": active["source"]["sha256"],
                "verifiedAt": publication["state"]["lastVerifiedAt"], "items": active["items"]}
