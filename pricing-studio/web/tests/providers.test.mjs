import test from 'node:test';
import assert from 'node:assert/strict';
import {getPricingProvider,pinPricingCatalog} from '../public/providers.mjs';
import {calculate,priceValidation} from '../public/engine.mjs';
import {syntheticCatalog,syntheticRow} from './fixtures/synthetic-catalog.mjs';
function tcp(){
 const source={url:'https://www.t-cloud-public.com/_Resources/fictional-service-description.pdf',sha256:'a'.repeat(64),documentVersion:'2026-10-01',revisionDate:'2026-10-01',fetchedAt:'2026-11-16T00:00:00Z'};
 const row={provider:'tcp',service:'EIP',region:'EU-DE',currency:'EUR',amount:'0.123000',unit:'hour',billingMode:'OPEN_ELASTIC',termMonths:null,tier:null,verification:{status:'AUTO_VALIDATED',reasons:[]},evidence:{...source,pages:[1]}};
 return {schemaVersion:1,provider:'tcp',versionId:'fictional-tcp-version',source,items:[row]};
}
const approval=catalog=>({approvedVersion:catalog.versionId,updateState:{currentVersion:catalog.versionId,status:'APPROVED',lastCheckedAt:new Date().toISOString()}});
test('Huawei adapter delegates unchanged validation and arithmetic',()=>{
 const adapter=getPricingProvider('huawei'),catalog=syntheticCatalog(),row=syntheticRow({catalog});
 assert.deepEqual(adapter.calculateQuote(row,catalog,{discount:.15}),calculate(row,catalog,{discount:.15}));
 assert.deepEqual(adapter.validatePrice(catalog.items[0],catalog),priceValidation(catalog.items[0],catalog));
});
test('TCP metadata validation requires approved catalog, source evidence and row review',()=>{
 const adapter=getPricingProvider('tcp'),catalog=tcp(),row=catalog.items[0],options=approval(catalog);
 assert.equal(adapter.validatePrice(row,catalog).valid,false);
 assert.equal(adapter.validatePrice(row,catalog,options).valid,true);
 for(const edit of [r=>r.amount=null,r=>r.amount='n.a.',r=>r.currency='USD',r=>r.region='eu-west-101',r=>r.verification.status='PENDING_REVIEW',r=>r.tier={raw:'0 to 5'},r=>r.evidence.pages=[],r=>r.evidence.sha256='b'.repeat(64)]){
  const changed=structuredClone(row);edit(changed);assert.equal(adapter.validatePrice(changed,catalog,options).valid,false);
 }
 assert.equal(adapter.validatePrice(null,catalog,options).valid,false);
 for(const state of [{...options.updateState,status:'PENDING_REVIEW'},{...options.updateState,status:'CHECK_FAILED'},{...options.updateState,lastCheckedAt:'2000-01-01T00:00:00Z'}])assert.equal(adapter.validatePrice(row,catalog,{...options,updateState:state}).valid,false);
 assert.throws(()=>adapter.calculateQuote(),/not enabled/);
});
test('TCP reserved, upfront and usage-based monthly units remain independent',()=>{
 const adapter=getPricingProvider('tcp'),catalog=tcp(),options=approval(catalog);
 for(const [billingMode,termMonths,unit] of [['RESERVED',12,'month'],['RESERVED',24,'month'],['RESERVED_UPFRONT',12,'term'],['RESERVED_UPFRONT',24,'term']]){
  const row={...catalog.items[0],billingMode,termMonths,unit};assert.equal(adapter.validatePrice(row,catalog,options).valid,true);
  assert.equal(adapter.validatePrice({...row,unit:'hour'},catalog,options).valid,false);
 }
});
test('Pinned quote catalog is detached/frozen and unknown providers have no fallback',()=>{
 const catalog=tcp(),snapshot=pinPricingCatalog('tcp',catalog,approval(catalog));
 catalog.items[0].amount='9.00';assert.equal(snapshot.prices[0].item.amount,'0.123000');assert.ok(Object.isFrozen(snapshot.prices[0].item));
 assert.throws(()=>getPricingProvider('alibaba'),/Unsupported/);assert.throws(()=>getPricingProvider('tencent'),/Unsupported/);
});
