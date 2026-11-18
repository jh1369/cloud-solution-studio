import {REGION,awsShape,billingOf,family,priceValidation} from './engine.mjs';

function attributes(item){
 return Object.fromEntries(item.description.split(';').map(part=>{
  const split=part.indexOf(':');
  return [part.slice(0,split).trim().toLowerCase(),part.slice(split+1).trim()];
 }));
}
const capacityToken=/(?:^|[^\w.])(\d+(?:\.\d+)?)\s*(?:GiB|GB|G)(?![a-z])/gi;
const capacity=(text)=>Number(text.matchAll(capacityToken).next().value?.[1])||null;
const policy=(test,assumptions=[])=>({test,assumptions});
const missing=(code)=>({code});
const computeShape=text=>{
 const explicitCPU=Number(text.match(/(\d+)\s*(?:vCPU|核)/i)?.[1])||null;
 const memory=capacity(text);
 const known=/\b(?:db\.)?(?:m5|m6i)\.(?:large|xlarge|2xlarge)\b/i.test(text)?awsShape(text):null;
 if(known&&(explicitCPU&&explicitCPU!==known.cpu||memory&&memory!==known.memory))return null;
 return explicitCPU&&memory?{cpu:explicitCPU,memory}:known;
};
const sameShape=(item,shape)=>item.cpu===shape.cpu&&item.memory===shape.memory;
const topologyOptions=[[/single(?:[- ]az|[- ]node)?|单机|单实例/i,'single_node'],[/master[ /_-]*standby|primary[ /_-]*standby|multi[- ]az|主备/i,'master_standby'],[/cluster|集群/i,'cluster'],[/read replica|只读副本/i,'read_replica']];
const topology=text=>{
 const matched=topologyOptions.filter(([pattern])=>pattern.test(text));
 return matched.length===1?matched[0][1]:null;
};
const rules={
 ECS(row,spec){
  const shape=computeShape(spec);
  if(!shape)return missing('HW_SHAPE_REQUIRED');
  const linux=/\blinux\b/i.test(spec),windows=/\bwindows\b/i.test(spec);
  const arm=/arm64|aarch64|鲲鹏|\barm\b|\b(?:m|c|r)\d+g\./i.test(spec),x86=/\bx86(?:_64)?\b|\b(?:m5|m6i)\./i.test(spec);
  if(linux&&windows||arm&&x86||/rhel|red hat|suse|byol|licen[cs]e|gpu|accelerator|dedicated|burst|risc-v|compute[- ]optimized|本地盘/i.test(spec))return missing('HW_ECS_CONFLICT');
  const type=/general[- ]computing[- ]plus|通用计算增强/i.test(spec)?'General Computing-plus':/memory[- ]optimized|内存优化/i.test(spec)?'Memory-optimized':'General Computing';
  const assumptions=[];
  if(!linux&&!windows)assumptions.push('HW_DEFAULT_LINUX');
  if(!arm&&!x86)assumptions.push('HW_DEFAULT_X86');
  if(type==='General Computing'&&!/general[- ]computing|通用计算/i.test(spec))assumptions.push('HW_DEFAULT_GENERAL');
  return policy((item,fields)=>sameShape(item,shape)&&item.os===(windows?'Windows':'Linux')&&
   item.arch.toLowerCase()===(arm?'arm':'x86')&&fields.type===type,assumptions);
 },
 EVS(row,spec){
  if(/snapshot|快照|iops|throughput|吞吐|mbps|premium|\b(?:io[12]|gp4)\b/i.test(spec))return missing('HW_DISK_PERFORMANCE');
  const types=[[/\bESSD\b|Extreme SSD|极速型/i,'ESSD'],[/\bSAS\b|^high i\/o$|高IO型/i,'SAS'],[/\b(?:GPSSD|gp[23])\b|General Purpose SSD|通用型SSD/i,'GPSSD'],[/Ultra[- ]high I\/O|超高IO/i,'SSD']];
  const explicit=types.filter(([pattern])=>pattern.test(spec));
  if(explicit.length>1)return missing('HW_DISK_TYPE');
  const generic=!explicit.length&&/\bSSD\b/i.test(spec),sku=explicit[0]?.[1]??(generic?'GPSSD':null);
  if(!sku)return missing('HW_DISK_TYPE');
  if(billingOf(row)!=='ONDEMAND'&&!(row.capacity>0))return missing('HW_DISK_CAPACITY');
  return policy(item=>item.sku===sku,generic?['HW_DEFAULT_SSD']:[]);
 },
 DCS(row,spec){
  const source=row.product+' '+spec;
  if(!/redis|\bdcs\b/i.test(source)||/memcached|valkey|keydb|\bredis\s+v?\d+\.\d+|版本|\bversion\b/i.test(spec))return missing('HW_CACHE_ENGINE');
  const specSize=capacity(spec),size=row.capacity??specSize,mode=topology(spec);
  if(row.capacity&&specSize&&row.capacity!==specSize)return missing('HW_CACHE_CAPACITY');
  if(!(size>0))return missing('HW_CACHE_CAPACITY');
  const units=Number(spec.match(/(\d+)\s*(?:节点|nodes?|副本|replicas?)/i)?.[1])||null;
  if(mode==='read_replica')return missing('HW_CACHE_MODE');
  if(!mode){
   const capacities=Array.from(source.matchAll(capacityToken),match=>Number(match[1]));
   if(capacities.some(capacity=>capacity!==size)||/\d\s*[-–~至/]\s*\d+(?:\.\d+)?\s*(?:GiB|GB|G)\b/i.test(source))return missing('HW_CACHE_CAPACITY');
   if(/\bredis\s+v\d/i.test(source)||/memcached|valkey|keydb|\bredis\s+\d+\.\d+|版本|\bversion\b/i.test(row.product))return missing('HW_CACHE_ENGINE');
   // Unknown or conflicting topology hints must not take the missing-topology default.
   const nodeConstraints=Array.from(source.matchAll(/(\d+)\s*(?:节点|nodes?|副本|replicas?)/gi),match=>Number(match[1]));
   if(!/redis/i.test(source)||topologyOptions.some(([pattern])=>pattern.test(source))||
      /主\s*备|高可用|多\s*(?:AZ|可用区)|哨兵|分片|\b(?:HA|standby|standalone|replication|replicated|shards?|sentinel)\b/i.test(source)||
      nodeConstraints.some(count=>count!==1))return missing('HW_CACHE_MODE');
  }
  const nodeCount=mode?units:1;
  const constraints=mode?spec:source;
  return policy((item,fields)=>typeof item.sku==='string'&&item.sku.startsWith('redis.')&&fields.cache_mode===(mode??'single_node')&&fields.capacity===`${size*1024}MB`&&
   (!nodeCount||fields.replica_number===`${nodeCount}PCS`)&&(!/arm|鲲鹏/i.test(constraints)||fields.cpu_type==='arm')&&
   (!/x86/i.test(constraints)||fields.cpu_type==='x86')&&(!/DRAM/i.test(constraints)||fields.storage_type==='DRAM'),mode?[]:['HW_DEFAULT_REDIS_SINGLE']);
 },
 RDS(row,spec){
  const shape=computeShape(spec),mode=topology(spec);
  const engine=spec.match(/\b(MySQL|PostgreSQL|MariaDB|SQL Server)\b/i)?.[1];
  const version=spec.match(/(?:mysql|postgresql|mariadb|sql server|版本|version)\s*(\d+(?:\.\d+)?)(?![\d.])/i)?.[1];
  if(!shape||!engine||!version||!mode||mode==='cluster')return missing('HW_DB_PARAMETERS');
  if(!/instance only|compute only|仅实例|仅计算/i.test(spec)||!/cloud ssd|云ssd/i.test(spec))return missing('HW_DB_STORAGE_SCOPE');
  const type={single_node:'Single',master_standby:'Primary/Standby',read_replica:'Read replica'}[mode];
  return policy((item,fields)=>sameShape(item,shape)&&item.engine.toLowerCase()===engine.toLowerCase()&&
   fields['db engine version']?.split('|').includes(version)&&fields['db instance type']===type&&fields['storage type']==='Cloud SSD',
   ['HW_DB_INSTANCE_ONLY']);
 }
};

