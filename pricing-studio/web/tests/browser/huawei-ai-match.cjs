// Run after npm run build. This starts an isolated Worker and a synthetic loopback model.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { chromium } = require('playwright');

const runtime = { Buffer, Uint8Array, ArrayBuffer };
runInNewContext(readFileSync('public/vendor/xlsx.full.min.js', 'utf8'), runtime);
const { XLSX } = runtime;
const csv = ['产品类型,规格类型,操作,使用量（小时数）,数量',
  'AmazonEC2,FIC-BoxUsage:m5.large,RunInstances,11,0.1',
  'AmazonEC2,FIC-BoxUsage:t3.nano,RunInstances,73,0.1',
  'AmazonEC2,FIC-BoxUsage:m6g.xlarge,RunInstances,20,0.1',
  'AmazonElastiCache,FIC-NodeUsage:cache.t2.small,CreateCacheCluster,120,0.1',
  'AmazonRDS,FIC-Aurora:ServerlessV2Usage,CreateDBCluster,27,1',
  'AmazonES,FIC-UltraWarmUsage:ultrawarm1.medium,ESDomain,43,0.06'
].join('\n');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.read(csv, { type: 'string' }).Sheets.Sheet1, 'Synthetic inventory');
const file = { name: 'synthetic-budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' })) };
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8'));
const clock = new Date(Date.parse(catalog.verifiedAt) + 60000);
const sheets = ['Input', 'Service Mapping', 'Public Pricing', 'Quotation', 'Assumptions'];

async function download(page) {
  const awaiting = page.waitForEvent('download');
  await page.locator('#quote-export').click();
  const artifact = await awaiting;
  const exported = XLSX.read(readFileSync(await artifact.path()), { type: 'buffer' });
  assert.deepEqual(Array.from(exported.SheetNames), sheets);
  return name => XLSX.utils.sheet_to_json(exported.Sheets[name], { header: 1, defval: null });
}

async function main() {
  const received = [];
  const version = JSON.parse(readFileSync('package.json')).version;
  const offlinePath = resolve('outputs/offline', `Pricing-Studio-${version}-Offline.html`);
  const model = createServer(async (request, response) => {
    if (request.url === '/standalone.html' && request.method === 'GET') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(readFileSync(offlinePath));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.response_format.json_schema.name, 'huawei_sku_recommendations');
    const inputs = JSON.parse(body.messages[1].content);
    received.push(...inputs);
    const recommendations = inputs.map(input => ({
      id: input.id, service: input.source.service, selection: input.candidates[0].id,
      alternatives: input.candidates.slice(1, 3).map(item => item.id), reason: 'Synthetic reference selection.',
      differences: ['Review target capacity.'], assumptions: ['Reference workload.'], missing: []
    }));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recommendations }) } }] }));
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn(process.execPath, ['scripts/dev-server.mjs'], { env: { ...process.env, PORT: String(port),
    HUAWEI_MATCH_MODEL_PORT: String(model.address().port), HUAWEI_MATCH_MODEL: 'synthetic-browser-fixture' } });
  const errors = [];
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Loopback Worker failed to start')), 10000);
      server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
    });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const base = 'http://127.0.0.1:' + port;
    const page = await browser.newPage({ acceptDownloads: true });
    page.on('pageerror', error => errors.push(error.message));
    const external = [];
    await page.route('**/*', route => {
      if (route.request().url().startsWith(base + '/')) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.clock.setFixedTime(clock);
    await page.addInitScript(() => localStorage.setItem('pricing-studio.language', 'en'));
    await page.goto(base);
    await page.waitForFunction(() => document.documentElement.lang === 'en' &&
      document.querySelector('#metric-plans').textContent.match(/\d/));
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#ai-coverage').textContent.includes('Rules 1/6'), null, {timeout:5000}).catch(async error => { console.error(errors, await page.locator('#message').textContent(), await page.locator('#ai-coverage').textContent()); throw error; });
    assert.equal(received.length, 0);
    await page.locator('#ai-run').click();
    await page.waitForFunction(() => document.querySelector('#ai-state').textContent.includes('AI candidates 5'));
    assert.match(await page.locator('#ai-coverage').innerText(), /AI priced 3.*Pending 2/);
    assert.equal(received.length, 5);
    assert.ok(received.every(item => !JSON.stringify(item).includes('CreateDBCluster')));
    const primary = await download(page);
    const assumptions = Object.fromEntries(primary('Assumptions'));
    const total = assumptions['Estimated Budget Source Period USD'];
    assert.equal(total, 12.72);
    assert.match(await page.locator('#monthly-money').innerText(), /^\$12\.72/);
    const mapping = primary('Service Mapping');
    const origin = mapping[0].indexOf('Match Source');
    assert.equal(mapping.filter(row => row[origin] === 'AI Suggested').length, 5);
    const options = page.locator('select[data-field="aiAlternative"]').first();
    const previous = await options.inputValue();
    const alternative = await options.locator('option').nth(2).getAttribute('value');
    assert.notEqual(previous, alternative);
    await options.selectOption(alternative);
    assert.match(await page.locator('#ai-coverage').innerText(), /AI priced 2.*Manual 1.*Pending 2/);
    await page.locator('#ai-retry').click();
    await page.waitForFunction(() => document.querySelector('#ai-state').textContent.includes('AI candidates 4'));
    assert.equal(await options.inputValue(), alternative);
    const reviewed = await download(page);
    assert.equal(reviewed('Service Mapping')[2][origin], 'Manual');
    const reviewedTotal = Object.fromEntries(reviewed('Assumptions'))['Estimated Budget Source Period USD'];
    assert.ok((await page.locator('#monthly-money').innerText()).startsWith('$' + reviewedTotal.toFixed(2)));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);

    const offline = await browser.newPage({ acceptDownloads: true });
    offline.on('pageerror', error => errors.push(error.message));
    await offline.clock.setFixedTime(clock);
    const offlineRequests = [];
    const standalone = 'http://127.0.0.1:' + model.address().port + '/standalone.html';
    await offline.route('**/*', route => {
      offlineRequests.push(route.request().url());
      return route.request().url() === standalone ? route.continue() : route.abort();
    });
    await offline.goto(standalone);
    await offline.waitForFunction(() => document.querySelector('#metric-plans').textContent.match(/\d/));
    await offline.locator('#file').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv',
      buffer: Buffer.from('product,specification,quantity,usage,unit\nEC2,2 vCPU 4 GB Linux,1,10,hour\n') });
    await offline.waitForFunction(() => document.querySelector('#resource-count').textContent === '1');
    assert.equal(await offline.locator('#ai-matching').isVisible(), false);
    assert.equal((await download(offline))('Input').length, 2);
    assert.deepEqual(errors, []);
    assert.deepEqual(offlineRequests, [standalone]);
    console.log(`Chromium ${browser.version()}: $12.72 source-period budget matched the five-sheet export. Manual choice survived rerun. Standalone HTML import and download over loopback passed.`);
  } finally {
    await browser?.close();
    server.kill();
    model.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
