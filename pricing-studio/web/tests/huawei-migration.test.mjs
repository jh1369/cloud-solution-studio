import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildWorkbook} from '../public/excel.mjs';
import {readInventory} from '../public/inventory-import.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows,confirmHuaweiConditionGroup,
 configureHuaweiMigrationGroup,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {calculate,normalizeRows,priceValidation} from '../public/engine.mjs';
import {summaryModel} from '../public/ui.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=JSON.parse(read('../public/catalog.json'));
const now=Math.max(...catalog.items.map(plan=>Date.parse(plan.verifiedAt)))+60000;
const opts={now,hours:730,discount:0,language:'en'};
const runtime={};
runInNewContext(read('../public/vendor/xlsx.full.min.js'),runtime);
const {XLSX}=runtime;
const match=(row,catalogue=catalog,options=opts)=>applyHuaweiMatch(identifyHuaweiRow(row),catalogue,options);
const fromBill=()=>{
 const book=XLSX.read(read('./fixtures/aws-fictional-huawei-migration.csv'),{type:'string',raw:true});
 return readInventory(book,XLSX).standard.map(row=>match(row));
};
const quote=(row,catalogue=catalog,options=opts)=>quoteHuaweiRows([row],catalogue,options)[0];
const info=(row,key)=>row.huaweiMigration.settings[key].value;
const change=(rows,row,design)=>configureHuaweiMigrationGroup(rows,row,design,catalog,opts);

test('ECS ranked public plans preserve compatibility and enforce the two-times limits',()=>{
 const rows=fromBill();
 const [general,c3,compute,t2,t3,nano,unknown,windows,arm,memory]=rows;
 assert.equal(quote(general).status,'Period');
 assert.ok(general.huaweiRanked[0].cpu===1&&general.huaweiRanked[0].memory===1);
 assert.equal(c3.awsProfile.architecture,'x86');
 assert.equal(c3.huaweiRanked[0].category,'compute');
 assert.ok(c3.huaweiRanked[0].memory>1);
 assert.equal(quote(c3).status,'Conditional');
 assert.ok(compute.huaweiRanked.length>1);
 assert.equal(compute.huaweiRanked[0].category,'compute');
 for(const row of [t2,t3]){
  assert.ok(row.huaweiConditions.includes('HW_AWS_BURST_REVIEW'));
  assert.equal(quote(row).status,'Conditional');
 }
 assert.equal(quote(nano).reasonCode,'HW_AWS_NO_PLAN');
 assert.equal(quote(unknown).reasonCode,'HW_AWS_OS_REVIEW');
 assert.equal(windows.awsOS.value,'Windows');
 assert.equal(quote(windows).reasonCode,'HW_AWS_NO_PLAN');
 assert.equal(quote(arm).reasonCode,'HW_AWS_NO_PLAN');
 assert.equal(memory.huaweiRanked[0].category,'memory');
 for(const row of rows.slice(0,10))for(const choice of row.huaweiRanked??[]){
  assert.ok(row.huaweiRanked.length<=3);
  assert.ok(choice.cpu>=1&&choice.cpu<=2&&choice.memory>=1&&choice.memory<=2);
  assert.equal(choice.item.arch,row.awsProfile.architecture);
  assert.equal(choice.item.os,row.awsOS.value);
  assert.ok(priceValidation(choice.item,catalog,opts).valid);
 }
});

test('RDS target design is separate from source instance and Multi-AZ billing facts',()=>{
 const rows=fromBill(),normal=rows[10],multi=rows[11],same=rows[12],micro=rows[13],aurora=rows[14];
 assert.equal(info(normal,'engine'),'MySQL');
 assert.equal(info(normal,'version'),'8.0');
 assert.equal(info(normal,'topology'),'ha');
 assert.equal(normal.huaweiMigration.source.engine.value,null);
 assert.equal(multi.awsProfile.type,'db.m6g.large');
 assert.equal(multi.huaweiMigration.meter.basis,'database-multi-az-hours');
 assert.ok(multi.huaweiConditions.includes('HW_MIG_ARM_X86'));
 assert.equal(quote(multi).effectiveUsage,112);
 assert.equal(quote(micro).status,'Conditional');
 assert.ok(micro.huaweiConditions.includes('HW_MIG_MIN_SIZE'));
 assert.equal(quote(aurora).reasonCode,'HW_RDS_SERVERLESS');
 assert.deepEqual(quote(multi).related.map(line=>line.result.status),['Pending','Pending']);
 const target={engine:'MySQL',version:'8.0',topology:'ha',storageType:'Cloud SSD',storageGiB:100,storageHours:200,storageQuantity:1};
 assert.equal(change(rows,multi,target),2);
 assert.deepEqual([multi.usage,same.usage],[112,115]);
 assert.equal(multi.huaweiMigration.settings.engine.origin,'user-confirmed');
 assert.equal(quote(multi).related[0].result.status,'Conditional');
 assert.equal(confirmHuaweiConditionGroup(rows,multi,catalog,opts),2);
 const bill=quote(multi);
 assert.equal(bill.status,'Period');
 assert.equal(bill.related[0].result.termScenario,12.08);
 assert.equal(bill.related[1].result.termScenario,null);
 assert.equal(quote(normal).status,'Conditional');
 assert.equal(change(rows,multi,{...target,topology:'single'}),2);
 assert.match(quote(multi).item.description,/DB Instance Type:Single;/);
 assert.equal(quote(multi).status,'Conditional');
});

