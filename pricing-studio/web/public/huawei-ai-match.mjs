import {REGION,billingOf,calculate,priceValidation} from './engine.mjs';
import {awsMigrationKind,matchAwsMigration,rdsOffer} from './huawei-migration.mjs';
import {awsUsageSemantics,lookupAwsSpec} from './aws-specs.mjs';
import {documentedDcsSpecs} from './huawei-dcs-specs.mjs';

export const AI_BATCH_SIZE=4;
export const AI_CANDIDATE_LIMIT=12;
const sourceServices={ECS:'EC2',RDS:'RDS',DCS:'ElastiCache',CSS:'OpenSearch'};
const dimensions=item=>item.cpu>0&&item.memory>0;
const hourUnit=unit=>/^(?:hours?|hrs?|hourly|instance-hrs)$/i.test(unit??'');
const blockedReasons=new Set(['HW_IMPORT_REVIEW','HW_TARGET_REGION','HW_AWS_SPEC_CONFLICT','HW_CACHE_MODE',
 'HW_MIG_CACHE_SOURCE','HW_MIG_CACHE_GROUP_CONFLICT','HW_CACHE_ENGINE','HW_CSS_ROLE_REVIEW','MAPPING_REVIEW']);
const missingMeters=['target-instance-hours','cold-data-capacity','cold-storage-meter','source-specification','target-quantity','usage'];
const operatingSystems=['Linux','Windows'];
const defaultOs='Linux';
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const idPattern=/^[A-Za-z0-9_.:-]{1,100}$/;
const safeNote=value=>typeof value==='string'&&value.trim().length>0&&value.length<=320&&
 !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)&&
 !/(?:[$€£¥￥]|\b(?:USD|EUR|CNY)\b)\s*\d|\d\s*(?:USD|EUR|CNY|dollars?|元)\b|\b(?:free of charge|at no cost)\b/i.test(value);

function cacheSpec(item){
 return documentedDcsSpecs.find(spec=>spec.specCode===item.sku&&spec.resourceType===item.resourceType&&
  spec.topology==='ha'&&spec.replicas===2&&spec.architecture==='x86_64'&&spec.versions.includes('6.0')&&
  (!spec.usageFactor||spec.usageFactor===item.usageFactor));
}
function mysqlHa(item){
 const offer=rdsOffer(item);
 return offer?.engine==='MySQL'&&offer.versions.includes('8.0')&&offer.topology==='Primary/Standby'&&
  ['Cloud SSD','ESSD'].includes(offer.storageType)?offer:null;
}

function candidateDetails(item,service){
 if(service==='ECS'&&!item.size&&item.resourceType==='hws.resource.type.vm'&&dimensions(item)&&
    operatingSystems.includes(item.os)&&item.image===item.os&&['x86','arm'].includes(item.arch)){
  return {os:item.os,architecture:item.arch,series:item.description?.match(/(?:^|;)\s*Series:\s*([^;]+)/i)?.[1]??null,
   performance:item.performanceClass??null};
 }
 if(service==='RDS'&&dimensions(item)){
  const offer=mysqlHa(item);
  if(offer)return {architecture:'x86',engine:'MySQL',version:'8.0',topology:offer.topology,
   storageType:offer.storageType,performance:offer.performanceClass};
 }
 if(service==='DCS'){
  const spec=cacheSpec(item);
  if(spec&&!item.size)return {capacityGiB:spec.capacityMiB/1024,architecture:'x86',engine:'Redis OSS',
   version:'6.0',topology:'Primary/Standby',replicas:2,specificationSource:spec.evidence.url};
 }
 if(service==='CSS'&&item.migrationCharge==='cssNode'&&!item.size&&item.targetArch==='x86'&&dimensions(item)){
  return {architecture:'x86',engine:'OpenSearch',performance:item.performanceClass};
 }
 if(service==='CSS'&&item.migrationCharge==='cssStorage'&&item.size){
  return {storageType:item.storageType,topology:'Managed CSS node volume (reference only)'};
 }
 return null;
}

