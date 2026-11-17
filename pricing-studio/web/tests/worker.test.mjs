import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {readFile} from 'node:fs/promises';
const catalogue=JSON.parse(await readFile(new URL('../public/catalog.json',import.meta.url)));
const origin='https://pricing.example';
test('Worker serves functional app and restrictive headers',async()=>{const r=await worker.fetch(new Request(origin));assert.equal(r.status,200);assert.match(await r.text(),/Pricing Studio/);assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);});
test('Missing asset is 404',async()=>assert.equal((await worker.fetch(new Request(origin+'/missing'))).status,404));
test('Rate API blocks cross-origin requests',async()=>{const r=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',headers:{Origin:'https://elsewhere.example'},body:'{}'}));assert.equal(r.status,403);});
test('Rate API rejects unknown products and invalid payloads',async()=>{for(const body of ['x','{}','{"ids":["unknown"]}']){const r=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body}));assert.equal(r.status,400);}});
test('Rate API verifies product identity and currency',async()=>{const p=catalogue.items.find(p=>p.service==='ECS'),previous=globalThis.fetch;let payload;
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'portal.eu.huaweicloud.com');payload=JSON.parse(options.body);return Response.json({currency:'USD',productRatingResult:[{...p.evidence.response,id:'0'}]});};
 try{const r=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:[p.id]})}));const data=await r.json();assert.equal(data.items[0].rate,p.rate);assert.equal(payload.productInfos[0].productId,p.id);assert.equal(payload.regionId,'eu-west-101');assert.equal(payload.productInfos[0].productNum,1);assert.equal(Object.keys(payload).includes('account'),false);}finally{globalThis.fetch=previous;}
});
test('Unavailable official service never fabricates price',async()=>{const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('unavailable',{status:503});try{const r=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:[catalogue.items[0].id]})}));assert.equal(r.status,502);assert.deepEqual((await r.json()).items,[]);}finally{globalThis.fetch=previous;}});
test('Mixed mode refresh sends separate official monthly and yearly inquiries',async()=>{
 const hourly=catalogue.items.find(p=>p.service==='ECS');
 const selected=['ONDEMAND','MONTHLY','YEARLY'].map(mode=>catalogue.items.find(p=>p.sku===hourly.sku&&p.billingMode===mode));
 assert.ok(selected.every(Boolean));
 const previous=globalThis.fetch,payloads=[];
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);payloads.push(body);return Response.json({currency:'USD',productRatingResult:body.productInfos.map(product=>({...catalogue.items.find(p=>p.productId===product.productId).evidence.response,id:product.id}))});};
 try{
  const result=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:selected.map(p=>p.id)})}));
  const data=await result.json();assert.equal(data.items.length,3);assert.equal(payloads.length,3);
  assert.equal(payloads[0].chargingMode,1);assert.equal(payloads[0].periodType,undefined);
  assert.equal(payloads[1].chargingMode,0);assert.equal(payloads[1].periodType,2);assert.equal(payloads[1].periodNum,1);
  assert.equal(payloads[2].chargingMode,0);assert.equal(payloads[2].periodType,3);assert.equal(payloads[2].periodNum,1);
  for(const item of data.items)assert.equal(item.evidence.response.productId,item.productId);
 }finally{globalThis.fetch=previous;}
});
test('Deployed bundle exposes billing revision and three target-mode choices',async()=>{
 const page=await (await worker.fetch(new Request(origin))).text();
 assert.match(page,/billing-modes-v0\.1\.1/);assert.match(page,/>V0\.1\.1</);
 assert.match(page,/value="ONDEMAND">按需/);assert.match(page,/value="MONTHLY">包月/);assert.match(page,/value="YEARLY">包年/);
 const app=await (await worker.fetch(new Request(origin+'/app.mjs?v=billing-v011'))).text();
 assert.match(app,/data-field="targetBilling"/);assert.doesNotMatch(app,/data-field="billing"/);
 assert.match(app,/Object\.entries\(BILLING_MODES\)/);assert.match(app,/AWS 原计费方式/);
});
