import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {cost} from '../public/engine.mjs';
import {applyQuotationRecommendations,prepareQuotation,quotationTask,quotationWorkbook,readQuotationInput} from '../scripts/codex-quotation.mjs';
import {monthlyBudgetLines,monthlyBudgetOptions,monthlyBudgetTotal} from '../scripts/monthly-budget.mjs';

const file=name=>readFileSync(new URL(name,import.meta.url));
const catalog=JSON.parse(file('../public/catalog.json'));
const now=Date.parse(catalog.verifiedAt)+60000;
const source=file('./fixtures/monthly-quotation-synthetic.csv');
const suggestions=JSON.parse(file('./fixtures/monthly-quotation-recommendations.json'));
const context={Buffer,Uint8Array,ArrayBuffer};
runInNewContext(file('../public/vendor/xlsx.full.min.js').toString(),context);
const {XLSX}=context;
function prepare(bytes=source,{settings={billingMonth:'2026-07'},prices=catalog,clock=now}={}){
 const {rows,input}=readQuotationInput(bytes);
 return prepareQuotation(rows,prices,{now:clock,input,monthlyBudget:monthlyBudgetOptions(settings)});
}
const linesOf=quote=>monthlyBudgetLines(quote.rows,quote.output,quote.options);

test('original Input, nine columns, separate fees, monthly priority and rate arithmetic',()=>{
 const result=prepare();
 const task=quotationTask(result);
 assert.equal(task.taskId,suggestions.taskId);
 assert.deepEqual(task.requests.map(row=>row.billingMode),['MONTHLY','ONDEMAND','MONTHLY','ONDEMAND','MONTHLY','ONDEMAND']);
 assert.deepEqual(applyQuotationRecommendations(result,task,suggestions),{accepted:6,rejected:0,abstained:0,omitted:0});
 const lines=linesOf(result),main=lines.filter(line=>line.row===result.rows[line.index]);
 assert.deepEqual(main.map(line=>line.amount),[80.10,80.10,146.20,206.53,null,127.29,null,null,20,8.16]);
 assert.deepEqual(main.map(line=>line.units),[2,1,2,1,null,1,null,null,200,80]);
 assert.deepEqual(lines.filter(line=>line.row!==result.rows[line.index]).map(line=>line.charge),
  ['rdsStorage','rdsBackup','cssStorage']);
 assert.equal(monthlyBudgetTotal(lines),668.38);
 const bytes=quotationWorkbook(result);
 const w=XLSX.read(bytes,{type:'buffer',cellNF:true});
 assert.deepEqual(Array.from(w.SheetNames),['Input','AWS-Huawei Quotation','Assumptions & Pending']);
 const values=(book,name)=>JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:null})));
 const original=XLSX.read(source,{type:'buffer',raw:true});
 assert.deepEqual(values(w,'Input'),values(original,original.SheetNames[0]));
 const table=values(w,'AWS-Huawei Quotation');
 assert.deepEqual(table[0],['大类','AWS 实例规格/计费项','数量','AWS每月 USD（7月实际）','华为云对应实例/服务',
  '华为云单价 USD/月/计费单位','华为云数量/月','华为云每月 USD（预估）','折扣']);
 assert.equal(table[1][2],1.25);
 assert.equal(table[1][6],2);
 assert.equal(table[5][1],'[来源行 5] RDS 数据盘');
 assert.ok(table.slice(1).every(row=>row[8]===null));
 assert.equal(table.at(-1)[3],138.98);
 assert.equal(table.at(-1)[7],668.38);
 for(const [, , , ,target,rate,units,amount] of table.slice(1,-1)){
  if(amount===null){assert.equal(rate,null);assert.equal(units,null);continue;}
  assert.equal(cost(1,units,rate).monthly,amount);
  assert.match(target,/官方包月|官方按需/);
 }
 const notes=values(w,'Assumptions & Pending');
 assert.deepEqual(notes[0],['来源行号','AWS 服务/规格','华为云对应服务','问题类型','Assumption / 不确定性说明','费用影响','建议处理方式']);
 assert.ok(notes.some(row=>row[0]===2&&row[3]==='包月数量假设'&&/930.*744.*1\.250.*2 个/.test(row[4])));
 assert.ok(notes.some(row=>row[0]===4&&row[3]==='包月数量假设'&&/755.*744.*1\.015.*2 个/.test(row[4])));
 assert.ok(notes.some(row=>row[0]===11&&row[3]==='官方按需月度估算'&&/华为|huaweicloud/.test(row[4])));
 assert.ok(notes.some(row=>row[0]===9&&row[3]==='Pending'&&/专用计量/.test(row[4])));
 const xml=XLSX.CFB.read(bytes,{type:'buffer'});
 for(const i of [1,2,3]){
  const data=Buffer.from(XLSX.CFB.find(xml,`/xl/worksheets/sheet${i}.xml`).content).toString();
  assert.match(data,/state="frozen"/);
  assert.match(data,/<autoFilter /);
 }
 assert.match(Buffer.from(XLSX.CFB.find(xml,'/xl/styles.xml').content).toString(),/FF245C9D.*FFFCE4CF/);
});

