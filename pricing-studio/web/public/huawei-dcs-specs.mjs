import {dcsDocTables,dcsDocExamples} from './huawei-dcs-spec-data.mjs';

const DCS_PRODUCT_DOC='https://support.huaweicloud.com/eu/productdesc-dcs/dcs-pd-0522002.html';
const DCS_ARCHITECTURE_DOC='https://support.huaweicloud.com/intl/en-us/productdesc-dcs/dcs-pd-0522002.html';
const redisVersions=['4.0','5.0','6.0','7.0'];
const topologies={1:'single',2:'ha',3:'proxy',5:'cluster',7:'ha_rw_split'};

function documentedSpec(table,anchor,row,example=false){
 const [specCode,gb,replicas,shards,defaultConnections,maxConnections,assuredBandwidthMbps,maxBandwidthMbps,referenceQps]=row;
 const evidence={kind:'official-doc',url:DCS_PRODUCT_DOC+(example?'':'#'+anchor),revision:'2025-11-03',
  section:`Table ${table}${example?' accompanying example':''}`};
 // The linked architecture tables identify the same x86 codes. Scope and versions come from the EU tables.
 if(table!==7&&!example)evidence.architectureUrl=DCS_ARCHITECTURE_DOC+'#'+anchor;
 return {service:'DCS',engine:'redis',specCode,region:null,resourceType:'hws.resource.type.dcs3',topology:topologies[table],
  architecture:'x86_64',versions:table===3||table===7?redisVersions.slice(0,3):redisVersions,
  capacityMiB:gb*1024,replicas,shards,performance:{defaultConnections,maxConnections,assuredBandwidthMbps,maxBandwidthMbps,referenceQps},
  availableZones:[],evidence};
}

export const documentedDcsSpecs=[
 ...dcsDocTables.flatMap(([table,anchor,rows])=>rows.map(row=>documentedSpec(table,anchor,row))),
 ...dcsDocExamples.map(([table,row])=>documentedSpec(table,null,row,true))
];

function values(text,pattern,convert=Number){
 return [...new Set(Array.from(text.matchAll(pattern),match=>convert(match[1])))];
}

const topologyPatterns=[
 [/\b(?:single(?:[- ]az|[- ]node)?|standalone)\b|单机|单实例/i,'single'],
 [/\b(?:HA|(?:master|primary)[ /_-]*standby)\b|主\s*备/i,'ha'],
 [/\bproxy[- ]cluster\b|代理(?:集群)?/i,'proxy'],
 [/\bcluster\b|集群/i,'cluster'],
 [/\bread[ /-]write split(?:ting)?\b|读写分离/i,'ha_rw_split']
];
const countNumber='([+-]?\\d+(?:\\.\\d+)?)';
const counts=(text,unit)=>values(text,new RegExp('(?<![\\w.])'+countNumber+'\\s*(?:个\\s*)?(?:'+unit+')','gi'));
const validCount=value=>Number.isSafeInteger(value)&&value>0;

