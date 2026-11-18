"""Publish the effective TCP catalog to a strongly consistent object store."""
from dataclasses import dataclass
import json

from .models import canonical, digest
from .service import utc_now

STATE_KEY = "tcp/current.json"
MAX_STATE_BYTES = 64 * 1024
MAX_CATALOG_BYTES = 8 * 1024 * 1024
MAX_CONDITIONAL_ATTEMPTS = 4
MAX_SEQUENCE = 2**53 - 1


@dataclass(frozen=True)
class StoredObject:
    body: bytes
    etag: str


class S3PublicationStorage:
    """S3/R2 adapter. All writes are conditional and use single-object PUT."""

    def __init__(self, client, bucket):
        self.client, self.bucket = client, bucket

    def get(self, key, limit):
        from botocore.exceptions import ClientError

        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response["ResponseMetadata"]["HTTPStatusCode"] == 404:
                return None
            raise
        with response["Body"] as stream:
            size = response["ContentLength"]
            if not 0 < size <= limit:
                raise ValueError("Remote publication object has invalid size")
            body = stream.read(size + 1)
        if len(body) != size or not response.get("ETag"):
            raise ValueError("Remote publication object lacks complete bytes or an ETag")
        return StoredObject(body, response["ETag"])

    def put(self, key, body, expected_etag):
        from botocore.exceptions import ClientError

        condition = {"IfMatch": expected_etag} if expected_etag is not None else {"IfNoneMatch": "*"}
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=body,
                                   ContentType="application/json", CacheControl="no-store", **condition)
        except ClientError as error:
            if error.response["ResponseMetadata"]["HTTPStatusCode"] in {409, 412}:
                return False
            raise
        return True


def state_order(state):
    if not isinstance(state, dict):
        raise ValueError("Invalid remote TCP state")
    sequence = state.get("sequence")
    phase = state.get("phase")
    if (state.get("schemaVersion") != 1 or state.get("provider") != "tcp"
            or type(sequence) is not int or not 0 <= sequence <= MAX_SEQUENCE
            or phase not in ("CHECKING", "DECISION")):
        raise ValueError("Invalid remote TCP state")
    # A guard at N fences any delayed writer of decision N. Only a new SQLite
    # decision can reopen the catalog after that guard.
    return sequence, phase == "CHECKING"


def state_object(snapshot, phase):
    local = snapshot["state"]
    fields = ("lastCheckedAt", "lastVerifiedAt", "currentVersion", "effectiveState",
              "status", "candidateVersion", "documentRevision", "reasons", "coverage", "source")
    state = {name: local[name] for name in fields}
    state.update(schemaVersion=1, provider="tcp", sequence=snapshot["sequence"], phase=phase, catalog=None)
    if phase == "CHECKING":
        state.update(effectiveState="PENDING", status="PENDING_VALIDATION", reasons=["PUBLICATION_IN_PROGRESS"])
    return state


def write_current(storage, state):
    rank = state_order(state)
    body = json_bytes(state, MAX_STATE_BYTES)
    for _ in range(MAX_CONDITIONAL_ATTEMPTS):
        current = storage.get(STATE_KEY, MAX_STATE_BYTES)
        if current is not None:
            remote_rank = state_order(json.loads(current.body))
            if remote_rank > rank:
                return False
            if remote_rank == rank:
                if current.body != body:
                    raise ValueError("Conflicting publication for the same TCP check sequence")
                return True
        if storage.put(STATE_KEY, body, current.etag if current else None):
            return True
    raise OSError("TCP publication state changed repeatedly")


def json_bytes(value, limit):
    body = canonical(value).encode("utf-8")
    if len(body) > limit:
        raise ValueError("TCP publication object exceeds its size limit")
    return body


def ensure_catalog(storage, catalog, state):
    if (catalog["provider"] != "tcp" or catalog["versionId"] != state["currentVersion"]
            or catalog["source"] != state["source"]):
        raise ValueError("SQLite publication state and catalog disagree")
    items = [row for row in catalog["items"] if row["verification"]["status"] == "AUTO_VALIDATED"]
    if not items:
        raise ValueError("TCP publication requires verified prices")
    body = json_bytes({**catalog, "items": items}, MAX_CATALOG_BYTES)
    sha256 = digest(body)
    key = f"tcp/catalogs/{sha256}.json"
    current = storage.get(key, MAX_CATALOG_BYTES)
    if current is None:
        storage.put(key, body, None)
        current = storage.get(key, MAX_CATALOG_BYTES)
    if current is None or current.body != body:
        raise ValueError("Immutable TCP catalog cannot be verified in object storage")
    return {"versionId": catalog["versionId"], "sha256": sha256,
            "sourceSHA256": catalog["source"]["sha256"], "size": len(body)}


def publish_to_storage(store, updater, provider, storage, clock=utc_now):
    before = store.publication_snapshot("tcp", clock())
    if not write_current(storage, state_object(before, "CHECKING")):
        raise ValueError("Remote TCP state is ahead of SQLite; use the original publication database")

    updater.check(provider)
    after = store.publication_snapshot("tcp", clock())
    if after["sequence"] <= before["sequence"]:
        raise ValueError("TCP update produced no new SQLite decision")
    state = state_object(after, "DECISION")
    if state["effectiveState"] == "ACTIVE":
        state["catalog"] = ensure_catalog(storage, after["catalog"], state)
    if not write_current(storage, state):
        return {"status": "SUPERSEDED", "sequence": state["sequence"]}
    return state
