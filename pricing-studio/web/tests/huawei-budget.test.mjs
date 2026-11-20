import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {lookupAwsSpec} from '../public/aws-specs.mjs';
import {huaweiBudget,priceValidation} from '../public/engine.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {applyHuaweiMatch,configureHuaweiMigrationGroup,identifyHuaweiRow,quoteHuaweiRows,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {readInventory} from '../public/inventory-import.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=JSON.parse(read('../public/catalog.json'));
const now=Math.max(...catalog.items.map(item=>Date.parse(item.verifiedAt)))+60000;
const opts={now,hours:730,discount:0,language:'en'};
const runtime={};
runInNewContext(read('../public/vendor/xlsx.full.min.js'),runtime);
const {XLSX}=runtime;
const match=(row,prices=catalog,settings=opts)=>applyHuaweiMatch(identifyHuaweiRow(row),prices,settings);
const bill=lines=>{
 const book=XLSX.read('产品类型,规格类型,操作,使用量（小时数）,数量\n'+lines.join('\n'),{type:'string',raw:true});
 return Array.from(readInventory(book,XLSX).standard,row=>match(row));
};
const primary=rows=>quoteHuaweiRows(rows,catalog,opts);
const aliases=[['InstanceUsage:r6g.xl','db.r6g.xlarge'],['Multi-AZUsage:db.r6g.2xl','db.r6g.2xlarge'],
 ['FIC-InstanceUsage:R6G.4XL','db.r6g.4xlarge'],['FIC-InstanceUsage:r6g.large','db.r6g.large']];

test('RDS usage abbreviations resolve exact official types without changing source fields or hours',()=>{
 for(const [description,type] of aliases){
  const [row]=bill([`AmazonRDS,${description},CreateDBInstance,147.625,0.2`]);
  assert.equal(row.awsProfile.type,type);
  assert.equal(row.huaweiMigration.source.type.origin,'official-aws');
  assert.ok(row.specification.startsWith(description));
  assert.equal(row.importSource.cells[1],description);
  assert.equal(row.usage,147.625);
  assert.equal(row.quantity,null);
  const [result]=primary([row]);
  assert.equal(result.effectiveUsage,147.625);
  assert.equal(result.status,'Conditional');
  assert.equal(result.item.engine,'MySQL');
  assert.equal(result.item.targetArch,'x86');
  assert.ok(row.huaweiConditions.includes('HW_MIG_ARM_X86'));
 }
 assert.equal(lookupAwsSpec('AmazonRDS','db.r6g.4xl')?.type,'db.r6g.4xlarge');
 for(const description of ['InstanceUsage:db.fictional.4xl','InstanceUsage:r6g.4xl.extra','InstanceUsage:r6g.4xl-fictional',
  'InstanceUsage:r6g.xl Multi-AZUsage:r6g.2xl','InstanceUsage:db.r6g.2xl Multi-AZUsage:db.fictional.2xl',
  'InstanceUsage:db.r6g.2xl Multi-AZUsage:db.r6g.2xl-fictional']){
  assert.equal(lookupAwsSpec('AmazonRDS',description),null);
 }
 assert.equal(lookupAwsSpec('AmazonEC2','BoxUsage:r6g.2xl'),null);
});

