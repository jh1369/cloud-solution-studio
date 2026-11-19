import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readInventory,reviewInventory,confirmInventory} from '../public/inventory-import.mjs';
import {inventoryBatches,decodeInventoryBatch,mergeInventoryBatches,inventoryModelSchema,validateModelBatch} from '../public/inventory-batches.mjs';
import {awsBatchKnowledge,lookupAwsSpec,awsOperatingSystem} from '../public/aws-specs.mjs';
import {createOpenAiInventoryModel} from '../scripts/inventory_model_adapter.mjs';
import {createLocalInventoryEndpoint} from '../scripts/local_inventory_api.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows,confirmHuaweiConditionGroup,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {calculate,normalizeRows} from '../public/engine.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {summaryModel} from '../public/ui.mjs';

const catalogue=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Math.max(...catalogue.items.map(plan=>Date.parse(plan.verifiedAt)))+60000;
const opts={now,hours:730,discount:0,language:'en'};
const match=row=>applyHuaweiMatch(identifyHuaweiRow(row),catalogue,opts);
const vm={};runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),vm);
const XLSX=vm.XLSX;
const sample=(kind,fields=[])=>({kind,fields});
const sourced=(name,column,value=null)=>({name,column,value});

test('multi-sheet model analysis preserves long workbook identity, context, physical rows and mixed usage evidence',()=>{
 const book=XLSX.utils.book_new();
 const a=[['Notes: synthetic fleet'],[],['Component family','Cloud flavour','Measured usage'],
  ...Array.from({length:67},(_,i)=>['AmazonEC2','Example-BoxUsage:m6a.xlarge RunInstances',80+i])];
 const b=[['资源类别','规格','数量'],['ElastiCache','cache.m6g.large',2],['OpenSearch','m7g.large.search',1]];
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(a),'Synthetic fleet');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(b),'组件');
 const {source}=readInventory(book,XLSX);
 const batches=inventoryBatches(source);
 assert.deepEqual(batches.map(batch=>batch.length),[24,24,21,3]);
 assert.deepEqual(batches.map(batch=>batch[0].id),[1,25,49,70]);
 assert.equal(source[1].row,3);
 assert.equal(validateModelBatch(batches[1],source[1]).length,24);
 assert.throws(()=>validateModelBatch(batches[3],source[1]),/inventory.invalid/);
 const suggestions=batches.map(batch=>decodeInventoryBatch(batch,{rows:Object.fromEntries(batch.map(row=>{
  const entry=row.id===1?sample('note'):row.id===2?sample('header',[sourced('product',0),sourced('specification',1),sourced('usage',2)]):
   row.id===70?sample('header'):sample('resource');
  return ['r'+row.id,entry];
 }))}));
 assert.throws(()=>mergeInventoryBatches(source,suggestions.slice(0,3)),/modelIncomplete/);
 assert.throws(()=>mergeInventoryBatches(source,[...suggestions,suggestions[0]]),/modelSyntax/);
 const merged=mergeInventoryBatches(source,[...suggestions].reverse());
 const draft=reviewInventory(source,merged);
 const imported=confirmInventory(draft,{semantic:true}).map(match);
 assert.equal(imported.length,69);
 const first=imported[0],last=imported[66];
 assert.deepEqual([first.importSource.row,last.importSource.row,first.importSource.headerRow],[4,70,3]);
 assert.deepEqual([first.usage,last.usage,first.scope,first.period,first.quantity],[80,146,'aggregate','source-period',null]);
 assert.equal(first.importSource.fieldSources.usage.origin,'inferred');
 assert.equal(first.importSource.fieldSources.usage.columns[0],3);
 assert.equal(last.importSource.fieldSources.usage.headerRow,3);
 assert.equal(calculate(first,catalogue,opts).reasonCode,'HW_IMPORT_REVIEW');
 draft.find(row=>row.id===3).reviewed=true;
 const verified=match(confirmInventory(draft,{semantic:true})[0]);
 assert.equal(calculate(verified,catalogue,opts).status,'Period');
 assert.equal(verified.importSource.fieldSources.usage.confirmed,true);
 assert.equal(imported[67].awsProfile.kind,'ElastiCache');
 assert.equal(calculate(imported[67],catalogue,opts).reasonCode,'HW_MIG_USAGE_REQUIRED');
 assert.equal(imported[68].awsProfile.kind,'OpenSearch');
});