function eligibleCandidate(item,source,catalog,mode,now){
 if(item.service!==source.service||item.billingMode!==mode||!priceValidation(item,catalog,{now}).valid)return null;
 const details=candidateDetails(item,source.service);
 if(!details)return null;
 if(source.service==='ECS'&&(item.os!==(source.os??defaultOs)||
    item.cpu<(source.cpu??Infinity)||item.memory<(source.memoryGiB??Infinity)))return null;
 if(source.service==='CSS'){
  if(source.reason==='HW_CSS_WARM_REVIEW'?item.migrationCharge!=='cssStorage':
     item.migrationCharge!=='cssNode'||item.cpu<(source.cpu??Infinity)||item.memory<(source.memoryGiB??Infinity))return null;
 }
 if(source.service==='DCS'&&details.capacityGiB<(source.memoryGiB??Infinity))return null;
 return {id:item.id,sku:item.sku,service:item.service,cpu:item.cpu,memoryGiB:item.memory,
  ...details,unit:item.unit,officialPriceValid:true,verifiedAt:item.verifiedAt,
  specificationSource:details.specificationSource??item.specificationSource??item.catalogUrl,priceSource:item.sourceUrl};
}

function sourceFor(row,reason,{codexQuotation=false}={}){
 const kind=awsMigrationKind(row);
 if(!kind||row.huaweiCapacityConflict||row.huaweiImportIssues?.length||
    row.huaweiTargetRegion&&row.huaweiTargetRegion!==REGION||blockedReasons.has(reason))return null;
 const profile=row.awsProfile;
 const spec=row.specification;
 if(kind==='EC2'&&(!dimensions(profile??{})||!row.awsOS&&/\b(?:windows|linux|runinstances\b|rhel|suse|sql server|license|byol|dedicated)\b/i.test(spec)))return null;
 if(kind==='ElastiCache'&&(!profile?.memory||row.capacity!=null||
    /\b(?:cluster|shards?|proxy|standalone|single node|serverless|tiering|flash|memcached|valkey|redis enterprise)\b/i.test(spec)))return null;
 if(kind==='OpenSearch'&&reason!=='HW_CSS_WARM_REVIEW'&&
    !(codexQuotation&&reason==='HW_CSS_NO_PLAN'&&dimensions(profile??{})&&profile.architecture))return null;
 return {service:row.service,type:profile?.type??null,cpu:profile?.cpu??null,memoryGiB:profile?.memory??null,
  architecture:profile?.architecture??null,performance:profile?.category??null,os:row.awsOS?.value??null,
  reason,meter:awsUsageSemantics(kind,spec)?.basis??null};
}

function rankCandidates(candidates,source,codexQuotation){
 const distance=item=>source.service==='DCS'?item.capacityGiB:
  Math.abs(Math.log2((item.cpu??1)/(source.cpu??4)))+Math.abs(Math.log2((item.memoryGiB??1)/(source.memoryGiB??16)));
 const storagePreference=item=>Number(codexQuotation&&source.service==='RDS'&&item.storageType!=='Cloud SSD');
 const ordered=candidates.sort((a,b)=>storagePreference(a)-storagePreference(b)||distance(a)-distance(b)||a.id.localeCompare(b.id));
 const groups=new Map();
 for(const item of ordered){
  const key=source.service==='RDS'&&!source.cpu?item.cpu:[item.architecture,item.series,item.performance].join('/');
  if(!groups.has(key))groups.set(key,item);
 }
 return [...new Set([...groups.values(),...ordered])].slice(0,AI_CANDIDATE_LIMIT);
}

export function huaweiAiRequest(row,catalog,ruleResult,{now=Date.now(),codexQuotation=false}={}){
 if(ruleResult.status!=='Pending'||row.huaweiSelection==='manual'||Object.keys(row.huaweiDesign??{}).length)return null;
 const source=sourceFor(row,ruleResult.reasonCode,{codexQuotation});
 if(!source)return null;
 const mode=billingOf(row);
 const candidates=rankCandidates(catalog.items.map(item=>eligibleCandidate(item,source,catalog,mode,now)).filter(Boolean),source,codexQuotation);
 if(!candidates.length)return null;
 return {source,region:REGION,billingMode:mode,candidateIds:candidates.map(item=>item.id)};
}

