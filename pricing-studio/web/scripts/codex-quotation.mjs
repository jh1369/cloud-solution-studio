import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {runInNewContext} from 'node:vm';
import {REGION} from '../public/engine.mjs';
import {readInventory} from '../public/inventory-import.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,quoteHuaweiRows} from '../public/huawei-match.mjs';
import {aiPlanSignature,huaweiAiRequest,huaweiAiSchema,resolveAiInput,validateAiRecommendation} from '../public/huawei-ai-match.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {monthlyBudgetLines,monthlyBudgetOptions,monthlyBudgetTotal,preferRecommendedMonthly,selectMonthlyBudget} from './monthly-budget.mjs';
import {buildMonthlyWorkbook,monthlyWorkbookInput} from './monthly-quotation-xlsx.mjs';

const context={Buffer,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder};
runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);
const {XLSX}=context;
const defaultCatalog=new URL('../public/catalog.json',import.meta.url);
const format='huawei-codex-quotation-v1';
const guidance=[
 'Return recommendations as JSON following responseSchema. Copy taskId into the response. Metering flags describe local evidence without quantities.',
 'Use only the listed candidate IDs or unambiguous SKUs. Choose null if none is useful.',
 'Explain the reason, relevant specification differences and budget assumptions. List required missing metering inputs.',
 'Prefer comparable ECS dimensions and OS. Note architecture changes. Prefer MySQL 8.0 primary/standby with Cloud SSD for RDS.',
 'Use the documented DCS tier with physical memory as a sizing proxy. Treat UltraWarm as a storage reference only.',
 'Leave unrelated storage out of the compute recommendation. Never supply rates, monetary amounts, quantities or paid terms.'
];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function readQuotationInput(bytes){
 const book=XLSX.read(bytes,{type:'buffer',raw:true,cellNF:true});
 const {standard}=readInventory(book,XLSX,{keepInvalid:true});
 if(!standard)throw Error('Use a standard Pricing Studio CSV/XLSX input or a supported AWS usage worksheet.');
 const rows=Array.from(standard);
 return {rows,input:monthlyWorkbookInput(XLSX,book,rows)};
}

export function readQuotationRows(bytes){
 return readQuotationInput(bytes).rows;
}

export function prepareQuotation(rows,catalog,{now=Date.now(),monthlyBudget,input}={}){
 if(catalog.region!==REGION||catalog.currency!=='USD'||!Array.isArray(catalog.items)||
    new Set(catalog.items.map(item=>item.id)).size!==catalog.items.length)throw Error('Expected a unique Huawei EU-Dublin USD catalog.');
 const options={now,hours:monthlyBudget?.periodHours??730,discount:monthlyBudget?.discount??0,
  codexQuotation:true,delivery:'codex',language:'en',monthlyBudget};
 rows=rows.map(row=>{
  identifyHuaweiRow(row);
  return monthlyBudget?selectMonthlyBudget(row,catalog,options):applyHuaweiMatch(row,catalog,options);
 });
 const output=quoteHuaweiRows(rows,catalog,options);
 const entries=rows.flatMap((row,index)=>{
  const request=huaweiAiRequest(row,catalog,output[index],options);
  if(!request)return [];
  const input=resolveAiInput({id:'r'+(index+1),...request},catalog,now);
  const unit=/^(?:hours?|hrs?|hourly|instance-hrs)$/i.test(row.unit)?'hour':
   /^(?:acu|acu-hours?)$/i.test(row.unit)?'acu-hour':'unknown';
  return input?[{row,request,input:{...input,metering:{
   unit,scope:['resource','aggregate'].includes(row.scope)?row.scope:'unknown',
   period:['monthly','source-period'].includes(row.period)?row.period:'unknown',
   usageKnown:row.usage!=null,quantityKnown:(row.targetQuantity??row.quantity)>0
  }}}]:[];
 });
 return {rows,output,options,entries,catalog,input};
}

export function quotationTask({entries,options}){
 const requests=entries.map(({input})=>input);
 const budget=options.monthlyBudget?{month:options.monthlyBudget.month,periodHours:options.monthlyBudget.periodHours,
  billingMonth:options.monthlyBudget.billingMonth??null}:null;
 const taskId=digest(budget?[budget,requests]:requests);
 const base=huaweiAiSchema(requests.length);
 return {format,taskId,region:REGION,currency:'USD',...(budget?{budget}:{}),guidance,requests,responseSchema:{
  ...base,required:['taskId',...base.required],properties:{taskId:{const:taskId},...base.properties}
 }};
}

