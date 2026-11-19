import {finite,normalizeRows} from './engine.mjs';
import {identifyHuaweiService} from './huawei-match.mjs';

export const INVENTORY_FIELDS=['product','specification','region','quantity','usage','unit','billing_method','capacity_gb','usage_scope','usage_period','huawei_target_region'];
export const INVENTORY_NUMBERS=new Set(['quantity','usage','capacity_gb']);
const kinds=['resource','header','note','unknown'];
const string={type:'string',maxLength:1024};
const number={type:['number','null'],minimum:0,maximum:1e12};
const scopes=['resource','aggregate'],periods=['monthly','source-period'];
export const INVENTORY_SCHEMA={
 type:'object',additionalProperties:false,required:['rows'],properties:{
  rows:{type:'array',maxItems:60,items:{
   type:'object',additionalProperties:false,required:['id','kind'],properties:{
    id:{type:'integer',minimum:1,maximum:60},kind:{enum:kinds},
    product:string,specification:string,region:string,
    quantity:{type:['integer','null'],minimum:1,maximum:1e9},usage:number,unit:string,billing_method:string,
    capacity_gb:{...number,exclusiveMinimum:0},usage_scope:{enum:scopes},
    usage_period:{enum:periods},huawei_target_region:string,
    columns:{type:'object',additionalProperties:false,properties:Object.fromEntries(INVENTORY_FIELDS.map(key=>[key,{type:'integer',minimum:0,maximum:19}]))}
   }
  }}
 }
};

export const INVENTORY_LIMIT=12000;
const productHeaders=new Set(['product','service','aws service','产品','服务','product/productname']);
const standardData=new Set(['specification','instance_type','instancetype','规格','description','描述','usage','monthly_usage','用量','period aggregate usage','lineitem/usageamount','explicit instance specification']);
const standardFields=new Set([...productHeaders,...standardData,'region','aws region label','区域','regioncode','quantity','count','数量','billing_method','billing method','aws billing method','unit','original unit','单位','计费方式','usage_scope','usage period','usage_period','capacity_gb','target_quantity','huawei_billing_mode','huawei_target_region']);
const clean=value=>String(value).normalize('NFKC').trim();
const comparable=value=>clean(value).toLowerCase().replace(/\s+/g,' ');
const headerLabel=value=>comparable(value).replaceAll('_',' ');
const blank=value=>value==null||clean(value)==='';

export function readInventory(book,XLSX){
 const name=book.SheetNames.includes('Input')?'Input':book.SheetNames[0];
 const sheet=book.Sheets[name];
 const range=sheet?.['!ref']&&XLSX.utils.decode_range(sheet['!ref']);
 if(range&&range.e.r<=2000&&range.e.c<128){
  const [first]=XLSX.utils.sheet_to_json(sheet,{header:1,range:{s:{r:0,c:0},e:{r:0,c:range.e.c}},defval:''});
  const header=(first??[]).map(cell=>String(cell).replace(/^\uFEFF/,'').trim().toLowerCase()).filter(Boolean);
  const quoteSheets=new Set(['Input','Service Mapping','Public Pricing','Quotation','Assumptions','Notes','Readme','说明']);
  const standardTemplate=book.SheetNames.length===1||name==='Input'&&book.SheetNames.every(name=>quoteSheets.has(name));
  if(standardTemplate&&header.some(cell=>productHeaders.has(cell))&&
     (header.some(cell=>standardData.has(cell))||header.length>1&&header.every(cell=>standardFields.has(cell)))){
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
   if(cells.every(blank))continue;
   if(source.length===60)throw Error('inventory.limit');
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
  if(!row||row.id!==index+1||typeof row.sheet!=='string'||!row.sheet.trim()||row.sheet.length>128||
     !Number.isInteger(row.row)||row.row<1||row.row>2001||!Array.isArray(row.cells)||!row.cells.length||row.cells.length>20||
     row.cells.some(value=>typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value))))throw Error('inventory.invalid');
 }
 return source;
}

