import {normalizeRows} from './engine.mjs';

const fields=['product','specification','region','quantity','usage','unit','billing_method','capacity_gb','usage_scope','usage_period'];
const numeric=new Set(['quantity','usage','capacity_gb']);
const string={type:'string',maxLength:1024};
const integer={type:['integer','null'],minimum:1,maximum:1e9};
const number={type:['number','null'],minimum:0,maximum:1e12};
export const INVENTORY_SCHEMA={
 type:'object',additionalProperties:false,required:['rows'],properties:{
  rows:{type:'array',maxItems:60,items:{
   type:'object',additionalProperties:false,required:['id','kind'],properties:{
    id:{type:'integer',minimum:1,maximum:60},kind:{enum:['resource','header','note','unknown']},
    product:string,specification:string,region:string,quantity:integer,usage:number,unit:string,
    billing_method:string,capacity_gb:number,usage_scope:{enum:['resource','aggregate']},
    usage_period:{enum:['monthly','source-period']}
   }
  }}
 }
};
export const INVENTORY_LIMIT=12000;
const productHeaders=new Set(['product','service','aws service','产品','服务','product/productname']);
const standardFields=new Set(['specification','instance_type','instancetype','规格','description','region','aws region label','区域','quantity','count','数量','usage','monthly_usage','用量','period aggregate usage','lineitem/usageamount','billing_method','unit','original unit','单位','服务','计费方式','explicit instance specification']);

export function readInventory(book,XLSX){
 const name=book.SheetNames.includes('Input')?'Input':book.SheetNames[0];
 const sheet=book.Sheets[name];
 const range=sheet?.['!ref']&&XLSX.utils.decode_range(sheet['!ref']);
 if(range&&range.e.r-range.s.r<=2000&&range.e.c-range.s.c<128){
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,range:0,defval:'',blankrows:true});
  const header=(matrix[0]??[]).map(cell=>String(cell).replace(/^\uFEFF/,'').trim().toLowerCase());
  const quoteSheets=new Set(['Input','Service Mapping','Public Pricing','Quotation','Assumptions','Notes','Readme','说明']);
  const standardTemplate=book.SheetNames.length===1||name==='Input'&&book.SheetNames.every(name=>quoteSheets.has(name));
  if(standardTemplate&&header.some(cell=>productHeaders.has(cell))&&header.some(cell=>standardFields.has(cell))){
   return {standard:normalizeRows(XLSX.utils.sheet_to_json(sheet,{defval:''}))};
  }
 }
 const source=[];
 if(book.SheetNames.length>10)throw Error('inventory.limit');
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name];
  if(!sheet['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  if(range.e.r>2000||range.e.c>=20)throw Error('inventory.limit');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,range:0,defval:'',blankrows:true});
  for(const [index,cells] of matrix.entries()){
   if(cells.every(cell=>String(cell).trim()===''))continue;
   source.push({id:source.length+1,sheet:name,row:index+1,cells});
  }
 }
 if(!source.length)throw Error('inventory.empty');
 validateInventorySource(source);
 return {source};
}

export function validateInventorySource(source){
 if(!Array.isArray(source)||!source.length||source.length>60||JSON.stringify(source).length>INVENTORY_LIMIT)throw Error('inventory.limit');
 for(const [index,row] of source.entries()){
  if(!row||row.id!==index+1||typeof row.sheet!=='string'||row.sheet.length>128||
     !Number.isInteger(row.row)||row.row<1||row.row>2001||!Array.isArray(row.cells)||row.cells.length>20||
     row.cells.some(value=>typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value))))throw Error('inventory.invalid');
 }
 return source;
}

