import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildWorkbook} from '../public/excel.mjs';
import {parseText,recommend} from '../public/engine.mjs';
const sandbox={console,Buffer,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder};
vm.runInNewContext(await readFile(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const XLSX=sandbox.XLSX;
const catalog=JSON.parse(await readFile(new URL('../public/catalog.json',import.meta.url)));
function resources(){const rows=parseText('2 台 EC2 m6i.2xlarge Linux，730 小时\n1 个 EBS gp3 500 GB\n1 个 S3 Standard 100 GB');rows.forEach(r=>{r.targetId=recommend(r,catalog);r.accepted=!!r.targetId;});return rows;}
test('Export real XLSX with five worksheets, official prices and Pending blanks',async()=>{
 const rows=resources(),book=buildWorkbook(XLSX,rows,catalog,{hours:730,discount:.15},'Fictional demo');
 assert.equal(Array.from(book.SheetNames).join(','),'Input,Service Mapping,Public Pricing,Quotation,Assumptions');
 const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'}),roundtrip=XLSX.read(bytes,{type:'buffer'});
 assert.equal(roundtrip.Sheets.Quotation.C4.v,'Pending');assert.equal(roundtrip.Sheets.Quotation.D4,undefined);
 assert.equal(roundtrip.Sheets['Public Pricing'].B2.v,'Valid');assert.equal(roundtrip.Sheets['Public Pricing'].F2.v,'USD');
 assert.equal(roundtrip.Sheets.Quotation.E2.v,.15);
 if(process.env.PRICING_EXPORT_CHECK)await writeFile(process.env.PRICING_EXPORT_CHECK,bytes);
});
test('Formula-like user input is literal text, never a formula',()=>{
 const rows=resources();rows[0].specification='=1+1';const book=buildWorkbook(XLSX,rows,catalog,{hours:730,discount:0},'=1+1');
 assert.equal(book.Sheets.Input.C2.t,'s');assert.equal(book.Sheets.Input.C2.f,undefined);
 assert.equal(book.Sheets.Assumptions.B2.t,'s');
});
test('Source-period quote never exports monthly or annual amounts',()=>{
 const rows=resources().slice(0,1);rows[0].scope='aggregate';rows[0].quantity=null;rows[0].period='source-period';
 const book=buildWorkbook(XLSX,rows,catalog,{hours:730,discount:0},'Fictional bill');
 assert.equal(book.Sheets.Quotation.C2.v,'Period');assert.equal(book.Sheets.Quotation.D2,undefined);assert.equal(book.Sheets.Quotation.G2,undefined);assert.equal(typeof book.Sheets.Quotation.H2.v,'number');
});
test('Excel preserves AWS source billing and annual target contract separately',async()=>{
 const {switchBilling}=await import('../public/engine.mjs');const row=resources()[0];row.billing='reserved';switchBilling(row,'YEARLY',catalog);row.accepted=true;
 const book=buildWorkbook(XLSX,[row],catalog,{hours:730,discount:.1},'Yearly demo');
 assert.equal(book.Sheets.Input.J2.v,'reserved');assert.equal(book.Sheets.Input.M2.v,'YEARLY');
 assert.equal(book.Sheets['Public Pricing'].K2.v,'包年');assert.equal(book.Sheets['Public Pricing'].L2.v,3);
 assert.equal(book.Sheets.Quotation.K2.v,'包年');assert.equal(book.Sheets.Quotation.L2.v,'1年');
 assert.equal(book.Sheets.Quotation.G2.v,book.Sheets.Quotation.O2.v);
 assert.notEqual(book.Sheets.Quotation.F2.v,book.Sheets.Quotation.O2.v);
});