const sourceFields={
 product:/^(?:product|resource|resource type|service|service name|category|产品|服务|资源类别|资源类型|条目)$/,
 specification:/^(?:configuration|requirements?|specification|specs?|description|instance type|设备要求|规格|配置|资源描述)$/,
 quantity:/^(?:quantity|count|units|qty|台套|数量|台数|套数|盘数)$/,
 region:/^(?:region|location|source region|区域|地区|来源区域)$/,
 huawei_target_region:/^(?:huawei(?: cloud)? (?:target )?region|target region|华为云(?:目标)?区域|目标区域)$/,
 unit:/^(?:unit|usage unit|billing unit|单位|用量单位)$/,
 usage:/^(?:usage|monthly usage|billable hours|用量|月用量)$/,
 capacity_gb:/^(?:capacity(?: per (?:disk|volume))?[\s_(]*g(?:i)?b\)?|容量[\s_(]*g(?:i)?b\)?)$/,
 billing_method:/^(?:billing method|billing|计费方式)$/,
 usage_scope:/^(?:usage scope|用量范围)$/,
 usage_period:/^(?:usage period|用量账期)$/
};
const dimensions=[
 [/^(?:vcpu[s]?|cpu cores?|cpu 核数|核数)$/,'vCPU'],
 [/^(?:memory|ram|内存)\s*(?:\(\s*g(?:i)?b\s*\)|g(?:i)?b)$/,'GiB'],
 [/^(?:architecture|arch|os|operating system|cpu 架构|架构|操作系统|disk type|volume type|磁盘类型|云盘类型|topology|deployment(?: mode)?|部署(?:模式|方式)|engine|数据库引擎|缓存类型)$/,''],
 [/^(?:engine version|database version|version|数据库版本|版本)$/,'version']
];
function knownColumns(cells){
 const labels=cells.map(headerLabel);
 return Object.fromEntries(Object.entries(sourceFields).flatMap(([key,pattern])=>{
  const column=labels.findIndex(label=>pattern.test(label));
  return column<0?[]:[[key,column]];
 }));
}
const dimensionOf=label=>dimensions.find(([pattern])=>pattern.test(headerLabel(label)));
function dimensionText(cells,headers){
 return (headers??[]).flatMap((header,index)=>{
  const dimension=dimensionOf(header);
  if(!dimension||blank(cells[index]))return [];
  const value=clean(cells[index]),unit=dimension[1];
  return [unit==='version'?'version '+value:unit&&/^[+-]?\d+(?:\.\d+)?$/.test(value)?value+' '+unit:value];
 }).join(' ');
}

function fieldValue(field,value,model=false){
 if(value==null||value==='')return undefined;
 if(INVENTORY_NUMBERS.has(field)){
  if(model&&typeof value!=='number')throw Error('inventory.invalid');
  const amount=finite(typeof value==='string'?clean(value):value,field);
  if(field==='quantity'&&(!Number.isInteger(amount)||amount<1||amount>1e9)||field==='capacity_gb'&&amount<=0)throw Error('inventory.invalid');
  return amount;
 }
 if(typeof value!=='string'||value.length>1024)throw Error('inventory.invalid');
 const raw=value.trim();
 if(field==='usage_scope'&&!scopes.includes(raw)||field==='usage_period'&&!periods.includes(raw)||
    field==='huawei_target_region'&&!/^[a-z]{2}(?:-[a-z]+)+-\d+$/i.test(raw))throw Error('inventory.invalid');
 return field==='huawei_target_region'?raw.toLowerCase():raw||undefined;
}

const quantityToken=/(?<![\w.])([+-]?\d[\d,.]*)\s*(?:台|套|块|个|instances?\b|disks?\b|volumes?\b|units?\b)|(?:\b(?:quantity|qty|count)\b|数量)\s*[:=]\s*([+-]?\d[\d,.]*)/gi;
const capacityToken=/(?<![\w.])([+-]?\d[\d,.]*)\s*(?:GiB|GB|G)(?![a-z]|\s*(?:[-/·]\s*)?(?:months?\b|hours?\b|mo\b|月|小时))/gi;
const usageToken=/(?<![\w.])([+-]?\d[\d,.]*)\s*(Gi?B[-/· ](?:months?|hours?)\b|hours?\b|hrs?\b|小时)/gi;
const units={'小时':'hour','hours':'hour','hr':'hour','hrs':'hour'};
function usageUnit(value){
 const match=value.match(/^(Gi?B)[-/· ](months?|hours?)$/i);
 if(!match)return units[value.toLowerCase()]??value;
 return (match[1].length===3?'GiB':'GB')+'-'+match[2].toLowerCase().replace(/s$/,'');
}
const usageScope=/\b(?:aggregate|total usage)\b|累计|合计用量/i;
const sourcePeriod=/\b(?:source period|billing period)\b|账期/i;
const columnSuffix={
 quantity:/\s*(?:台|套|块|个|instances?|disks?|volumes?|units?)$/i,
 capacity_gb:/\s*(?:GiB|GB|G)$/i,
 usage:/\s*(?:Gi?B[-/· ](?:months?|hours?)|hours?|hrs?|小时)$/i
};

