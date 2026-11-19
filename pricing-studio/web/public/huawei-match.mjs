import {REGION,awsShape,billingOf,family,parseText,priceValidation,calculate,pendingResult,relatedHuaweiCharges} from './engine.mjs';
import {dcsRequirements,documentedDcsSpecs,matchesDcsSpec} from './huawei-dcs-specs.mjs';
import {infrastructureRules} from './huawei-infrastructure-specs.mjs';
import {eipName,eipSelection,eipAttachment,eipReference,attachedEipRow} from './huawei-eip.mjs';
import {awsSourceService,hasAwsSourceType,lookupAwsSpec,awsOperatingSystem} from './aws-specs.mjs';

const productRules={...infrastructureRules,EIP:eipSelection};
export const usesHuaweiProductSpecs=service=>service==='DCS'||Object.hasOwn(productRules,service);
const awsUsageServices={amazonec2:'ECS',amazonrds:'RDS',amazonelasticache:'DCS',amazones:'CSS'};
const awsServiceByKind={EC2:'ECS',RDS:'RDS',ElastiCache:'DCS',OpenSearch:'CSS'};

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
function verifiedComputeConflict(text,profile,{memoryCheck}={}){
 const cpus=observedIntegers(text,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:vCPUs?\b|核)/gi);
 const arm=/\b(?:arm64|aarch64|arm)\b|鲲鹏/i.test(text),x86=/\b(?:x86(?:_64)?|amd64)\b/i.test(text);
 const memory=memoryCheck?storageDimensions(text):null;
 return [...cpus].some(cpu=>cpu!==profile.cpu)||arm&&x86||
  !!profile.architecture&&(arm&&profile.architecture!=='arm'||x86&&profile.architecture!=='x86')||
  memory&&(memory.conflict||memory.size!==null&&memory.size!==profile.memory);
}
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
  const profile=row.awsProfile?.kind==='RDS'?row.awsProfile:null;
  const shape=profile??computeShape(spec),modes=topologies(spec);
  const engines=new Set(Array.from(spec.matchAll(/\b(MySQL|PostgreSQL|MariaDB|SQL Server)\b/gi),match=>match[1].toLowerCase()));
  const versions=new Set(Array.from(spec.matchAll(/(?:mysql|postgresql|mariadb|sql server|版本|version)\s*(\d+(?:\.\d+)?)(?![\d.])/gi),match=>match[1]));
  if(!shape||engines.size!==1||versions.size!==1||modes.length!==1||modes[0]==='cluster')return missing('HW_DB_PARAMETERS');
  if(profile&&verifiedComputeConflict(spec,profile))return missing('HW_AWS_SPEC_CONFLICT');
  if(profile?.architecture==='arm'||profile&&/\b(?:arm64|aarch64|arm)\b|鲲鹏/i.test(spec))return missing('HW_AWS_DB_ARCH');
  if(engines.has('sql server')||/byol|licen[cs]e|许可/i.test(spec))return missing('HW_DB_LICENSE');
  if(!/instance only|compute only|仅实例|仅计算/i.test(spec)||!/cloud ssd|云ssd/i.test(spec))return missing('HW_DB_STORAGE_SCOPE');
  const type={single_node:'Single',master_standby:'Primary/Standby',read_replica:'Read replica'}[modes[0]];
  const version=versions.values().next().value;
  return {...policy((item,fields)=>sameShape(item,shape)&&engines.has(String(item.engine??'').toLowerCase())&&
   fields['db engine version']?.split('|').includes(version)&&fields['db instance type']===type&&fields['storage type']==='Cloud SSD',
   ['HW_DB_INSTANCE_ONLY']),condition:profile?'HW_AWS_RDS_REVIEW':null};
 }
};

