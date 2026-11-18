import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import worker from '../dist/server/index.js';
import {readTCPPublication,tcpReleaseStore} from '../tcp_publication.mjs';

const fixture = fileURLToPath(new URL('./fixtures/tcp_publication_fixture.py', import.meta.url));
const {objects, now, pdf} = JSON.parse(execFileSync('python3.12', [fixture], {encoding: 'utf-8'}));
const currentKey = 'tcp/current.json';
const baseline = JSON.parse(objects[currentKey].text);
const catalogKey = `tcp/catalogs/${baseline.catalog.sha256}.json`;
const origin = 'https://pricing.example';

function stored(text) {
  return {text, etag: createHash('sha256').update(text).digest('hex')};
}

function mockBucket() {
  const data = new Map(Object.entries(objects));
  const reads = [];
  return {
    data, reads,
    setState(state) { data.set(currentKey, stored(JSON.stringify(state))); },
    async get(key) {
      reads.push(key);
      const item = data.get(key);
      if (!item) return null;
      const bytes = new TextEncoder().encode(item.text);
      return {size: bytes.byteLength, etag: item.etag, version: item.etag, arrayBuffer: async () => bytes.buffer};
    },
    async head(key) {
      const item = data.get(key);
      return item ? {etag: item.etag, version: item.etag} : null;
    },
  };
}

function get(path, bucket, init) {
  return worker.fetch(new Request(origin + '/api/catalog/tcp/' + path, init), {TCP_CATALOG_BUCKET: bucket});
}

async function expectPending(bucket, reason) {
  const payload = await (await get('catalog', bucket)).json();
  assert.equal(payload.state.effectiveState, 'PENDING');
  assert.deepEqual(payload.state.reasons, [reason]);
  assert.equal(payload.catalog, null);
  assert.equal(payload.state.catalog, null);
}

test('built Worker reads the exact catalog published from a fictional PDF through SQLite', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  const bucket = mockBucket();
  const response = await get('catalog', bucket);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const {state, catalog} = await response.json();
  assert.equal(state.effectiveState, 'ACTIVE');
  assert.equal(state.currentVersion, catalog.versionId);
  assert.equal(state.lastVerifiedAt, now);
  assert.equal(state.catalog.sha256, objects[catalogKey].etag);
  assert.equal(state.catalog.sourceSHA256, catalog.source.sha256);
  assert.deepEqual(catalog, JSON.parse(objects[catalogKey].text));
  assert.deepEqual(catalog.items.map(row => row.amount), ['0.111000', '0.222000', '0.000000']);
  assert.deepEqual(bucket.reads, [currentKey, catalogKey]);
  assert.deepEqual(await (await get('status', bucket)).json(), state);
  assert.equal((await get('catalog', bucket, {method: 'POST'})).status, 405);
});

test('missing binding, state, or object never supplies usable prices', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  await expectPending(undefined, 'STORAGE_NOT_CONFIGURED');
  const bucket = mockBucket();
  bucket.data.delete(catalogKey);
  await expectPending(bucket, 'CATALOG_MISSING');
  assert.equal((await (await get('status', bucket)).json()).effectiveState, 'PENDING');
  bucket.data.delete(currentKey);
  await expectPending(bucket, 'STATE_MISSING');
});

test('invalid version, source hash, or status stops before the immutable object read', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  for (const state of [
    {...baseline, currentVersion: 'fictional-other-version'},
    {...baseline, sequence: 0},
    {...baseline, status: 'CHECK_FAILED'},
    {...baseline, lastVerifiedAt: '2026-02-30T01:00:00Z'},
    {...baseline, catalog: {...baseline.catalog, sha256: '../../other-object'}},
    {...baseline, catalog: {...baseline.catalog, sourceSHA256: '1'.repeat(64)}},
  ]) {
    const bucket = mockBucket();
    bucket.setState(state);
    await expectPending(bucket, 'STATE_INVALID');
    assert.deepEqual(bucket.reads, [currentKey]);
  }
});

test('tampering and catalog/state mismatch with a valid byte hash both fail closed', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  const bucket = mockBucket();
  bucket.data.set(catalogKey, stored(objects[catalogKey].text.replace('0.111000', '0.999000')));
  await expectPending(bucket, 'CATALOG_INTEGRITY');

  const wrong = JSON.parse(objects[catalogKey].text);
  wrong.versionId = 'fictional-unrelated-version';
  const variant = stored(JSON.stringify(wrong));
  bucket.data.set(`tcp/catalogs/${variant.etag}.json`, variant);
  bucket.setState({...baseline, catalog: {...baseline.catalog, sha256: variant.etag, size: Buffer.byteLength(variant.text)}});
  await expectPending(bucket, 'CATALOG_CONTRACT_INVALID');
});