test('strict model batches require every physical row and reject extra keys, invalid numbers and conflicting sources',()=>{
 const rows=[{id:42,sheet:'Fictional',row:6,cells:['EC2',2,'m6i.xlarge']}];
 const valid={rows:{r42:sample('resource',[sourced('quantity',1,2)])}};
 assert.deepEqual(inventoryModelSchema(rows).properties.rows.required,['r42']);
 assert.equal(decodeInventoryBatch(rows,valid).rows[0].fieldColumns.quantity,1);
 const malformed=[
  {rows:{}},{rows:{...valid.rows,r43:sample('unknown')}},{rows:{r42:sample('resource',[sourced('quantity',1,2.5)])}},
  {rows:{r42:sample('resource',[sourced('quantity',3,2)])}},{rows:{r42:sample('resource',[sourced('price',1,2)])}},
  {rows:{r42:sample('resource',[sourced('quantity',1,2),sourced('quantity',1,3)])}}
 ];
 for(const output of malformed)assert.throws(()=>decodeInventoryBatch(rows,output),/modelSyntax/);
 assert.equal(decodeInventoryBatch(rows,{rows:{r42:'resource'}},{classifyOnly:true}).rows[0].kind,'resource');
 assert.throws(()=>decodeInventoryBatch(rows,valid,{classifyOnly:true}),/modelSyntax/);
});

