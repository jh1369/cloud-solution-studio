import {DCS_SPEC_REGION,DCS_FLAVOR_DOC,DCS_TOPOLOGIES,dcsSpecSnapshot} from './public/huawei-dcs-specs.mjs';

const DCS_ENDPOINT='https://dcs.eu-west-101.myhuaweicloud.com';
const DCS_SPEC_TTL_MS=15*60*1000;
const DCS_API_REVISION='2025-05-13';

function numberValue(value){
 if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)))return null;
 const number=Number(value);
 return Number.isFinite(number)&&number>0?number:null;
}
function capacityMiB(value){
 const capacity=numberValue(value)*1024;
 return Number.isSafeInteger(capacity)&&capacity>0?capacity:null;
}
function positiveInteger(value){
 const number=numberValue(value);
 return Number.isSafeInteger(number)?number:null;
}
function flavorAttribute(flavor,capacity,name){
 if(!Array.isArray(flavor.attrs))return null;
 const matches=flavor.attrs.filter(attr=>attr?.name===name&&capacityMiB(attr.capacity)===capacity);
 return matches.length===1?matches[0].value:null;
}
function availableZones(flavor,capacity){
 if(!Array.isArray(flavor.flavors_available_zones))return [];
 const matches=flavor.flavors_available_zones.filter(zone=>zone&&capacityMiB(zone.capacity)===capacity&&zone.unit==='GB');
 const codes=matches.length===1?matches[0].az_codes:null;
 return Array.isArray(codes)&&codes.every(code=>typeof code==='string'&&/^[a-z][a-z0-9-]{0,47}$/i.test(code))?[...new Set(codes.map(code=>code.toLowerCase()))].sort():[];
}

export function normalizeDcsFlavors(data,now=Date.now()){
 if(!Array.isArray(data?.flavors)||data.flavors.length>3000||data.spec_type!==undefined&&data.spec_type!=='instance')throw Error('Invalid DCS flavor response');
 const evidence={kind:'official-api',url:DCS_FLAVOR_DOC,revision:DCS_API_REVISION,endpoint:DCS_ENDPOINT,
  verifiedAt:new Date(now).toISOString(),expiresAt:new Date(now+DCS_SPEC_TTL_MS).toISOString()};
 const records=new Map();
 for(const flavor of data.flavors){
  if(!flavor||typeof flavor.engine!=='string')throw Error('Invalid DCS flavor');
  if(flavor.engine.toLowerCase()!=='redis'||flavor.product_type!=='generic'||flavor.storage_type!=='DRAM'||flavor.pricing_type==='tier'||flavor.dec===true)continue;
  const {spec_code:specCode,cpu_type:architecture,cache_mode:topology,cloud_resource_type_code:resourceType}=flavor;
  const versions=typeof flavor.engine_version==='string'?[...new Set(flavor.engine_version.split(';').map(version=>version.trim()))].sort():[];
  const capacity=Array.isArray(flavor.capacity)&&flavor.capacity.length===1?capacityMiB(flavor.capacity[0]):null;
  if(typeof specCode!=='string'||!/^redis\.[a-z0-9._-]{1,100}$/.test(specCode)||!DCS_TOPOLOGIES.includes(topology)||
     !['x86_64','aarch64'].includes(architecture)||!versions.length||versions.some(version=>!/^\d{1,2}\.\d{1,2}$/.test(version))||
     !capacity||flavor.pricing_type!=='normal'||typeof resourceType!=='string'||!/^hws\.resource\.type\.[a-z0-9._-]{1,60}$/.test(resourceType))throw Error('Invalid DCS instance flavor');
  const bandwidth=flavorAttribute(flavor,capacity,'max_bandwidth');
  const bandwidthMbps=typeof bandwidth==='string'?numberValue(bandwidth.match(/^(\d+(?:\.\d+)?)\s*(?:Mbit\/s|Mbps)$/)?.[1]):null;
  const record={service:'DCS',engine:'redis',specCode,region:DCS_SPEC_REGION,resourceType,topology,architecture,versions,capacityMiB:capacity,
   replicas:positiveInteger(flavor.replica_count),shards:positiveInteger(flavorAttribute(flavor,capacity,'sharding_num')),
   performance:{maxConnections:positiveInteger(flavorAttribute(flavor,capacity,'max_connections')),maxBandwidthMbps:bandwidthMbps},
   availableZones:availableZones(flavor,capacity),evidence};
  records.set(JSON.stringify(record),record);
 }
 return dcsSpecSnapshot('official',[...records.values()]);
}

export async function loadDcsSpecs(env,{fetcher=fetch,now=Date.now}={}){
 const project=env?.DCS_SPEC_PROJECT_ID,token=env?.DCS_SPEC_AUTH_TOKEN;
 if(typeof project!=='string'||!/^(?:[a-f\d]{32}|[a-f\d]{64})$/i.test(project)||typeof token!=='string'||!token.trim())return dcsSpecSnapshot('authentication_required');
 try{
  const response=await fetcher(`${DCS_ENDPOINT}/v2/${project}/flavors?engine=Redis&spec_type=instance`,{
   headers:{'Accept':'application/json','X-Auth-Token':token},redirect:'error',signal:AbortSignal.timeout(8000)
  });
  if(response.status===401||response.status===403)return dcsSpecSnapshot('authentication_required');
  if(!response.ok)return dcsSpecSnapshot('unavailable');
  return normalizeDcsFlavors(await response.json(),now());
 }catch{
  return dcsSpecSnapshot('unavailable');
 }
}
