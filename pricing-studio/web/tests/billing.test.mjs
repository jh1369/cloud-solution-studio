import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseText,normalizeRows,recommend,calculate,cost,switchBilling,BILLING_MODES,billingOf} from '../public/engine.mjs';
const catalog=JSON.parse(await readFile(new URL('../public/catalog.json',import.meta.url)));
function compute(mode='ONDEMAND'){
 const row=parseText('2 台 EC2 c5.large Linux 730 小时')[0];switchBilling(row,mode,catalog);row.accepted=true;return row;
}
test('Huawei target choices are exactly three conventional modes',()=>{assert.deepEqual(Object.keys(BILLING_MODES),['ONDEMAND','MONTHLY','YEARLY']);});
test('AWS reserved and spot are preserved but do not control Huawei pricing',()=>{
 for(const method of ['reserved','spot','需确认']){
  const [row]=normalizeRows([{product:'EC2',specification:'c5.large Linux',quantity:1,usage:730,billing_method:method}]);
  assert.equal(row.billing,method);assert.equal(billingOf(row),'ONDEMAND');row.targetId=recommend(row,catalog);row.accepted=true;
  assert.equal(calculate(row,catalog).status,'Valid');
 }
});
test('Monthly contract uses verified monthly price, not usage hours',()=>{
 const row=compute('MONTHLY');row.usage=null;const result=calculate(row,catalog);
 assert.equal(result.status,'Valid');assert.equal(result.termScenario,cost(2,1,result.item.rate).monthly);
 assert.equal(result.annual,cost(2,1,result.item.rate).annual);assert.equal(result.upfrontScenario,result.termScenario);
 const hourly=catalog.items.find(p=>p.sku===result.item.sku&&p.billingMode==='ONDEMAND');assert.notEqual(result.termScenario,cost(2,730,hourly.rate).monthly);
});
test('Annual contract uses independently verified annual price and shows amortization',()=>{
 const row=compute('YEARLY'),result=calculate(row,catalog,{discount:.15});
 assert.equal(result.status,'Valid');assert.equal(result.item.periodType,3);
 assert.equal(result.annual,cost(2,1,result.item.rate,.15).scenario);
 assert.equal(result.upfrontScenario,result.annual);assert.equal(result.termLabel,'1年');
 assert.equal(result.scenario,cost(1,1,result.annual/12).monthly);
 const month=catalog.items.find(p=>p.sku===result.item.sku&&p.billingMode==='MONTHLY');assert.notEqual(result.annual,cost(2,1,month.rate,.15).annual);
});
test('Switching target mode preserves SKU when available and clears confirmation',()=>{
 const row=compute(),sku=catalog.items.find(p=>p.id===row.targetId).sku;switchBilling(row,'包月',catalog);
 assert.equal(row.targetBilling,'MONTHLY');assert.equal(row.accepted,false);assert.equal(catalog.items.find(p=>p.id===row.targetId).sku,sku);
 assert.equal(calculate(row,catalog).status,'Pending');
});
test('Incorrect price mode cannot be reused after switching',()=>{const row=compute();row.targetBilling='YEARLY';assert.equal(calculate(row,catalog).status,'Pending');});
test('No subscription rate means Pending without hourly fallback',()=>{
 const row=compute('MONTHLY');row.targetId='';assert.equal(calculate(row,catalog).status,'Pending');
 const [lb]=normalizeRows([{product:'ELB',quantity:1,usage:730,huawei_billing_mode:'包年'}]);switchBilling(lb,'YEARLY',catalog);lb.accepted=true;
 assert.equal(lb.targetId,'');assert.equal(calculate(lb,catalog).status,'Pending');
});
test('Aggregate instance-hours cannot establish monthly/yearly subscription quantities',()=>{
 const [row]=normalizeRows([{'AWS Service':'Elastic Compute Cloud',Description:'c5.large Linux','Period Aggregate Usage':1460,'Original Unit':'Hrs','Billing Method':'reserved'}]);
 switchBilling(row,'MONTHLY',catalog);row.accepted=true;assert.equal(calculate(row,catalog).status,'Pending');
 row.period='monthly';assert.equal(calculate(row,catalog).status,'Pending');
 row.targetQuantity=2;const result=calculate(row,catalog);assert.equal(result.status,'Valid');assert.equal(result.quantity,2);assert.equal(row.quantity,null);
});
test('EVS monthly/yearly use per-disk capacity, not GB-hours',()=>{
 for(const mode of ['MONTHLY','YEARLY']){
  const row=parseText('2 个 EBS gp3 500 GB')[0];switchBilling(row,mode,catalog);row.accepted=true;
  const a=calculate(row,catalog,{hours:730}),b=calculate(row,catalog,{hours:100});
  assert.equal(a.status,'Valid');assert.equal(a.termPublic,cost(2,500,a.item.rate).monthly);assert.equal(a.termPublic,b.termPublic);
  row.capacity=null;assert.equal(calculate(row,catalog).status,'Pending');
 }
});
test('Fractional and zero subscription quantity stay Pending',()=>{for(const quantity of [0,.5]){const row=compute('YEARLY');row.targetQuantity=quantity;assert.equal(calculate(row,catalog).status,'Pending');}});
test('Import and text preserve independent source/target modes',()=>{
 const [row]=normalizeRows([{product:'EC2',billing_method:'spot',huawei_billing_mode:'包年'}]);assert.equal(row.billing,'spot');assert.equal(row.targetBilling,'YEARLY');
 const [text]=parseText('1 台 EC2 c5.large Linux spot，华为云包年');assert.equal(text.billing,'spot');assert.equal(text.targetBilling,'YEARLY');
});
test('Each official plan records and verifies its own billing parameters',()=>{
 const counts={ONDEMAND:0,MONTHLY:0,YEARLY:0};
 for(const p of catalog.items){counts[p.billingMode]++;assert.equal(p.evidence.response.productId,p.productId);assert.equal(p.evidence.response.officialWebsiteAmount,p.rate);
  assert.equal(p.evidence.inquiry.chargingMode,p.billingMode==='ONDEMAND'?1:0);
  if(p.billingMode!=='ONDEMAND'){assert.equal(p.periodNum,1);assert.equal(p.evidence.inquiry.periodType,p.billingMode==='MONTHLY'?2:3);assert.equal(p.evidence.inquiry.periodNum,1);}
 }
 for(const count of Object.values(counts))assert.ok(count>0);
});