function explicitField(cells,field,pattern){
 const values=new Set();
 for(const cell of cells){
  for(const match of cell.matchAll(pattern))values.add(fieldValue(field,match[1]??match[2]));
 }
 if(values.size>1)throw Error('inventory.invalid');
 return values.values().next().value;
}
function observedFields(draft,header){
 const cells=draft.cells;
 const textCells=cells.filter(value=>typeof value==='string'&&!blank(value)).map(clean);
 const text=textCells.join(' ');
 const values={},invalid=new Set();
 for(const [field,column] of Object.entries(header?.known??{})){
  const raw=cells[column];
  if(blank(raw))continue;
  const value=INVENTORY_NUMBERS.has(field)&&typeof raw==='string'?clean(raw).replace(columnSuffix[field],''):raw;
  try{values[field]=fieldValue(field,value);}
  catch{invalid.add(field);}
 }
 const mapped=new Set(Object.values(header?.known??{}));
 const unmappedText=cells.filter((value,index)=>typeof value==='string'&&!blank(value)&&
  !mapped.has(index)&&!dimensionOf(header?.row.cells[index])).map(clean);
 const specParts=[values.specification,dimensionText(cells,header?.row.cells),...unmappedText].filter(Boolean);
 const spec=specParts.join(' ');
 const inferred=identifyHuaweiService(values.product??'',spec||text);
 let capacityFromSpec=false;
 for(const [field,pattern] of [['quantity',quantityToken],['capacity_gb',capacityToken],['usage',usageToken]]){
  if(field==='capacity_gb'&&!['EVS','DCS'].includes(inferred)&&values[field]===undefined)continue;
  const evidence=field==='capacity_gb'&&specParts.length?specParts:textCells;
  try{
   const amount=explicitField(evidence,field,pattern);
   if(amount!==undefined&&values[field]!==undefined&&values[field]!==amount)invalid.add(field);
   if(amount!==undefined&&values[field]===undefined){
    values[field]=amount;
    if(field==='capacity_gb')capacityFromSpec=true;
   }
  }catch{invalid.add(field);}
 }
 if(values.usage!==undefined&&values.unit===undefined){
  const observedUnits=new Set(textCells.flatMap(cell=>Array.from(cell.matchAll(usageToken),match=>usageUnit(match[2]))));
  if(observedUnits.size===1)values.unit=observedUnits.values().next().value;
 }
 if(usageScope.test(text))values.usage_scope??='aggregate';
 if(sourcePeriod.test(text)||values.usage_scope==='aggregate')values.usage_period??='source-period';
 if(values.unit)values.unit=usageUnit(values.unit);
 if(spec)values.specification=spec.slice(0,1024);
 return {values,inferred,text,invalid,capacityFromSpec};
}

const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function indexOutput(source,output){
 if(!record(output)||Object.keys(output).length!==1||!Array.isArray(output.rows)||output.rows.length>source.length)throw Error('inventory.modelSyntax');
 const byId=new Map();
 for(const entry of output.rows){
  if(!record(entry)||!Number.isInteger(entry.id)||!source[entry.id-1]||byId.has(entry.id)||
     !kinds.includes(entry.kind)||Object.keys(entry).some(key=>!['id','kind','columns',...INVENTORY_FIELDS].includes(key)))throw Error('inventory.modelSyntax');
  if(entry.columns!==undefined&&(entry.kind!=='header'||!record(entry.columns)||Object.entries(entry.columns).some(([key,column])=>
   !INVENTORY_FIELDS.includes(key)||!Number.isInteger(column)||column<0||column>=source[entry.id-1].cells.length||
   typeof source[entry.id-1].cells[column]!=='string'||blank(source[entry.id-1].cells[column]))))throw Error('inventory.modelSyntax');
  byId.set(entry.id,entry);
 }
 return byId;
}

