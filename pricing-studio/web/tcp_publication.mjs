// Read the TCP publication through a private R2-compatible Worker binding.
const tcpCurrentKey = 'tcp/current.json';
const tcpStateLimit = 64 * 1024;
const tcpCatalogLimit = 8 * 1024 * 1024;
const tcpMaximumAge = 48 * 60 * 60 * 1000;
const tcpHashPattern = /^[a-f0-9]{64}$/;

function tcpPending(reason, state, effectiveState = 'PENDING') {
  return {
    state: {
      provider: 'tcp', currentVersion: null, lastVerifiedAt: null, lastCheckedAt: null,
      ...state, catalog: null, effectiveState, status: 'PENDING_VALIDATION', reasons: [reason],
    },
    catalog: null,
  };
}

function tcpTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return NaN;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 19) === value.slice(0, 19) ? instant : NaN;
}

async function tcpObjectBytes(object, limit) {
  if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > limit) {
    await object.body?.cancel();
    throw Error('Invalid object size');
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== object.size) throw Error('Incomplete object');
  return bytes;
}

function tcpParseObject(bytes) {
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

function tcpUsableCatalog(catalog, state) {
  const {catalog: reference, source} = state;
  return catalog?.schemaVersion === 1 && catalog.provider === 'tcp' && catalog.currency === 'EUR'
    && catalog.versionId === reference.versionId && catalog.source?.sha256 === reference.sourceSHA256
    && catalog.source.url === source.url && catalog.source.revisionDate === source.revisionDate
    && catalog.source.fetchedAt === source.fetchedAt && Array.isArray(catalog.items) && catalog.items.length > 0
    && catalog.items.every(row => row?.provider === 'tcp' && row.currency === 'EUR'
      && row.availability === 'AVAILABLE' && row.verification?.status === 'AUTO_VALIDATED'
      && Array.isArray(row.verification.reasons) && row.verification.reasons.length === 0
      && row.evidence?.sha256 === reference.sourceSHA256 && row.evidence.url === source.url
      && Array.isArray(row.evidence.pages) && row.evidence.pages.length > 0
      && typeof row.amount === 'string' && /^\d+(?:\.\d+)?$/.test(row.amount) && Number(row.amount) <= 1e12);
}

export async function readTCPPublication(bucket, now = Date.now) {
  if (!bucket) return tcpPending('STORAGE_NOT_CONFIGURED');
  let state;
  try {
    const head = await bucket.get(tcpCurrentKey);
    if (!head) return tcpPending('STATE_MISSING');
    if (!head.version || !head.etag) return tcpPending('STATE_INVALID');
    const candidate = tcpParseObject(await tcpObjectBytes(head, tcpStateLimit));
    if (candidate?.schemaVersion !== 1 || candidate.provider !== 'tcp'
        || !Number.isSafeInteger(candidate.sequence) || candidate.sequence < 0
        || !['CHECKING', 'DECISION'].includes(candidate.phase)) return tcpPending('STATE_INVALID');
    state = candidate;
    if (state.phase === 'CHECKING') return tcpPending('PUBLICATION_IN_PROGRESS', state);
    if (state.effectiveState !== 'ACTIVE') {
      if (state.catalog !== null || !['PENDING', 'STALE', 'UNINITIALIZED'].includes(state.effectiveState)) {
        return tcpPending('STATE_INVALID');
      }
      return {state, catalog: null};
    }

    const {catalog: reference, source} = state;
    const verified = tcpTimestamp(state.lastVerifiedAt);
    const checked = tcpTimestamp(state.lastCheckedAt);
    const fetched = tcpTimestamp(source?.fetchedAt);
    const time = now();
    if (state.sequence === 0 || !['UPDATED', 'UNCHANGED'].includes(state.status)
        || typeof state.currentVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,160}$/.test(state.currentVersion)
        || state.candidateVersion !== state.currentVersion || reference?.versionId !== state.currentVersion
        || typeof reference.sha256 !== 'string' || !tcpHashPattern.test(reference.sha256)
        || typeof reference.sourceSHA256 !== 'string' || !tcpHashPattern.test(reference.sourceSHA256)
        || reference.sourceSHA256 !== source?.sha256 || typeof source.url !== 'string'
        || !/^https:\/\/(?:www\.)?t-cloud-public\.com(?::443)?\//i.test(source.url)
        || !Number.isSafeInteger(reference.size) || reference.size <= 0 || reference.size > tcpCatalogLimit
        || !(fetched <= verified && checked <= verified && verified <= time)) return tcpPending('STATE_INVALID');
    if (time - verified > tcpMaximumAge) return tcpPending('CATALOG_EXPIRED', state, 'STALE');

    const object = await bucket.get(`tcp/catalogs/${reference.sha256}.json`);
    if (!object) return tcpPending('CATALOG_MISSING', state);
    const bytes = await tcpObjectBytes(object, reference.size);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== reference.size || hash !== reference.sha256) return tcpPending('CATALOG_INTEGRITY', state);
    const catalog = tcpParseObject(bytes);
    if (!tcpUsableCatalog(catalog, state)) return tcpPending('CATALOG_CONTRACT_INVALID', state);

    const latest = await bucket.head(tcpCurrentKey);
    if (!latest || latest.etag !== head.etag || latest.version !== head.version) return tcpPending('STATE_CHANGED', state);
    if (now() - verified > tcpMaximumAge) return tcpPending('CATALOG_EXPIRED', state, 'STALE');
    return {state, catalog};
  } catch {
    return tcpPending('PUBLICATION_READ_FAILED', state);
  }
}
