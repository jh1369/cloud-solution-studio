import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {calculate,OFFICIAL_PRICE_SOURCE,parseText,priceValidation} from '../public/engine.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {documentedDcsSpecs} from '../public/huawei-dcs-specs.mjs';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Date.parse(catalog.verifiedAt)+600000;
const select=(row,source=catalog)=>applyHuaweiMatch(identifyHuaweiRow(row),source,{now});
const rowFor=(text,source=catalog)=>select(parseText(text)[0],source);
const quote=(row,source=catalog,date=now)=>calculate(row,source,{now:date});
const scenarios=[
 ['1 套 Redis 2 GB 单机','redis.single.xu1.large.2',[24.82,16.75,167.53]],
 ['1 套 Redis 2 GB 主备','redis.ha.xu1.large.r2.2',[49.64,73.1,728.09]],
 ['1 套 Redis 4 GB Cluster','redis.cluster.xu1.large.r2.4',[132.86,125.28,1247.7]]
];

test('DCS pricing uses the documented flavors in all three billing modes with no specifications API',()=>{
 for(const [text,sku,totals] of scenarios){
  const row=rowFor(text);
  for(const [index,mode] of ['ONDEMAND','MONTHLY','YEARLY'].entries()){
   selectHuaweiBilling(row,mode,catalog,{now});
   const result=quote(row),spec=row.huaweiProductMatch.selected;
   assert.deepEqual([result.status,result.item?.sku,result.item?.billingMode,result.termPublic],['Valid',sku,mode,totals[index]],text+' '+mode);
   assert.equal(result.item.evidence.request.resourceSpecCode,spec.specCode);
   assert.equal(result.item.evidence.inquiry.regionId,'eu-west-101');
   assert.equal(spec.evidence.kind,'official-doc');
   assert.equal(spec.evidence.revision,'2025-11-03');
   assert.equal(spec.region,null);
  }
 }
 const cluster=rowFor(scenarios[2][0]).huaweiProductMatch.selected;
 assert.deepEqual([cluster.topology,cluster.architecture,cluster.capacityMiB,cluster.replicas,cluster.shards],['cluster','x86_64',4096,2,3]);
 assert.match(cluster.evidence.url,/\/eu\/productdesc-dcs\/dcs-pd-0522002\.html#.*table/);
 assert.equal(new Set(documentedDcsSpecs.map(spec=>spec.specCode)).size,documentedDcsSpecs.length);
});

test('the packaged Worker refreshes DCS using the public price endpoint without a Huawei account',async()=>{
 const origin='https://studio.example',original=globalThis.fetch;
 const plans=scenarios.flatMap(([,sku])=>catalog.items.filter(item=>item.sku===sku));
 const calls=[];
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,OFFICIAL_PRICE_SOURCE);
  const headers=new Headers(init.headers);
  for(const name of ['Authorization','X-Auth-Token','Cookie'])assert.equal(headers.has(name),false);
  const inquiry=JSON.parse(init.body);
  assert.equal(inquiry.regionId,'eu-west-101');
  const mode=inquiry.chargingMode===1?'ONDEMAND':inquiry.periodType===2?'MONTHLY':'YEARLY';
  calls.push(mode);
  return Response.json({currency:'USD',productRatingResult:inquiry.productInfos.map(product=>{
   const item=plans.find(plan=>plan.productId===product.productId&&plan.sku===product.resourceSpecCode&&plan.billingMode===mode);
   assert.ok(item);
   return {id:product.id,productId:item.productId,officialWebsiteAmount:item.rate};
  })});
 };
 try{
  assert.equal((await worker.fetch(new Request(origin+'/api/specifications/dcs'))).status,404);
  const response=await worker.fetch(new Request(origin+'/api/rates',{method:'POST',body:JSON.stringify({ids:plans.map(item=>item.id)})}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.deepEqual(calls,['ONDEMAND','MONTHLY','YEARLY']);
  assert.equal(result.items.length,9);
  assert.deepEqual(result.pending,[]);
  assert.ok(result.items.every(item=>priceValidation(item,catalog).valid));
 }finally{globalThis.fetch=original;}
});

test('DCS defaults are visible and explicit version, topology, architecture and performance are respected',()=>{
 const bare=rowFor('1 套 Redis 2 GB');
 assert.deepEqual(bare.huaweiAssumptions,['HW_DEFAULT_REDIS_SINGLE','HW_DCS_DOCUMENTED_VERSIONS','HW_DCS_DOCUMENTED_X86']);
 assert.equal(quote(bare).item?.sku,'redis.single.xu1.large.2');
 const native=rowFor('1 套 Redis 4 GB Cluster');
 assert.ok(native.huaweiAssumptions.includes('HW_DCS_DOCUMENTED_REPLICAS'));
 assert.ok(native.huaweiAssumptions.includes('HW_DCS_DOCUMENTED_SHARDS'));
 assert.equal(quote(rowFor('1 套 Redis 7.0 2 GB x86 单机')).item?.sku,'redis.single.xu1.large.2');
 assert.equal(quote(rowFor('1 套 Redis 4 GB Proxy Cluster')).item?.sku,'redis.proxy.xu1.large.4');
 assert.equal(quote(rowFor('1 套 Redis 4 GB 读写分离 2 副本 包月')).item?.sku,'redis.ha.xu1.large.p2.4');
 for(const [text,code] of [
  ['1 套 Redis 5.0 1 GB Arm 单机','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB ARM x86 单机','HW_DCS_SPEC_CONSTRAINT'],
  ['1 套 Redis 2 GB Cluster','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 4 GB Proxy Cluster 版本 7.0','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 4 GB Cluster 4 分片','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 4 GB 读写分离','HW_MULTIPLE'],
  ['1 套 Redis 4 GB 读写分离 2 副本','HW_DCS_SPEC_PRICE_LINK'],
  ['1 套 Redis 2 GB 单机 50,001 connections','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB 单机 maximum bandwidth 129 Mbps','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB 单机 1000 QPS','HW_DCS_SPEC_CONSTRAINT'],
  ['1 套 Redis 2 GB 单机 version 5.0 through 7.0','HW_DCS_SPEC_CONSTRAINT']
 ])assert.equal(quote(rowFor(text)).reasonCode,code,text);
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 50,000 connections')).status,'Valid');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 assured bandwidth 128 Mbps')).status,'Valid');
});

