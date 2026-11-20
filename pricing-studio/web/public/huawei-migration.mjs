import {billingOf,calculate,huaweiApprovalKey,pendingResult,priceValidation} from './engine.mjs';
import {awsSourceService,awsUsageSemantics} from './aws-specs.mjs';
import {documentedDcsSpecs} from './huawei-dcs-specs.mjs';

const redisVersions=['4.0','5.0','6.0','7.0'];
const styles={compute:['compute','general'],general:['general','compute'],memory:['memory','general'],burstable:['general','compute']};
const ecsTypes={'General Computing':'general','General Computing-plus':'compute','Memory-optimized':'memory'};
const cssTypes={'General-computing':'general','Computing-plus':'compute','Memory-optimized':'memory'};
const sourced=(value,origin,evidence=null)=>({value,origin,...(evidence?{evidence}:{})});
const readValues=description=>Object.fromEntries(description.split(';').flatMap(field=>{
 const end=field.indexOf(':');
 return end<0?[]:[[field.slice(0,end).trim().toLowerCase(),field.slice(end+1).trim()]];
}));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1e12;
const integer=value=>positive(value)&&Number.isSafeInteger(value);
const isHour=value=>/^(?:hours?|hrs?|hourly)$/i.test(value??'');
const errorCode=(code,metadata={})=>({...metadata,code});

function sourceFields(row,meter){
 const profile=row.awsProfile;
 const specEvidence=profile?.evidence.specification;
 const imported=row.importSource?.fieldSources?.usage;
 const origin=imported?.origin==='confirmed'?'user-confirmed':imported?.origin==='inferred'?'assumption':'excel';
 const values={
  type:sourced(profile?.type??null,profile?'official-aws':'unknown',specEvidence),
  cpu:sourced(profile?.cpu??null,profile?.cpu?'official-aws':'unknown',specEvidence),
  memory:sourced(profile?.memory??null,profile?.memory?'official-aws':'unknown',specEvidence),
  architecture:sourced(profile?.architecture??null,profile?.architecture?'official-aws':'unknown',profile?.evidence.architecture),
  usage:sourced(row.usage,origin,imported),
  usageBasis:sourced(meter?.basis??null,meter?'official-aws':'unknown')
 };
 if(row.awsOS)values.os=sourced(row.awsOS.value,row.awsOS.origin,row.awsOS.url);
 return values;
}

export function awsMigrationKind(row){
 if(!row.awsInventory)return null;
 const kind=awsSourceService(row.product)??row.awsProfile?.kind;
 if(kind==='EC2'&&row.service==='ECS'&&(row.awsProfile||row.awsTypedSource))return kind;
 if(kind==='RDS'&&row.service==='RDS')return kind;
 if(kind==='ElastiCache'&&row.service==='DCS')return kind;
 if(kind==='OpenSearch'&&row.service==='CSS')return kind;
 return null;
}

export function migrationGroup(row){
 const migration=row.huaweiMigration;
 const profile=row.awsProfile;
 if(!migration||!profile||migration.unsupported)return null;
 return JSON.stringify([migration.kind,profile.type,profile.architecture,row.awsOS?.value??null,
  migration.meter?.basis??null,migration.sourceRole??null,migration.sourceCapacity??null,
  migration.source.engine?.value??null,migration.source.version?.value??null,billingOf(row),row.scope,row.period]);
}

function settingsFor(row,defaults,observed={}){
 const overrides=row.huaweiDesign??{};
 return Object.fromEntries(Object.keys({...defaults,...observed,...overrides}).map(key=>{
  const [value,origin]=Object.hasOwn(overrides,key)?[overrides[key],'user-confirmed']:
   Object.hasOwn(observed,key)?[observed[key],'excel']:[defaults[key],'assumption'];
  return [key,sourced(value??null,origin)];
 }));
}
const dataFor=settings=>Object.fromEntries(Object.entries(settings).map(([key,value])=>[key,value.value]));

function candidatePlans(items,catalog,now){
 return items.filter(item=>priceValidation(item,catalog,{now}).valid);
}
const byId=(a,b)=>a.id.localeCompare(b.id);

