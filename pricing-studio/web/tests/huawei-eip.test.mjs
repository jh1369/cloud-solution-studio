import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import worker from '../dist/server/index.js';
import {calculate,normalizeRows,parseText,priceValidation,huaweiQuoteLines} from '../public/engine.mjs';
import {identifyHuaweiRow,applyHuaweiMatch,quoteHuaweiRows,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {readInventory} from '../public/inventory-import.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {summaryModel} from '../public/ui.mjs';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Math.max(...catalog.items.map(item=>Date.parse(item.verifiedAt)))+60000;
const opts={now,hours:730,discount:0,language:'en'};
const pick=(row,source=catalog)=>applyHuaweiMatch(identifyHuaweiRow(row),source,opts);
const input=(product,specification,fields={},source=catalog)=>pick(normalizeRows([{product,specification,quantity:1,...fields}])[0],source);
const bill=(row,source=catalog)=>calculate(row,source,opts);
const plan=(meter,mode='ONDEMAND')=>catalog.items.find(p=>p.eipMeter===meter&&p.billingMode===mode);
const fixed={usage:10,unit:'Mbit/s'};
const outbound={usage:120,unit:'GB'};
const vm={};runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),vm);
const XLSX=vm.XLSX;

test('fixed EIP prices the dedicated rate in each term and keeps the reference hour assumption visible',()=>{
 const row=input('公网 IP','动态 BGP 固定公网带宽 10 Mbit/s',fixed);
 assert.deepEqual([row.service,bill(row).item.sku,bill(row).termPublic],['EIP','19_bgp',129.94]);
 assert.ok(row.huaweiAssumptions.includes('HW_EIP_REFERENCE_HOURS'));
 for(const [mode,total] of [['MONTHLY',85.5],['YEARLY',855]]){
  selectHuaweiBilling(row,mode,catalog,opts);
  assert.equal(bill(row).termPublic,total);
 }
 assert.equal(bill(pick(parseText('1 EIP fixed bandwidth 10 Mbit/s with 10 hours')[0])).termPublic,1.78);
 assert.equal(bill(input('EIP','fixed bandwidth 2500 Mbps')).reasonCode,'HW_EIP_BANDWIDTH');
 assert.equal(bill(input('EIP','fixed bandwidth 11 Mbps',fixed)).reasonCode,'HW_EIP_CONFLICT');
});

test('only verified graduated full-month outbound traffic is used and never interpreted as bandwidth',()=>{
 assert.equal(bill(input('Elastic IP','dedicated outbound traffic',outbound)).termPublic,10.26);
 assert.equal(bill(input('Elastic IP','dedicated outbound traffic 11 TB')).termPublic,958.21);
 assert.equal(bill(input('EIP','dedicated outbound traffic',{usage:51201,unit:'GB'})).termPublic,4183.11);
 assert.equal(bill(input('EIP','dedicated outbound traffic',{usage:154624,unit:'GB'})).termPublic,11041.28);
 assert.equal(bill(input('EIP','dedicated outbound traffic',{usage:154625,unit:'GB'})).reasonCode,'HW_EIP_TRAFFIC_LIMIT');
 assert.equal(bill(input('EIP','dedicated inbound traffic',outbound)).reasonCode,'HW_EIP_UNSUPPORTED');
 assert.equal(bill(input('EIP','outbound traffic',{usage:120})).reasonCode,'HW_EIP_UNIT');
 assert.equal(bill(input('EIP','outbound traffic')).reasonCode,'HW_EIP_TRAFFIC_USAGE');
 assert.equal(bill(input('EIP','outbound traffic',{...outbound,huawei_billing_mode:'MONTHLY'})).reasonCode,'HW_EIP_MODE');
 assert.equal(bill(input('EIP','outbound traffic',{...outbound,usage_period:'source-period'})).reasonCode,'HW_EIP_TRAFFIC_PERIOD');
 assert.equal(bill(input('EIP','outbound traffic',{...outbound,huawei_target_region:'eu-west-102'})).reasonCode,'HW_TARGET_REGION');
});