const tokens=text=>[...text.matchAll(/-?\d+(?:\.\d+)?/g)].map(match=>Number(match[0]));
const cleanHeader=cell=>String(cell).trim().toLowerCase();
const comparable=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const sourceFields={
 product:/^(?:resource|resource type|service|category|产品|服务|资源类别|资源类型|条目)$/,
 specification:/^(?:configuration|requirements?|specification|description|设备要求|规格|配置|资源描述)$/,
 quantity:/^(?:quantity|count|units|qty|台套|数量|台数|套数)$/,
 region:/^(?:region|location|区域|地区)$/,
 unit:/^(?:unit|单位|用量单位)$/,
 usage:/^(?:usage|monthly usage|用量|月用量)$/,
 capacity_gb:/^(?:capacity\s*\(?g(?:i)?b\)?|容量\s*\(?g(?:i)?b\)?)$/,
 billing_method:/^(?:billing method|billing|计费方式)$/
};
const sourceServices={
 ECS:/云主机|虚拟机|\b(?:ECS|EC2|virtual machines?|virtual server)\b/i,
 EVS:/云盘|硬盘|\b(?:EVS|EBS|SSD)\b/i,
 DCS:/\b(?:DCS|Redis)\b/i,
 RDS:/\b(?:RDS|MySQL|PostgreSQL|MariaDB|SQL Server)\b/i,
 ELB:/负载均衡|\b(?:ELB|load balancer)\b/i,
 OBS:/对象存储|\b(?:OBS|S3)\b/i
};
function sourceColumns(cells){
 return Object.fromEntries(Object.entries(sourceFields).flatMap(([key,pattern])=>{
  const column=cells.map(cleanHeader).findIndex(cell=>pattern.test(cell));
  return column<0?[]:[[key,column]];
 }));
}
function supplement(draft,columns){
 for(const [field,column] of Object.entries(columns??{})){
  const raw=draft.cells[column];
  if(raw==null||String(raw).trim()==='')continue;
  if(numeric.has(field)){
   const amount=typeof raw==='number'?raw:/^\d+(?:\.\d+)?$/.test(String(raw).trim())?Number(raw):NaN;
   if(Number.isFinite(amount)&&amount>=0&&amount<=1e12&&(field!=='quantity'||Number.isInteger(amount)&&amount>=1&&amount<=1e9))draft[field]=amount;
  }else draft[field]=String(raw).trim().slice(0,1024);
 }
 const text=draft.cells.filter(value=>typeof value==='string').join(' ').trim();
 const inferred=Object.entries(sourceServices).filter(([,pattern])=>pattern.test(text));
 if(inferred.length===1)draft.product=inferred[0][0];
 if(draft.specification){
  const containing=draft.cells.find(cell=>typeof cell==='string'&&comparable(cell).includes(comparable(draft.specification)));
  if(containing)draft.specification=containing.trim().slice(0,1024);
 }
 if(!draft.specification||!tokens(draft.specification).length&&tokens(text).length)draft.specification=text.slice(0,1024);
 if(!draft.quantity){
  const units=Number(text.match(/(\d+)\s*(?:台|套|块|instances?\b)/i)?.[1]);
  if(Number.isInteger(units)&&units>0&&units<=1e9)draft.quantity=units;
 }
}
export function reviewInventory(source,output){
 validateInventorySource(source);
 if(!output||Object.keys(output).length!==1||!Array.isArray(output.rows)||output.rows.length>source.length)throw Error('inventory.modelSyntax');
 const byId=new Map();
 for(const entry of output.rows){
  if(!entry||!Number.isInteger(entry.id)||!source[entry.id-1]||byId.has(entry.id)||
     !['resource','header','note','unknown'].includes(entry.kind)||Object.keys(entry).some(key=>!['id','kind',...fields].includes(key)))throw Error('inventory.modelSyntax');
  byId.set(entry.id,entry);
 }
 const columnsBySheet=new Map();
 return source.map(original=>{
  const entry=byId.get(original.id);
  const originalText=original.cells.map(String).join(' ');
  const sourceText=comparable(originalText);
  const originalNumbers=tokens(originalText.replace(/(\d),(?=\d{3}(?!\d))/g,'$1'));
  const draft={...original,include:!['header','note'].includes(entry?.kind),kind:entry?.kind??'unknown',warnings:[]};
  const columns=sourceColumns(original.cells);
  if(Object.keys(columns).length>=2){
   columnsBySheet.set(original.sheet,columns);
   draft.kind='header';draft.include=false;
  }
  for(const key of fields){
   const value=entry?.[key];
   if(value===null||value===undefined||value==='')continue;
   if(numeric.has(key)){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12||
       key==='quantity'&&(!Number.isInteger(value)||value<1||value>1e9)||!originalNumbers.includes(value)){
     draft.warnings.push(key);
     continue;
    }
   }else if(typeof value!=='string'||value.length>1024||
     ['specification','region'].includes(key)&&!sourceText.includes(comparable(value))||
     key==='usage_scope'&&(!['aggregate','resource'].includes(value)||value==='aggregate'&&!/aggregate|total usage|累计|合计用量/i.test(originalText))||
     key==='usage_period'&&(!['source-period','monthly'].includes(value)||value==='source-period'&&!/aggregate|period|total usage|账期|累计/i.test(originalText))){
    draft.warnings.push(key);
    continue;
   }
   draft[key]=value;
  }
  if(draft.include){
   supplement(draft,columnsBySheet.get(original.sheet));
   if(!draft.specification)draft.specification=originalText.trim().slice(0,1024);
   if(!draft.product)draft.warnings.push('product');
   if(draft.quantity==null&&draft.usage_scope!=='aggregate')draft.warnings.push('quantity');
  }
  return draft;
 });
}

export function confirmInventory(review){
 const active=review.filter(row=>row.include);
 if(!active.length)throw Error('inventory.empty');
 return active.map(draft=>{
  const input=Object.fromEntries(fields.map(field=>[field,draft[field]??'']));
  input.product=input.product.trim()||'Unknown';
  const [row]=normalizeRows([input]);
  row.importSource={sheet:draft.sheet,row:draft.row,cells:draft.cells};
  return row;
 });
}