function powerOptions(plans,profile,classes,category,limit){
 const order=styles[category]??styles.general;
 const options=plans.flatMap(item=>{
  const cpu=item.cpu/profile.cpu,memory=item.memory/profile.memory;
  if(cpu<1||memory<1||cpu>limit||memory>limit||!Number.isFinite(cpu)||!Number.isFinite(memory))return [];
  const type=classes[item.performanceClass??readValues(item.description??'').type];
  if(!order.includes(type))return [];
  return [{item,cpu,memory,category:type,preferred:order.indexOf(type),
   exceedsPreferred:cpu>2||memory>2,distance:cpu+memory-2,
   verifiedPerformance:item.performanceClass?0:1}];
 }).sort((a,b)=>Number(a.exceedsPreferred)-Number(b.exceedsPreferred)||a.preferred-b.preferred||
  a.distance-b.distance||a.verifiedPerformance-b.verifiedPerformance||a.item.rate-b.item.rate||byId(a.item,b.item));
 return options.some(option=>!option.exceedsPreferred)?options.filter(option=>!option.exceedsPreferred):options;
}

function pick(row,options,catalog,now,empty='HW_AWS_NO_PLAN',maximum=3){
 const distinct=new Map();
 for(const option of options){
  const previous=distinct.get(option.item.sku);
  if(!previous||!priceValidation(previous.item,catalog,{now}).valid&&priceValidation(option.item,catalog,{now}).valid)distinct.set(option.item.sku,option);
 }
 const valid=[...distinct.values()].filter(option=>priceValidation(option.item,catalog,{now}).valid);
 const ranked=valid.slice(0,maximum);
 const userId=row.huaweiSelection==='manual'?row.targetId:row.huaweiDesign?.candidateId;
 const selected=userId?valid.find(option=>option.item.id===userId):ranked[0];
 if(selected&&!ranked.includes(selected))ranked.splice(maximum-1,1,selected);
 const choices={ranked,candidates:ranked.map(option=>option.item.sku)};
 if(selected)return {...choices,selected,item:selected.item,code:'HW_MATCHED'};
 if(userId&&valid.length)return errorCode('HW_AWS_SPEC_CONFLICT',choices);
 const stale=options.find(({item})=>(!userId||item.id===userId)&&priceValidation(item,catalog,{now}).code==='PRICE_EXPIRED');
 return errorCode(stale?'PRICE_EXPIRED':options.length?'HW_MATCHED_PRICE':empty,{...choices,item:stale?.item});
}

function powerConditions(selected){
 if(!selected)return [];
 return [...(selected.cpu>1||selected.memory>1?['HW_MIG_UPSIZE']:[]),
  ...(selected.exceedsPreferred?['HW_MIG_MIN_SIZE']:[])];
}

function ecs(row,plans,catalog,now,migration){
 const profile=row.awsProfile,os=row.awsOS?.value;
 if(!profile)return errorCode('HW_AWS_SPEC_UNVERIFIED',{migration});
 if(!os)return errorCode('HW_AWS_OS_REVIEW',{migration});
 if(!profile.architecture)return errorCode('HW_AWS_PROFILE_ARCH',{migration});
 const eligible=plans.filter(item=>item.arch===profile.architecture&&item.os===os&&!item.size);
 const match=pick(row,powerOptions(eligible,profile,ecsTypes,profile.category,2),catalog,now);
 const selected=match.selected;
 return {...match,migration,conditions:selected?[
  ...powerConditions(selected),
  ...(profile.category==='burstable'?['HW_AWS_BURST_REVIEW']:
   profile.category!=='general'||selected.category!=='general'?['HW_AWS_CAPACITY_REVIEW']:[])
 ]:[]};
}

function sourceHourIssue(row,meter){
 return row.scope==='aggregate'&&(!meter||!isHour(row.unit))?'HW_MIG_USAGE_REQUIRED':null;
}

