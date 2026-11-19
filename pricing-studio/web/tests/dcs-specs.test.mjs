import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {loadDcsSpecs,normalizeDcsFlavors} from '../huawei-dcs-spec-api.mjs';
import {calculate,parseText} from '../public/engine.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {flavor,flavors} from './fixtures/dcs-flavors.mjs';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Date.parse(catalog.verifiedAt)+600000;
const snapshot=normalizeDcsFlavors(flavors,now-30000);
const select=(row,dcsSpecs=snapshot,source=catalog)=>applyHuaweiMatch(identifyHuaweiRow(row),source,{dcsSpecs,now});
const rowFor=(text,dcsSpecs=snapshot,source=catalog)=>select(parseText(text)[0],dcsSpecs,source);
const quote=(row,source=catalog,date=now)=>calculate(row,source,{now:date});
const env={DCS_SPEC_PROJECT_ID:'0123456789abcdef0123456789abcdef',DCS_SPEC_AUTH_TOKEN:'fictional-unit-test-token'};

test('packaged Worker requests a fixed regional official API and strips upstream extras',async()=>{
 const url='https://studio.example/api/specifications/dcs';
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(upstream,init)=>{
  calls++;
  assert.equal(upstream,`https://dcs.eu-west-101.myhuaweicloud.com/v2/${env.DCS_SPEC_PROJECT_ID}/flavors?engine=Redis&spec_type=instance`);
  assert.equal(init.headers['X-Auth-Token'],env.DCS_SPEC_AUTH_TOKEN);
  assert.equal(init.redirect,'error');
  assert.equal(init.body,undefined);
  assert.ok(init.signal instanceof AbortSignal);
  return Response.json({flavors:[{...flavors.flavors[1],inquery_spec_code:'ignored-price-alias',debug:env}]});
 };
 try{
  assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request(url+'?region=fictional'),env)).status,400);
  assert.equal((await worker.fetch(new Request(url,{headers:{Origin:'https://example.org'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request(url,{headers:{'Sec-Fetch-Site':'cross-site'}}),env)).status,403);
  const fallback=await worker.fetch(new Request(url));
  assert.equal((await fallback.json()).status,'authentication_required');
  assert.equal(calls,0);
  const response=await worker.fetch(new Request(url),env);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const text=await response.text(),data=JSON.parse(text);
  assert.equal(data.status,'official');
  assert.equal(data.records[0].specCode,'redis.single.xu1.large.2');
  assert.deepEqual(data.records[0].availableZones,['eu-west-101a']);
  assert.equal(calls,1);
  for(const forbidden of [...Object.values(env),'ignored-price-alias','debug'])assert.ok(!text.includes(forbidden));
 }finally{globalThis.fetch=original;}
});

test('authorization failures, malformed replies and transport failures use only documented candidates',async()=>{
 const results=[];
 for(const status of [401,403,500,307])results.push(await loadDcsSpecs(env,{fetcher:async()=>new Response(null,{status})}));
 results.push(await loadDcsSpecs(env,{fetcher:async()=>Response.json({flavors:null})}));
 results.push(await loadDcsSpecs(env,{fetcher:async()=>{throw new DOMException('test timeout','TimeoutError');}}));
 assert.deepEqual(results.map(result=>result.status),['authentication_required','authentication_required','unavailable','unavailable','unavailable','unavailable']);
 for(const result of results){
  assert.ok(result.records.length>0);
  assert.ok(result.records.every(spec=>spec.evidence.kind==='official-doc'&&spec.evidence.revision==='2025-11-03'&&spec.region===null&&!spec.availableZones.length));
 }
});