test('four service budgets include conditional prices at import and preserve detailed statuses',()=>{
 const rows=bill([
  'AmazonEC2,FIC-BoxUsage:t3.small,RunInstances,49,0.1',
  'AmazonRDS,FIC-Multi-AZUsage:r6g.xl PostgreSQL 12,CreateDBInstance,120,0.2',
  'AmazonElastiCache,FIC-NodeUsage:cache.m6g.large,CreateCacheCluster,1488,2',
  'AmazonES,FIC-ESInstance:m7g.large,ESDomain,220,0.3',
  'AmazonRDS,FIC-Aurora:ServerlessV2Usage,CreateDBCluster,5,1',
  'AmazonES,FIC-UltraWarmUsage:ultrawarm1.medium,ESDomain,10,1'
 ]);
 const output=primary(rows),budget=huaweiBudget(rows,output);
 assert.deepEqual(output.map(result=>result.status),['Conditional','Conditional','Conditional','Conditional','Pending','Pending']);
 assert.deepEqual([budget.priced,budget.input,budget.confirmed,budget.conditional,budget.unpriced,budget.excludedCharges],[4,6,0,4,2,3]);
 assert.ok(rows[0].huaweiConditions.includes('HW_AWS_BURST_REVIEW'));
 assert.ok(rows[0].huaweiRanked.every(({cpu,memory})=>cpu>=1&&cpu<=2&&memory>=1&&memory<=2));
 assert.equal(rows[1].huaweiMigration.source.engine.value,'PostgreSQL');
 assert.equal(rows[1].huaweiMigration.source.version.value,'12');
 assert.ok(rows[1].huaweiConditions.includes('HW_BUDGET_RDS_ENGINE_DIFFERENCE'));
 assert.match(output[1].item.description,/DB Instance Type:Primary\/Standby;Storage Type:Cloud SSD;/);
 assert.equal(rows[2].usage,1488);
 assert.equal(rows[2].huaweiMigration.metering.sourceNodeHours,1488);
 assert.equal(output[2].effectiveUsage,744);
 assert.ok(budget.assumptions.some(([code])=>code==='HW_MIG_CACHE_PAIRING'));
 assert.equal(rows[3].huaweiMigration.settings.version.value,null);
 assert.equal(output[3].item.migrationCharge,'cssNode');
 assert.deepEqual(output.slice(4).map(result=>result.reasonCode),['HW_RDS_SERVERLESS','HW_CSS_WARM_REVIEW']);
 const cents=output.slice(0,4).reduce((sum,result,i)=>{
  assert.ok(priceValidation(result.item,catalog,opts).valid);
  assert.equal(result.termScenario,null);
  return sum+Math.round(result.item.rate*[49,120,744,220][i]*100);
 },0);
 assert.equal(budget.sourcePeriod,cents/100);
 assert.equal(budget.monthly,null);
 assert.equal(budget.annual,null);
});

test('RDS group edits use an offered engine and version and keep storage products distinct',()=>{
 const rows=bill(['AmazonRDS,FIC-InstanceUsage:db.m5.large,CreateDBInstance,200,0.3']);
 const [row]=rows;
 assert.ok(row.huaweiMigration.engineVersions.PostgreSQL.includes('12'));
 const options={...opts,storageBudget:{RDS:100}};
 assert.equal(configureHuaweiMigrationGroup(rows,row,{engine:'PostgreSQL',version:'12',topology:'single',storageType:'Cloud SSD'},catalog,options),1);
 const [result]=quoteHuaweiRows(rows,catalog,options);
 assert.equal(result.status,'Conditional');
 assert.equal(result.item.engine,'PostgreSQL');
 assert.equal(result.related[0].result.reasonCode,'HW_MIG_STORAGE_PRICE');
 assert.ok(row.huaweiConditions.includes('HW_BUDGET_RDS_TARGET_ARCH'));
 configureHuaweiMigrationGroup(rows,row,{engine:'PostgreSQL',version:'999'},catalog,opts);
 assert.equal(primary(rows)[0].status,'Pending');
});

test('optional storage is an independent budget assumption using priced aggregate hours once',()=>{
 const rows=bill(['AmazonRDS,FIC-InstanceUsage:db.m5.large,CreateDBInstance,200,0.3',
  'AmazonES,FIC-ESInstance:m7g.large,ESDomain,150,0.2']);
 const without=primary(rows),settings={...opts,storageBudget:{RDS:100,CSS:100}};
 const withStorage=quoteHuaweiRows(rows,catalog,settings);
 assert.equal(huaweiBudget(rows,without).excludedCharges,3);
 assert.deepEqual(withStorage.map(item=>item.conditionalScenario),without.map(item=>item.conditionalScenario));
 assert.equal(withStorage[0].related[0].result.status,'Conditional');
 assert.equal(withStorage[0].related[0].result.effectiveUsage,20000);
 assert.equal(withStorage[0].related[0].result.conditionalScenario,12.08);
 assert.equal(withStorage[0].related[1].result.reasonCode,'HW_MIG_BACKUP_INPUT');
 assert.equal(withStorage[1].related[0].result.status,'Conditional');
 assert.equal(withStorage[1].related[0].result.effectiveUsage,15000);
 assert.equal(withStorage[1].related[0].result.conditionalScenario,3);
 assert.equal(huaweiBudget(rows,withStorage).excludedCharges,1);
 assert.equal(rows[0].quantity,null);
});