const rdsTopology={ha:'Primary/Standby',single:'Single'};
const engineName=value=>typeof value==='string'?value.replace(/^Microsoft SQL Server$/i,'SQL Server'):null;
export function rdsOffer(item){
 if(item.size||item.resourceType!=='hws.resource.type.rds.vm')return null;
 const fields=readValues(item.description??''),engine=engineName(fields['db engine']);
 if(!['MySQL','PostgreSQL','SQL Server'].includes(engine)||engineName(item.engine)!==engine||
    engine==='MySQL'&&(item.migrationCharge!=='rdsInstance'||item.targetArch!=='x86'))return null;
 const [series,...edition]=(fields['db engine version']??'').split(/\s+/);
 if(!/^\d+(?:\.\d+)*(?:\|\d+(?:\.\d+)*)*$/.test(series))return null;
 return {item,engine,versions:series.split('|').map(version=>[version,...edition].join(' ')),
  topology:fields['db instance type'],storageType:fields['storage type']==='Extreme SSD'?'ESSD':fields['storage type'],
  performanceClass:fields['instance class']==='General-purpose'?'general':'compute'};
}

function rds(row,plans,catalog,now,migration){
 const text=row.specification,profile=row.awsProfile;
 if(/\baurora\b|serverless(?:v?2)?usage|\bacu(?:-hours?)?\b/i.test(text)){
  return errorCode('HW_RDS_SERVERLESS',{migration:{...migration,unsupported:true}});
 }
 if(!profile)return errorCode('HW_AWS_SPEC_UNVERIFIED',{migration});
 const settings=settingsFor(row,{engine:'MySQL',version:'8.0',topology:'ha',storageType:'Cloud SSD',
  storageGiB:null,storageHours:null,storageQuantity:null});
 const config=dataFor(settings);
 const engine=text.match(/\b(MySQL|PostgreSQL|MariaDB|SQL Server|Oracle|Db2)\b/i)?.[1];
 const sourceVersion=text.match(/\b(?:MySQL|PostgreSQL|MariaDB|SQL Server|Oracle|Db2|version)\s+(\d+(?:\.\d+)*)\b/i)?.[1];
 const offers=plans.map(rdsOffer).filter(Boolean),engineVersions={};
 for(const offer of offers){
  if(!Object.values(rdsTopology).includes(offer.topology)||!priceValidation(offer.item,catalog,{now}).valid)continue;
  engineVersions[offer.engine]=[...new Set([...(engineVersions[offer.engine]??[]),...offer.versions])];
 }
 const target={...migration,settings,engineVersions,source:{...migration.source,
  engine:sourced(engine??null,engine?'excel':'unknown'),version:sourced(sourceVersion??null,sourceVersion?'excel':'unknown')}};
 const issue=sourceHourIssue(row,migration.meter);
 if(issue)return errorCode(issue,{migration:target});
 const topology=Object.hasOwn(rdsTopology,config.topology)?rdsTopology[config.topology]:null;
 if(!topology||!['MySQL','PostgreSQL','SQL Server'].includes(config.engine)||!config.version||!['Cloud SSD','ESSD'].includes(config.storageType))
  return errorCode('HW_DB_PARAMETERS',{migration:target});
 const eligible=offers.filter(offer=>offer.engine===config.engine&&offer.versions.includes(config.version)&&
  offer.topology===topology&&offer.storageType===config.storageType)
  .map(({item,performanceClass})=>({...item,performanceClass}));
 const options=powerOptions(eligible,profile,{general:'general',compute:'compute'},'general',4);
 const match=pick(row,options,catalog,now);
 return {...match,migration:target,charge:'rdsInstance',conditions:[
  'HW_MIG_RDS_DESIGN',...powerConditions(match.selected),
  ...(settings.engine.origin==='assumption'&&settings.version.origin==='assumption'&&settings.topology.origin==='assumption'&&
   settings.storageType.origin==='assumption'?['HW_BUDGET_RDS_DEFAULT']:[]),
  ...(engine&&engine.toLowerCase()!==config.engine.toLowerCase()?['HW_BUDGET_RDS_ENGINE_DIFFERENCE']:[]),
  ...(config.engine!=='MySQL'?['HW_BUDGET_RDS_TARGET_ARCH']:
   profile.architecture==='arm'?['HW_MIG_ARM_X86']:!profile.architecture?['HW_MIG_ARCH_UNKNOWN']:[])
 ]};
}