test('normalization binds topology, versions, architecture, replica count, attributes and AZs to a capacity',()=>{
 const arm=flavor('redis.single.au1.large.1','single',1,{architecture:'aarch64',versions:'5.0;4.0;5.0'});
 const wrongCapacity={...arm,flavors_available_zones:[{capacity:'2',unit:'GB',az_codes:['eu-west-101a']}]};
 const zonesOnly={...arm,flavors_available_zones:[{capacity:'1',unit:'GB',available_zones:['fictional-id']}]};
 const tier={...arm,pricing_type:'tier',capacity:['1','2']};
 assert.deepEqual(normalizeDcsFlavors({flavors:[tier]},now).records,[]);
 assert.deepEqual(normalizeDcsFlavors({flavors:[wrongCapacity]},now).records[0].availableZones,[]);
 assert.deepEqual(normalizeDcsFlavors({flavors:[zonesOnly]},now).records[0].availableZones,[]);
 const [record]=normalizeDcsFlavors({flavors:[arm,arm]},now).records;
 assert.deepEqual([record.capacityMiB,record.architecture,record.versions,record.replicas,record.shards,record.performance],
  [1024,'aarch64',['4.0','5.0'],1,1,{maxConnections:10000,maxBandwidthMbps:null}]);
 assert.ok(normalizeDcsFlavors({flavors:[arm,arm]},now).records.length===1);
 assert.throws(()=>normalizeDcsFlavors({flavors:[{...arm,cpu_type:'undocumented'}]},now),/Invalid DCS instance flavor/);
});

test('2 GB single and HA and 4 GB native Cluster link to independent existing plan evidence in all modes',()=>{
 const scenarios=[
  ['1 套 Redis 2 GB 单机 x86','redis.single.xu1.large.2',[24.82,16.75,167.53]],
  ['1 套 Redis 2 GB 主备 2 个节点','redis.ha.xu1.large.r2.2',[49.64,73.1,728.09]],
  ['1 套 Redis 4 GB Cluster 7.0，2 副本，3 分片','redis.cluster.xu1.large.r2.4',[132.86,125.28,1247.7]]
 ];
 for(const [text,sku,totals] of scenarios){
  const row=rowFor(text);
  for(const [index,mode] of ['ONDEMAND','MONTHLY','YEARLY'].entries()){
   selectHuaweiBilling(row,mode,catalog,{dcsSpecs:snapshot,now});
   const result=quote(row);
   assert.deepEqual([result.status,result.item?.sku,result.item?.billingMode,result.termPublic],['Valid',sku,mode,totals[index]],text+' '+mode);
   assert.equal(result.item.evidence.request.resourceSpecCode,row.huaweiProductMatch.selected.specCode);
  }
 }
});

test('replica count is independent from target quantity and manual choice resolves eligible topology ties',()=>{
 const count=rowFor('Redis 2 GB 主备 2 个节点 3 套');
 assert.equal(quote(count).termPublic,148.92);
 const row=rowFor('Redis 2 GB 主备 3 套');
 assert.equal(row.huaweiMatch,'HW_MULTIPLE');
 assert.deepEqual(row.huaweiCandidates,['redis.ha.xu1.large.r2.2','redis.ha.xu1.large.r3.2']);
 const chosen=catalog.items.find(item=>item.sku===row.huaweiCandidates[1]&&item.billingMode==='ONDEMAND');
 Object.assign(row,{targetId:chosen.id,huaweiSelection:'manual',accepted:false});
 select(row);
 assert.equal(quote(row).reasonCode,'MAPPING_REVIEW');
 row.accepted=true;
 assert.equal(quote(row).item?.sku,chosen.sku);
 selectHuaweiBilling(row,'YEARLY',catalog,{dcsSpecs:snapshot,now});
 assert.equal(quote(row).reasonCode,'MAPPING_REVIEW');
 row.accepted=true;
 assert.equal(quote(row).item?.sku,chosen.sku);
 row.specification='Redis 2 GB 主备 2 副本 3 套';
 assert.equal(quote(row).reasonCode,'HW_DCS_SPEC_RECHECK');
 assert.equal(quote(select(row)).reasonCode,'HW_DCS_SPEC_NO_MATCH');
});