test('aggregate fallback needs an explicit full period and never invents a subscription rate',()=>{
 const actual=Buffer.from('product,specification,quantity,usage,unit,AWS Actual USD\nAmazonEC2,BoxUsage:m5.large Linux,1.25,930,hour,42.12');
 const hourly={...catalog,items:catalog.items.filter(item=>item.billingMode!=='MONTHLY')};
 const result=prepare(actual,{prices:hourly});
 const [line]=linesOf(result);
 assert.equal(line.result.billingMode,'ONDEMAND');
 assert.equal(line.units,930);
 assert.equal(line.rate,0.0762);
 assert.equal(line.amount,70.87);
 assert.equal(linesOf(prepare(actual,{settings:{},prices:hourly}))[0].amount,null);
 assert.equal(linesOf(prepare(actual,{clock:now+8*86400000}))[0].amount,null);
 const discounted=prepare(actual,{settings:{billingMonth:'2026-07',discount:'0.1'}});
 assert.equal(linesOf(discounted)[0].amount,72.09);
 assert.equal(monthlyBudgetOptions({billingMonth:'2024-02'}).periodHours,696);
 assert.throws(()=>monthlyBudgetOptions({periodHours:'48'}),/完整/);
 assert.throws(()=>monthlyBudgetOptions({billingMonth:'2026-09',periodHours:'744'}),/相符/);

});

test('XLSX row gaps and invalid entries retain original source position and values',()=>{
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['Product','Specification','Quantity','Usage','Unit','AWS Actual USD','Currency','Notes'],
  ['AmazonEC2','m5.large Linux',1,82,'hour',7.5,'USD','row 2'],
  [],
  ['AmazonEC2','m5.large Linux',1,'unknown','hour',13,'EUR','row 4'],
 ]),'AWS Source');
 const result=prepare(XLSX.write(book,{bookType:'xlsx',type:'buffer'}),{settings:{billingMonth:'2026-09'}});
 assert.deepEqual(result.input.entries.map(row=>row.line),[2,4]);
 assert.deepEqual(linesOf(result).map(row=>row.amount),[40.05,null]);
 const w=XLSX.read(quotationWorkbook(result),{type:'buffer'});
 assert.equal(w.Sheets.Input.H4.v,'row 4');
 assert.equal(w.Sheets.Input.D4.v,'unknown');
 assert.equal(w.Sheets['AWS-Huawei Quotation'].D1.v,'AWS每月 USD（9月实际）');
 assert.equal(w.Sheets['AWS-Huawei Quotation'].D3,undefined);
 const other=prepare(source,{settings:{billingMonth:'2026-09'}});
 assert.throws(()=>applyQuotationRecommendations(other,quotationTask(prepare()),suggestions),/Invalid matching task/);
});