function oneCacheTopology(text){
 if(/\b(?:proxy|shards?|cluster)\b|集群|分片/i.test(text))return 'cluster';
 if(/\b(?:standalone|single node)\b|单机/i.test(text))return 'single';
 if(/\b(?:primary standby|master standby)\b|主备/i.test(text))return 'ha';
 return null;
}
const sourceCapacity=text=>{
 const match=text.match(/(?:usable (?:cache|memory)|maxmemory|可用缓存)\s*[:=：]?\s*(\d+(?:\.\d+)?)\s*Gi?B\b/i);
 return match?Number(match[1]):null;
};

function cacheOptions(config,plans,catalog,now,optionsForSpec){
 return documentedDcsSpecs.flatMap(spec=>{
  if(spec.architecture!=='x86_64'||spec.topology!==config.topology||spec.capacityMiB<config.cacheGiB*1024||
     !spec.versions.includes(config.version)||spec.replicas!==config.replicas||
     config.topology==='cluster'&&spec.shards!==config.shards)return [];
  const pricing=optionsForSpec(spec,plans,catalog,now);
  return pricing?[{...pricing,capacity:spec.capacityMiB/1024}]:[];
 }).sort((a,b)=>a.capacity-b.capacity||a.item.rate-b.item.rate||byId(a.item,b.item));
}

function cache(row,plans,catalog,now,migration,optionsForSpec){
 const text=row.specification,profile=row.awsProfile;
 if(!profile||/\b(?:serverless|tiering|flash|memcached|valkey|redis enterprise)\b/i.test(text)||profile.family.endsWith('gd'))
  return errorCode('HW_MIG_CACHE_SOURCE',{migration:{...migration,unsupported:true}});
 const explicit=sourceCapacity(text);
 const defaultCapacity=profile.cacheBytes?Math.min(profile.cacheBytes/2**30,profile.memory??Infinity)*.75:null;
 const sourceTopology=oneCacheTopology(text);
 const settings=settingsFor(row,{engine:'Redis OSS',version:'6.0',topology:sourceTopology==='cluster'?'cluster':'ha',cacheGiB:defaultCapacity,
  nodeGrouping:'assumed',groupingEvidence:'',sourcePeriodHours:null,targetInstances:null,replicas:null,shards:null},
  explicit?{cacheGiB:explicit}:{});
 const config=dataFor(settings);
 const topology=config.topology;
 const replicas=topology==='ha'?2:topology==='single'?1:config.replicas;
 const target={...migration,settings,sourceRole:sourceTopology,sourceCapacity:explicit,
  source:{...migration.source,usableCache:sourced(explicit,explicit?'excel':'unknown'),
   nodeMemory:sourced(profile.memory,'official-aws',profile.evidence.specification),topology:sourced(sourceTopology,sourceTopology?'excel':'unknown')},
  capacityEvidence:explicit?null:profile.evidence.cacheLimit??null};
 if(config.engine!=='Redis OSS'||!redisVersions.includes(config.version))return errorCode('HW_CACHE_ENGINE',{migration:target});
 if(!positive(config.cacheGiB)||explicit&&config.cacheGiB<explicit)return errorCode('HW_CACHE_CAPACITY',{migration:target});
 if(!['ha','single','cluster'].includes(topology)||sourceTopology==='cluster'&&topology!=='cluster'||
    topology==='cluster'&&(!integer(config.shards)||!integer(replicas)||settings.cacheGiB.origin==='assumption'))
  return errorCode('HW_CACHE_MODE',{migration:target});
 const options=cacheOptions({...config,replicas},plans,catalog,now,optionsForSpec);
 const comparison=topology==='ha'&&sourceTopology!=='cluster'?
  candidatePlans(cacheOptions({...config,topology:'single',replicas:1},plans,catalog,now,optionsForSpec).map(option=>option.item),catalog,now)[0]:null;
 const match=pick(row,options,catalog,now,'HW_DCS_SPEC_PRICE_LINK',comparison?2:3);
 const nodesPerInstance=topology==='cluster'?replicas*config.shards:replicas;
 const knownHours=positive(row.usage)||row.usage===0;
 const countedNodes=row.scope==='aggregate'?1:row.quantity;
 const nodeHours=knownHours&&integer(countedNodes)&&isHour(row.unit)&&
  (row.scope!=='aggregate'||migration.meter?.basis==='cache-node-hours')?row.usage*countedNodes:null;
 const groupingVerified=config.nodeGrouping==='verified'&&typeof config.groupingEvidence==='string'&&config.groupingEvidence.trim().length>=3;
 const meter={sourceNodeHours:nodeHours,sourceAverageNodes:nodeHours!=null&&positive(config.sourcePeriodHours)?nodeHours/config.sourcePeriodHours:null,
  targetInstanceQuantity:config.targetInstances??row.targetQuantity??null,targetInstanceHours:nodeHours==null?null:nodeHours/nodesPerInstance,
  nodesPerInstance,groupingVerified};
 if(groupingVerified&&integer(meter.targetInstanceQuantity)&&positive(config.sourcePeriodHours)&&
    meter.targetInstanceHours>meter.targetInstanceQuantity*config.sourcePeriodHours){
  return errorCode('HW_MIG_CACHE_GROUP_CONFLICT',{migration:{...target,metering:meter,comparison,canApprove:false},
   ranked:match.ranked,candidates:match.candidates});
 }
 return {...match,spec:match.selected?.spec,migration:{...target,metering:meter,comparison,
  canApprove:(billingOf(row)!=='ONDEMAND'||groupingVerified)&&settings.cacheGiB.origin!=='assumption'},
  usageOverride:billingOf(row)==='ONDEMAND'?meter.targetInstanceHours:undefined,charge:'dcsInstance',
  conditions:['HW_MIG_CACHE_DESIGN',...(settings.cacheGiB.origin==='assumption'?['HW_MIG_CACHE_RESERVE']:[]),
   ...(!groupingVerified&&billingOf(row)==='ONDEMAND'?[topology==='ha'?'HW_MIG_CACHE_PAIRING':'HW_BUDGET_CACHE_NODE_METER']:[]),
   ...(profile.architecture==='arm'?['HW_MIG_ARM_X86']:!profile.architecture?['HW_MIG_ARCH_UNKNOWN']:[])]};
}

