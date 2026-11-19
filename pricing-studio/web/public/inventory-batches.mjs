import {INVENTORY_FIELDS,INVENTORY_KINDS,INVENTORY_NUMBERS,validateInventorySource} from './inventory-import.mjs';

export const MODEL_ROWS=24,MODEL_SOURCE_BYTES=20000,MODEL_OUTPUT_TOKENS=2048;
const encoder=new TextEncoder();
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const bytes=value=>encoder.encode(JSON.stringify(value)).length;
function preview(row){
 const lengths=[320,160,80,40];
 for(const length of lengths){
  const sample={...row,cells:row.cells.map(cell=>typeof cell==='string'?cell.slice(0,length):cell)};
  if(bytes(sample)+3<=MODEL_SOURCE_BYTES)return sample;
 }
 throw Error('inventory.modelRowLimit');
}

export function inventoryBatches(source){
 validateInventorySource(source);
 const batches=[];
 let batch=[],size=2;
 for(const original of source){
  const row=preview(original),length=bytes(row)+1;
  if(length>MODEL_SOURCE_BYTES)throw Error('inventory.modelRowLimit');
  if(batch.length&&(row.sheet!==batch[0].sheet||batch.length===MODEL_ROWS||size+length>MODEL_SOURCE_BYTES)){
   batches.push(batch);batch=[];size=2;
  }
  batch.push(row);size+=length;
 }
 if(batch.length)batches.push(batch);
 return batches;
}

export function validateModelBatch(rows,header){
 validateInventorySource(rows);
 if(rows.length>MODEL_ROWS||rows.some(row=>row.sheet!==rows[0].sheet)||bytes(rows)>MODEL_SOURCE_BYTES)throw Error('inventory.limit');
 if(header!==null&&header!==undefined){
  validateInventorySource([header]);
  if(header.sheet!==rows[0].sheet||header.row>=rows[0].row||header.id>=rows[0].id||bytes(header)>MODEL_SOURCE_BYTES)throw Error('inventory.invalid');
 }
 return rows;
}

const fields={type:'array',maxItems:INVENTORY_FIELDS.length,items:{type:'object',additionalProperties:false,
 required:['name','column','value'],properties:{name:{type:'string',enum:INVENTORY_FIELDS},column:{type:'integer',minimum:-1,maximum:63},
  value:{anyOf:[{type:'string',maxLength:1024},{type:'number',minimum:0,maximum:1e12},{type:'null'}]}}}};
export function inventoryModelSchema(rows,{classifyOnly=false}={}){
 const keys=rows.map(row=>`r${row.id}`);
 return {type:'object',additionalProperties:false,required:['rows'],properties:{rows:{type:'object',additionalProperties:false,
  required:keys,properties:Object.fromEntries(keys.map(key=>[key,{$ref:'#/$defs/inventoryRow'}]))}},
  $defs:{inventoryRow:classifyOnly?{type:'string',enum:INVENTORY_KINDS}:{type:'object',additionalProperties:false,required:['kind','fields'],
   properties:{kind:{type:'string',enum:INVENTORY_KINDS},fields}}}};
}

export function decodeInventoryBatch(source,output,{classifyOnly=false}={}){
 const error=()=>{throw Error('inventory.modelSyntax');};
 const keys=source.map(row=>`r${row.id}`);
 if(!exactKeys(output,['rows'])||!exactKeys(output.rows,keys))error();
 return {rows:source.map(({id,cells})=>{
  const value=output.rows['r'+id];
  if(classifyOnly){
   if(!INVENTORY_KINDS.includes(value))error();
   return {id,kind:value};
  }
  if(!exactKeys(value,['kind','fields'])||!INVENTORY_KINDS.includes(value.kind)||!Array.isArray(value.fields)||
    value.fields.length>INVENTORY_FIELDS.length)error();
  const proposed={id,kind:value.kind},columns={},fieldColumns={},seen=new Set();
  for(const field of value.fields){
   if(!exactKeys(field,['name','column','value']))error();
   const {name,column,value:proposal}=field;
   if(!INVENTORY_FIELDS.includes(name)||!Number.isInteger(column)||column< -1||column>=cells.length)error();
   if(value.kind!=='header'&&proposal===null)continue;
   if(seen.has(name))error();
   seen.add(name);
   if(value.kind==='header'){
    if(column<0||proposal!==null||typeof cells[column]!=='string'||!cells[column].trim())error();
    columns[name]=column;continue;
   }
   if(value.kind==='note')error();
   if(INVENTORY_NUMBERS.has(name)){
    if(typeof proposal!=='number'||!Number.isFinite(proposal)||proposal<0||proposal>1e12||
     name==='quantity'&&(!Number.isInteger(proposal)||proposal<1||proposal>1e9)||name==='capacity_gb'&&proposal<=0)error();
   }else if(typeof proposal!=='string'||proposal.length>1024||name==='usage_scope'&&!['resource','aggregate'].includes(proposal)||
    name==='usage_period'&&!['monthly','source-period'].includes(proposal)||name==='huawei_target_region'&&!/^[a-z]{2}(?:-[a-z]+)+-\d+$/i.test(proposal))error();
   proposed[name]=proposal;
   if(column>=0)fieldColumns[name]=column;
  }
  if(Object.keys(columns).length){
   if(new Set(Object.values(columns)).size!==Object.keys(columns).length)error();
   proposed.columns=columns;
  }
  if(Object.keys(fieldColumns).length)proposed.fieldColumns=fieldColumns;
  return proposed;
 })};
}

export function mergeInventoryBatches(source,batches){
 const expected=new Set(source.map(row=>row.id)),byId=new Map();
 for(const batch of batches)for(const row of batch.rows){
  if(!expected.has(row.id)||byId.has(row.id))throw Error('inventory.modelSyntax');
  byId.set(row.id,row);
 }
 if(byId.size!==source.length)throw Error('inventory.modelIncomplete');
 return {rows:source.map(row=>byId.get(row.id))};
}