export function identifyHuaweiRow(row){
 const text=row.product+' '+row.specification;
 const inferred=row.service==='Unmapped';
 if(row.service==='Unmapped'){
  const mapped=family(row.product);
  if(mapped!=='Unmapped')row.service=mapped;
  else if(/云主机|虚拟机|\b(?:VM|EC2|ECS)\b/i.test(text))row.service='ECS';
  else if(/云盘|硬盘|\b(?:EBS|EVS)\b/i.test(text))row.service='EVS';
  else if(/redis|\bdcs\b/i.test(text))row.service='DCS';
 }
 if(row.service==='DCS'||row.service==='EVS'){
  row.capacity??=capacity(row.specification);
  if(row.service==='DCS'&&!row.unit)row.unit='hour';
  if(row.service==='EVS'&&inferred&&!row.unitExplicit&&row.usage==null)row.unit='';
 }
 if(row.scope==='resource'&&row.quantity==null)row.huaweiQuantity=Number(text.match(/(\d+)\s*(?:套|台|块|instances?\b)/i)?.[1])||null;
 return row;
}

export function matchHuawei(row,catalog,{now=Date.now()}={}){
 if(row.huaweiTargetRegion&&row.huaweiTargetRegion!==REGION)return missing('HW_TARGET_REGION');
 const rule=rules[row.service];
 const mode=billingOf(row);
 const plans=catalog.items.filter(item=>item.region===REGION&&item.service===row.service&&item.billingMode===mode);
 if(!plans.length)return missing('HW_NO_PLAN');
 if(!rule)return missing('HW_MANUAL_SERVICE');
 const spec=row.specification.trim();
 const contract=rule(row,spec);
 if(contract.code)return contract;
 if(contract.assumptions.includes('HW_DEFAULT_REDIS_SINGLE')&&plans.some(item=>typeof item.description!=='string'||!item.description.trim()))return missing('HW_NO_MATCH');
 const exact=plans.filter(item=>contract.test(item,attributes(item)));
 if(!exact.length)return missing('HW_NO_MATCH');
 if(exact.length!==1)return {code:'HW_MULTIPLE',candidates:exact.map(item=>item.sku)};
 const [item]=exact;
 return {item,code:priceValidation(item,catalog,{now}).valid?'HW_MATCHED':'HW_MATCHED_PRICE',
  assumptions:contract.assumptions};
}

export function applyHuaweiMatch(row,catalog){
 if(row.huaweiSelection==='manual')return row;
 const match=matchHuawei(row,catalog);
 row.huaweiMatch=match.code;
 row.huaweiCandidates=match.candidates;
 row.huaweiAssumptions=match.assumptions??[];
 row.targetId=match.item?.id??'';
 row.accepted=!!match.item;
 setHuaweiUsageAssumption(row,match.item);
 return row;
}

export function setHuaweiUsageAssumption(row,item){
 row.huaweiUsageAssumption=null;
 if(item&&row.scope==='resource'&&row.period==='monthly'&&row.usage==null&&billingOf(row)==='ONDEMAND'){
  if(row.service==='EVS'&&row.capacity>0&&(!row.unit||['GB-month','GiB-month','GB','GiB'].includes(row.unit))){
   row.huaweiUsageAssumption='HW_STORAGE_MONTH';
  }else if(item.unit==='hour'&&(!row.unit||/^(?:hour|hours|hr|hrs)$/i.test(row.unit))){
   row.huaweiUsageAssumption='HW_MONTH_HOURS';
  }
 }
}