function css(row,plans,catalog,now,migration){
 const text=row.specification,profile=row.awsProfile;
 if(/ultra[\s-]?warm|\bcold(?:storage| tier| data)?\b|温数据|冷数据/i.test(text))
  return errorCode('HW_CSS_WARM_REVIEW',{migration:{...migration,unsupported:true}});
 const role=/\b(?:dedicated master|master node|coordinating|ingest)\b/i.test(text)?'non-data':
  /\b(?:hot|data node)\b/i.test(text)?'data':null;
 const settings=settingsFor(row,{engine:'OpenSearch',role:'data',version:null,storageType:null,
  storageGiB:null,storageHours:null,storageQuantity:null});
 const config=dataFor(settings),target={...migration,settings,sourceRole:role,
  canApprove:/^\d+\.\d+(?:\.\d+)?$/.test(config.version??'')};
 if(role==='non-data'||config.role!=='data'||config.engine!=='OpenSearch')return errorCode('HW_CSS_ROLE_REVIEW',{migration:target});
 if(!profile?.cpu||!profile.memory||!profile.category||!profile.architecture)return errorCode('HW_CSS_SOURCE_SPEC',{migration:target});
 const issue=sourceHourIssue(row,migration.meter);
 if(issue)return errorCode(issue,{migration:target});
 const eligible=plans.filter(item=>item.migrationCharge==='cssNode'&&item.targetArch==='x86'&&!item.size);
 const match=pick(row,powerOptions(eligible,profile,cssTypes,profile.category,4),catalog,now,'HW_CSS_NO_PLAN');
 return {...match,migration:target,charge:'cssNode',conditions:['HW_MIG_CSS_DESIGN',...powerConditions(match.selected),
  ...(profile.architecture==='arm'?['HW_MIG_ARM_X86']:[])]};
}