test('address reservation charges confirmed idle hours and leaves unknown durations and unsupported modes Pending',()=>{
 assert.equal(bill(input('EIP','unbound address reservation',{usage:730,unit:'hour'})).termPublic,3.65);
 assert.equal(bill(input('EIP','bound address only')).termPublic,0);
 assert.equal(bill(input('EIP','unbound')).reasonCode,'HW_EIP_IDLE_HOURS');
 assert.equal(bill(input('EIP','unbound',{huawei_billing_mode:'YEARLY'})).reasonCode,'HW_EIP_MODE');
 const row=input('EIP','fixed bandwidth 10 Mbps; idle 10 hours');
 const result=quoteHuaweiRows([row],catalog,opts)[0];
 assert.equal(result.termPublic,129.94);
 assert.deepEqual(result.related.map(line=>[line.charge,line.result.termPublic]),[['eipReservation',.05]]);
});

test('the EIP ladder requires verified identities, measures, range and fresh public evidence',()=>{
 const traffic=plan('traffic'),expired=opts.now+8*86400000;
 assert.equal(priceValidation(traffic,catalog,{now:expired}).code,'PRICE_EXPIRED');
 const row=input('EIP','outbound traffic',outbound);
 assert.equal(calculate(row,catalog,{now:expired}).reasonCode,'PRICE_EXPIRED');
 for(const change of [
  item=>item.evidence.probes.splice(-1),item=>item.evidence.probes[0].request.usageMeasureId=9,
  item=>item.evidence.probes[0].response.productId='FICTIONAL',
  item=>item.evidence.probes.at(-1).response.officialWebsiteAmount+=1,
  item=>item.evidence.billingSource='https://example.invalid/'
 ]){
  const item=structuredClone(traffic);change(item);
  assert.equal(priceValidation(item,catalog,opts).code,'PRICE_EVIDENCE');
 }
 const missing={...catalog,items:catalog.items.filter(p=>p.id!==traffic.id)};
 assert.equal(bill(input('EIP','outbound traffic',outbound,missing),missing).reasonCode,'HW_SPEC_PRICE_LINK');
 Object.assign(row,{huaweiSelection:'manual',targetId:plan('bandwidth').id,accepted:true});
 assert.equal(bill(pick(row)).reasonCode,'HW_SPEC_PRICE_LINK');
});

