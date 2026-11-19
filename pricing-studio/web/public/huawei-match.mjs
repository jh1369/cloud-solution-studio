import {REGION,awsShape,billingOf,family,priceValidation,productSpecAvailability} from './engine.mjs';
import {dcsRequirements,dcsSpecSnapshot,matchesDcsSpec} from './huawei-dcs-specs.mjs';

function attributes(item){
 if(typeof item.description!=='string')return {};
 return Object.fromEntries(item.description.split(';').flatMap(part=>{
  const split=part.indexOf(':');
  return split<0?[]:[[part.slice(0,split).trim().toLowerCase(),part.slice(split+1).trim()]];
 }));
}

const amountPattern='[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const capacityUnits='\\s*(?:GiB|GB|G)(?![a-z])';
const capacityToken=new RegExp('(?<![\\w.])(?<!\\d,)('+amountPattern+')'+capacityUnits,'gi');
const capacityRange=new RegExp(amountPattern+'\\s*[-–~至/]\\s*'+amountPattern+capacityUnits,'gi');
const meterSuffix=/^\s*(?:[-/·]\s*)?(?:(months?\b|mo\b|月)|hours?\b|h\b|小时)/i;
function storageDimensions(text){
 const sizes=new Set(),metered=new Map();
 for(const match of text.matchAll(capacityToken)){
  const amount=Number(match[1].replaceAll(',',''));
  const suffix=text.slice(match.index+match[0].length).match(meterSuffix);
  if(!suffix){sizes.add(amount);continue;}
  const unit=(/GiB$/i.test(match[0])?'GiB':'GB')+(suffix[1]?'-month':'-hour');
  metered.set(unit+':'+amount,{amount,unit});
 }
 let sizeRange=false,meteredRange=false;
 for(const match of text.matchAll(capacityRange)){
  if(meterSuffix.test(text.slice(match.index+match[0].length)))meteredRange=true;
  else sizeRange=true;
 }
 const size=sizes.values().next().value;
 const conflict=sizes.size>1||sizeRange||size<=0;
 const usageConflict=metered.size>1||meteredRange;
 return {size:conflict?null:size??null,conflict,metered:usageConflict?null:metered.values().next().value,usageConflict};
}

const policy=(test,assumptions=[])=>({test,assumptions});
const missing=code=>({code});
function observedIntegers(text,pattern){
 return new Set(Array.from(text.matchAll(pattern),match=>Number(match[1])));
}
function computeShape(text){
 const cpus=observedIntegers(text,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:vCPUs?\b|核)/gi);
 const awsTypes=new Set(Array.from(text.matchAll(/\b(?:db\.)?(?:m5|m6i)\.(?:large|xlarge|2xlarge)\b/gi),match=>match[0].toLowerCase()));
 const {size:memory,conflict}=storageDimensions(text);
 const cpu=cpus.values().next().value;
 if(cpus.size>1||awsTypes.size>1||conflict||cpu!==undefined&&(!Number.isInteger(cpu)||cpu<=0))return null;
 const known=awsTypes.size===1?awsShape(awsTypes.values().next().value):null;
 if(known&&(cpu&&cpu!==known.cpu||memory&&memory!==known.memory))return null;
 return cpu&&memory?{cpu,memory}:known;
}
const sameShape=(item,shape)=>item.cpu===shape.cpu&&item.memory===shape.memory;
const topologyOptions=[
 [/\bsingle(?:[- ]az|[- ]node)?\b|\bstandalone\b|单机|单实例/i,'single_node'],
 [/\b(?:master|primary)[ /_-]*standby\b|\bmulti[- ]az\b|主\s*备/i,'master_standby'],
 [/\bcluster\b|集群/i,'cluster'],
 [/\bread replica\b|只读副本/i,'read_replica']
];
const topologies=text=>topologyOptions.filter(([pattern])=>pattern.test(text)).map(([,value])=>value);