test('DCS paired estimates require usable capacity and grouping evidence before confirmation',()=>{
 const rows=fromBill(),cache=rows[15],same=rows[16],cluster=rows[17],explicit=rows[18];
 const price=quote(cache);
 assert.equal(cache.awsProfile.architecture,'arm');
 assert.ok(cache.awsProfile.memory>info(cache,'cacheGiB'));
 assert.ok(cache.huaweiProductMatch.selected.capacityMiB>=info(cache,'cacheGiB')*1024);
 assert.equal(cache.huaweiProductMatch.selected.replicas,2);
 assert.equal(cache.huaweiMigration.metering.sourceNodeHours,126);
 assert.equal(price.effectiveUsage,63);
 assert.equal(price.status,'Conditional');
 assert.ok(cache.huaweiMigration.comparison.sku.includes('.single.'));
 assert.ok(cache.huaweiRanked.length+1<=3);
 assert.equal(confirmHuaweiConditionGroup(rows,cache,catalog,opts),0);
 assert.equal(change(rows,cache,{cacheGiB:5,nodeGrouping:'verified',groupingEvidence:'Fictional pairs',
  sourcePeriodHours:40,targetInstances:1}),2);
 assert.equal(quote(cache).reasonCode,'HW_MIG_CACHE_GROUP_CONFLICT');
 assert.equal(change(rows,cache,{cacheGiB:5,nodeGrouping:'verified',groupingEvidence:'Equal-runtime fictional pairs',
  sourcePeriodHours:70,targetInstances:1}),2);
 assert.equal(cache.huaweiMigration.metering.sourceAverageNodes,1.8);
 assert.equal(cache.huaweiMigration.metering.targetInstanceQuantity,1);
 assert.equal(confirmHuaweiConditionGroup(rows,cache,catalog,opts),2);
 assert.deepEqual([quote(cache).effectiveUsage,quote(same).effectiveUsage,cache.usage,same.usage],[63,70,126,140]);
 assert.equal(quote(cache).status,'Period');
 assert.equal(quote(cluster).reasonCode,'HW_CACHE_MODE');
 assert.equal(change(rows,cluster,{topology:'cluster',cacheGiB:4,replicas:2,shards:3,nodeGrouping:'verified',
  groupingEvidence:'Six fictional nodes per cluster with equal runtime'}),1);
 assert.equal(quote(cluster).effectiveUsage,184/6);
 assert.equal(cluster.huaweiProductMatch.selected.shards,3);
 assert.equal(info(explicit,'cacheGiB'),7);
 assert.equal(explicit.huaweiMigration.settings.cacheGiB.origin,'excel');
 assert.equal(change(rows,explicit,{topology:'single',cacheGiB:6}),1);
 assert.equal(quote(explicit).reasonCode,'HW_CACHE_CAPACITY');
});