export function matchAwsMigration(row,kind,plans,catalog,now,optionsForSpec){
 const meter=awsUsageSemantics(kind,row.specification);
 const migration={kind,meter,source:sourceFields(row,meter)};
 if(kind==='EC2')return ecs(row,plans,catalog,now,migration);
 if(kind==='RDS')return rds(row,plans,catalog,now,migration);
 if(kind==='ElastiCache')return cache(row,plans,catalog,now,migration,optionsForSpec);
 return css(row,plans,catalog,now,migration);
}

export function migrationStoragePlan(row,catalog,config=dataFor(row.huaweiMigration?.settings??{})){
 const charge=row.service==='RDS'?'rdsStorage':'cssStorage';
 const diskType=({'Cloud SSD':'cloudssd',ESSD:'essd'})[config.storageType];
 const sku=row.service==='RDS'&&config.engine==='MySQL'&&diskType&&['ha','single'].includes(config.topology)?
  'rds.mysql.volume.'+diskType+(config.topology==='ha'?'.ha':''):
  row.service==='CSS'?({SSD:'ess.volume.ultrahigh',SAS:'ess.volume.high'})[config.storageType]:null;
 if(!sku)return null;
 const matches=catalog.items.filter(item=>item.migrationCharge===charge&&item.sku===sku&&item.billingMode===billingOf(row));
 return matches.length===1?matches[0]:null;
}

export function migrationRelated(row,result,catalog,options){
 const group=row.huaweiMigration;
 if(!group||group.unsupported||!['RDS','CSS'].includes(row.service))return [];
 const charge=row.service==='RDS'?'rdsStorage':'cssStorage';
 const config=dataFor(group.settings??{});
 const scenarioGiB=options.storageBudget?.[row.service];
 const useScenario=config.storageGiB==null&&positive(scenarioGiB);
 const capacity=config.storageGiB??scenarioGiB;
 if(useScenario&&row.service==='CSS'&&!config.storageType)config.storageType='SSD';
 const price=migrationStoragePlan(row,catalog,config);
 const count=config.storageQuantity??row.targetQuantity??row.quantity;
 const subscription=billingOf(row)!=='ONDEMAND';
 const useComputeHours=useScenario&&!subscription&&config.storageHours==null&&config.storageQuantity==null&&
  result.item?.unit==='hour'&&['Valid','Period','Conditional'].includes(result.status);
 const aggregate=useComputeHours&&row.scope==='aggregate';
 const hours=useComputeHours?result.effectiveUsage:config.storageHours;
 let storage={charge,result:pendingResult('','HW_MIG_STORAGE_INPUT')};
 if(positive(capacity)&&(aggregate||integer(count))&&(subscription||positive(hours)||useComputeHours&&hours===0)){
  if(!price)storage={charge,result:pendingResult('','HW_MIG_STORAGE_PRICE')};
  else{
   const part={...row,huaweiCharge:charge,targetId:price.id,capacity,
    scope:aggregate?'aggregate':'resource',quantity:aggregate?null:count,targetQuantity:aggregate?null:count,
    usage:subscription?null:capacity*hours,
    unit:'GB-hour',unitExplicit:true,huaweiMeterUsage:undefined,huaweiProductMatch:null,awsMatchIssue:null};
   if(useScenario){
    part.huaweiConditions=[...(row.huaweiConditions??[]),'HW_BUDGET_STORAGE_ASSUMPTION'];
    part.huaweiConditionKey='HW_BUDGET_STORAGE_ASSUMPTION';
    part.huaweiConditionApproval=null;
   }else if(['Valid','Period'].includes(result.status))part.huaweiConditionApproval=huaweiApprovalKey(part,price,options);
   storage={charge,row:part,result:calculate(part,catalog,options)};
  }
 }
 return row.service==='RDS'?[storage,{charge:'rdsBackup',result:pendingResult('','HW_MIG_BACKUP_INPUT')}]:[storage];
}