test('an in-progress or failed publication does not reuse stored historical prices', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  const bucket = mockBucket();
  bucket.setState({...baseline, phase: 'CHECKING', catalog: null, effectiveState: 'PENDING'});
  await expectPending(bucket, 'PUBLICATION_IN_PROGRESS');
  bucket.setState({...baseline, phase: 'DECISION', status: 'CHECK_FAILED', catalog: null,
    effectiveState: 'PENDING', reasons: ['FETCH_OR_VALIDATION_FAILED']});
  const result = await (await get('catalog', bucket)).json();
  assert.equal(result.state.status, 'CHECK_FAILED');
  assert.equal(result.state.effectiveState, 'PENDING');
  assert.equal(result.state.lastVerifiedAt, now);
  assert.equal(result.catalog, null);
  assert.deepEqual(bucket.reads, [currentKey, currentKey]);
});

test('Worker rejects a current-state change while loading the catalog', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  const bucket = mockBucket();
  const originalGet = bucket.get.bind(bucket);
  bucket.get = key => {
    if (key === catalogKey) bucket.setState({...baseline, phase: 'CHECKING', catalog: null, effectiveState: 'PENDING'});
    return originalGet(key);
  };
  await expectPending(bucket, 'STATE_CHANGED');
});

test('official document detection cannot reopen a publication guarded during detection', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  const bucket = mockBucket();
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/prices/price-calculator')) {
      return new Response('<a href="/fictional-service-description.pdf">PDF</a>');
    }
    bucket.setState({...baseline, phase: 'CHECKING', catalog: null, effectiveState: 'PENDING'});
    return new Response(Buffer.from(pdf, 'base64'));
  });
  const result = await (await get('check', bucket, {method: 'POST', body: '{}'})).json();
  assert.equal(result.effectiveState, 'PENDING');
  assert.equal(result.lastVerifiedAt, now);
  assert.equal(result.catalog, null);
  assert.deepEqual(result.reasons, ['PUBLICATION_IN_PROGRESS']);
  assert.deepEqual(bucket.reads, [currentKey]);
});

test('48-hour expiry is enforced even during a read and future verification is rejected', async t => {
  const verified = Date.parse(now), boundary = verified + 48 * 3600000;
  let clock = verified - 1;
  t.mock.method(Date, 'now', () => clock);
  await expectPending(mockBucket(), 'STATE_INVALID');
  clock = boundary;
  assert.equal((await (await get('catalog', mockBucket())).json()).state.effectiveState, 'ACTIVE');
  const bucket = mockBucket();
  const originalHead = bucket.head.bind(bucket);
  bucket.head = key => {
    clock += 1;
    return originalHead(key);
  };
  const expired = await (await get('catalog', bucket)).json();
  assert.equal(expired.state.effectiveState, 'STALE');
  assert.equal(expired.catalog, null);
  assert.deepEqual(expired.state.reasons, ['CATALOG_EXPIRED']);
  bucket.reads.length = 0;
  assert.equal((await (await get('status', bucket)).json()).effectiveState, 'STALE');
  assert.deepEqual(bucket.reads, [currentKey]);
});

test('a verified release snapshot keeps its original verification and expires',async()=>{
  const catalog=Buffer.from(objects[catalogKey].text);
  const store=tcpReleaseStore({sha256:baseline.catalog.sha256,state:Buffer.from(objects[currentKey].text).toString('base64'),
    catalog:gzipSync(catalog).toString('base64'),size:catalog.length});
  const verified=Date.parse(now);
  const active=await readTCPPublication(store,()=>verified);
  assert.equal(active.state.lastVerifiedAt,now);
  assert.equal(active.catalog.versionId,baseline.currentVersion);
  const stale=await readTCPPublication(store,()=>verified+48*3600000+1);
  assert.equal(stale.state.effectiveState,'STALE');
  assert.equal(stale.catalog,null);
});

test('oversized and unavailable storage objects fail closed', async t => {
  t.mock.method(Date, 'now', () => Date.parse(now));
  let readBody = false;
  await expectPending({
    async get() { return {etag: 'fictional', version: 'fictional', size: 65537, arrayBuffer() { readBody = true; }}; },
  }, 'PUBLICATION_READ_FAILED');
  assert.equal(readBody, false);
  await expectPending({async get() { throw Error('Fictional storage failure'); }}, 'PUBLICATION_READ_FAILED');
});