test('CSS native OpenSearch pricing separates storage and blocks warm or non-data nodes',()=>{
 const rows=fromBill(),node=rows[19],same=rows[20],warm=rows[23];
 const first=quote(node);
 assert.equal(first.status,'Conditional');
 assert.equal(first.item.migrationCharge,'cssNode');
 assert.equal(node.awsProfile.architecture,'arm');
 assert.ok(node.huaweiConditions.includes('HW_MIG_ARM_X86'));
 assert.equal(first.effectiveUsage,106);
 assert.equal(first.related[0].result.reasonCode,'HW_MIG_STORAGE_INPUT');
 assert.equal(confirmHuaweiConditionGroup(rows,node,catalog,opts),0);
 assert.equal(quote(warm).reasonCode,'HW_CSS_WARM_REVIEW');
 assert.equal(quote(rows[22]).reasonCode,'HW_CSS_ROLE_REVIEW');
 assert.equal(change(rows,node,{version:'1.3.6',storageType:'SSD',storageGiB:100,storageHours:200,storageQuantity:1}),2);
 assert.equal(confirmHuaweiConditionGroup(rows,node,catalog,opts),2);
 assert.equal(quote(node).related[0].result.termScenario,4);
 assert.equal(quote(same).effectiveUsage,145);
 assert.equal(same.usage,145);
 selectHuaweiBilling(node,'YEARLY',catalog,opts);
 assert.equal(quote(node).reasonCode,'SUBSCRIPTION_REVIEW');
 node.period='monthly';
 node.targetQuantity=1;
 match(node);
 assert.equal(quote(node).related[0].result.reasonCode,'HW_MIG_STORAGE_PRICE');
});

test('price and usage changes invalidate approval, and exports retain independent charges',()=>{
 const rows=fromBill(),rds=rows[10];
 assert.equal(confirmHuaweiConditionGroup(rows,rds,catalog,opts),1);
 assert.equal(quote(rds).status,'Period');
 const refreshed=structuredClone(catalog),plan=refreshed.items.find(item=>item.id===rds.targetId);
 plan.verifiedAt=new Date(now).toISOString();
 assert.equal(quote(rds,refreshed).status,'Conditional');
 assert.equal(calculate({...rds,usage:rds.usage+1},catalog,opts).status,'Conditional');
 const stale={...opts,now:now+8*86400000};
 const outdated=fromBill()[19];
 match(outdated,catalog,stale);
 assert.equal(quote(outdated,catalog,stale).reasonCode,'PRICE_EXPIRED');
 assert.deepEqual(outdated.huaweiRanked,[]);
 const output=quoteHuaweiRows(rows,catalog,opts),summary=summaryModel(rows,output,'en');
 const workbook=buildWorkbook(XLSX,rows,catalog,{...opts,output},'Fictional migration');
 assert.deepEqual(Array.from(workbook.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const data=XLSX.utils.sheet_to_json(workbook.Sheets.Quotation,{defval:null});
 assert.equal(data.filter(line=>line.Status==='Conditional').length,summary.conditionalCount);
 assert.ok(data.some(line=>line.Charge==='RDS excess backup'&&line.Status==='Pending'));
 for(const line of data.filter(line=>line.Status==='Pending'||line.Status==='Conditional')){
  assert.equal(line['Term Scenario USD'],null);
  if(line.Status==='Pending')assert.equal(line['Conditional Scenario USD'],null);
 }
 const proof=catalog.items.find(item=>item.migrationCharge==='cssStorage');
 const corrupt=structuredClone(proof);
 corrupt.evidence.probes[0].response.officialWebsiteAmount+=0.005;
 assert.equal(priceValidation(corrupt,catalog,opts).code,'PRICE_EVIDENCE');
});

test('standard CSV keeps AWS billing usage without publishing the original source quantities as target counts',()=>{
 const book=XLSX.read('product,specification,quantity,usage,unit\nAmazonRDS,Multi-AZUsage:m6g.large,3,39,hour\n',{type:'string',raw:true});
 const row=match(readInventory(book,XLSX).standard[0]);
 assert.deepEqual([row.quantity,row.usage,row.importSource.row,row.importSource.cells[2]],[null,39,2,'3']);
 assert.equal(quote(row).status,'Conditional');
});

test('stored public offers enforce real region, price mode, units and verified storage scaling',()=>{
 const candidates=catalog.items.filter(item=>item.migrationCharge||item.service==='ECS');
 assert.ok(candidates.every(item=>priceValidation(item,catalog,opts).valid));
 assert.equal(catalog.items.filter(item=>item.migrationCharge==='cssNode').length,36);
 assert.equal(catalog.items.some(item=>item.sku==='ess.volume.high'&&item.billingMode==='MONTHLY'),false);
 const row=match({...normalizeRows([{product:'AmazonEC2',specification:'m6g.large Linux',quantity:1,usage:2,unit:'hour'}])[0],awsInventory:true});
 assert.equal(calculate(row,catalog,opts).reasonCode,'HW_AWS_NO_PLAN');
});