test('fallback, regional and AZ restrictions and expired evidence block both manual and automatic amounts',()=>{
 const auth={status:'authentication_required'};
 const row=rowFor('1 套 Redis 2 GB 单机',auth);
 assert.equal(row.huaweiProductMatch.candidates[0].specCode,'redis.single.xu1.large.2');
 assert.equal(quote(row).reasonCode,'HW_DCS_SPEC_AUTH');
 Object.assign(row,{targetId:rowFor(row.specification).targetId,huaweiSelection:'manual',accepted:true});
 assert.deepEqual([quote(select(row,auth)).reasonCode,quote(row).monthly],['HW_DCS_SPEC_AUTH',null]);
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 target region: cn-east-3')).reasonCode,'HW_TARGET_REGION');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 AZ: eu-west-101b')).reasonCode,'HW_DCS_SPEC_AZ_REQUIRED');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 AZ: eu-west-101a')).status,'Valid');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 主备 2 副本 Multi-AZ')).status,'Pending');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机'),catalog,now+900000).reasonCode,'HW_DCS_SPEC_EXPIRED');
 const empty=normalizeDcsFlavors({flavors:[]},now);
 assert.equal(rowFor('1 套 Redis 2 GB 单机',empty).huaweiMatch,'HW_DCS_SPEC_NO_MATCH');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机',{...snapshot,region:'cn-east-3'})).reasonCode,'HW_DCS_SPEC_UNAVAILABLE');
 const single=flavors.flavors[1];
 const contradictory=normalizeDcsFlavors({flavors:[single,{...single,flavors_available_zones:[]}]},now);
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机',contradictory)).reasonCode,'HW_MULTIPLE');
});

test('explicit Arm, version, shards, topology and performance requirements never fall through to another flavor',()=>{
 const arm=flavor('redis.single.au1.large.1','single',1,{architecture:'aarch64',versions:'4.0;5.0'});
 const data=normalizeDcsFlavors({flavors:[...flavors.flavors.slice(0,-1),arm]},now);
 const row=rowFor('1 套 Redis 5.0 1 GB Arm 单机',data);
 assert.deepEqual([quote(row).reasonCode,row.huaweiCandidates],['HW_DCS_SPEC_PRICE_LINK',['redis.single.au1.large.1']]);
 for(const [text,code] of [
  ['1 套 Redis 7.0 1 GB Arm 单机','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 5.0 1 GB 单机','HW_MULTIPLE'],
  ['1 套 Redis 2 GB Cluster','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 4 GB Proxy Cluster 版本 7.0','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 4 GB Cluster 4 分片','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB 单机 10,001 connections','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB 单机 maximum bandwidth 128 Mbps','HW_DCS_SPEC_NO_MATCH'],
  ['1 套 Redis 2 GB 单机 1000 QPS','HW_DCS_SPEC_CONSTRAINT'],
  ['1 套 Redis 2 GB 单机 version 5.0 through 7.0','HW_DCS_SPEC_CONSTRAINT']
 ])assert.equal(quote(rowFor(text,data)).reasonCode,code,text);
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 10,000 connections')).status,'Valid');
 const peak=normalizeDcsFlavors({flavors:[flavor('redis.single.xu1.large.2','single',2,{bandwidth:'128 Mbit/s'})]},now);
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 maximum bandwidth 128 Mbps',peak)).status,'Valid');
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机 assured bandwidth 128 Mbps',peak)).reasonCode,'HW_DCS_SPEC_NO_MATCH');
 const proxy=rowFor('1 套 Redis 4 GB Proxy Cluster');
 assert.equal(quote(proxy).item?.sku,'redis.proxy.xu1.large.4');
});

test('verified flavor requires the exact resource type, billing unit and successful official price evidence',()=>{
 const [plan]=catalog.items.filter(item=>item.sku==='redis.single.xu1.large.2'&&item.billingMode==='ONDEMAND');
 for(const item of [{...plan,resourceType:'hws.resource.type.fictional'},{...plan,size:true},{...plan,sku:'redis.single.xu1.large.1'}]){
  const source={...catalog,items:[item]};
  assert.equal(quote(rowFor('1 套 Redis 2 GB 单机',snapshot,source),source).reasonCode,'HW_DCS_SPEC_PRICE_LINK');
 }
 const source={...catalog,items:[{...plan,evidence:{...plan.evidence,request:{...plan.evidence.request,resourceSpecCode:'wrong'}}}]};
 assert.equal(quote(rowFor('1 套 Redis 2 GB 单机',snapshot,source),source).reasonCode,'PRICE_EVIDENCE');
});
