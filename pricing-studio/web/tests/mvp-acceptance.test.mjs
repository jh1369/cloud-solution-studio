// Automated module/Worker acceptance, NOT real-browser E2E.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeRows,recommend,switchBilling,calculate,mappingReview,sumMoney} from '../public/engine.mjs';
import {summaryModel,resourceHTML,catalogueHTML} from '../public/ui.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {t as translate,mappingLabel,readLanguage,saveLanguage} from '../public/i18n.mjs';
import {syntheticCatalog,syntheticRow} from './fixtures/synthetic-catalog.mjs';
const sandbox={console,Buffer,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder};
vm.runInNewContext(await readFile(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const XLSX=sandbox.XLSX,csv=await readFile(new URL('./fixtures/aws-fictional-mvp.csv',import.meta.url),'utf8');
function imported(book){return normalizeRows(Array.from(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''})));}
function fixture(){const catalog=syntheticCatalog(),rows=imported(XLSX.read(csv,{type:'string'}));rows.forEach(row=>{row.targetId=recommend(row,catalog);});return {catalog,rows};}
test('Fictional CSV and XLSX imports preserve count, usage, units and AWS billing',()=>{
 const book=XLSX.read(csv,{type:'string'}),bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
 const fromCSV=imported(book),fromXLSX=imported(XLSX.read(bytes,{type:'buffer'}));
 for(const rows of [fromCSV,fromXLSX]){
  assert.deepEqual(rows.map(r=>r.service),['ECS','EVS','RDS','OBS']);
  assert.deepEqual(rows.map(r=>r.quantity),[2,1,1,1]);assert.deepEqual(rows.map(r=>r.usage),[730,500,730,100]);
  assert.equal(rows[1].capacity,500);assert.equal(rows[0].billing,'reserved');assert.ok(rows.every(r=>!r.accepted));
 }
});
for(const [mode,expected] of Object.entries({
 ONDEMAND:{gross:365,scenario:310.25,annual:3723,prepaid:null},
 MONTHLY:{gross:210,scenario:178.5,annual:2142,prepaid:178.5},
 YEARLY:{gross:157.5,scenario:133.88,annual:1606.5,prepaid:1606.5}
}))test(`${mode}: confirmation, partial totals and all five Excel sheets agree`,()=>{
 const {catalog,rows}=fixture(),opts={hours:730,discount:.15,language:'en'};
 rows.forEach(row=>{switchBilling(row,mode,catalog);assert.equal(calculate(row,catalog,opts).status,'Pending');row.accepted=!!row.targetId;});
 const output=rows.map(row=>calculate(row,catalog,opts));assert.deepEqual(output.map(r=>r.status),['Valid','Valid','Valid','Pending']);
 const summary=summaryModel(rows,output,'en');assert.equal(summary.monthly,expected.gross);assert.equal(summary.scenario,expected.scenario);assert.equal(summary.annual,expected.annual);assert.equal(summary.upfront,expected.prepaid);
 assert.match(summary.note,/not a complete quote/);assert.equal(summary.ready,3);assert.equal(summary.total,4);
 const book=buildWorkbook(XLSX,rows,catalog,opts,'Fictional acceptance only');
 const exported=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.deepEqual(Array.from(exported.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 assert.equal(exported.Sheets.Input.J2.v,'reserved');assert.equal(exported.Sheets.Input.M2.v,mode);
 assert.equal(exported.Sheets['Service Mapping'].G2.v,'Yes');assert.match(exported.Sheets['Service Mapping'].K4.v,/storage.*backups/i);
 assert.equal(exported.Sheets['Public Pricing'].B2.v,'Valid');assert.equal(exported.Sheets['Public Pricing'].G2.v,{ONDEMAND:'hour',MONTHLY:'month',YEARLY:'year'}[mode]);
 assert.equal(exported.Sheets['Public Pricing'].B5.v,'Pending');assert.equal(exported.Sheets['Public Pricing'].E5,undefined);
 const quote=XLSX.utils.sheet_to_json(exported.Sheets.Quotation,{defval:null});
 assert.equal(sumMoney(quote.map(r=>r['Monthly Scenario or Amortized USD'])),expected.scenario);
 assert.equal(sumMoney(quote.map(r=>r['Annual Scenario USD'])),expected.annual);assert.equal(quote[3].Status,'Pending');assert.equal(quote[3]['Annual Scenario USD'],null);
 const assumptions=Object.fromEntries(XLSX.utils.sheet_to_json(exported.Sheets.Assumptions,{header:1}).slice(1));
 assert.equal(assumptions['Monthly equivalent partial subtotal USD'],summary.scenario);assert.equal(assumptions['Prepaid first-term partial subtotal USD']??null,summary.upfront);
});
test('Resource counts must be positive integers; aggregate usage is not multiplied again',()=>{
 const catalog=syntheticCatalog(),row=syntheticRow({catalog});
 for(const quantity of [0,.5,2.5])assert.equal(calculate({...row,quantity},catalog).reasonCode,'QUANTITY_INVALID');
 const result=calculate({...row,scope:'aggregate',period:'source-period',quantity:99,usage:1460},catalog);
 assert.equal(result.status,'Period');assert.equal(result.monthly,182.5);assert.equal(result.annual,null);
});
test('Unknown storage types require manual selection; architecture, OS and engines are explicit reviews',()=>{
 const {catalog,rows}=fixture();
 for(const specification of ['io1','io2','st1','sc1','unknown'])assert.equal(recommend({...rows[1],specification},catalog),'');
 const ecs=catalog.items.find(p=>p.service==='ECS'),rds=catalog.items.find(p=>p.service==='RDS');
 assert.ok(mappingReview({...rows[0],specification:'m6g.large Windows'},ecs).some(i=>i.code==='ARCH_DIFFERENT'));
 assert.ok(mappingReview({...rows[0],specification:'m6i.large Windows'},ecs).some(i=>i.code==='OS_DIFFERENT'));
 const issues=mappingReview({...rows[2],specification:'db.m5.large PostgreSQL'},rds);
 assert.ok(issues.some(i=>i.code==='ENGINE_DIFFERENT'));for(const issue of issues)for(const language of ['zh','en'])assert.ok(mappingLabel(issue,language));
});
test('Expired prices are Pending in calculation, UI and Excel, never presented as verified',()=>{
 const {catalog,rows}=fixture();rows[0].accepted=true;
 const price=catalog.items.find(p=>p.id===rows[0].targetId);price.verifiedAt='2000-01-01T00:00:00Z';
 const output=rows.map(row=>calculate(row,catalog));assert.equal(output[0].reasonCode,'PRICE_EXPIRED');
 const html=resourceHTML(rows,output,catalog,'en');assert.match(html,/snapshot has expired/);assert.doesNotMatch(html.split('</article>')[0],/Officially verified:/);
 assert.match(catalogueHTML([price],catalog,'en'),/Expired/);
 const book=buildWorkbook(XLSX,rows,catalog,{hours:730,discount:0},'Fictional expiry');assert.equal(book.Sheets['Public Pricing'].B2.v,'Pending');assert.equal(book.Sheets.Quotation.D2,undefined);
});
test('Cent-safe summaries and language preferences do not change user data',async()=>{
 assert.equal(sumMoney([.1,.2,null]),.3);
 assert.throws(()=>sumMoney([1e14]),/precision/);
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 saveLanguage(storage,'en');assert.equal(readLanguage(storage),'en');assert.deepEqual([...map.keys()],['pricing-studio.language']);
 const rows=[{service:'ECS'},{service:'ECS'}],output=[.1,.2].map(scenario=>({status:'Valid',monthly:scenario,scenario,annual:scenario*12,billingMode:'ONDEMAND',upfrontScenario:null}));
 for(const language of ['zh','en'])assert.equal(summaryModel(rows,output,language).scenario,.3);
 assert.equal(summaryModel(rows,output).groups[0][1],.3);
 const page=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 for(const [,key] of page.matchAll(/data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"/g))for(const language of ['zh','en'])assert.ok(translate(key,language));
 const fixtureData=fixture();fixtureData.rows.forEach(row=>row.accepted=!!row.targetId);
 for(const mode of ['ONDEMAND','MONTHLY','YEARLY']){
  fixtureData.rows.forEach(row=>{switchBilling(row,mode,fixtureData.catalog);row.accepted=!!row.targetId;});
  const results=fixtureData.rows.map(row=>calculate(row,fixtureData.catalog));
  for(const language of ['zh','en'])assert.match(resourceHTML(fixtureData.rows,results,fixtureData.catalog,language),/data-field="targetBilling"/);
 }
});