const rules={
 ECS(row,spec){
  const shape=computeShape(spec);
  if(!shape)return missing('HW_SHAPE_REQUIRED');
  const linux=/\b(?:linux|ubuntu|debian|centos|openeuler)\b/i.test(spec),windows=/\bwindows\b/i.test(spec);
  const architectures=[/\b(?:arm64|aarch64|arm)\b|鲲鹏|\b(?:m|c|r)\d+g\./i,/\b(?:x86(?:_64)?|amd64)\b|\b(?:m5|m6i)\./i].map(test=>test.test(spec));
  const [arm,x86]=architectures;
  const classes=[
   [/general[- ]computing[- ]plus|通用计算增强/i,'General Computing-plus'],
   [/memory[- ]optimized|内存优化/i,'Memory-optimized'],
   [/general[- ]computing(?![- ]plus)|通用计算(?!增强)/i,'General Computing']
  ].filter(([pattern])=>pattern.test(spec)).map(([,value])=>value);
  const series=new Set(Array.from(spec.matchAll(/(?:\bseries\s*[:=]?\s*|系列\s*[:=：]?\s*)([a-z]\d+[a-z]*)\b/gi),match=>match[1].toLowerCase()));
  if(linux&&windows||arm&&x86||classes.length>1||series.size>1||
     /rhel|red hat|suse|byol|licen[cs]e|macos|freebsd|\baix\b|gpu|accelerator|dedicated|burst|risc-v|compute[- ]optimized|本地盘/i.test(spec))return missing('HW_ECS_CONFLICT');
  const type=classes[0]??(series.size?null:'General Computing');
  const assumptions=[];
  if(!linux&&!windows)assumptions.push('HW_DEFAULT_LINUX');
  if(!arm&&!x86)assumptions.push('HW_DEFAULT_X86');
  if(!classes.length&&!series.size)assumptions.push('HW_DEFAULT_GENERAL');
  return policy((item,fields)=>sameShape(item,shape)&&item.os===(windows?'Windows':'Linux')&&
   String(item.arch??'').toLowerCase()===(arm?'arm':'x86')&&(!type||fields.type===type)&&
   (!series.size||series.has(fields.series?.toLowerCase())),assumptions);
 },
 EVS(row,spec){
  if(row.huaweiCapacityConflict)return missing('HW_DISK_CAPACITY_CONFLICT');
  if(/snapshot|快照|iops|throughput|吞吐|mbps|premium|\b(?:io[12]|gp4)\b/i.test(spec))return missing('HW_DISK_PERFORMANCE');
  const types=[
   [/\bESSD\b|Extreme SSD|极速型/i,'ESSD'],
   [/\bSAS\b|(?<!ultra[- ])\bhigh i\/o\b|高IO型/i,'SAS'],
   [/\b(?:GPSSD|gp[23])\b|General Purpose SSD|通用型SSD/i,'GPSSD'],
   [/Ultra[- ]high I\/O|超高IO/i,'SSD']
  ];
  const explicit=types.filter(([pattern])=>pattern.test(spec));
  if(explicit.length>1)return missing('HW_DISK_TYPE');
  const generic=!explicit.length&&/\bSSD\b/i.test(spec),sku=explicit[0]?.[1]??(generic?'GPSSD':null);
  if(!sku)return missing('HW_DISK_TYPE');
  if(!(row.capacity>0)&&(billingOf(row)!=='ONDEMAND'||row.usage==null))return missing('HW_DISK_CAPACITY');
  return policy(item=>item.sku===sku,generic?['HW_DEFAULT_SSD']:[]);
 },
 RDS(row,spec){
  const shape=computeShape(spec),modes=topologies(spec);
  const engines=new Set(Array.from(spec.matchAll(/\b(MySQL|PostgreSQL|MariaDB|SQL Server)\b/gi),match=>match[1].toLowerCase()));
  const versions=new Set(Array.from(spec.matchAll(/(?:mysql|postgresql|mariadb|sql server|版本|version)\s*(\d+(?:\.\d+)?)(?![\d.])/gi),match=>match[1]));
  if(!shape||engines.size!==1||versions.size!==1||modes.length!==1||modes[0]==='cluster')return missing('HW_DB_PARAMETERS');
  if(engines.has('sql server')||/byol|licen[cs]e|许可/i.test(spec))return missing('HW_DB_LICENSE');
  if(!/instance only|compute only|仅实例|仅计算/i.test(spec)||!/cloud ssd|云ssd/i.test(spec))return missing('HW_DB_STORAGE_SCOPE');
  const type={single_node:'Single',master_standby:'Primary/Standby',read_replica:'Read replica'}[modes[0]];
  const version=versions.values().next().value;
  return policy((item,fields)=>sameShape(item,shape)&&engines.has(String(item.engine??'').toLowerCase())&&
   fields['db engine version']?.split('|').includes(version)&&fields['db instance type']===type&&fields['storage type']==='Cloud SSD',
   ['HW_DB_INSTANCE_ONLY']);
 },
 'NAT Gateway'(row,spec){
  const sizes=new Set(Array.from(spec.matchAll(/\b(small|medium|large|xlarge)\b/gi),match=>match[1].toLowerCase()));
  if(!/\bprivate\s+nat\b|私网\s*NAT/i.test(spec)||!/\binstance only\b|仅实例/i.test(spec)||
     /\b(?:public|aws|azure)\b|公网|流量|traffic|bandwidth/i.test(spec)||sizes.size!==1)return missing('HW_NAT_PARAMETERS');
  return policy((item,fields)=>item.resourceType==='hws.resource.type.privatenat'&&sizes.has(fields.specification),['HW_NAT_INSTANCE_ONLY']);
 }
};