export function applyQuotationRecommendations(prepared,task,result){
 if(task?.format!==format||task.region!==REGION||task.currency!=='USD'||!Array.isArray(task.requests)||
    task.requests.length>2000||digest(task.budget?[task.budget,task.requests]:task.requests)!==task.taskId||
    JSON.stringify(task.budget??null)!==JSON.stringify(quotationTask(prepared).budget??null))throw Error('Invalid matching task.');
 if(!result||Object.keys(result).length!==2||result.taskId!==task.taskId||!Array.isArray(result.recommendations)||
    result.recommendations.length>2000)throw Error('Recommendations must reference the original matching task.');
 const active=new Map(prepared.entries.map(entry=>[entry.input.id,entry]));
 const original=new Map(task.requests.map(input=>[input.id,input]));
 const byRow=new Map();
 for(const value of result.recommendations){
  const id=value?.id;
  if(!byRow.has(id))byRow.set(id,[]);
  byRow.get(id).push(value);
 }
 const counts={accepted:0,rejected:0,abstained:0,omitted:0};
 for(const [id,values] of byRow){
  const entry=active.get(id),issued=original.get(id);
  if(values.length!==1||!entry||!issued||JSON.stringify(issued)!==JSON.stringify(entry.input)||
     entry.row.huaweiSelection==='manual'||entry.row.huaweiAi){
   counts.rejected+=values.length;
   continue;
  }
  const {row,request,input}=entry;
  const recommendation=validateAiRecommendation(values[0],{...input,candidateIds:request.candidateIds});
  if(!recommendation){counts.rejected++;continue;}
  if(recommendation.selection===null){counts.abstained++;continue;}
  row.huaweiAi={request,signature:aiPlanSignature(row),recommendation};
  applyHuaweiMatch(row,prepared.catalog,prepared.options);
  if(row.huaweiAi?.display){
   counts.accepted++;
   if(prepared.options.monthlyBudget){
    const index=Number(id.slice(1))-1;
    prepared.rows[index]=preferRecommendedMonthly(row,prepared.catalog,prepared.options);
   }
  }else counts.rejected++;
 }
 counts.omitted=task.requests.filter(input=>!byRow.has(input.id)).length;
 prepared.output=quoteHuaweiRows(prepared.rows,prepared.catalog,prepared.options);
 return counts;
}

export function quotationWorkbook(prepared){
 const {rows,catalog,options,output}=prepared;
 if(options.monthlyBudget)return buildMonthlyWorkbook(XLSX,prepared);
 return XLSX.write(buildWorkbook(XLSX,rows,catalog,{...options,output},'Huawei Cloud budget'),{bookType:'xlsx',type:'buffer'});
}

function main(argv){
 const {positionals,values}=parseArgs({args:argv,allowPositionals:true,options:{
  catalog:{type:'string'},task:{type:'string'},recommendations:{type:'string'},quote:{type:'string'},
  'billing-month':{type:'string'},'period-hours':{type:'string'},discount:{type:'string'}
 }});
 const [action,inventory]=positionals;
 if(!['export','import'].includes(action)||positionals.length!==2||!values.task||!values.quote||
    (action==='import')!==!!values.recommendations)throw Error(
  'Usage: node scripts/codex-quotation.mjs export|import INVENTORY --task TASK.json --quote QUOTE.xlsx [--billing-month YYYY-MM] [--period-hours HOURS] [--discount FRACTION] [--catalog OFFICIAL.json] [--recommendations RESULT.json (import)]');
 const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
 const {rows,input}=readQuotationInput(readFileSync(inventory));
 const monthlyBudget=monthlyBudgetOptions({billingMonth:values['billing-month'],periodHours:values['period-hours'],discount:values.discount});
 const prepared=prepareQuotation(rows,readJSON(values.catalog??defaultCatalog),{monthlyBudget,input});
 let recommendations;
 if(action==='export'){
  const task=quotationTask(prepared);
  writeFileSync(values.task,JSON.stringify(task,null,2)+'\n',{flag:'wx',mode:0o600});
 }else{
  recommendations=applyQuotationRecommendations(prepared,readJSON(values.task),readJSON(values.recommendations));
 }
 writeFileSync(values.quote,quotationWorkbook(prepared),{flag:'wx',mode:0o600});
 const lines=monthlyBudgetLines(prepared.rows,prepared.output,prepared.options);
 const coverage={monthly:lines.filter(line=>line.amount!==null&&line.result.billingMode==='MONTHLY').length,
  onDemand:lines.filter(line=>line.amount!==null&&line.result.billingMode==='ONDEMAND').length,
  pending:lines.filter(line=>line.amount===null&&!['Included','Linked'].includes(line.result.status)).length};
 console.log(JSON.stringify({eligiblePending:prepared.entries.length,coverage,recommendations,
  monthlyUSD:monthlyBudgetTotal(lines)},null,2));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main(process.argv.slice(2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