test('budget and five-sheet round trip reconcile source, monthly, yearly and conditional figures',()=>{
 const rows=bill(['AmazonEC2,FIC-BoxUsage:m5.large,RunInstances,60,0.1',
  'AmazonRDS,FIC-Multi-AZUsage:r6g.xl,CreateDBInstance,120,0.2',
  'AmazonRDS,FIC-Multi-AZUsage:m6g.large,CreateDBInstance,70,0.1',
  'AmazonES,FIC-ESInstance:m7g.large,ESDomain,55,0.1']);
 for(const [row,mode] of [[rows[2],'MONTHLY'],[rows[3],'YEARLY']]){
  selectHuaweiBilling(row,mode,catalog,opts);
  assert.equal(primary([row])[0].reasonCode,'SUBSCRIPTION_REVIEW');
  row.period='monthly';
  assert.equal(primary([row])[0].reasonCode,'QUANTITY_REQUIRED');
  row.targetQuantity=2;
  match(row);
 }
 const output=primary(rows),summary=huaweiBudget(rows,output);
 assert.ok(summary.sourcePeriod>0&&summary.monthly>0&&summary.annual>0&&summary.prepaid>0);
 assert.equal(summary.headline,'sourcePeriod');
 assert.equal(summary.priced,4);
 const workbook=buildWorkbook(XLSX,rows,catalog,{...opts,output},'Fictional estimate');
 const reopened=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.deepEqual(Array.from(reopened.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const lines=XLSX.utils.sheet_to_json(reopened.Sheets.Quotation,{defval:null});
 const assumptions=Object.fromEntries(XLSX.utils.sheet_to_json(reopened.Sheets.Assumptions,{header:1}).slice(1));
 const cents=(lines,column)=>lines.filter(row=>row[column]!=null).reduce((sum,row)=>sum+Math.round(row[column]*100),0);
 for(const [column,key] of [['Source Period','sourcePeriod'],['Monthly Equivalent','monthly'],['Annual Scenario','annual'],['First-Term Prepaid','prepaid']]){
  assert.equal(assumptions['Estimated Budget '+column+' USD'],summary[key]);
  assert.equal(cents(lines,'Budget '+column+' USD')/100,summary[key]);
 }
 assert.equal(assumptions['Estimated Budget Coverage'],'4 / 4');
 assert.equal(lines.find(row=>row.Row===2).Status,'Conditional');
 assert.equal(lines.find(row=>row.Row===2)['Term Scenario USD'],null);
 assert.ok(lines.filter(row=>row.Status==='Pending').every(row=>row['Budget Source Period USD']===null&&row['Budget Monthly Equivalent USD']===null));
});

test('missing and expired catalog prices contribute no budget or zero placeholders',()=>{
 const row=bill(['AmazonRDS,FIC-InstanceUsage:r6g.xl,CreateDBInstance,130,0.2'])[0];
 const expired={...opts,now:now+8*86400000};
 for(const [prices,settings,reason] of [[catalog,expired,'PRICE_EXPIRED'],[{...catalog,items:[]},opts,'HW_AWS_NO_PLAN']]){
  const rows=[match(structuredClone(row),prices,settings)];
  const output=quoteHuaweiRows(rows,prices,settings),budget=huaweiBudget(rows,output);
  assert.equal(output[0].reasonCode,reason);
  assert.deepEqual([budget.sourcePeriod,budget.monthly,budget.prepaid,budget.priced], [null,null,null,0]);
  assert.equal(budget.unpriced,1);
 }
});