test('spec edits rematch and manual choice resolves documented replica ambiguity with confirmation',()=>{
 const row=rowFor('Redis 2 GB 主备 2 个节点 3 套');
 assert.equal(quote(row).termPublic,148.92);
 row.specification='Redis 8 GB 主备 3 套';
 select(row);
 assert.equal(quote(row).reasonCode,'HW_MULTIPLE');
 assert.deepEqual(row.huaweiCandidates,['redis.ha.xu1.large.r2.8','redis.ha.xu1.large.r3.8']);
 const chosen=catalog.items.find(item=>item.sku===row.huaweiCandidates[1]&&item.billingMode==='ONDEMAND');
 Object.assign(row,{targetId:chosen.id,huaweiSelection:'manual',accepted:false});
 select(row);
 assert.equal(quote(row).reasonCode,'MAPPING_REVIEW');
 row.accepted=true;
 assert.equal(quote(row).item?.sku,chosen.sku);
 selectHuaweiBilling(row,'YEARLY',catalog,{now});
 assert.equal(quote(row).reasonCode,'MAPPING_REVIEW');
 row.accepted=true;
 assert.equal(quote(row).item?.sku,chosen.sku);
 row.specification='Redis 8 GB 主备 2 副本 3 套';
 assert.equal(quote(row).reasonCode,'HW_DCS_SPEC_RECHECK');
 assert.equal(quote(select(row)).reasonCode,'HW_DCS_SPEC_NO_MATCH');
});

test('regional estimates require precise plan evidence and expired or invalid rates stay Pending',()=>{
 const [text,sku]=scenarios[0];
 assert.equal(quote(rowFor(text+' target region: cn-east-3')).reasonCode,'HW_TARGET_REGION');
 assert.equal(quote(rowFor(text+' AZ: eu-west-101a')).reasonCode,'HW_DCS_SPEC_AZ_REQUIRED');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 主备 2 副本 Multi-AZ')).status,'Pending');
 const plan=catalog.items.find(item=>item.sku===sku&&item.billingMode==='ONDEMAND');
 const expiry=Date.parse(plan.verifiedAt)+86400000*catalog.ttlDays;
 assert.equal(quote(rowFor(text),catalog,expiry).reasonCode,'PRICE_EXPIRED');
 for(const [item,reason] of [
  [{...plan,region:'cn-east-3'},'HW_DCS_SPEC_PRICE_LINK'],
  [{...plan,resourceType:'hws.resource.type.fictional'},'HW_DCS_SPEC_PRICE_LINK'],
  [{...plan,size:true},'HW_DCS_SPEC_PRICE_LINK'],
  [{...plan,billingMode:'MONTHLY'},'HW_DCS_SPEC_PRICE_LINK'],
  [{...plan,unit:'month'},'PRICE_UNIT'],
  [{...plan,currency:'EUR'},'PRICE_CURRENCY'],
  [{...plan,sourceUrl:'https://example.org/'},'PRICE_SOURCE'],
  [{...plan,verifiedAt:'invalid'},'PRICE_TIME'],
  [{...plan,evidence:{...plan.evidence,inquiry:{...plan.evidence.inquiry,regionId:'cn-east-3'}}},'PRICE_EVIDENCE'],
  [{...plan,evidence:{...plan.evidence,request:{...plan.evidence.request,resourceSpecCode:'wrong'}}},'PRICE_EVIDENCE']
 ]){
  const source={...catalog,items:[item]},result=quote(rowFor(text,source),source);
  assert.deepEqual([result.reasonCode,result.monthly],[reason,null]);
 }
 const missing={...catalog,items:[]};
 assert.deepEqual([quote(rowFor(text,missing),missing).reasonCode,rowFor(text,missing).huaweiCandidates],['HW_DCS_SPEC_PRICE_LINK',[sku]]);
 const ambiguous={...catalog,items:catalog.items.filter(item=>item.sku!=='redis.ha.xu1.large.r3.8')};
 assert.equal(quote(rowFor('1 套 Redis 8 GB 主备',ambiguous),ambiguous).reasonCode,'HW_MULTIPLE');
});
