import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeRows,parseText,calculate} from '../public/engine.mjs';
import {identifyHuaweiRow,applyHuaweiMatch,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {readInventory,reviewInventory,confirmInventory} from '../public/inventory-import.mjs';
import {createLocalInventoryEndpoint} from '../scripts/local_inventory_api.mjs';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Date.parse(catalog.verifiedAt)+600000;
const match=(input,source=catalog)=>applyHuaweiMatch(identifyHuaweiRow(input),source);
const selection=row=>catalog.items.find(item=>item.id===row.targetId)?.sku;
const resource=text=>match(parseText(text)[0]);

test('match ECS and generic SSD without using rate to choose, with visible defaults',()=>{
 const ecs=resource('1 台 4 vCPU / 16 GiB 云主机');
 assert.equal(selection(ecs),'s6.xlarge.4.linux');
 assert.deepEqual(ecs.huaweiAssumptions,['HW_DEFAULT_LINUX','HW_DEFAULT_X86','HW_DEFAULT_GENERAL']);
 assert.equal(ecs.huaweiUsageAssumption,'HW_MONTH_HOURS');
 assert.equal(calculate(ecs,catalog,{now}).monthly,111.25);
 const evs=resource('2 块 100 GiB SSD 云盘');
 assert.equal(selection(evs),'GPSSD');
 assert.equal(evs.capacity,100);
 assert.equal(calculate(evs,catalog,{now}).monthly,20.88);
 assert.equal(calculate(resource('1 块 1,024 GiB SSD 云盘'),catalog,{now}).monthly,106.9);
 assert.equal(resource('1 台 4 vCPU / 16 GiB ARM x86 云主机').huaweiMatch,'HW_ECS_CONFLICT');
 assert.equal(resource('1 台 256 vCPU / 999 GiB 云主机').huaweiMatch,'HW_NO_MATCH');
 assert.equal(resource('1 块 100 GiB Premium SSD 云盘').huaweiMatch,'HW_DISK_PERFORMANCE');
});

test('ECS requires consistent dimensions and honors explicit series and target region',()=>{
 const candidates=resource('1 台 4 vCPU 16 GiB General Computing-plus Linux 云主机');
 assert.equal(candidates.huaweiMatch,'HW_MULTIPLE');
 assert.deepEqual(new Set(candidates.huaweiCandidates),new Set(['c6.xlarge.4.linux','c9.xlarge.4.linux']));
 assert.equal(selection(resource('1 台 4 vCPU 16 GiB 云主机 Ubuntu Series: C9')),'c9.xlarge.4.linux');
 assert.equal(resource('1 台 4 vCPU 16 GiB / 32 GiB 云主机').huaweiMatch,'HW_SHAPE_REQUIRED');
 assert.equal(resource('1 台 4 vCPU 或 8 vCPU 16 GiB 云主机').huaweiMatch,'HW_SHAPE_REQUIRED');
 assert.equal(resource('1 台 4 vCPU 16 GiB FreeBSD 云主机').huaweiMatch,'HW_ECS_CONFLICT');
 const outside=resource('1 台 4 vCPU 16 GiB 云主机，Huawei target region: cn-east-3');
 assert.equal(calculate(outside,catalog,{now}).reasonCode,'HW_TARGET_REGION');
 outside.specification='1 台 4 vCPU 16 GiB 云主机';
 assert.equal(selection(match(outside)),'s6.xlarge.4.linux');
});

test('EVS edits replace text-derived capacity and calculate each disk in every billing mode',()=>{
 for(const [targetBilling,term,monthly] of [['ONDEMAND',41.76,41.76],['MONTHLY',40,40],['YEARLY',416,34.67]]){
  const [row]=parseText('2 块 100 GiB SSD 云盘');
  row.targetBilling=targetBilling;
  match(row);
  assert.equal(row.capacity,100);
  row.specification='2 块 200 GiB SSD 云盘';
  match(row);
  assert.equal(selection(row),'GPSSD');
  assert.equal(row.capacity,200);
  assert.equal(row.usage,null);
  const result=calculate(row,catalog,{now});
  assert.deepEqual([result.quantity,result.termPublic,result.monthly],[2,term,monthly]);
  row.specification='2 块 SSD 云盘';
  match(row);
  assert.equal(row.capacity,null);
  assert.equal(calculate(row,catalog,{now}).monthly,null);
 }
 const legacy=resource('1 个 EBS gp3 100 GB');
 assert.equal(legacy.usage,null);
 legacy.specification='1 个 EBS gp3 200 GB';
 assert.equal(calculate(match(legacy),catalog,{now}).monthly,20.88);
});

test('EVS explicit capacity conflicts cannot be confirmed into a quote',()=>{
 for(const targetBilling of ['ONDEMAND','MONTHLY','YEARLY']){
  const [row]=normalizeRows([{product:'EVS',specification:'100 GiB SSD',quantity:1,capacity_gb:100}]);
  row.targetBilling=targetBilling;
  match(row);
  row.huaweiSelection='manual';
  row.specification='200 GiB SSD';
  match(row);
  assert.equal(row.capacity,100);
  const pending=calculate(row,catalog,{now});
  assert.deepEqual([pending.reasonCode,pending.monthly,pending.termPublic],['HW_DISK_CAPACITY_CONFLICT',null,null]);
  row.capacity=200;
  match(row);
  assert.equal(calculate(row,catalog,{now}).status,'Valid');
 }
 const ambiguous=resource('1 块 100 GiB 或 200 GiB SSD 云盘');
 assert.equal(calculate(ambiguous,catalog,{now}).reasonCode,'HW_DISK_CAPACITY_CONFLICT');
 assert.equal(calculate(resource('1 块 100–200 GiB SSD 云盘'),catalog,{now}).reasonCode,'HW_DISK_CAPACITY_CONFLICT');
 assert.equal(selection(resource('1 块 100 GiB Ultra-high I/O 云盘')),'SSD');
});

test('EVS sizing leaves imported usage independent of per-disk capacity',()=>{
 const [row]=normalizeRows([{product:'EVS',specification:'100 GB SSD; 80 GB-month usage',quantity:2,usage:80,unit:'GB-month'}]);
 match(row);
 row.specification='200 GB SSD; 80 GB-month usage';
 match(row);
 assert.deepEqual([row.capacity,row.usage,calculate(row,catalog,{now}).monthly],[200,80,16.7]);
 row.targetBilling='MONTHLY';
 assert.equal(calculate(match(row),catalog,{now}).monthly,40);
 row.specification='SSD; 80 GB-month usage';
 assert.equal(calculate(match(row),catalog,{now}).reasonCode,'HW_DISK_CAPACITY');
});

test('DCS defaults to a unique single node and leaves unspecified quantities unpriced',()=>{
 const bare=resource('2G Redis');
 assert.equal(bare.service,'DCS');
 assert.equal(bare.capacity,2);
 assert.equal(selection(bare),'redis.single.xu1.large.2');
 assert.equal(bare.quantity,null);
 assert.equal(bare.huaweiQuantity,null);
 assert.equal(calculate(bare,catalog,{now}).reasonCode,'QUANTITY_REQUIRED');
 const inferred=resource('1个1g的redis');
 assert.equal(selection(inferred),'redis.single.xu1.large.1');
 assert.deepEqual(inferred.huaweiAssumptions,['HW_DEFAULT_REDIS_SINGLE']);
 assert.equal(calculate(inferred,catalog,{now}).monthly,12.41);
 const expired=calculate(inferred,catalog,{now:now+8*86400000});
 assert.deepEqual([expired.reasonCode,expired.monthly],['PRICE_EXPIRED',null]);
 const HA=resource('Redis 2GB 主备 3套');
 assert.equal(HA.huaweiMatch,'HW_MULTIPLE');
 assert.ok(HA.huaweiCandidates.length>1);
 assert.equal(selection(resource('Redis 2GB 主备 2节点 3套')),'redis.ha.xu1.large.r2.2');
 const single=resource('Redis 2GB 单机 3套');
 assert.equal(selection(single),'redis.single.xu1.large.2');
 assert.deepEqual(single.huaweiAssumptions,[]);
 assert.equal(calculate(single,catalog,{now}).monthly,74.46);
 assert.equal(calculate(single,catalog,{now:now+8*86400000}).monthly,null);
});

test('Redis default rejects conflicts and ambiguous or invalid catalog records',()=>{
 for(const [text,code] of [
  ['1个1g的redis 主备','HW_MULTIPLE'],['1个1g的redis 单机 主备','HW_CACHE_MODE'],
  ['1个1g的redis 2节点','HW_CACHE_MODE'],['1个1g的redis 高可用','HW_CACHE_MODE'],
  ['1个1g的redis 1GB 或 2GB','HW_CACHE_CAPACITY'],['1个1g的redis 1-2GB','HW_CACHE_CAPACITY'],
  ['1个1g的redis 版本7.0','HW_CACHE_ENGINE'],['Redis v7 1GB','HW_CACHE_ENGINE'],['Redis 1GB ARM x86','HW_NO_MATCH']
 ]){
  const row=resource(text);
  assert.equal(row.huaweiMatch,code,text);
  assert.equal(calculate(row,catalog,{now}).monthly,null,text);
 }
 const item=catalog.items.find(item=>item.sku==='redis.single.xu1.large.1'&&item.billingMode==='ONDEMAND');
 const fixture=items=>({...catalog,items});
 const from=items=>match(parseText('1个1g的redis')[0],fixture(items));
 assert.equal(from([item,{...item,id:'fictional-duplicate'}]).huaweiMatch,'HW_MULTIPLE');
 assert.equal(from([{...item,region:'fictional-region'}]).huaweiMatch,'HW_NO_PLAN');
 assert.equal(from([{...item,description:null}]).huaweiMatch,'HW_NO_MATCH');
 const unverified=fixture([{...item,evidence:null}]);
 assert.equal(calculate(match(parseText('1个1g的redis')[0],unverified),unverified,{now}).monthly,null);
 const manual=match({...resource('1个1g的redis'),huaweiSelection:'manual',targetId:'manual-example',accepted:false});
 assert.equal(manual.targetId,'manual-example');
 assert.equal(manual.accepted,false);
 const monthly=match({...parseText('1个1g的redis')[0],targetBilling:'MONTHLY'});
 assert.equal(catalog.items.find(item=>item.id===monthly.targetId)?.billingMode,'MONTHLY');
 for(const [product,code] of [['Redis Cluster','HW_NO_MATCH'],['Redis 7.0','HW_CACHE_ENGINE'],['Redis 2G','HW_CACHE_CAPACITY'],['Redis ARM','HW_NO_MATCH']]){
  const [row]=normalizeRows([{product,specification:'1g',quantity:1}]);
  assert.equal(match({...row,service:'DCS'}).huaweiMatch,code);
 }
});

test('Redis size edits rematch the SKU and keep explicit conflicts Pending',()=>{
 const row=resource('Redis 2GB 单机 3套');
 row.specification='Redis 4GB 单机 3套';
 assert.equal(selection(match(row)),'redis.single.xu1.large.4');
 assert.equal(row.capacity,4);
 assert.equal(calculate(row,catalog,{now}).monthly,148.92);
 row.specification='Redis 单机 3套';
 assert.equal(calculate(match(row),catalog,{now}).reasonCode,'HW_CACHE_CAPACITY');
 assert.equal(row.capacity,null);
 assert.equal(resource('Redis 2.5 GiB 3套').huaweiMatch,'HW_NO_MATCH');
 assert.equal(resource('Redis 2GB 单机 1GB 或 3GB 3套').huaweiMatch,'HW_CACHE_CAPACITY');
 assert.equal(resource('Redis 2GB 单机 2节点 3套').huaweiMatch,'HW_CACHE_MODE');
 const [explicit]=normalizeRows([{product:'Redis',specification:'Redis 4GB 单机',capacity_gb:2,quantity:3}]);
 assert.equal(calculate(match(explicit),catalog,{now}).reasonCode,'HW_CACHE_CAPACITY');
});

test('RDS compute-only scope, region, unmatched service and manual selection',()=>{
 const [row]=normalizeRows([{product:'RDS',specification:'db.m5.large MySQL 8.0 Single-AZ Cloud SSD instance only',quantity:1}]);
 assert.equal(selection(match(row)),'rds.mysql.n1.large.4');
 assert.equal(calculate(row,catalog,{now}).monthly,100.01);
 assert.equal(resource('RDS db.m5.large MySQL Single-AZ').huaweiMatch,'HW_DB_PARAMETERS');
 const [wrong]=normalizeRows([{product:'EC2',specification:'4 vCPU 16 GiB Linux',quantity:1,huawei_target_region:'cn-east-3'}]);
 assert.equal(match(wrong).huaweiMatch,'HW_TARGET_REGION');
 const manually={...resource('1 台 4 vCPU 16 GiB 云主机'),targetId:'manual',accepted:false,huaweiSelection:'manual'};
 assert.equal(match(manually).targetId,'manual');
 assert.equal(resource('ELB dedicated bandwidth').huaweiMatch,'HW_MANUAL_SERVICE');
 assert.equal(resource('OBS S3 requests').huaweiMatch,'HW_NO_PLAN');
 assert.equal(resource('RDS SQL Server 2019 2 vCPU 8 GiB Single-AZ Cloud SSD instance only').huaweiMatch,'HW_DB_LICENSE');
});

test('catalog-backed private NAT matching requires a clear instance-only scope',()=>{
 const nat=resource('1 个 Private NAT Gateway small instance only');
 assert.equal(selection(nat),'privatenat_small');
 assert.deepEqual(nat.huaweiAssumptions,['HW_NAT_INSTANCE_ONLY']);
 assert.equal(calculate(nat,catalog,{now}).monthly,74.46);
 assert.equal(resource('1 个 AWS NAT Gateway small instance only').huaweiMatch,'HW_NAT_PARAMETERS');
 assert.equal(resource('1 个 Private NAT Gateway medium').huaweiMatch,'HW_NAT_PARAMETERS');
});

test('manual SKU is carried through billing changes without substituting another SKU',()=>{
 const row=resource('1 台 4 vCPU 16 GiB 云主机');
 const manual=catalog.items.find(item=>item.sku==='c9.xlarge.4.linux'&&item.billingMode==='ONDEMAND');
 Object.assign(row,{targetId:manual.id,huaweiSelection:'manual'});
 selectHuaweiBilling(row,'MONTHLY',catalog);
 assert.equal(selection(row),manual.sku);
 assert.equal(row.accepted,false);
 assert.equal(calculate(row,catalog,{now}).reasonCode,'MAPPING_REVIEW');
 const withoutManualYear={...catalog,items:catalog.items.filter(item=>!(item.sku===manual.sku&&item.billingMode==='YEARLY'))};
 selectHuaweiBilling(row,'YEARLY',withoutManualYear);
 assert.equal(row.targetId,'');
 assert.equal(calculate(row,withoutManualYear,{now}).reasonCode,'HW_MANUAL_PLAN');
 selectHuaweiBilling(row,'ONDEMAND',withoutManualYear);
 assert.equal(selection(row),manual.sku);
});

const sandbox={};
vm.runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const {XLSX}=sandbox;
function workbook(fixture){
 const data=readFileSync(new URL('./fixtures/'+fixture,import.meta.url));
 return fixture.endsWith('.csv')?XLSX.read(data.toString('utf8'),{type:'string'}):XLSX.read(new Uint8Array(data),{type:'array'});
}

test('standard sheets bypass the model and nonstandard workbooks retain physical row coordinates',()=>{
 for(const name of ['aws-fictional-mvp.csv','aws-fictional-mvp.xlsx']){
  const result=readInventory(workbook(name),XLSX);
  assert.equal(result.standard.length,4);
  assert.equal(result.source,undefined);
 }
 const ws=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(ws,XLSX.utils.aoa_to_sheet([['Fictional notes'],[],['台套','配置'],[1,'4 vCPU 16 GiB x86 Linux 云主机']]),'Compute');
 XLSX.utils.book_append_sheet(ws,XLSX.utils.aoa_to_sheet([['Redis 2GB 单机 3套']]),'Cache');
 const {source}=readInventory(ws,XLSX);
 assert.deepEqual(Array.from(source,row=>[row.sheet,row.row]),[['Compute',1],['Compute',3],['Compute',4],['Cache',1]]);
 const review=reviewInventory(source,{rows:[{id:1,kind:'note'},{id:2,kind:'header'},{id:3,kind:'resource',product:'ECS'},
  {id:4,kind:'resource',product:'DCS',quantity:3,capacity_gb:2}]});
 const [compute,cache]=confirmInventory(review);
 assert.equal(compute.importSource.row,4);
 assert.deepEqual(Array.from(compute.importSource.headers),['台套','配置']);
 assert.equal(compute.importSource.headerRow,3);
 assert.equal(compute.quantity,1);
 assert.equal(cache.importSource.sheet,'Cache');
 assert.equal(selection(match(cache)),'redis.single.xu1.large.2');
 cache.specification='Redis 4GB 单机 3套';
 assert.equal(selection(match(cache)),'redis.single.xu1.large.4');
});

test('numeric model guesses cannot repurpose capacity, CPU or replica counts',()=>{
 const source=[
  {id:1,sheet:'Fictional',row:2,cells:['Redis 2GB 单机']},
  {id:2,sheet:'Fictional',row:3,cells:['4 vCPU 16 GiB VM 2台']},
  {id:3,sheet:'Fictional',row:4,cells:['Redis 2GB 主备 2节点 3套']}
 ];
 const review=reviewInventory(source,{rows:[
  {id:1,kind:'resource',product:'DCS',capacity_gb:2,quantity:2},
  {id:2,kind:'resource',product:'ECS',quantity:4,usage:16},
  {id:3,kind:'note'}
 ]});
 assert.equal(review[0].capacity_gb,2);
 assert.equal(review[0].quantity,undefined);
 assert.equal(review[1].quantity,2);
 assert.equal(review[1].usage,undefined);
 assert.equal(review[2].include,true);
 assert.equal(review[2].quantity,3);
 const results=confirmInventory(review).map(row=>calculate(match(row),catalog,{now}));
 assert.equal(results[0].reasonCode,'HW_IMPORT_REVIEW');
 assert.equal(results[1].reasonCode,'HW_IMPORT_REVIEW');
 assert.equal(results[2].monthly,148.92);
 review[1].reviewed=true;
 assert.equal(calculate(match(confirmInventory(review)[1]),catalog,{now}).monthly,222.5);
 const separate=[
  {id:1,sheet:'Compute',row:2,cells:['Service','Specs','Quantity','Billing unit']},
  {id:2,sheet:'Compute',row:3,cells:['ECS','4 vCPU 16 GiB Linux','2','hour']}
 ];
 const [row]=confirmInventory(reviewInventory(separate,{rows:[]}));
 assert.equal(row.usage,null);
 assert.equal(calculate(match(row),catalog,{now}).monthly,222.5);
});

test('nonstandard model header mappings and invalid user values are reviewed per row',()=>{
 const source=[
  {id:1,sheet:'Compute',row:3,cells:['Asset class','vCPU','RAM (GiB)','OS','Seats requested']},
  {id:2,sheet:'Compute',row:4,cells:['Virtual machine',4,16,'Linux',2]},
  {id:3,sheet:'Storage',row:7,cells:['Category','Disk type','Capacity GB','Count','Target region']},
  {id:4,sheet:'Storage',row:8,cells:['Managed disk','100 GiB GPSSD','100 GiB',2,'cn-east-3']},
  {id:5,sheet:'Cache',row:9,cells:['Redis 2GB 单机 3套']}
 ];
 const output={rows:[
  {id:1,kind:'header',columns:{quantity:4}},
  {id:2,kind:'resource',product:'ECS',quantity:2},
  {id:5,kind:'resource',product:'DCS'}
 ]};
 const review=reviewInventory(source,output);
 assert.equal(review[1].quantity,2);
 assert.deepEqual(review[1].needsReview,['quantity']);
 assert.equal(review[3].capacity_gb,100);
 assert.equal(review[3].huawei_target_region,'cn-east-3');
 assert.equal(review[3].header.row,7);
 const result=()=>confirmInventory(review).map(row=>calculate(match(row),catalog,{now}));
 assert.deepEqual(result().map(row=>row.reasonCode),['HW_IMPORT_REVIEW','HW_TARGET_REGION',undefined]);
 review[1].reviewed=true;
 review[4].quantity='3.5';
 assert.deepEqual(result().map(row=>row.monthly),[222.5,null,null]);
 assert.deepEqual(result()[2].fields,['quantity']);
 for(const columns of [{quantity:5},{quantity:-1},{quantity:1.5},{price:0}]){
  assert.throws(()=>reviewInventory(source,{rows:[{id:1,kind:'header',columns}]}),/modelSyntax/);
 }
});

test('invalid or fabricated structured values are flagged and missing rows survive review',()=>{
 const {source}=readInventory(workbook('huawei-fictional-nonstandard.csv'),XLSX);
 assert.equal(source[3].cells[1],'Redis 2GB 单机 3套');
 const review=reviewInventory(source,{rows:[{id:3,kind:'resource',quantity:-1,usage:9999,capacity_gb:'16',
  specification:'128 CPUs',usage_period:'source-period'},{id:4,kind:'resource',quantity:2.5}]});
 assert.ok(review[0].include);
 assert.ok(review[2].specification.includes('vCPU'));
 assert.equal(review[2].quantity,1);
 assert.ok(review[2].warnings.includes('quantity'));
 assert.equal(review[2].usage_period,undefined);
 assert.ok(review[2].warnings.includes('specification'));
 assert.ok(review[3].warnings.includes('quantity'));
 for(const rows of [[{id:1,kind:'resource',price:1}],[{id:9,kind:'note'}],[{id:1,kind:'note'},{id:1,kind:'header'}],[{id:2}]]){
  assert.throws(()=>reviewInventory(source,{rows}),/modelSyntax/);
 }
});

const url='http://127.0.0.1:4814/api/inventory/model';
const source=[{id:1,sheet:'Fictional',row:3,cells:['Redis 2GB 单机 3套']}];
const post=(overrides={})=>new Request(url,{method:'POST',headers:{Origin:new URL(url).origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...overrides},body:JSON.stringify({rows:source})});

test('local model route enforces origin and exposes structured output without a cloud route',async()=>{
 let sent=0;
 const route=createLocalInventoryEndpoint({model:'fictional',port:'4813',token:'fictional-local-test',fetcher:async(target,params)=>{
  sent++;
  assert.equal(target,'http://127.0.0.1:4813/v1/chat/completions');
  assert.equal(params.headers.Authorization,'Bearer fictional-local-test');
  const packet=JSON.parse(params.body);
  assert.equal(packet.response_format.json_schema.strict,true);
  assert.equal(packet.temperature,0);
  assert.deepEqual(JSON.parse(packet.messages[1].content),[{id:1,sheet:'Fictional',cells:source[0].cells}]);
  return Response.json({choices:[{message:{content:'{"rows":[{"id":1,"kind":"resource","quantity":3}]}'}}]});
 }});
 assert.equal((await route(post({Origin:'https://elsewhere.example'}))).status,403);
 assert.equal((await route(post({'Sec-Fetch-Site':'cross-site'}))).status,403);
 assert.equal(sent,0);
 assert.deepEqual(await (await route(new Request(url))).json(),{available:true});
 assert.equal((await route(post())).status,200);
 assert.equal(sent,1);
 assert.equal((await createLocalInventoryEndpoint()(post())).status,404);
});

test('model timeout and malformed responses return stable errors',async()=>{
 const get=(fetcher,timeout=200)=>createLocalInventoryEndpoint({model:'fictional',port:'4813',fetcher,timeout});
 const parse=await get(async()=>Response.json({choices:[{message:{content:'not JSON'}}]}))(post());
 assert.deepEqual(await parse.json(),{error:'inventory.modelSyntax'});
 const noRows=await get(async()=>Response.json({choices:[{message:{content:'{}'}}]}))(post());
 assert.equal(noRows.status,502);
 const timeout=await get(async(_, {signal})=>new Promise((_,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason));
  const keepAlive=setTimeout(()=>{},100);
  signal.addEventListener('abort',()=>clearTimeout(keepAlive));
 }),5)(post());
 assert.equal(timeout.status,504);
 assert.deepEqual(await timeout.json(),{error:'inventory.timeout'});
 const unavailable=await get(async()=>{throw Error('connection rejected');})(post());
 assert.deepEqual(await unavailable.json(),{error:'inventory.unavailable'});
 const length=await get(async()=>Response.json({choices:[{finish_reason:'length'}]}))(post());
 assert.deepEqual(await length.json(),{error:'inventory.modelLength'});
});

test('inventory endpoint accepts an injected model adapter with bounded input and schema',async()=>{
 const route=createLocalInventoryEndpoint({modelAdapter:async({rows,schema,signal})=>{
  assert.deepEqual(rows,[{id:1,sheet:'Fictional',cells:source[0].cells}]);
  assert.equal(schema.properties.rows.items.properties.quantity.maximum,1e9);
  assert.ok(signal instanceof AbortSignal);
  return {rows:[{id:1,kind:'resource',quantity:3}]};
 }});
 assert.equal((await route(post())).status,200);
 assert.equal((await route(post({'Content-Type':'application/json-seq'}))).status,403);
});
