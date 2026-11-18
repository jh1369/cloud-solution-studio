// Run against the online public/ entry on loopback. Only catalog.json and /api/rates are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const sandbox = {Buffer, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder};
vm.runInNewContext(readFileSync(require.resolve('../../public/vendor/xlsx.full.min.js'), 'utf8'), sandbox);
const XLSX = sandbox.XLSX;

const base = process.env.PRICING_TEST_URL || 'http://127.0.0.1:4173';
assert.equal(new URL(base).hostname, '127.0.0.1');
const now = Date.UTC(2035, 0, 15, 12);
const sheets = ['Input', 'Service Mapping', 'Public Pricing', 'Quotation', 'Assumptions'];

async function checkExport(page, button, plans, destination, expired = false) {
  const download = page.waitForEvent('download');
  await page.locator(button).click();
  await (await download).saveAs(destination);
  const book = XLSX.read(await fs.readFile(destination), {type: 'buffer'});
  assert.deepEqual(Array.from(book.SheetNames), sheets);
  const values = name => XLSX.utils.sheet_to_json(book.Sheets[name], {header: 1, defval: null});
  const workbookTotal = Object.fromEntries(values('Assumptions'))['Monthly equivalent partial subtotal USD'];
  const displayed = await page.locator('#scenario-money').innerText();
  assert.equal(displayed, workbookTotal === null ? '—' : '$' + workbookTotal.toFixed(2), 'page vs downloaded subtotal');
  const inputs = values('Input').slice(1);
  const mapping = values('Service Mapping').slice(1);
  const pricing = values('Public Pricing').slice(1);
  const quotation = values('Quotation').slice(1);
  assert.equal(quotation.length, 11);
  let total = 0;
  for (const [i, plan] of plans.entries()) {
    assert.equal(inputs[i][12], 'ONDEMAND');
    assert.equal(mapping[i][3], plan.sku);
    assert.equal(mapping[i][6], 'Yes');
    assert.equal(pricing[i][2], plan.productId);
    assert.equal(pricing[i][7], plan.verifiedAt);
    assert.deepEqual(JSON.parse(pricing[i][9]), plan.evidence);
    const valid = !expired && i >= 2;
    assert.equal(pricing[i][1], valid ? 'Valid' : 'Pending');
    assert.equal(pricing[i][4], valid ? plan.rate : null);
    assert.equal(quotation[i][2], valid ? 'Valid' : 'Pending');
    if (valid) {
      const expected = plan.rate * 10;
      assert.equal(quotation[i][5], expected);
      total += expected;
    } else {
      for (const col of [3, 5, 6, 7, 8, 12, 13, 14]) assert.equal(quotation[i][col], null);
    }
  }
  assert.equal(workbookTotal, expired ? null : total);
}

async function scenario(browser, firstFails, output) {
  const { syntheticPlan } = await import('../fixtures/synthetic-catalog.mjs');
  const makePlan = (i, rate, time) => syntheticPlan({
    name: 'BATCH-' + i, sku: 'fictional.batch.' + i, cpu: i + 1, memory: 4, rate, now: time
  });
  const original = Array.from({length: 11}, (_, i) => makePlan(i, 1, i === 0 ? now - 8 * 86400000 : now));
  original[1].rate = null;
  original[1].evidence = null;
  const refreshed = original.map((_, i) => makePlan(i, 3, now + 30000));
  const page = await browser.newPage();
  const label = firstFails ? 'first-503' : 'first-partial';
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await page.clock.setFixedTime(new Date(now));
    await page.route('**/catalog.json', route => route.fulfill({json: {
      region: 'eu-west-101', currency: 'USD', ttlDays: 7, items: original
    }}));
    page.on('request', req => {
      if (req.url().endsWith('/api/rates')) calls.push(req.postDataJSON().ids);
    });
    await page.route('**/api/rates', async route => {
      const ids = route.request().postDataJSON().ids;
      if (calls.length === 1 && firstFails) return route.fulfill({status: 503, body: ''});
      if (calls.length === 2) await gate;
      const items = refreshed.filter((p, i) => i >= 2 && ids.includes(p.id));
      await route.fulfill({json: {items, pending: ids.filter(id => !items.some(p => p.id === id))}});
    });
    await page.goto(base);
    const csv = ['product,specification,quantity,usage,unit',
      ...original.map(p => 'EC2,' + p.cpu + ' vCPU 4 GB Linux,1,10,hour')].join('\n');
    await page.locator('#file').setInputFiles({name:'fictional-batch.csv', mimeType:'text/csv', buffer:Buffer.from(csv)});
    await page.locator('#confirm-all').click();
    await page.locator('#confirm-check').check();
    await page.locator('#apply-confirm').click();
    const second = page.waitForRequest(req => req.url().endsWith('/api/rates') && req.postDataJSON().ids.length === 1, {timeout: 4000});
    await page.locator('#refresh-prices').click();
    await second;
    assert.deepEqual(calls, [original.slice(0,10).map(p=>p.id), [original[10].id]]);
    assert.equal(await page.locator('#scenario-money').innerText(), '$90.00');
    for (const [name, button] of [['top','#export'], ['card','#quote-export']]) {
      await checkExport(page, button, original, path.join(output, label+'-waiting-'+name+'.xlsx'));
    }
    release();
    await page.waitForFunction(() => !document.querySelector('#refresh-prices').disabled);
    const final = original.map((p,i) => i >= (firstFails ? 10 : 2) ? refreshed[i] : p);
    assert.match(await page.locator('#message').innerText(), new RegExp('验证 '+(firstFails ? 1 : 9)+' 个方案'));
    for (const [name, button] of [['top','#export'], ['card','#quote-export']]) {
      await checkExport(page, button, final, path.join(output, label+'-finished-'+name+'.xlsx'));
    }
    await page.locator('#next-page').click();
    const selection = await page.locator('.target-select option:checked').innerText();
    assert.ok(selection.includes(final[10].sku) && selection.includes('$3/'));
    const stamp = await page.evaluate(stamp => new Date(stamp).toLocaleString('zh-CN'), final[10].verifiedAt);
    assert.ok((await page.locator('.row-notes').first().innerText()).includes(stamp));
    if (firstFails) {
      await page.clock.setFixedTime(new Date(now + 8 * 86400000));
      for (const [name, button] of [['top','#export'], ['card','#quote-export']]) {
        await checkExport(page, button, final, path.join(output, 'expired-'+name+'.xlsx'), true);
        assert.ok((await page.locator('.target-select option:checked').innerText()).includes('Pending'));
      }
    }
  } finally {
    release();
    await page.close();
  }
}

(async () => {
  const output = process.env.PRICING_DOWNLOAD_DIR || await fs.mkdtemp(path.join(os.tmpdir(),'pricing-batch-'));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
  let failures = 0;
  try {
    for (const firstFails of [true, false]) {
      try { await scenario(browser, firstFails, output); }
      catch (error) { failures++; console.error(firstFails ? 'First batch 503' : 'Second batch delayed', error.message); }
    }
  } finally { await browser.close(); }
  assert.equal(failures, 0, 'batch refresh regression scenarios');
  console.log('2 scenarios passed; 10 browser downloads verified:', output);
})().catch(error => { console.error(error); process.exitCode = 1; });
