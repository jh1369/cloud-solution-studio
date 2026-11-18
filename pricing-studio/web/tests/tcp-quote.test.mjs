import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeRows} from '../public/engine.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {tcpQuoteRows,tcpQuoteTotals} from '../public/providers.mjs';

const sandbox={};
vm.runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const {XLSX}=sandbox;
const inventory=readFileSync(new URL('./fixtures/aws-fictional-tcp.csv',import.meta.url));
const input=XLSX.read(new Uint8Array(inventory),{type:'array'});
const rows=normalizeRows(Array.from(XLSX.utils.sheet_to_json(input.Sheets[input.SheetNames[0]])));
const source={url:'https://www.t-cloud-public.com/fictional.pdf',sha256:'a'.repeat(64),
 documentVersion:'2026-10-09',revisionDate:'2026-10-09',fetchedAt:'2026-11-18T08:00:00Z'};
const versionId='fictional-verified';
const now=Date.parse('2026-11-18T09:00:00Z');
const state={provider:'tcp',currentVersion:versionId,source,status:'UPDATED',effectiveState:'ACTIVE',
 lastVerifiedAt:'2026-11-18T08:01:00Z',catalog:{sha256:'b'.repeat(64)}};
function price(service,sku,amount,specification={},productLabel=sku,unit='hour'){
 return {provider:'tcp',service,region:'EU-DE',currency:'EUR',sku,amount,specification,productLabel,unit,
  billingMode:'OPEN_ELASTIC',termMonths:null,tier:null,availability:'AVAILABLE',
  verification:{status:'AUTO_VALIDATED',reasons:[]},evidence:{...source,pages:[7]}};
}
const catalog={provider:'tcp',schemaVersion:1,versionId,source,items:[
 price('ECS','s3.large.4','0.100001',{vCPU:'2','GiB RAM':'8','Operating System':'open Linux'}),
 price('RDS','db.n1.large.4.mysql','0.21',{vCPU:'2','GiB RAM':'8'},'RDS MySQL GP 2 vCPU 8 GiB RAM'),
 price('EVS',null,'0.07',{},'EVS High I/O','GiB-month'),
 price('EVS',null,'0.08',{},'EVS GP SSD v2 space','GiB-month'),
]};
const options={updateState:state,now};

test('TCP matches a narrow scope and refuses rule-sensitive or unexplained rows',()=>{
 const output=tcpQuoteRows(rows,catalog,options);
 assert.deepEqual(output.map(row=>row.termPublic),[20,3.5,21,1,null,null,null,null,null]);
 assert.deepEqual(output.slice(4).map(row=>row.reasonCode),
  ['TCP_EVS_RULE','TCP_ECS_MAPPING','TCP_PRICE_MISSING','TCP_REGION','TCP_STORAGE_UNIT']);
 assert.deepEqual(tcpQuoteTotals(output),{monthly:44.5,period:1,pendingCount:5,ready:4});
});

test('TCP rejects ambiguous units, out-of-date evidence and conflicting rates',()=>{
 for(const [catalogValue,context,reason] of [
  [catalog,{...options,now:Date.parse(state.lastVerifiedAt)+48*3600000+1},'TCP_EXPIRED'],
  [null,{...options,updateState:{...state,effectiveState:'PENDING'}},'TCP_UNAVAILABLE'],
  [{...catalog,items:[...catalog.items,catalog.items[0]]},options,'TCP_AMBIGUOUS'],
  [{...catalog,items:[{...catalog.items[0],unit:'month'}]},options,'TCP_PRICE_INVALID'],
  [{...catalog,items:[{...catalog.items[0],specification:{...catalog.items[0].specification,'GiB RAM':'4'}}]},options,'TCP_SHAPE'],
  [{...catalog,items:[{...catalog.items[0],evidence:{...source,sha256:'c'.repeat(64),pages:[1]}}]},options,'TCP_PRICE_INVALID'],
 ]){
  const [result]=tcpQuoteRows(rows.slice(0,1),catalogValue,context);
  assert.deepEqual([result.termPublic,result.reasonCode],[null,reason]);
 }
 const [missingUnit]=normalizeRows([{product:'EC2',specification:'m5.large Linux',quantity:1,usage:10}]);
 assert.equal(tcpQuoteRows([missingUnit],catalog,options)[0].reasonCode,'TCP_HOUR_UNIT');
});

test('TCP workbook keeps five sheets, exact unit rate, source identity, and review blanks',()=>{
 const book=buildWorkbook(XLSX,rows,catalog,{...options,provider:'tcp',language:'en'},'Fictional project');
 assert.deepEqual(Array.from(book.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const sheet=name=>Array.from(XLSX.utils.sheet_to_json(book.Sheets[name],{defval:null}));
 const [price]=sheet('Public Pricing');
 assert.equal(price['Unit Price'],'0.100001');
 assert.equal(price['Currency'],'EUR');
 assert.equal(price['Official Source'],source.url);
 assert.equal(price['Catalog SHA-256'],'b'.repeat(64));
 const quotes=sheet('Quotation');
 assert.deepEqual(quotes.map(row=>row['Monthly Amount EUR']),[20,3.5,21,null,null,null,null,null,null]);
 assert.equal(quotes[3]['Source Period Amount EUR'],1);
 assert.equal(quotes[4]['Status'],'Needs review');
 assert.match(quotes[4]['Review Reason'],/minimum size/);
 const assumptions=Object.fromEntries(sheet('Assumptions').map(row=>[row.Item,row.Value]));
 assert.equal(assumptions['Priced monthly subtotal EUR'],44.5);
 assert.equal(assumptions['Needs review'],5);
});