function applyModelFields(draft,entry,header,observed){
 const {values,inferred,text,invalid,capacityFromSpec}=observed;
 const source=comparable(text);
 const needsReview=new Set(invalid);
 const warnings=new Set([...draft.warnings,...invalid]);
 for(const key of INVENTORY_FIELDS){
  const proposal=entry?.[key];
  const known=values[key];
  let proposed;
  try{proposed=fieldValue(key,proposal,true);}
  catch{warnings.add(key);if(known===undefined)needsReview.add(key);}
  if(known!==undefined){
   draft[key]=known;
   const sameService=key==='product'&&inferred!=='Unmapped'&&proposed!==undefined&&identifyHuaweiService(proposed)===inferred;
   if(proposed!==undefined&&comparable(proposed)!==comparable(known)&&!sameService)warnings.add(key);
   continue;
  }
  if(proposed===undefined)continue;
  if(key==='product'&&inferred!=='Unmapped'){
   draft.product=inferred;
   if(identifyHuaweiService(proposed)!==inferred)warnings.add(key);
   continue;
  }
  if(key==='specification'){
   if(!source.includes(comparable(proposed)))warnings.add(key);
   continue;
  }
  if(key==='product'&&/^unknown$/i.test(proposed))continue;
  if(['product','region','billing_method'].includes(key)&&source.includes(comparable(proposed))){
   draft[key]=proposed;
   continue;
  }
  if(['usage_scope','usage_period'].includes(key)&&proposed===({usage_scope:'resource',usage_period:'monthly'})[key])continue;
  const column=header?.suggested?.[key];
  const raw=draft.cells[column];
  if(!blank(raw)&&comparable(proposed)===comparable(raw))draft[key]=proposed;
  warnings.add(key);
  // Source region and billing method are traceability fields.
  if(!['region','billing_method'].includes(key))needsReview.add(key);
 }
 draft.product??=inferred==='Unmapped'?undefined:inferred;
 draft.specification??=text.slice(0,1024);
 if(!draft.product)warnings.add('product');
 if(draft.quantity==null&&draft.usage_scope!=='aggregate')warnings.add('quantity');
 draft.needsReview=[...needsReview];
 draft.warnings=[...warnings];
 draft.capacityFromSpec=capacityFromSpec;
}

export function reviewInventory(source,output){
 validateInventorySource(source);
 const byId=indexOutput(source,output);
 const headers=new Map();
 return source.map(original=>{
  const entry=byId.get(original.id),header=headers.get(original.sheet);
  const known=knownColumns(original.cells);
  const visibleDimensions=original.cells.filter(dimensionOf).length;
  const observed=observedFields(original,header);
  const kind=entry?.kind??'unknown';
  const looksLikeResource=observed.inferred!=='Unmapped'&&
   (Object.keys(observed.values).length>0||/\d\s*(?:vcpus?|GiB|GB|G|核|套|台|块)/i.test(observed.text));
  const isHeader=Object.keys(known).length+visibleDimensions>=2||kind==='header'&&!looksLikeResource;
  if(isHeader)headers.set(original.sheet,{row:original,known,suggested:entry?.columns});
  const include=!isHeader&&(kind!=='note'||looksLikeResource);
  const draft={...original,header:isHeader?null:header?.row??null,include,kind:isHeader?'header':kind,
   warnings:include&&['note','header'].includes(kind)?['kind']:[],needsReview:[]};
  if(include)applyModelFields(draft,entry,header,observed);
  return draft;
 });
}

export function confirmInventory(review){
 const active=review.filter(row=>row.include);
 if(!active.length)throw Error('inventory.empty');
 return active.map(draft=>{
  const issues=new Set(draft.reviewed?[]:draft.needsReview.filter(key=>!draft.edited?.includes(key)));
  const input={};
  for(const field of INVENTORY_FIELDS){
   try{input[field]=fieldValue(field,draft[field])??'';}
   catch{issues.add(field);}
  }
  input.product||='Unknown';
  const [row]=normalizeRows([input]);
  if(draft.capacityFromSpec&&!draft.edited?.includes('capacity_gb')){
   row.dcsCapacitySource='specification';
   row.evsCapacitySource='specification';
  }
  row.huaweiImportIssues=[...issues];
  row.importSource={sheet:draft.sheet,row:draft.row,cells:draft.cells,headerRow:draft.header?.row,headers:draft.header?.cells};
  return row;
 });
}