export function dcsRequirements(row,text,manual){
 if(!/redis|\bdcs\b/i.test(text)||/memcached|valkey|keydb|redis enterprise/i.test(text))return {code:'HW_CACHE_ENGINE'};
 if(/\b(?:flash|SSD|persistent memory|serverless)\b|闪存/i.test(text))return {code:'HW_DCS_SPEC_NO_MATCH'};
 if(row.huaweiCapacityConflict||!manual&&!(row.capacity>0))return {code:'HW_CACHE_CAPACITY'};
 const versionText=text.replace(/\d+(?:\.\d+)?\s*(?:GiB|GB|G)(?![a-z])/gi,' ');
 const versions=values(versionText,/(?:\bredis\s*(?:(?:oss|cluster|standalone|ha)\s*)?(?:v\s*)?|\bv\s*|\b(?:engine\s+)?version\s*[:=]?\s*|版本\s*[:=]?\s*)(\d+(?:\.[\dx]+)*)(?![\w.]|\s*(?:个|套|台|instances?\b|节点|副本|分片|replicas?\b|shards?\b|nodes?\b))/gi,
  value=>value.includes('.')?value.toLowerCase():value+'.0');
 if(versions.length>1||/\b(?:version|redis\s*v)\b|版本/i.test(versionText)&&!versions.length||
    /\bv?\d+\.[\dx]+\s*(?:\/|or|through|to|或|至|、|[-~–])\s*v?\d+\.[\dx]+\b/i.test(versionText))return {code:'HW_DCS_SPEC_CONSTRAINT'};
 const proxyText=text.replace(/\bproxy[- ]cluster\b|代理(?:集群)?/gi,' ');
 const modes=topologyPatterns.filter(([pattern,mode])=>pattern.test(mode==='cluster'?proxyText:text)).map(([,mode])=>mode);
 const nodes=counts(text,'节点|nodes?\\b');
 const replicas=counts(text,'副本|replicas?\\b');
 const shards=counts(text,'分片|shards?\\b');
 const mode=modes[0];
 const copies=[...new Set([...replicas,...nodes])];
 const unknownTopology=/只读副本|\bread replica\b|哨兵|\bsentinel\b|\bmulti[- ]az\b|[多跨]\s*(?:AZ|可用区)|\b\d+\s*AZs?\b/i.test(text);
 const unclearCounts=copies.length>1||shards.length>1||[...copies,...shards].some(value=>!validCount(value))||
  !copies.length&&/副本|\breplicas?\b|节点|\bnodes?\b/i.test(text.replace(/\bsingle[- ]node\b/i,''))||!shards.length&&/分片|\bshards?\b/i.test(text);
 const nodeConflict=nodes.length&&mode&&mode!=='ha'&&mode!=='single'||mode==='single'&&(copies[0]>1||shards[0]>1);
 const cannotDefault=!mode&&!manual&&(!/redis/i.test(text)||/高可用|\b(?:standby|replication|replicated)\b/i.test(text)||copies[0]>1||shards.length);
 if(modes.length>1||unknownTopology||unclearCounts||nodeConflict||cannotDefault)return {code:'HW_CACHE_MODE'};
 const architectures=[
  [/\b(?:x86(?:_64)?|amd64)\b/i,'x86_64'],[/\b(?:arm(?:64)?|aarch64)\b|鲲鹏/i,'aarch64']
 ].filter(([pattern])=>pattern.test(text)).map(([,architecture])=>architecture);
 if(architectures.length>1)return {code:'HW_DCS_SPEC_CONSTRAINT'};
 const connections=values(text,/(?<![\w.,])([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(?:连接(?:数)?|connections?\b)/gi,value=>Number(value.replaceAll(',','')));
 const bandwidth=values(text,/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:Mbit\/s|Mbps)\b/g);
 const zones=values(text,/(?:\b(?:AZ|availability zone)|可用区)\s*[:=]\s*([a-z][a-z0-9-]{0,47})\b/gi,value=>value.toLowerCase());
 if(connections.length>1||bandwidth.length>1||connections.some(value=>!validCount(value))||bandwidth.some(value=>!(value>0))||
    /\bQPS\b|\b(?:Gbit\/s|Gbps|MB\/s)\b|吞吐(?:量)?/i.test(text)||
    /(?:connections?\b|连接数)/i.test(text)&&!connections.length||/带宽|\bbandwidth\b/i.test(text)&&!bandwidth.length||zones.length>1)return {code:'HW_DCS_SPEC_CONSTRAINT'};
 const maxBandwidth=/最大带宽|峰值带宽|\b(?:max(?:imum)?|peak) bandwidth\b/i.test(text);
 return {capacityMiB:row.capacity>0?row.capacity*1024:null,topology:mode??(manual?null:'single'),version:versions[0],
  architecture:architectures[0],replicas:copies[0],shards:shards[0],minConnections:connections[0],zone:zones[0],
  bandwidth:bandwidth[0],bandwidthField:maxBandwidth?'maxBandwidthMbps':'assuredBandwidthMbps',
  assumptions:!mode&&!manual?['HW_DEFAULT_REDIS_SINGLE']:[]};
}

export function matchesDcsSpec(spec,requirements){
 const {capacityMiB,topology,version,architecture,replicas,shards,minConnections,bandwidth,bandwidthField}=requirements;
 return (!capacityMiB||spec.capacityMiB===capacityMiB)&&(!topology||spec.topology===topology)&&
  (!version||spec.versions.includes(version))&&(!architecture||spec.architecture===architecture)&&
  (!replicas||spec.replicas===replicas)&&(!shards||spec.shards===shards)&&
  (!minConnections||spec.performance.maxConnections>=minConnections)&&
  (!bandwidth||spec.performance[bandwidthField]>=bandwidth);
}