// Resolve model-facing catalog fields on the server. Only compact normalized fields cross this boundary.
export function resolveAiInput(input,catalog,now=Date.now()){
 if(!exactKeys(input,['id','source','region','billingMode','candidateIds'])||!/^r\d{1,4}$/.test(input.id)||
    input.region!==REGION||!['ONDEMAND','MONTHLY','YEARLY'].includes(input.billingMode)||
    !Array.isArray(input.candidateIds)||!input.candidateIds.length||input.candidateIds.length>AI_CANDIDATE_LIMIT||
    new Set(input.candidateIds).size!==input.candidateIds.length||!input.candidateIds.every(id=>typeof id==='string'&&idPattern.test(id)))return null;
 const {source}=input;
 if(!exactKeys(source,['service','type','cpu','memoryGiB','architecture','performance','os','reason','meter'])||
    !Object.hasOwn(sourceServices,source.service)||
    typeof source.reason!=='string'||!/^HW_[A-Z_]{1,55}$|^PRICE_[A-Z_]{1,55}$|^(USAGE|QUANTITY)_(REQUIRED|UNIT|INVALID)$|^INPUT_(PERIOD|INVALID)$/.test(source.reason)||
    ![null,...operatingSystems].includes(source.os)||
    ![null,'instance-hours','database-multi-az-hours','cache-node-hours','search-node-hours'].includes(source.meter))return null;
 const profile=typeof source.type==='string'&&source.type.length<=40?
  lookupAwsSpec(sourceServices[source.service],source.type):null;
 if((profile?.type??null)!==source.type||source.cpu!==(profile?.cpu??null)||source.memoryGiB!==(profile?.memory??null)||
    source.architecture!==(profile?.architecture??null)||source.performance!==(profile?.category??null))return null;
 const candidates=input.candidateIds.map(id=>eligibleCandidate(catalog.items.find(item=>item.id===id)??{},source,catalog,input.billingMode,now));
 if(candidates.some(item=>!item))return null;
 return {id:input.id,source,region:input.region,billingMode:input.billingMode,candidates};
}

const stringList=(items,maxItems)=>({type:'array',items,maxItems});
const textSchema={type:'string',maxLength:320};
const choiceSchema={type:'string',maxLength:100};
const outputFields=['id','service','selection','alternatives','reason','differences','assumptions','missing'];
export function huaweiAiSchema(count){
 return {type:'object',additionalProperties:false,required:['recommendations'],properties:{recommendations:{
  type:'array',minItems:count,maxItems:count,items:{type:'object',additionalProperties:false,required:outputFields,properties:{
   id:{type:'string'},service:{type:'string',enum:Object.keys(sourceServices)},selection:{anyOf:[choiceSchema,{type:'null'}]},
   alternatives:stringList(choiceSchema,3),reason:textSchema,differences:stringList(textSchema,4),
   assumptions:stringList(textSchema,4),missing:stringList({type:'string',enum:missingMeters},6)
  }}
 }}};
}
export function validateAiRecommendation(value,request){
 if(!exactKeys(value,outputFields)||value.id!==request.id||value.service!==request.source.service||!safeNote(value.reason)||
    !['differences','assumptions'].every(key=>Array.isArray(value[key])&&value[key].length<=4&&value[key].every(safeNote))||
    !Array.isArray(value.missing)||value.missing.length>6||!value.missing.every(meter=>missingMeters.includes(meter))||
    !Array.isArray(value.alternatives)||value.alternatives.length>3||value.selection===null&&value.alternatives.length)return null;
 const resolve=key=>{
  if(typeof key!=='string'||!idPattern.test(key))return null;
  if(request.candidateIds.includes(key))return key;
  const matches=request.candidates.filter(candidate=>candidate.sku===key);
  return matches.length===1?matches[0].id:null;
 };
 const selection=value.selection===null?null:resolve(value.selection);
 const alternatives=value.alternatives.map(resolve);
 if(value.selection!==null&&!selection||alternatives.some(id=>!id)||new Set([selection,...alternatives]).size!==alternatives.length+1)return null;
 return {...value,selection,alternatives};
}

export function aiPlanSignature(row){
 return JSON.stringify([row.product,row.specification,row.service,row.huaweiTargetRegion,billingOf(row),row.scope,row.period,
  row.capacity,row.huaweiImportIssues,row.huaweiDesign]);
}