const servicePatterns=[
 ['ECS',/云主机|云服务器|虚拟机|\b(?:VMs?|virtual machines?|virtual server|EC2|ECS)\b/i],
 ['EVS',/云盘|云硬盘|硬盘|磁盘|\d\s*块\s*盘|\b(?:EBS|EVS|managed disks?|block storage)\b/i],
 ['DCS',/redis|缓存|\b(?:ElastiCache|DCS|memcached|valkey)\b/i],
 ['RDS',/数据库|\b(?:RDS|MySQL|PostgreSQL|MariaDB|SQL Server)\b/i],
 ['ELB',/负载均衡|\b(?:ELB|load balancers?|load balancing)\b/i],
 ['OBS',/对象存储|\b(?:OBS|S3|object storage)\b/i],
 ['NAT Gateway',/\b(?:private\s+nat|nat gateway)\b|私网\s*NAT/i]
];

export function identifyHuaweiService(product,specification=''){
 const known=family(product);
 if(known!=='Unmapped')return known;
 for(const text of [product,specification]){
  const candidates=servicePatterns.filter(([,pattern])=>pattern.test(text));
  if(candidates.length===1)return candidates[0][0];
  if(candidates.length>1)break;
 }
 return 'Unmapped';
}

const targetRegion=/(?:华为云区域|华为云目标区域|目标区域|(?:huawei\s+)?target\s+region)\s*[:=：]\s*([a-z]{2}(?:-[a-z]+)+-\d+)\b/i;
export function identifyHuaweiRow(row){
 const text=(row.product+' '+row.specification).normalize('NFKC');
 if(row.service==='Unmapped')row.service=identifyHuaweiService(row.product,row.specification);
 if(!row.huaweiTargetRegion||row.huaweiRegionFromSpec){
  row.huaweiTargetRegion=text.match(targetRegion)?.[1].toLowerCase()??'';
  row.huaweiRegionFromSpec=!!row.huaweiTargetRegion;
 }
 row.huaweiTargetRegion=row.huaweiTargetRegion.toLowerCase();
 if(row.service==='DCS'||row.service==='EVS'){
  const {size,conflict,metered,usageConflict}=storageDimensions(text);
  row.huaweiCapacityConflict=conflict||!!(row.huaweiCapacityExplicit&&size!==null&&size!==row.capacity);
  if(!row.huaweiCapacityExplicit)row.capacity=size;
  if(row.service==='DCS'&&!row.unit)row.unit='hour';
  if(row.service==='EVS'&&row.huaweiUsageFromSpec){
   row.evsUsageConflict=usageConflict;
   row.usage=metered?.amount??null;
   row.unit=metered?.unit??'';
  }
 }
 if(row.scope==='resource'&&row.quantity==null&&!row.importSource){
  const quantities=observedIntegers(text,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:套|台|块|instances?\b)/gi);
  const quantity=quantities.values().next().value;
  row.huaweiQuantity=quantities.size===1&&Number.isInteger(quantity)&&quantity>0?quantity:null;
 }
 return row;
}

