import {AWS_SPEC_DATE,AWS_SPEC_SOURCES,AWS_SPEC_RECORDS} from './aws-spec-data.mjs';

const operationSource='https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/billing-info-fields.html';
const serviceNames={EC2:'ECS',RDS:'RDS',ElastiCache:'DCS',OpenSearch:'CSS'};
const size='(?:\\d*xlarge|metal(?:-\\d+xl)?|large|medium|small|micro|nano)';
const instanceType=(prefix,family,suffix='')=>new RegExp('\\b'+prefix+family+'\\.'+size+suffix+'\\b(?!\\.[a-z0-9])','gi');
const programs=[
 ['RDS',/^(?:amazon\s*)?(?:rds|relational database service)$/i,instanceType('db\\.','[a-z][a-z0-9]*','(?:\\.tpc[12]\\.mem\\d+x)?')],
 ['ElastiCache',/^(?:amazon\s*)?elasticache$/i,instanceType('cache\\.','[a-z][a-z0-9]*')],
 ['OpenSearch',/^(?:amazones|(?:amazon\s*)?(?:opensearch(?: service)?|elasticsearch(?: service)?))$/i,instanceType('','[a-z][a-z0-9]*','(?:\\.search)?')],
 ['EC2',/^(?:amazon\s*)?(?:ec2|elastic compute cloud)$/i,instanceType('','[a-z][0-9][a-z0-9]*')]
];
const source=key=>key?{url:AWS_SPEC_SOURCES[key][0],sha256:AWS_SPEC_SOURCES[key][1],retrievedAt:AWS_SPEC_DATE}:null;
const profiles=new Map(AWS_SPEC_RECORDS.map(([kind,type,cpu,memory,architecture,category,dimensions,arch,typeSource,cacheBytes])=>{
 const record=Object.freeze({kind,type,service:serviceNames[kind],cpu,memory,architecture,category,
  family:type.split('.')[kind==='RDS'||kind==='ElastiCache'?1:0],
  ...(cacheBytes?{cacheBytes}:{}),evidence:{specification:source(dimensions),architecture:source(arch),
   ...(typeSource?{nodeType:source(typeSource)}:{}),...(cacheBytes?{cacheLimit:source('cache_params'),cacheReserve:source('cache_reserve')}: {})}});
 return [kind+'|'+type,record];
}));

export function awsSourceService(product){
 return programs.find(([,pattern])=>pattern.test(String(product).trim()))?.[0]??null;
}

function normalizeAwsTypeText(kind,description){
 const text=String(description??'').normalize('NFKC');
 if(kind!=='RDS')return text;
 return text.replace(/\b((?:InstanceUsage|Multi-AZUsage):)(?=[a-z][a-z\d]*\.(?:\d*xlarge|large|medium|small|micro)\b)/gi,'$1db.');
}

export function hasAwsSourceType(product,description){
 const kind=awsSourceService(product);
 const pattern=programs.find(([service])=>service===kind)?.[2];
 return !!pattern&&new RegExp(pattern.source,'i').test(normalizeAwsTypeText(kind,description));
}

export function lookupAwsSpec(product,description){
 const known=awsSourceService(product);
 const text=normalizeAwsTypeText(known,description);
 const explicit=programs.filter(([kind,,pattern])=>known?kind===known:kind!=='EC2'&&
   (kind!=='OpenSearch'||/\.search\b/i.test(text))&&new RegExp(pattern.source,'i').test(text));
 if(!explicit.length&&!known&&/\b(?:AWS|EC2)\b/i.test(String(product)+' '+text))explicit.push(programs[3]);
 const found=new Map();
 for(const [kind,,pattern] of explicit)for(const match of text.matchAll(pattern)){
  const value=match[0].toLowerCase();
  const type=kind==='OpenSearch'&&!value.endsWith('.search')?value+'.search':value;
  const profile=profiles.get(kind+'|'+type);
  found.set(kind+'|'+type,profile??null);
 }
 return found.size===1?found.values().next().value:null;
}

const hourly={
 EC2:/(?:^|[-\s])(?:BoxUsage|SpotUsage):[\w.]+\b/i,
 RDS:/(?:^|[-\s])(?:InstanceUsage|Multi-AZUsage):[\w.]+\b/i,
 ElastiCache:/(?:^|[-\s])NodeUsage:[\w.]+\b/i,
 OpenSearch:/(?:^|[-\s])(?:ESInstance|InstanceUsage):[\w.]+\b/i
};
export function awsUsageSemantics(kind,text){
 if(!kind||!Object.hasOwn(hourly,kind)||!hourly[kind].test(text))return null;
 const basis=kind==='ElastiCache'?'cache-node-hours':kind==='OpenSearch'?'search-node-hours':
  kind==='RDS'&&/\bMulti-AZUsage:/i.test(text)?'database-multi-az-hours':'instance-hours';
 return {scope:'aggregate',period:'source-period',unit:'hour',basis,billing:/\bSpotUsage:/i.test(text)?'spot':null};
}

export function awsOperatingSystem(description){
 const text=String(description??'');
 const operations=[...new Set(Array.from(text.matchAll(/\bRunInstances(?::[a-z\d]+)?\b/gi),m=>m[0].toLowerCase()))];
 if(operations.length>1||/\b(?:rhel|suse|sql server|license|byol|dedicated)\b/i.test(text))return null;
 const labels=[/\b(?:linux|ubuntu|debian|centos)\b/i.test(text)?'Linux':null,/\bWindows\b/i.test(text)?'Windows':null].filter(Boolean);
 if(labels.length>1)return null;
 const operation=operations[0];
 if(operation){
  const value=operation==='runinstances'?'Linux':operation==='runinstances:0002'?'Windows':null;
  if(!value||labels.length&&labels[0]!==value)return null;
  return {value,origin:'official-aws',url:operationSource};
 }
 return labels.length?{value:labels[0],origin:'excel'}:null;
}

// A batch only receives the exact known records mentioned by its own source cells.
export function awsBatchKnowledge(rows){
 const matches=new Map();
 for(const row of rows){
  const strings=row.cells.filter(value=>typeof value==='string');
  const product=strings.find(value=>awsSourceService(value))??'';
  const profile=lookupAwsSpec(product,strings.join(' '));
  if(!profile)continue;
  matches.set(profile.type,[profile.type,profile.kind,profile.cpu,profile.memory,profile.architecture]);
 }
 return [...matches.values()];
}