export function aiSourceSignature(row){
 return JSON.stringify([aiPlanSignature(row),row.usage,row.unit,row.unitExplicit,row.quantity,row.targetQuantity]);
}

function cacheMatch(row,item,plans,catalog,now){
 // Use AWS official physical node memory as a conservative sizing assumption, not usable-memory evidence.
 const draft={...row,huaweiSelection:null,huaweiDesign:{cacheGiB:row.awsProfile.memory,candidateId:item.id}};
 const match=matchAwsMigration(draft,'ElastiCache',plans,catalog,now,(spec,items)=>{
  const matched=items.filter(plan=>plan.sku===spec.specCode&&plan.resourceType===spec.resourceType&&
   plan.size===false&&(!spec.usageFactor||plan.usageFactor===spec.usageFactor));
  return matched.length===1?{item:matched[0],spec}:null;
 });
 if(match.item?.id!==item.id||!match.spec)return null;
 match.migration.settings.cacheGiB={value:row.awsProfile.memory,origin:'assumption'};
 match.migration.canApprove=false;
 return match;
}

function budgetRules(row,item,rule){
 const conditions=['HW_AI_ESTIMATE'];
 const kind=awsMigrationKind(row);
 const extra={};
 if(kind==='EC2'){
  if(!row.awsOS)conditions.push('HW_AI_LINUX');
  if(row.awsProfile.architecture!==item.arch)conditions.push('HW_AI_ARCH');
  if(item.cpu>row.awsProfile.cpu||item.memory>row.awsProfile.memory)conditions.push('HW_MIG_UPSIZE');
  if(item.cpu>2*row.awsProfile.cpu||item.memory>2*row.awsProfile.memory)conditions.push('HW_MIG_MIN_SIZE');
  if(row.awsProfile.category==='burstable')conditions.push('HW_AWS_BURST_REVIEW');
  if(row.scope==='aggregate'&&(!hourUnit(row.unit)||!rule.migration?.meter))return null;
 }
 if(kind==='OpenSearch'){
  if(row.scope==='aggregate'&&(!hourUnit(row.unit)||rule.migration?.meter?.basis!=='search-node-hours'))return null;
  extra.charge='cssNode';
  extra.migration={...rule.migration,canApprove:false};
  conditions.push('HW_MIG_CSS_DESIGN');
  if(row.awsProfile.architecture!==item.targetArch)conditions.push('HW_AI_ARCH');
  if(item.cpu>row.awsProfile.cpu||item.memory>row.awsProfile.memory)conditions.push('HW_MIG_UPSIZE');
 }
 if(kind==='RDS'){
  if(/\b(?:acu(?:-hours?)?|serverless(?:v?2)?usage)\b/i.test(row.specification)||
     row.scope==='aggregate'&&(!hourUnit(row.unit)||!rule.migration?.meter)||
     row.scope==='resource'&&billingOf(row)==='ONDEMAND'&&(!row.unitExplicit||!hourUnit(row.unit)||row.usage==null))return null;
  const offer=mysqlHa(item);
  extra.charge='rdsInstance';
  extra.migration={...rule.migration,unsupported:false,canApprove:false,settings:Object.fromEntries(
   Object.entries({engine:'MySQL',version:'8.0',topology:'ha',storageType:offer.storageType}).map(([key,value])=>[key,{value,origin:'assumption'}]))};
  conditions.push('HW_AI_RDS_REFERENCE');
 }
 return {conditions,...extra};
}