const servicePatterns=[
 ['ECS',/云主机|云服务器|虚拟机|\b(?:VMs?|virtual machines?|virtual server|EC2|ECS)\b/i],
 ['EVS',/云盘|云硬盘|硬盘|磁盘|\d\s*块\s*盘|\b(?:EBS|EVS|managed disks?|block storage)\b/i],
 ['DCS',/redis|缓存|\b(?:ElastiCache|DCS|memcached|valkey)\b/i],
 ['RDS',/数据库|\b(?:RDS|MySQL|PostgreSQL|MariaDB|SQL Server)\b/i],
 ['ELB',/负载均衡|\b(?:ELB|ALB|NLB|elbv3|load balancers?|load balancing)\b/i],
 ['OBS',/对象存储|\b(?:OBS|S3|object storage)\b/i],
 ['CCE',/容器集群|\b(?:CCE|EKS|K8s|Kubernetes|Cloud Container Engine)\b/i],
 ['NAT Gateway',/\b(?:public\s+nat|private\s+nat|nat\s*gateway|natgateway_[a-z]+|privatenat_[a-z]+)\b|[公私]网\s*NAT|NAT\s*网关/i],
 ['EIP',eipName]
];

export function identifyHuaweiService(product,specification=''){
 const code=String(product).trim().toLowerCase();
 const known=awsServiceByKind[awsSourceService(product)]??(Object.hasOwn(awsUsageServices,code)?awsUsageServices[code]:family(product));
 if(known==='VPC / EIP'&&eipName.test(specification)&&specification.search(eipName)===specification.search(/\S/))return 'EIP';
 if(known!=='Unmapped')return known;
 for(const text of [product,specification]){
  const candidates=servicePatterns.filter(([,pattern])=>pattern.test(text));
  if(candidates.length===1)return candidates[0][0];
  if(candidates.length>1)break;
 }
 return 'Unmapped';
}

const targetRegion=/(?:华为云区域|华为云目标区域|目标区域|(?:huawei\s+)?target\s+region)\s*[:=：]\s*([a-z]{2}(?:-[a-z]+)+-\d+)\b/i;
const leadingService=/^(?:\s*(\d+)\s*(?:套|台|个|clusters?\b|instances?\b|load balancers?\b|gateways?\b)\s*)?((?:(?:aws|amazon|dedicated|application|network|private|public)\s+)*(?:负载均衡|\b(?:CCE|EKS|K8s|Kubernetes|ELB|ALB|NLB|load balanc\w*|NAT\s*Gateway)\b)|(?:专享型\s*ELB|[公私]网\s*NAT|容器集群|NAT\s*网关))/i;
function identifyInfrastructureText(row,spec){
 const first=spec.match(leadingService);
 if(first&&!row.huaweiMatch){
  const service=identifyHuaweiService(first[2]);
  if(Object.hasOwn(infrastructureRules,service)){row.service=service;row.product=service;}
 }
 if(!Object.hasOwn(infrastructureRules,row.service))return;
 // Counts of worker nodes, IPs and bandwidth options are not counts of clusters or gateways.
 const explicit=spec.match(/(?:^|[,，])\s*(?:target\s+quantity|resource count|quantity|目标数量|数量)\s*[:=]\s*(\d+(?:\.\d+)?)/i)?.[1];
 const shortCount=spec.match(/^(\d+)\s*(?:台|个|套)\s*/)?.[1];
 row.quantity=explicit!=null?Number(explicit):first?.[1]!=null?Number(first[1]):shortCount!=null?Number(shortCount):null;
 if(row.service==='NAT Gateway'&&!row.unitExplicit&&(row.usage==null||row.huaweiNatUsageFromText)){
  const days=observedIntegers(spec,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:计费日|billed days?\b|billable days?\b)/gi);
  if(days.size===1){row.usage=days.values().next().value;row.unit='day';row.huaweiNatUsageFromText=true;}
  else if(row.huaweiNatUsageFromText)row.usage=null;
 }
}
export function identifyHuaweiRow(row){
 const infrastructureText=!row.sourceService&&!row.importSource&&row.huaweiUsageFromSpec;
 const text=(row.product+' '+row.specification).normalize('NFKC');
 if(row.service==='Unmapped'||row.service==='VPC / EIP')row.service=identifyHuaweiService(row.product,row.specification);
 if(row.awsInventory){
  const profile=lookupAwsSpec(row.product,row.specification);
  if(row.service==='Unmapped'&&profile)row.service=profile.service;
  row.awsProfile=profile?.service===row.service?profile:null;
  row.awsTypedSource=hasAwsSourceType(row.product,row.specification)?awsServiceByKind[awsSourceService(row.product)]:null;
  row.awsOS=row.awsProfile?.kind==='EC2'?awsOperatingSystem(row.specification):null;
 }
 if(infrastructureText){
  const attachment=eipAttachment(row);
  if(attachment?.base&&!row.unitExplicit&&row.huaweiEipBase!==attachment.base){
   row.usage=parseText(attachment.base)[0].usage;row.unit='hour';row.huaweiEipBase=attachment.base;
  }
  identifyInfrastructureText(row,attachment?.base??row.specification.normalize('NFKC'));
 }
 if(row.service==='EIP'&&row.quantity==null&&!row.importSource){
  const count=row.specification.match(/^\s*(\d+)\s*(?:个\s*)?(?=(?:EIP|Elastic IP|Public IP|(?:弹性)?公网\s*IP))/i);
  if(count)row.huaweiQuantity=Number(count[1]);
 }
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
 if(row.scope==='resource'&&row.quantity==null&&row.service!=='EIP'&&!row.importSource&&!(infrastructureText&&Object.hasOwn(infrastructureRules,row.service))){
  const quantities=observedIntegers(text,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:套|台|块|instances?\b)/gi);
  const quantity=quantities.values().next().value;
  row.huaweiQuantity=quantities.size===1&&Number.isInteger(quantity)&&quantity>0?quantity:null;
 }
 return row;
}

