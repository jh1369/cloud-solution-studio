import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {priceValidation} from '../public/engine.mjs';
const catalogue=JSON.parse(await readFile(new URL('../public/catalog.json',import.meta.url)));
const origin='https://pricing.example';
test('Worker serves functional app and restrictive headers',async()=>{const r=await worker.fetch(new Request(origin));assert.equal(r.status,200);assert.match(await r.text(),/Pricing Studio/);assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);});
test('Missing asset is 404',async()=>assert.equal((await worker.fetch(new Request(origin+'/missing'))).status,404));
test('TCP update button API detects official document changes without price promotion',async()=>{
 const status=await (await worker.fetch(new Request(origin+'/api/catalog/tcp/status'))).json();assert.equal(status.provider,'tcp');
 assert.equal((await worker.fetch(new Request(origin+'/api/catalog/tcp/check',{method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);
 const previous=globalThis.fetch,pdf='%PDF-1.4 FICTIONAL ONLY';
 globalThis.fetch=async url=>String(url).includes('/en/prices/price-calculator')?new Response('<a href="/new-service-description.pdf">PDF</a>'):new Response(pdf);
 try{
  const response=await worker.fetch(new Request(origin+'/api/catalog/tcp/check',{method:'POST',body:'{}'}));const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.status,'DOCUMENT_CHANGED');assert.equal(result.currentVersion,status.currentVersion);assert.equal(result.checkScope,'DETECTION_ONLY_NO_PROMOTION');
 }finally{globalThis.fetch=previous;}
});
test('Offline package is a byte-exact ZIP attachment with a working web entry',async()=>{
 const path='/downloads/pricing-studio-offline.zip',version=JSON.parse(await readFile(new URL('../package.json',import.meta.url))).version;
 const archive=process.env.PRICING_OFFLINE_ARCHIVE||fileURLToPath(new URL(`../outputs/offline/Pricing-Studio-${version}-Offline.zip`,import.meta.url));
 const name=basename(archive);
 const response=await worker.fetch(new Request(origin+path));
 const expected=await readFile(archive);
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/zip');
 assert.equal(response.headers.get('Content-Disposition'),`attachment; filename="${name}"`);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(Number(response.headers.get('Content-Length')),expected.length);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);assert.equal(expected.readUInt32LE(0),0x04034b50);
 const head=await worker.fetch(new Request(origin+path,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 const page=await (await worker.fetch(new Request(origin))).text();assert.match(page,/id="download-offline"[^>]*href="\/downloads\/pricing-studio-offline\.zip"/);
 assert.equal((await worker.fetch(new Request(origin+'/downloads/unknown.zip'))).status,404);
});
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
test('Packaged UI exposes bilingual controls and three Huawei target modes',async()=>{
 const page=await (await worker.fetch(new Request(origin))).text();
 assert.match(page,/id="language-toggle"/);
 for(const mode of ['ONDEMAND','MONTHLY','YEARLY'])assert.match(page,new RegExp(`value="${mode}"`));
 for(const asset of ['/app.mjs','/ui.mjs','/i18n.mjs','/excel.mjs']){
  const response=await worker.fetch(new Request(origin+asset));assert.equal(response.status,200,asset);assert.match(response.headers.get('Content-Type'),/javascript/);
 }
 const ui=await (await worker.fetch(new Request(origin+'/ui.mjs'))).text();
 assert.match(ui,/data-field="targetBilling"/);assert.doesNotMatch(ui,/data-field="billing"/);
});
test('Ambiguous response IDs, wrong products and currency stay Pending',async()=>{
 const plan=catalogue.items[0],original=globalThis.fetch;
 try{
  const quote={...plan.evidence.response,id:'0'};
  for(const upstream of [
   {currency:'USD',productRatingResult:[quote,quote]},
   {currency:'USD',productRatingResult:[{...quote,id:'00'}]},
   {currency:'USD',productRatingResult:[{...quote,productId:'SYNTHETIC-WRONG'}]},
   {currency:'EUR',productRatingResult:[quote]},
   {currency:'USD',productRatingResult:[{...quote,officialWebsiteAmount:-1}]}
  ]){
   globalThis.fetch=async()=>Response.json(upstream);
   const response=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:[plan.id]})}));
   assert.equal(response.status,502);const body=await response.json();assert.deepEqual(body.items,[]);assert.deepEqual(body.pending,[plan.id]);
  }
 }finally{globalThis.fetch=original;}
});
test('Refreshed hourly/monthly/yearly prices use independent official inquiry amounts',async()=>{
 const first=catalogue.items.find(p=>p.service==='ECS'),plans=['ONDEMAND','MONTHLY','YEARLY'].map(mode=>catalogue.items.find(p=>p.sku===first.sku&&p.billingMode===mode));
 const original=globalThis.fetch,amounts={ONDEMAND:.111,MONTHLY:37,YEARLY:333};
 globalThis.fetch=async(url,options)=>{
  const inquiry=JSON.parse(options.body),mode=inquiry.chargingMode===1?'ONDEMAND':inquiry.periodType===2?'MONTHLY':'YEARLY';
  return Response.json({currency:'USD',productRatingResult:inquiry.productInfos.map(p=>({id:p.id,productId:p.productId,officialWebsiteAmount:amounts[mode]}))});
 };
 try{
  const response=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:plans.map(p=>p.id)})}));
  const data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.pending,[]);assert.equal(data.items.length,3);
  for(const plan of data.items){assert.equal(plan.rate,amounts[plan.billingMode]);assert.equal(priceValidation(plan,catalogue).valid,true);}
 }finally{globalThis.fetch=original;}
});