export function applyAiOverlay(row,rule,catalog,options={}){
 const saved=row.huaweiAi;
 if(!saved||saved.signature!==aiPlanSignature(row)||row.huaweiImportIssues?.length||
    row.huaweiSelection==='manual'&&!saved.manualId||Object.keys(row.huaweiDesign??{}).length){
  delete row.huaweiAi;
  return rule;
 }
 const now=options.now??Date.now();
 const source=sourceFor(row,saved.request.source.reason,options);
 if(!source){delete row.huaweiAi;return rule;}
 const catalogById=new Map(catalog.items.map(item=>[item.id,item]));
 const ids=[saved.manualId??saved.recommendation.selection,...saved.recommendation.alternatives,saved.recommendation.selection];
 const items=[...new Set(ids)].flatMap(id=>{
  const item=catalogById.get(id);
  return item&&eligibleCandidate(item,source,catalog,billingOf(row),now)?[item]:[];
 });
 const item=items.find(plan=>plan.id===(saved.manualId??saved.recommendation.selection)&&saved.request.candidateIds.includes(plan.id));
 if(!item){delete row.huaweiAi;return rule;}
 const ranked=items.map(item=>({item}));
 saved.display={id:item.id,sku:item.sku,description:item.description,
  missing:source.reason==='HW_CSS_WARM_REVIEW'?[...new Set([...saved.recommendation.missing,'cold-data-capacity','cold-storage-meter'])]:saved.recommendation.missing};
 const pending={...rule,item:undefined,code:'HW_AI_METER_REQUIRED',ranked,candidates:items.map(plan=>plan.sku)};
 if(source.reason==='HW_CSS_WARM_REVIEW'||saved.recommendation.missing.length)return pending;
 if(source.service==='DCS'){
  const match=cacheMatch(row,item,items,catalog,now);
  if(!match||match.usageOverride===null){
   saved.display.missing=[...new Set([...saved.display.missing,'usage'])];
   return pending;
  }
  return {...match,ranked,conditions:[...match.conditions,'HW_AI_ESTIMATE','HW_AI_CACHE_PHYSICAL']};
 }
 const rules=budgetRules(row,item,rule);
 if(!rules){
  saved.display.missing=[...new Set([...saved.display.missing,'target-instance-hours'])];
  return pending;
 }
 return {...rule,...rules,item,ranked,candidates:items.map(plan=>plan.sku),code:'HW_MATCHED'};
}

export async function runHuaweiAi(jobs,{send,cache=new Map(),signal,retry=false,commit}={}){
 const counts={candidates:0,rejected:0,failed:0};
 const groups=new Map();
 for(const job of jobs){
  const key=JSON.stringify(job.request);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(job);
 }
 const pending=[...groups];
 const apply=(group,value)=>{
  for(const job of group){
   if(value.selection&&commit(job,value)!==false)counts.candidates++;
  }
 };
 for(let start=0;start<pending.length&&!signal?.aborted;start+=AI_BATCH_SIZE){
  const batch=pending.slice(start,start+AI_BATCH_SIZE);
  const inputs=[];
  for(const [key,group] of batch){
   if(!retry&&cache.has(key)){apply(group,cache.get(key));continue;}
   inputs.push({key,group,input:{id:'r'+(start+inputs.length),...group[0].request}});
  }
  if(!inputs.length)continue;
  try{
   const result=await send(inputs.map(entry=>entry.input),signal);
   if(signal?.aborted)break;
   for(const {key,group,input} of inputs){
    const candidates=input.candidateIds.map(id=>group[0].catalog.items.find(item=>item.id===id)).filter(Boolean);
    const matches=result.recommendations?.filter(value=>value?.id===input.id);
    const valid=matches?.length===1?validateAiRecommendation(matches[0],{...input,candidates}):null;
    if(!valid){counts.rejected+=group.length;continue;}
    if(cache.size>=500&&!cache.has(key))cache.delete(cache.keys().next().value);
    cache.set(key,valid);
    apply(group,valid);
   }
  }catch{
   if(!signal?.aborted)counts.failed+=inputs.reduce((sum,{group})=>sum+group.length,0);
  }
 }
 return counts;
}

export function selectAiAlternative(row,id){
 if(!row.huaweiAi||!row.huaweiRanked?.some(({item})=>item.id===id))return false;
 row.huaweiAi.manualId=id;
 row.huaweiSelection='manual';
 row.targetId=id;
 return true;
}

export function aiCoverage(rows,output){
 const counts={rule:0,ai:0,manual:0,pending:0};
 for(const [index,result] of output.entries()){
  const row=rows[index];
  if(result.status==='Pending')counts.pending++;
  else if(row.huaweiSelection==='manual'||row.huaweiDesign?.candidateId)counts.manual++;
  else if(row.huaweiAi?.display)counts.ai++;
  else counts.rule++;
 }
 return counts;
}