function priceForSpec(spec,plans,catalog,now,chosen){
 const exact=plans.filter(plan=>plan.sku===spec.specCode&&plan.resourceType===spec.resourceType&&plan.size===false&&
  (!spec.usageFactor||plan.usageFactor===spec.usageFactor&&plan.evidence?.request?.usageFactor===spec.usageFactor));
 if(exact.length!==1||chosen&&chosen.id!==exact[0].id)return null;
 const [item]=exact;
 return {item,spec,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE'};
}

function matchDcs(row,catalog,plans,source,now){
 const manual=row.huaweiSelection==='manual';
 const chosen=manual?plans.find(plan=>plan.id===row.targetId):null;
 if(manual&&!chosen)return missing('HW_MANUAL_PLAN');
 const requirements=dcsRequirements(row,source,manual);
 if(requirements.code)return requirements;
 const scope=chosen?documentedDcsSpecs.filter(spec=>spec.specCode===chosen.sku):documentedDcsSpecs;
 const matches=scope.filter(spec=>matchesDcsSpec(spec,requirements));
 const pending=(code,specs=matches)=>({code,specs,candidates:[...new Set(specs.map(spec=>spec.specCode))],assumptions:requirements.assumptions});
 if(!matches.length){
  const wrongCapacity=chosen&&requirements.capacityMiB&&scope.length&&scope.every(spec=>spec.capacityMiB!==requirements.capacityMiB);
  return pending(wrongCapacity?'HW_CACHE_SKU_CAPACITY':'HW_DCS_SPEC_NO_MATCH',wrongCapacity?scope:matches);
 }
 if(requirements.zone)return pending('HW_DCS_SPEC_AZ_REQUIRED');
 if(matches.length!==1)return pending('HW_MULTIPLE');
 const [spec]=matches;
 const price=priceForSpec(spec,plans,catalog,now,chosen);
 if(!price)return pending('HW_DCS_SPEC_PRICE_LINK');
 const assumptions=[...requirements.assumptions];
 if(!requirements.version)assumptions.push('HW_DCS_DOCUMENTED_VERSIONS');
 if(!requirements.architecture)assumptions.push('HW_DCS_DOCUMENTED_X86');
 if(!requirements.replicas&&spec.replicas>1)assumptions.push('HW_DCS_DOCUMENTED_REPLICAS');
 if(!requirements.shards&&spec.shards)assumptions.push('HW_DCS_DOCUMENTED_SHARDS');
 return {...price,assumptions};
}

function matchDocumentedProduct(row,catalog,plans,text,now){
 const manual=row.huaweiSelection==='manual';
 const chosen=manual?plans.find(plan=>plan.id===row.targetId):null;
 const match=productRules[row.service](row,text,chosen?.sku);
 const specs=match.specs??[];
 const pending=code=>({...match,code,candidates:specs.map(spec=>spec.specCode)});
 if(match.code)return pending(match.code);
 if(manual&&!chosen)return pending('HW_MANUAL_PLAN');
 if(!specs.length)return pending('HW_NO_MATCH');
 if(specs.length>1)return pending('HW_MULTIPLE');
 const price=priceForSpec(specs[0],plans,catalog,now,chosen);
 return price?{...match,...price,specs:undefined}:pending('HW_SPEC_PRICE_LINK');
}

const isAwsCompute=row=>row.service==='ECS'&&(row.awsProfile?.kind==='EC2'||row.awsTypedSource==='ECS');
const isAwsDatabase=row=>row.service==='RDS'&&(row.awsProfile?.kind==='RDS'||row.awsTypedSource==='RDS');
export const revalidateHuaweiSelection=row=>usesHuaweiProductSpecs(row.service)||isAwsCompute(row)||isAwsDatabase(row);

function matchAwsCompute(row,catalog,plans,text,now){
 const profile=row.awsProfile,os=row.awsOS?.value;
 if(!os)return missing('HW_AWS_OS_REVIEW');
 if(!profile.architecture)return missing('HW_AWS_PROFILE_ARCH');
 if(verifiedComputeConflict(text,profile,{memoryCheck:true}))return missing('HW_AWS_SPEC_CONFLICT');
 const candidates=plans.filter(plan=>sameShape(plan,profile)&&String(plan.arch).toLowerCase()===profile.architecture&&plan.os===os);
 const skus=candidates.map(plan=>plan.sku);
 if(!candidates.length)return missing('HW_AWS_NO_PLAN');
 const preferredType=profile.category==='memory'?'Memory-optimized':'General Computing';
 const preferred=candidates.filter(plan=>attributes(plan).type===preferredType);
 const manual=row.huaweiSelection==='manual';
 const item=manual?candidates.find(plan=>plan.id===row.targetId):preferred.length===1?preferred[0]:candidates.length===1?candidates[0]:null;
 if(!item)return {code:manual?'HW_AWS_SPEC_CONFLICT':'HW_MULTIPLE',candidates:skus};
 const automatic=profile.category==='general'&&attributes(item).type==='General Computing'&&profile.architecture==='x86';
 const condition=automatic?null:profile.category==='burstable'?'HW_AWS_BURST_REVIEW':
  profile.architecture==='arm'?'HW_AWS_ARCH_REVIEW':'HW_AWS_CAPACITY_REVIEW';
 return {item,condition,candidates:skus,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE'};
}

export function matchHuawei(row,catalog,{now=Date.now()}={}){
 if(row.huaweiTargetRegion&&row.huaweiTargetRegion!==REGION)return missing('HW_TARGET_REGION');
 const rule=Object.hasOwn(rules,row.service)?rules[row.service]:null;
 const mode=billingOf(row);
 const plans=catalog.items.filter(item=>item?.region===REGION&&item.service===row.service&&item.billingMode===mode);
 const spec=(row.product+' '+(eipAttachment(row)?.base??row.specification)).normalize('NFKC').trim();
 if((isAwsCompute(row)||isAwsDatabase(row))&&!row.awsProfile)return missing('HW_AWS_SPEC_UNVERIFIED');
 if(isAwsCompute(row))return matchAwsCompute(row,catalog,plans,spec,now);
 if(row.service==='DCS')return matchDcs(row,catalog,plans,spec,now);
 if(Object.hasOwn(productRules,row.service))return matchDocumentedProduct(row,catalog,plans,spec,now);
 if(!plans.length)return missing('HW_NO_PLAN');
 if(!rule)return missing('HW_MANUAL_SERVICE');
 const contract=rule(row,spec);
 if(contract.code)return contract;
 const exact=plans.filter(item=>contract.test(item,attributes(item)));
 if(isAwsDatabase(row)&&row.huaweiSelection==='manual'){
  const chosen=exact.find(item=>item.id===row.targetId);
  return chosen?{item:chosen,code:priceValidation(chosen,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE',
   condition:contract.condition,assumptions:contract.assumptions}:{code:'HW_AWS_SPEC_CONFLICT',candidates:exact.map(item=>item.sku)};
 }
 if(!exact.length)return missing('HW_NO_MATCH');
 if(exact.length!==1)return {code:'HW_MULTIPLE',candidates:exact.map(item=>item.sku)};
 const [item]=exact;
 return {item,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE',
  assumptions:contract.assumptions,condition:contract.condition};
}

export function applyHuaweiMatch(row,catalog,options){
 const manual=row.huaweiSelection==='manual';
 if(manual&&!revalidateHuaweiSelection(row))return row;
 const match=matchHuawei(row,catalog,options);
 row.huaweiMatch=match.code;
 row.huaweiCandidates=match.candidates;
 row.huaweiAssumptions=match.assumptions??[];
 row.huaweiCharge=match.charge;
 row.huaweiPendingCharges=match.pendingCharges??[];
 if(row.service==='EIP')row.huaweiEip=match.dimensions;
 else delete row.huaweiEip;
 if(usesHuaweiProductSpecs(row.service)){
  row.huaweiProductMatch={reasonCode:match.spec?null:match.code,selected:match.spec,candidates:match.specs,
   specification:row.specification,product:row.product,capacity:row.capacity,
   ...(row.service==='EIP'?{usage:row.usage,unit:row.unit,unitExplicit:row.unitExplicit}:{})};
 }else delete row.huaweiProductMatch;
 if(!manual){row.targetId=match.item?.id??'';row.accepted=!!match.item;}
 row.awsMatchIssue=(isAwsCompute(row)||isAwsDatabase(row))&&!match.item?match.code:null;
 setHuaweiUsageAssumption(row,match.item);
 const assumptions=row.semanticInventory?[...row.huaweiAssumptions.filter(code=>
  /^HW_(?:DEFAULT_|DCS_DOCUMENTED_)/.test(code)||['HW_ELB_ELASTIC_BASE','HW_CCE_STANDARD','HW_EIP_REFERENCE_HOURS'].includes(code)),
  row.huaweiUsageAssumption].filter(Boolean):[];
 row.huaweiConditions=[...new Set([match.condition,...assumptions].filter(Boolean))];
 updateConditionKey(row,match.item);
 return row;
}
function updateConditionKey(row,item){
 const next=item&&row.huaweiConditions?.length?JSON.stringify([
  row.awsProfile?.type??row.product,row.awsOS?.value??row.specification,item.id,...row.huaweiConditions]):null;
 if(next!==row.huaweiConditionKey)row.huaweiConditionApproval=null;
 row.huaweiConditionKey=next;
}

export function confirmHuaweiConditionGroup(rows,source,catalog,options){
 const group=source.huaweiConditionKey;
 if(!group)return 0;
 let confirmed=0;
 for(const row of rows){
  if(row.huaweiConditionKey!==group||row.huaweiImportIssues?.length)continue;
  applyHuaweiMatch(identifyHuaweiRow(row),catalog,options);
  if(row.huaweiConditionKey!==group||calculate(row,catalog,options).status!=='Conditional')continue;
  row.huaweiConditionApproval=group;row.accepted=true;confirmed++;
 }
 return confirmed;
}

export function selectHuaweiBilling(row,mode,catalog,options){
 row.targetBilling=mode;
 if(row.huaweiSelection!=='manual')return applyHuaweiMatch(identifyHuaweiRow(row),catalog,options);
 row.huaweiPreferredSku??=catalog.items.find(item=>item.id===row.targetId)?.sku;
 const choices=catalog.items.filter(item=>item.region===REGION&&item.service===row.service&&item.billingMode===mode&&item.sku===row.huaweiPreferredSku);
 const chosen=choices.length===1?choices[0]:null;
 row.targetId=chosen?.id??'';
 row.accepted=false;
 if(revalidateHuaweiSelection(row))return applyHuaweiMatch(identifyHuaweiRow(row),catalog,options);
 row.huaweiMatch=chosen?'HW_MATCHED':'HW_MANUAL_PLAN';
 setHuaweiUsageAssumption(row,chosen);
 updateConditionKey(row,chosen);
 return row;
}

export function setHuaweiUsageAssumption(row,item){
 row.huaweiUsageAssumption=null;
 if(row.service==='EIP')return;
 if(item&&row.scope==='resource'&&row.period==='monthly'&&row.usage==null&&billingOf(row)==='ONDEMAND'){
  if(row.service==='EVS'&&!row.evsUsageConflict&&row.capacity>0&&(!row.unit||['GB-month','GiB-month','GB','GiB'].includes(row.unit))){
   row.huaweiUsageAssumption='HW_STORAGE_MONTH';
  }else if(item.unit==='hour'&&(!row.unit||/^(?:hour|hours|hr|hrs)$/i.test(row.unit))){
   row.huaweiUsageAssumption='HW_MONTH_HOURS';
  }
 }
}

function eipClaimSignature(row,hours){
 const shape=row.huaweiEip;
 return shape?JSON.stringify([shape.meter,shape.mbps,billingOf(row)==='ONDEMAND'?(shape.referenceHours?hours:shape.amount):null,
  billingOf(row),row.targetQuantity??row.quantity??row.huaweiQuantity,row.period,row.scope,row.huaweiTargetRegion||REGION]):null;
}

function resolveEipClaims(claims,{hours=730}){
 const groups=new Map();
 const standalone=new Set(claims.filter(entry=>entry.standalone).map(entry=>entry.kind));
 for(const claim of claims){
  if(!claim.ref){
   if(!claim.standalone&&standalone.has(claim.kind))Object.assign(claim.result,pendingResult('','HW_EIP_LINK_REQUIRED'));
   continue;
  }
  const key=claim.ref+'|'+claim.kind;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(claim);
 }
 for(const group of groups.values()){
  if(group.length<2)continue;
  const described=group.filter(entry=>entry.result.reasonCode!=='HW_EIP_PARAMETERS');
  const signature=new Set(described.map(entry=>eipClaimSignature(entry.row,hours)));
  if(!described.length)continue;
  if(signature.size>1||signature.has(null)){
   for(const claim of group)Object.assign(claim.result,pendingResult('','HW_EIP_REFERENCE_CONFLICT'));
   continue;
  }
  const primary=described.find(entry=>entry.standalone)??described[0];
  for(const claim of group)if(claim!==primary)Object.assign(claim.result,pendingResult('','HW_EIP_LINKED'),{status:'Linked',linkedRow:primary.index+1});
 }
}

export function quoteHuaweiRows(rows,catalog,options={}){
 const claims=[];
 const output=rows.map((row,index)=>{
  const result=calculate(row,catalog,options);
  const attach=eipAttachment(row),related=relatedHuaweiCharges(row,result).filter(line=>!attach||line.charge!=='eip');
  const addClaim=(item,quote,reference,standalone=false)=>claims.push({row:item,result:quote,index,
   ref:reference,standalone,kind:item.huaweiCharge==='eipReservation'?'reservation':'connection'});
  const addCharge=(item,reference)=>{
   const quote=calculate(item,catalog,options);
   related.push({row:item,result:quote,charge:item.huaweiCharge??'eip'});
   addClaim(item,quote,reference);
  };
  const eip=attach?applyHuaweiMatch(attachedEipRow(row,attach),catalog,options):row.service==='EIP'?row:null;
  if(eip){
   const ref=eipReference(eip).ref;
   if(attach)addCharge(eip,ref);
   else addClaim(eip,result,ref,true);
   const dimensions=eip.huaweiEip;
   if(dimensions?.unbound&&dimensions.meter!=='reservation'){
    const idle={...eip,product:'EIP',specification:'unbound EIP',targetBilling:'ONDEMAND',
     usage:dimensions.idleHours??null,unit:'hour',unitExplicit:true,huaweiSelection:null,targetId:''};
    addCharge(applyHuaweiMatch(idle,catalog,options),ref);
   }else if(attach&&!dimensions?.unbound&&eip.huaweiCharge!=='eipReservation'){
    related.push({charge:'eipReservation',result:{...pendingResult('','HW_EIP_BOUND'),status:'Included'}});
   }
  }
  return Object.assign(result,{related});
 });
 resolveEipClaims(claims,options);
 return output;
}
