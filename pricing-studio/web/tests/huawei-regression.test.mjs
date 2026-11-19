import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {readInventory} from '../public/inventory-import.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows} from '../public/huawei-match.mjs';
import {collectHuaweiRegression,validateHuaweiRegression} from '../public/huawei-regression.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=JSON.parse(read('../public/catalog.json'));
const now=Math.max(...catalog.items.map(plan=>Date.parse(plan.verifiedAt)))+60000;
const opts={webVersion:'0.3.15-dev',stage:'initial',now};
const runtime={};
runInNewContext(read('../public/vendor/xlsx.full.min.js'),runtime);

test('fictional release regression exports primary rows, valid candidates and separate charge counts',()=>{
 const {XLSX}=runtime;
 const book=XLSX.read(read('./fixtures/aws-fictional-huawei-migration.csv'),{type:'string',raw:true});
 const rows=readInventory(book,XLSX).standard.map(row=>applyHuaweiMatch(identifyHuaweiRow(row),catalog,opts));
 const output=quoteHuaweiRows(rows,catalog,opts);
 const regression=collectHuaweiRegression(rows,output,catalog,opts);
 assert.deepEqual(validateHuaweiRegression(regression),{input:24,identified:24,officialProfile:22,hasCandidate:16,
  confirmed:1,conditional:15,pending:8,linked:0,included:0});
 assert.deepEqual(regression.billingModes,{ONDEMAND:24});
 assert.equal(regression.services.ECS.pendingReasons.HW_AWS_NO_PLAN,3);
 assert.equal(regression.services.CSS.pendingReasons.HW_CSS_WARM_REVIEW,1);
 assert.deepEqual(Object.fromEntries(Object.entries(regression.charges).map(([name,totals])=>[name,totals.pending])),
  {rdsStorage:4,rdsBackup:4,cssStorage:4});
 const expired=collectHuaweiRegression(rows,output,catalog,{...opts,now:now+8*86400000});
 assert.equal(validateHuaweiRegression(expired).hasCandidate,0);
});

test('reports whitelist every emitted field, service, mode, charge and reason code',()=>{
 const example='FICTIONAL_SENSITIVE_MARKER';
 const rows=[{service:example,specification:example,product:example,id:example,awsProfile:{type:example},
  usage:9876543210,importSource:{cells:[example]},targetBilling:example}];
 const output=[{status:'Pending',reasonCode:example,reason:example,termScenario:1234567.89,
  related:[{charge:example,result:{status:'Linked',linkedRow:724}}]}];
 const data=collectHuaweiRegression(rows,output,catalog,opts);
 const json=JSON.stringify(data);
 for(const value of [example,'9876543210','1234567.89','724','specification','importSource','termScenario','product'])assert.ok(!json.includes(value));
 assert.equal(data.services.OTHER.pendingReasons.OTHER_PENDING,1);
 assert.equal(data.charges.OTHER.linked,1);
 assert.deepEqual(data.billingModes,{OTHER:1});
});

test('anonymized statistics intake rejects extra data and mismatched counts',()=>{
 const rows=[{service:'Unmapped'}],output=[{status:'Pending',reasonCode:'HW_IMPORT_REVIEW'}];
 const data=collectHuaweiRegression(rows,output,catalog,opts);
 assert.equal(data.services.UNMAPPED.identified,0);
 for(const update of [
  x=>{x.projectName='Example';},
  x=>{x.services.UNMAPPED.sourceRow=1;},
  x=>{x.services.UNKNOWN=x.services.UNMAPPED;},
  x=>{x.services.UNMAPPED.pendingReasons={HW_UNKNOWN_FREE_TEXT:1};},
  x=>{x.services.UNMAPPED.pending=2;},
  x=>{x.billingModes.ONDEMAND=2;},
  x=>{x.services.UNMAPPED.officialProfile=-1;},
  x=>{x.webVersion='0.3.15-FICTITIOUS-USER';}
 ]){
  const bad=structuredClone(data);
  update(bad);
  assert.throws(()=>validateHuaweiRegression(bad),/(invalid anonymized|counts do not reconcile)/i);
 }
});
