import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,cost,recommend,parseText} from '../public/engine.mjs';
import {syntheticCatalog,syntheticRow,copy} from './fixtures/synthetic-catalog.mjs';
const NOW=Date.UTC(2035,0,15,12);
const DAY=86400000;
function setup(t,options={}){
 t.mock.method(Date,'now',()=>NOW);
 const catalog=syntheticCatalog({now:NOW});
 return {catalog,row:syntheticRow({...options,catalog})};
}
function assertPending(value){
 assert.equal(value.status,'Pending');
 for(const key of ['monthly','scenario','annual','termPublic','termScenario','upfrontScenario'])assert.equal(value[key],null,key);
 assert.ok(value.reason,'Pending requires an actionable reason');
}
test('Independent money oracle: hourly, half-up cents and unrounded annual scenario',t=>{
 const {catalog,row}=setup(t);
 const result=calculate(row,catalog,{discount:.15});
 assert.equal(result.status,'Valid');assert.equal(result.monthly,182.5);assert.equal(result.scenario,155.13);assert.equal(result.annual,1861.5);
 assert.notEqual(result.annual,result.scenario*12,'Annual must not accumulate monthly cent rounding');
});
test('Independent monthly tariff oracle: quantity only, hours do not discount a subscription',t=>{
 const {catalog,row}=setup(t,{mode:'MONTHLY',usage:1});
 const result=calculate(row,catalog,{hours:1,discount:.1});
 assert.equal(result.status,'Valid');assert.equal(result.termPublic,74);assert.equal(result.termScenario,66.6);assert.equal(result.upfrontScenario,66.6);assert.equal(result.annual,799.2);
});
test('Independent yearly tariff oracle: annual price is prepaid and monthly is amortized',t=>{
 const {catalog,row}=setup(t,{mode:'YEARLY',usage:1});
 const result=calculate(row,catalog,{discount:.1});
 assert.equal(result.status,'Valid');assert.equal(result.termPublic,666);assert.equal(result.termScenario,599.4);assert.equal(result.annual,599.4);assert.equal(result.upfrontScenario,599.4);assert.equal(result.monthly,55.5);assert.equal(result.scenario,49.95);
});
test('Storage GB-month converts once, then multiplies explicit resource count',t=>{
 const {catalog,row}=setup(t,{service:'EVS',quantity:2,usage:100,unit:'GB-month'});
 const result=calculate(row,catalog,{hours:730,discount:.25});
 assert.equal(result.status,'Valid');assert.equal(result.effectiveUsage,73000);assert.equal(result.monthly,29.2);assert.equal(result.scenario,21.9);assert.equal(result.annual,262.8);
});
test('Direct GB-hour storage usage is not multiplied by reference hours again',t=>{
 const {catalog,row}=setup(t,{service:'EVS',quantity:2,usage:73000,unit:'GB-hour'});
 const result=calculate(row,catalog,{hours:730});assert.equal(result.status,'Valid');assert.equal(result.monthly,29.2);
});
test('Explicit storage subscription capacity uses independent monthly and yearly rates',t=>{
 const month=setup(t,{service:'EVS',mode:'MONTHLY',quantity:2,usage:123456,unit:'GB-month'});month.row.capacity=500;
 const annual=syntheticRow({service:'EVS',mode:'YEARLY',quantity:2,catalog:month.catalog});annual.capacity=500;
 assert.equal(calculate(month.row,month.catalog).termPublic,80);
 assert.equal(calculate(annual,month.catalog).termPublic,720);
});
test('Source-period aggregate usage never gains an inferred count or annual estimate',t=>{
 const {catalog,row}=setup(t,{quantity:null,usage:1460,scope:'aggregate',period:'source-period'});
 const result=calculate(row,catalog);assert.equal(result.status,'Period');assert.equal(result.quantity,null);assert.equal(result.monthly,182.5);assert.equal(result.annual,null);
});
test('Missing mapping or target count remains unknown, not a zero-valued quote',t=>{
 const {catalog,row}=setup(t);row.targetId='';assertPending(calculate(row,catalog));
 row.targetId=catalog.items[0].id;row.quantity=null;assertPending(calculate(row,catalog));
});
test('Zero official rate remains a verified zero when all provenance is valid',t=>{
 const {catalog,row}=setup(t);const price=catalog.items.find(p=>p.id===row.targetId);price.rate=0;price.evidence.response.amount=0;price.evidence.response.officialWebsiteAmount=0;
 const result=calculate(row,catalog);assert.equal(result.status,'Valid');assert.equal(result.monthly,0);assert.equal(result.scenario,0);
});
test('Expired timestamps include the exact expiry boundary',t=>{
 const {catalog,row}=setup(t);const price=catalog.items.find(p=>p.id===row.targetId);
 for(const at of [NOW-7*DAY,NOW-8*DAY]){price.verifiedAt=new Date(at).toISOString();assertPending(calculate(row,catalog));}
});
test('Invalid and future verification timestamps cannot mark a price valid',t=>{
 const {catalog,row}=setup(t);const price=catalog.items.find(p=>p.id===row.targetId);
 for(const at of ['not-a-date','',new Date(NOW+DAY).toISOString()]){price.verifiedAt=at;assertPending(calculate(row,catalog));}
});
test('Missing, unbounded and nonfinite TTL cannot extend price validity',t=>{
 const {catalog,row}=setup(t);
 for(const ttl of [undefined,null,0,-1,NaN,Infinity,8]){catalog.ttlDays=ttl;assertPending(calculate(row,catalog));}
});
test('Catalogue and item must both match target region and USD currency',t=>{
 const base=setup(t);
 for(const mutate of [c=>c.region='cn-north-4',c=>c.currency='EUR',c=>c.items[0].region='cn-north-4',c=>c.items[0].currency='EUR']){
  const catalog=copy(base.catalog);mutate(catalog);assertPending(calculate(base.row,catalog));
 }
});
test('Corrupt price amounts and mismatching official evidence never yield quote amounts',t=>{
 const base=setup(t);
 for(const rate of [null,undefined,-1,NaN,Infinity,'0.125']){const catalog=copy(base.catalog);catalog.items[0].rate=rate;assertPending(calculate(base.row,catalog));}
 const mismatched=copy(base.catalog);mismatched.items[0].evidence.response.officialWebsiteAmount=.126;assertPending(calculate(base.row,mismatched));
});
test('Evidence must identify the same SKU, product and inquiry contract',t=>{
 const base=setup(t);
 const edits=[
  p=>delete p.evidence,
  p=>p.sourceUrl='https://prices.example.invalid/unverified',
  p=>p.evidence.currency='EUR',
  p=>p.evidence.response.productId='DIFFERENT-SYNTHETIC-ID',
  p=>p.evidence.request.productId='DIFFERENT-SYNTHETIC-ID',
  p=>p.evidence.request.resourceSpecCode='different.sku',
  p=>p.evidence.inquiry.regionId='ap-southeast-1',
  p=>p.evidence.inquiry.chargingMode=0,
  p=>p.evidence.request.usageValue=2,
  p=>p.evidence.request.usageMeasureId=6
 ];
 for(const edit of edits){const catalog=copy(base.catalog);edit(catalog.items[0]);assertPending(calculate(base.row,catalog));}
});
test('Billing mode, unit and subscription period cannot borrow another tariff',t=>{
 const base=setup(t,{mode:'YEARLY'});
 for(const edit of [p=>p.periodType=2,p=>p.periodNum=2,p=>p.unit='hour',p=>p.evidence.inquiry.periodType=2,p=>p.evidence.inquiry.periodNum=2]){
  const catalog=copy(base.catalog);edit(catalog.items.find(p=>p.id===base.row.targetId));assertPending(calculate(base.row,catalog));
 }
});
test('Invalid calculator inputs return Pending rather than throw or retain stale amounts',t=>{
 const base=setup(t);
 for(const edit of [r=>r.quantity=NaN,r=>r.quantity=-1,r=>r.usage=Infinity,r=>r.usage=-1]){const row=copy(base.row);edit(row);assertPending(calculate(row,base.catalog));}
 for(const opts of [{discount:NaN},{discount:Infinity},{discount:-.1},{discount:1.1}])assertPending(calculate(base.row,base.catalog,opts));
 const volume=syntheticRow({service:'EVS',quantity:1,usage:100,unit:'GB-month',catalog:base.catalog});
 for(const hours of [NaN,Infinity,-1,0])assertPending(calculate(volume,base.catalog,{hours}));
});
test('Small scientific-notation prices are not quantized to zero before multiplication',()=>{
 assert.equal(cost(1,1e12,1e-10).monthly,100);
 assert.equal(cost(1e12,.001,1e-10).monthly,.1);
});
test('ARM source instances are not silently suggested as x86 ECS targets',t=>{
 const {catalog}=setup(t),row=parseText('1 台 EC2 m6g.2xlarge Linux 730 小时')[0];assert.equal(recommend(row,catalog),'');
});
test('EBS snapshot/IOPS dimensions do not get a capacity-only EVS recommendation',t=>{
 const {catalog}=setup(t);
 for(const specification of ['gp3 provisioned IOPS 3000','snapshot data stored 500 GB']){
  const row=syntheticRow({service:'EVS',catalog});row.specification=specification;assert.equal(recommend(row,catalog),'');
 }
});
