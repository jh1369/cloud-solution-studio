import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {aiCoverage} from '../public/huawei-ai-match.mjs';
import {huaweiBudget} from '../public/engine.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows} from '../public/huawei-match.mjs';
import {applyQuotationRecommendations,prepareQuotation,quotationTask,quotationWorkbook,readQuotationRows} from '../scripts/codex-quotation.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url));
const catalog=JSON.parse(read('../public/catalog.json'));
const now=Date.parse(catalog.verifiedAt)+60000;
const inventory=read('./fixtures/codex-quotation-synthetic.csv');
const recommendations=JSON.parse(read('./fixtures/codex-quotation-recommendations.json'));
const prepare=(prices=catalog,clock=now)=>prepareQuotation(readQuotationRows(inventory),prices,{now:clock});
const context={Buffer,Uint8Array,ArrayBuffer};
runInNewContext(read('../public/vendor/xlsx.full.min.js').toString(),context);
const {XLSX}=context;

test('Codex round trip preserves rule prices and reconciles all five workbook sheets',()=>{
 const prepared=prepare();
 const ruleRows=readQuotationRows(inventory).map(row=>applyHuaweiMatch(identifyHuaweiRow(row),catalog,{now}));
 const baseline=quoteHuaweiRows(ruleRows,catalog,{now});
 assert.deepEqual(prepared.output,baseline);
 const task=quotationTask(prepared);
 assert.equal(task.taskId,recommendations.taskId);
 assert.deepEqual(task.requests.map(input=>input.id),['r2','r3','r4','r5','r6','r7','r8']);
 for(const input of task.requests){
  assert.deepEqual(Object.keys(input),['id','source','region','billingMode','candidates','metering']);
  assert.equal(input.region,'eu-west-101');
  assert.ok(input.candidates.every(candidate=>!Object.hasOwn(candidate,'rate')));
  assert.ok(!Object.hasOwn(input.metering,'usage'));
 }
 assert.deepEqual(applyQuotationRecommendations(prepared,task,recommendations),{accepted:7,rejected:0,abstained:0,omitted:0});
 assert.deepEqual(aiCoverage(prepared.rows,prepared.output),{rule:3,ai:5,manual:0,pending:2});
 for(const i of [0,8,9])assert.deepEqual(prepared.output[i],baseline[i]);
 assert.deepEqual(prepared.output.slice(1,8).map(result=>result.conditionalScenario??null),[4.75,3.05,4.08,10.96,null,7.26,null]);
 assert.equal(prepared.output[4].related[0].charge,'rdsStorage');
 assert.equal(prepared.output[4].related[0].result.status,'Pending');
 assert.equal(prepared.output[6].related[0].charge,'cssStorage');
 assert.equal(prepared.output[6].related[0].result.status,'Pending');

 const book=XLSX.read(quotationWorkbook(prepared),{type:'buffer'});
 assert.deepEqual(Array.from(book.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const sheet=name=>Array.from(XLSX.utils.sheet_to_json(book.Sheets[name],{defval:null}));
 const mapping=sheet('Service Mapping');
 assert.ok(mapping.some(row=>row['Match Source']==='Rule Matched'));
 assert.equal(mapping.filter(row=>row['Match Source']==='AI Suggested').length,7);
 assert.ok(sheet('Public Pricing').some(row=>row['Official Source']&&row['Verified At']));
 const quotation=sheet('Quotation'),assumptions=Object.fromEntries(sheet('Assumptions').map(row=>[row.Item,row.Value]));
 const budget=huaweiBudget(prepared.rows,prepared.output);
 for(const [engine,column,summary,expected] of [
  ['sourcePeriod','Source Period', 'Source Period',4.08],
  ['monthly','Monthly Equivalent','Monthly Equivalent',100.29],
  ['prepaid','First-Term Prepaid','First-Term Prepaid',440.55]
 ]){
  assert.equal(budget[engine],expected);
  assert.equal(assumptions['Estimated Budget '+summary+' USD'],expected);
  assert.equal(quotation.reduce((sum,row)=>sum+Math.round((row['Budget '+column+' USD']??0)*100),0),Math.round(expected*100));
 }
 assert.ok(quotation.some(row=>row.Status==='Conditional Estimate'));
 assert.ok(quotation.filter(row=>row.Status==='Pending').every(row=>row['Budget Monthly Equivalent USD']===null));
});

test('rejects unknown, duplicate, wrong-region and stale recommendations before pricing',()=>{
 const fresh=prepare(),task=quotationTask(fresh),[wanted,arm]=recommendations.recommendations;
 assert.throws(()=>applyQuotationRecommendations(fresh,{...task,region:'cn-north-4'},recommendations),/Invalid matching task/);
 assert.throws(()=>applyQuotationRecommendations(fresh,task,{...recommendations,taskId:'elsewhere'}),/original matching task/);
 const invalid={taskId:task.taskId,recommendations:[
  {...wanted,selection:'unknown-sku'},arm,arm,{...wanted,id:'r1'}
 ]};
 assert.deepEqual(applyQuotationRecommendations(fresh,task,invalid),{accepted:0,rejected:4,abstained:0,omitted:5});
 assert.equal(fresh.output[1].status,'Pending');
 const id=task.requests[0].candidates.find(item=>item.sku===wanted.selection).id;
 const refused=prices=>{
  const updated=prepare(prices);
  assert.equal(applyQuotationRecommendations(updated,task,{taskId:task.taskId,recommendations:[wanted]}).rejected,1);
  assert.equal(updated.output[1].status,'Pending');
 };
 for(const change of [{region:'cn-north-4'},{evidence:null},{billingMode:'YEARLY'}]){
  refused({...catalog,items:catalog.items.map(item=>item.id===id?{...item,...change}:item)});
 }
 const expired=prepare(catalog,now+8*86400000);
 assert.equal(applyQuotationRecommendations(expired,task,recommendations).rejected,7);
 assert.equal(huaweiBudget(expired.rows,expired.output).monthly,null);
 const protectedRow=prepare();
 protectedRow.rows[1].huaweiSelection='manual';
 assert.equal(applyQuotationRecommendations(protectedRow,task,{taskId:task.taskId,recommendations:[wanted]}).rejected,1);
 assert.equal(protectedRow.rows[1].huaweiAi,undefined);
});