function matchDcs(row,catalog,plans,source,dcsSpecs,now){
 const manual=row.huaweiSelection==='manual';
 const chosen=manual?plans.find(plan=>plan.id===row.targetId):null;
 if(manual&&!chosen)return missing('HW_MANUAL_PLAN');
 const requirements=dcsRequirements(row,source,manual);
 if(requirements.code)return requirements;
 const status=dcsSpecs?.status;
 const regional=status==='official'&&dcsSpecs.schemaVersion===1&&dcsSpecs.service==='DCS'&&dcsSpecs.region===REGION&&Array.isArray(dcsSpecs.records);
 const records=regional?dcsSpecs.records:dcsSpecSnapshot('unavailable').records;
 const scope=records.filter(spec=>spec.service==='DCS'&&(!chosen||spec.specCode===chosen.sku));
 const matches=scope.filter(spec=>matchesDcsSpec(spec,requirements));
 const pending=(code,specs=matches)=>({code,specs,candidates:[...new Set(specs.map(spec=>spec.specCode))],assumptions:requirements.assumptions});
 if(!regional){
  const code={loading:'HW_DCS_SPEC_LOADING',authentication_required:'HW_DCS_SPEC_AUTH'}[status??'authentication_required'];
  return pending(code??'HW_DCS_SPEC_UNAVAILABLE');
 }
 if(!matches.length){
  const wrongCapacity=chosen&&requirements.capacityMiB&&scope.length&&scope.every(spec=>spec.capacityMiB!==requirements.capacityMiB);
  return pending(wrongCapacity?'HW_CACHE_SKU_CAPACITY':'HW_DCS_SPEC_NO_MATCH',scope.filter(spec=>chosen&&wrongCapacity));
 }
 const eligible=matches.filter(spec=>!productSpecAvailability(spec,REGION,now)&&(!requirements.zone||spec.availableZones.includes(requirements.zone)));
 if(!eligible.length)return pending(matches.some(spec=>productSpecAvailability(spec,REGION,now)==='HW_DCS_SPEC_EXPIRED')?'HW_DCS_SPEC_EXPIRED':'HW_DCS_SPEC_AZ_REQUIRED');
 if(eligible.length!==1)return pending('HW_MULTIPLE',eligible);
 const [spec]=eligible;
 const conflicting=matches.filter(other=>other.specCode===spec.specCode&&other.versions.some(version=>spec.versions.includes(version)));
 if(conflicting.length>1)return pending('HW_MULTIPLE',conflicting);
 const exact=plans.filter(plan=>plan.sku===spec.specCode&&plan.resourceType===spec.resourceType&&plan.size===false);
 if(exact.length!==1||chosen&&chosen.id!==exact[0].id)return pending('HW_DCS_SPEC_PRICE_LINK',eligible);
 const [item]=exact;
 return {item,spec,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE',assumptions:requirements.assumptions};
}

export function matchHuawei(row,catalog,{now=Date.now(),dcsSpecs}={}){
 if(row.huaweiTargetRegion&&row.huaweiTargetRegion!==REGION)return missing('HW_TARGET_REGION');
 const rule=Object.hasOwn(rules,row.service)?rules[row.service]:null;
 const mode=billingOf(row);
 const plans=catalog.items.filter(item=>item?.region===REGION&&item.service===row.service&&item.billingMode===mode);
 const spec=(row.product+' '+row.specification).normalize('NFKC').trim();
 if(row.service==='DCS')return matchDcs(row,catalog,plans,spec,dcsSpecs,now);
 if(!plans.length)return missing('HW_NO_PLAN');
 if(!rule)return missing('HW_MANUAL_SERVICE');
 const contract=rule(row,spec);
 if(contract.code)return contract;
 const exact=plans.filter(item=>contract.test(item,attributes(item)));
 if(!exact.length)return missing('HW_NO_MATCH');
 if(exact.length!==1)return {code:'HW_MULTIPLE',candidates:exact.map(item=>item.sku)};
 const [item]=exact;
 return {item,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE',
  assumptions:contract.assumptions};
}

export function applyHuaweiMatch(row,catalog,options){
 const manual=row.huaweiSelection==='manual';
 if(manual&&row.service!=='DCS')return row;
 const match=matchHuawei(row,catalog,options);
 row.huaweiMatch=match.code;
 row.huaweiCandidates=match.candidates;
 row.huaweiAssumptions=match.assumptions??[];
 if(row.service==='DCS'){
  row.huaweiProductMatch={reasonCode:match.spec?null:match.code,selected:match.spec,candidates:match.specs,
   specification:row.specification,product:row.product,capacity:row.capacity};
 }else delete row.huaweiProductMatch;
 if(!manual){row.targetId=match.item?.id??'';row.accepted=!!match.item;}
 setHuaweiUsageAssumption(row,match.item);
 return row;
}

export function selectHuaweiBilling(row,mode,catalog,options){
 row.targetBilling=mode;
 if(row.huaweiSelection!=='manual')return applyHuaweiMatch(identifyHuaweiRow(row),catalog,options);
 row.huaweiPreferredSku??=catalog.items.find(item=>item.id===row.targetId)?.sku;
 const choices=catalog.items.filter(item=>item.region===REGION&&item.service===row.service&&item.billingMode===mode&&item.sku===row.huaweiPreferredSku);
 const chosen=choices.length===1?choices[0]:null;
 row.targetId=chosen?.id??'';
 row.accepted=false;
 if(row.service==='DCS')return applyHuaweiMatch(identifyHuaweiRow(row),catalog,options);
 row.huaweiMatch=chosen?'HW_MATCHED':'HW_MANUAL_PLAN';
 setHuaweiUsageAssumption(row,chosen);
 return row;
}

export function setHuaweiUsageAssumption(row,item){
 row.huaweiUsageAssumption=null;
 if(item&&row.scope==='resource'&&row.period==='monthly'&&row.usage==null&&billingOf(row)==='ONDEMAND'){
  if(row.service==='EVS'&&!row.evsUsageConflict&&row.capacity>0&&(!row.unit||['GB-month','GiB-month','GB','GiB'].includes(row.unit))){
   row.huaweiUsageAssumption='HW_STORAGE_MONTH';
  }else if(item.unit==='hour'&&(!row.unit||/^(?:hour|hours|hr|hrs)$/i.test(row.unit))){
   row.huaweiUsageAssumption='HW_MONTH_HOURS';
  }
 }
}