test('verified AWS profiles are shared and keep source-only capacity, architecture and engine constraints explicit',()=>{
 const first=lookupAwsSpec('AmazonEC2','BoxUsage:c6i.xlarge RunInstances');
 const second=lookupAwsSpec('EC2','c6i.xlarge');
 assert.equal(first,second);
 assert.deepEqual([first.cpu,first.memory,first.architecture,first.category],[4,8,'x86','compute']);
 assert.match(first.evidence.specification.url,/docs.aws.amazon.com\/ec2\//);
 assert.equal(lookupAwsSpec('RDS','db.m7g.large').architecture,'arm');
 assert.match(lookupAwsSpec('RDS','db.m7g.large').evidence.architecture.url,/docs.aws.amazon.com\/AmazonRDS\//);
 assert.equal(lookupAwsSpec('RDS','db.r6i.8xlarge.tpc2.mem4x').memory,1024);
 assert.equal(lookupAwsSpec('RDS','db.m6i.large.tpc2.mem9x'),null);
 assert.equal(lookupAwsSpec('AmazonElastiCache','cache.m6g.large').memory,6.38);
 assert.equal(lookupAwsSpec('AmazonES','m7g.large.search').memory,8);
 assert.equal(lookupAwsSpec('EC2','c6i.xlarge or m6i.large'),null);
 assert.equal(lookupAwsSpec('EC2','c6i.xlarge or z9z.large'),null);
 assert.deepEqual(awsBatchKnowledge([{cells:['AmazonEC2','c6i.xlarge']},{cells:['EC2','c6i.xlarge']}]),[['c6i.xlarge','EC2',4,8,'x86']]);
 assert.equal(awsOperatingSystem('RunInstances:0002').value,'Windows');
 assert.equal(awsOperatingSystem('RunInstances:unknown'),null);
});

function compute(type,usage){
 return match({...normalizeRows([{product:'AmazonEC2',specification:`Fiction-BoxUsage:${type} RunInstances`,usage,unit:'hour',usage_scope:'aggregate'}])[0],awsInventory:true});
}
test('verified shapes generate separately priced conditions and confirmation rematches the exact same source configuration',()=>{
 const rows=[compute('c6i.xlarge',100),compute('c6i.xlarge',200),compute('t3.large',50),compute('m6a.xlarge',300)];
 const output=quoteHuaweiRows(rows,catalogue,opts);
 assert.deepEqual(output.map(result=>result.status),['Conditional','Conditional','Conditional','Period']);
 assert.ok(output[0].conditionalScenario>0);
 assert.equal(output[0].termScenario,null);
 assert.equal(rows[0].huaweiConditions[0],'HW_AWS_CAPACITY_REVIEW');
 assert.equal(rows[2].huaweiConditions[0],'HW_AWS_BURST_REVIEW');
 const summary=summaryModel(rows,output,'en');
 assert.equal(summary.ready,1);
 assert.equal(summary.conditionalCount,3);
 assert.equal(summary.scenario,output[3].scenario);
 const book=buildWorkbook(XLSX,rows,catalogue,{...opts,output},'Synthetic design');
 assert.deepEqual(Array.from(book.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const quotes=XLSX.utils.sheet_to_json(book.Sheets.Quotation,{defval:null});
 assert.equal(quotes[0]['Term Scenario USD'],null);
 assert.equal(quotes[0]['Conditional Scenario USD'],output[0].conditionalScenario);
 assert.equal(quotes[0]['Conditional Basis'],'source-period');
 assert.equal(confirmHuaweiConditionGroup(rows,rows[0],catalogue,opts),2);
 assert.deepEqual(quoteHuaweiRows(rows,catalogue,opts).map(result=>result.status),['Period','Period','Conditional','Period']);
 assert.ok(rows.every(row=>row.quantity===null));
 assert.deepEqual(rows.map(row=>row.usage),[100,200,50,300]);
 selectHuaweiBilling(rows[0],'MONTHLY',catalogue,opts);
 assert.equal(rows[0].huaweiConditionApproval,null);
 assert.equal(calculate(rows[0],catalogue,opts).reasonCode,'SUBSCRIPTION_REVIEW');
 const arm=compute('m6g.xlarge',24);
 assert.equal(calculate(arm,catalogue,opts).reasonCode,'HW_AWS_NO_PLAN');
 const ambiguous=compute('m6i.large or unknown-family z9z.large',24);
 assert.equal(calculate(ambiguous,catalogue,opts).reasonCode,'HW_AWS_SPEC_UNVERIFIED');
 const conflicting=compute('c6i.xlarge 8 vCPU',24);
 assert.equal(calculate(conflicting,catalogue,opts).reasonCode,'HW_AWS_SPEC_CONFLICT');
 const redis=match({...normalizeRows([{product:'Redis',specification:'Redis 2 GB single node',quantity:1,usage:100,unit:'hour'}])[0],semanticInventory:true});
 assert.equal(calculate(redis,catalogue,opts).status,'Conditional');
 assert.ok(redis.huaweiConditions.includes('HW_DCS_DOCUMENTED_X86'));
});

test('OpenAI adapter uses strict structured output for an explicitly scoped synthetic test and stays outside the loopback route',async()=>{
 const rows=[{id:3,cells:['Synthetic Cloud','4 vCPU']}];
 const proof={rows:{r3:sample('resource')}};
 assert.throws(()=>createOpenAiInventoryModel({apiKey:'fixture-secret',model:'fixture-model'}),/approved synthetic/);
 const model=createOpenAiInventoryModel({apiKey:'fixture-secret',model:'fixture-model',allowSynthetic:true,fetcher:async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer fixture-secret');
  const packet=JSON.parse(init.body);
  assert.equal(packet.response_format.json_schema.strict,true);
  assert.equal(packet.max_tokens,2048);
  assert.deepEqual(JSON.parse(packet.messages[1].content).rows,rows);
  return Response.json({choices:[{message:{content:JSON.stringify(proof)}}]});
 }});
 assert.deepEqual(await model({rows,schema:inventoryModelSchema(rows),signal:AbortSignal.timeout(1000)}),proof);
 const loopback=createLocalInventoryEndpoint({modelAdapter:async()=>proof});
 const denied=await loopback(new Request('https://private.example/api/inventory/model',{method:'POST',body:JSON.stringify({rows})}));
 assert.equal(denied.status,404);
});