test('ECS, ELB and NAT each quote a separate related EIP; linked or conflicting claims never add twice',()=>{
 const rows=[
  input('ECS','4 vCPU 16 GiB x86 Linux plus EIP fixed bandwidth 10 Mbps eip_ref=demo-a'),
  input('ELB','Dedicated flexible L4 base instance with EIP outbound traffic 120 GB eip_ref=demo-b'),
  input('NAT Gateway','Public small gateway with EIP fixed bandwidth 12 Mbps eip_ref=demo-c',{usage:30,unit:'day'}),
  input('EIP','outbound traffic',{...outbound,eip_ref:'demo-b'})
 ];
 const output=quoteHuaweiRows(rows,catalog,opts);
 assert.deepEqual(output.map(r=>r.termPublic),[111.25,18.25,73.14,10.26]);
 assert.equal(output[0].related[0].result.termPublic,129.94);
 assert.equal(output[1].related.find(line=>line.charge==='eipTraffic').result.linkedRow,4);
 assert.equal(output[2].related[0].result.termPublic,155.93);
 const summary=summaryModel(rows,output,'en');
 assert.deepEqual([summary.ready,summary.total,summary.monthly,summary.status],[6,7,498.77,'1 Pending']);
 const book=buildWorkbook(XLSX,rows,catalog,{...opts,output},'Fictional EIP design');
 assert.deepEqual(Array.from(book.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const quote=XLSX.utils.sheet_to_json(book.Sheets.Quotation,{defval:null});
 assert.equal(quote.find(line=>line.Status==='Linked')['Term Public USD'],null);
 assert.equal(quote.find(line=>line.Status==='Linked')['Linked Row'],4);
 assert.equal(quote.filter(line=>line.Status==='Pending').length,1);
 assert.ok(quote.filter(line=>line.Status==='Pending').every(line=>line['Term Public USD']===null));
 assert.equal(quote.filter(line=>line.Charge==='EIP outbound internet traffic'&&line.Status==='Valid').length,1);
 rows[3].usage=130;pick(rows[3]);
 const conflicting=quoteHuaweiRows(rows,catalog,opts);
 assert.equal(conflicting[3].reasonCode,'HW_EIP_REFERENCE_CONFLICT');
 assert.equal(conflicting[1].termPublic,18.25);
 const unlinked=[input('ECS','4 vCPU 16 GiB Linux with EIP fixed bandwidth 10 Mbps'),input('EIP','fixed bandwidth 10 Mbps')];
 assert.equal(quoteHuaweiRows(unlinked,catalog,opts)[0].related[0].result.reasonCode,'HW_EIP_LINK_REQUIRED');
 assert.equal(huaweiQuoteLines(rows,conflicting).filter(line=>line.result.reasonCode==='HW_EIP_REFERENCE_CONFLICT').length,2);
});

test('the AWS usage worksheet above the review window imports locally without turning fractional counts into resources',()=>{
 const header=['账单账户','产品类型','规格类型','操作','使用量（小时数）','数量','来源金额'];
 const entries=Array.from({length:71},()=>['FICTIONAL','AmazonEC2','SYN-BoxUsage:m6i.large','RunInstances',311.5,0.42,17.33]);
 entries.push(['FICTIONAL','AmazonRDS','SYN-InstanceUsage:db.m5.large','CreateDBInstance',100,0.4,15]);
 entries.push(['FICTIONAL','AmazonES','SYN-Node:m7g.large','CreateDomain',100,0.4,15]);
 const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([header,...entries]),'Fictional usage');
 const rows=readInventory(b,XLSX).standard.map(row=>pick(row));
 assert.equal(rows.length,73);
 const first=rows[0];
 assert.deepEqual([first.quantity,first.usage,first.unit,first.scope,first.period,first.importSource.row],[null,311.5,'hour','aggregate','source-period',2]);
 assert.equal(first.importSource.cells[5],0.42);
 assert.equal(bill(first).status,'Period');
 assert.equal(bill(first).annual,null);
 assert.equal(bill(rows.at(-2)).status,'Conditional');
 assert.equal(bill(rows.at(-2)).effectiveUsage,100);
 assert.equal(bill(rows.at(-1)).reasonCode,'HW_MIG_USAGE_REQUIRED');
});

test('Worker verifies the entire public EIP ladder using GB, and independently returns other verified plans',async()=>{
 const plans=catalog.items.filter(p=>p.service==='EIP');
 const ids=plans.map(p=>p.id),requests=[],fetch=globalThis.fetch;
 let corrupt=false;
 globalThis.fetch=async(_url,init)=>{
  assert.equal(new Headers(init.headers).has('Authorization'),false);
  const body=JSON.parse(init.body);requests.push(body);
  assert.equal(body.regionId,'eu-west-101');assert.ok(body.productInfos.length<=10);
  const matches=body.productInfos.map(product=>{
   const p=plans.find(plan=>plan.productId===product.productId);
   const sample=[p.evidence,...p.evidence.probes].find(e=>e.request.resourceSize===product.resourceSize&&e.request.usageValue===product.usageValue);
   assert.ok(sample);
   assert.equal(product.usageMeasureId,sample.request.usageMeasureId);
   assert.equal(product.resouceSizeMeasureId,sample.request.resouceSizeMeasureId);
   const value=sample.response.officialWebsiteAmount;
   return {id:product.id,productId:product.productId,officialWebsiteAmount:value+(corrupt&&p.eipMeter==='traffic'&&product.usageValue===10241?1:0)};
  });
  return Response.json({currency:'USD',productRatingResult:matches});
 };
 try{
  const get=async()=>{
   const response=await worker.fetch(new Request('https://studio.example/api/rates',{method:'POST',body:JSON.stringify({ids})}));
   assert.equal(response.status,200);return response.json();
  };
  const verified=await get();
  assert.equal(verified.items.length,5);
  assert.equal(requests.length,4);
  assert.ok(verified.items.every(item=>priceValidation(item,catalog).valid));
  corrupt=true;
  const partial=await get();
  assert.deepEqual(partial.pending,[plan('traffic').id]);
  assert.equal(partial.items.length,4);
 }finally{globalThis.fetch=fetch;}
});
