import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';

const fixture=new URL('./fixtures/aws-fictional-huawei-migration.csv',import.meta.url);
const root=resolve(process.argv[2]??fileURLToPath(new URL('..',import.meta.url)));
const asOf=process.argv[3]??'2026-11-19T19:00:00Z';
const now=Date.parse(asOf);
if(!Number.isFinite(now))throw Error('Supply a valid ISO price verification timestamp.');
const asset=file=>resolve(root,'public',file);
const load=file=>import(pathToFileURL(asset(file)));
const {readInventory}=await load('inventory-import.mjs');
const {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows}=await load('huawei-match.mjs');
const {priceValidation}=await load('engine.mjs');
const catalog=JSON.parse(readFileSync(asset('catalog.json'),'utf8'));
const options={now,hours:730,discount:0};
const runtime={};
runInNewContext(readFileSync(asset('vendor/xlsx.full.min.js'),'utf8'),runtime);
const {XLSX}=runtime;
const book=XLSX.read(readFileSync(fixture,'utf8'),{type:'string',raw:true});
const rows=readInventory(book,XLSX).standard.map(row=>applyHuaweiMatch(identifyHuaweiRow(row),catalog,options));
const results=quoteHuaweiRows(rows,catalog,options);
const services={},pending={},charges={};

for(const [index,row] of rows.entries()){
 const result=results[index];
 const metrics=services[row.service]??={input:0,identified:0,officialProfile:0,hasCandidate:0,confirmed:0,conditional:0,pending:0};
 metrics.input++;
 metrics.identified+=Number(row.service!=='Unmapped');
 metrics.officialProfile+=Number(!!row.awsProfile?.type);
 const candidate=catalog.items.some(plan=>plan.service===row.service&&plan.billingMode==='ONDEMAND'&&
  (row.targetId===plan.id||row.huaweiCandidates?.includes(plan.sku))&&priceValidation(plan,catalog,options).valid);
 metrics.hasCandidate+=Number(candidate);
 if(result.status==='Valid'||result.status==='Period')metrics.confirmed++;
 else if(result.status==='Conditional')metrics.conditional++;
 else if(result.status==='Pending'){
  metrics.pending++;
  pending[result.reasonCode]=(pending[result.reasonCode]??0)+1;
 }
 for(const line of result.related??[]){
  const statuses=charges[line.charge]??={};
  statuses[line.result.status]=(statuses[line.result.status]??0)+1;
 }
 if(row.usage!==Number(row.importSource.cells[3])||row.quantity!==null)throw Error('Fictional source usage was altered.');
}
console.log(JSON.stringify({asOf,services,pending,charges},null,2));
