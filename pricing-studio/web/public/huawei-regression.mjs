import {REGION,BILLING_MODES,billingOf,priceValidation,relatedHuaweiCharges} from './engine.mjs';
import {ENGINE_REASON_MESSAGES} from './i18n.mjs';

const services=['ECS','RDS','DCS','CSS','OTHER','UNMAPPED'];
const charges=['rdsStorage','rdsBackup','cssStorage','OTHER'];
const modes=[...Object.keys(BILLING_MODES),'OTHER'];
const stages=['initial','reviewed'];
const fields=['confirmed','conditional','pending','linked','included'];
const statusFields={Valid:'confirmed',Period:'confirmed',Conditional:'conditional',Pending:'pending',Linked:'linked',Included:'included'};
const primaryFields=['input','identified','officialProfile','hasCandidate'];
const reasonCodes=new Set([...Object.keys(ENGINE_REASON_MESSAGES),'HW_IMPORT_REVIEW','OTHER_PENDING']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000;
const total=(group,keys)=>keys.reduce((sum,key)=>sum+group[key],0);
const blankCounts=keys=>Object.fromEntries(keys.map(key=>[key,0]));
const blankBucket=(keys=[])=>({...blankCounts([...keys,...fields]),pendingReasons:{}});
const scope=(value,allowed)=>allowed.includes(value)?value:'OTHER';

function countResult(bucket,result){
 const status=Object.hasOwn(statusFields,result?.status)?statusFields[result.status]:'pending';
 bucket[status]++;
 if(status==='pending'){
  const reason=reasonCodes.has(result?.reasonCode)?result.reasonCode:'OTHER_PENDING';
  bucket.pendingReasons[reason]=(bucket.pendingReasons[reason]??0)+1;
 }
}

export function collectHuaweiRegression(rows,output,catalog,{webVersion,stage,now=Date.now()}={}){
 if(!rows.length||rows.length!==output.length)throw Error('Missing quote rows.');
 const data={
  schemaVersion:1,webVersion,region:REGION,stage,
  measuredOn:new Date(now).toISOString().slice(0,10),catalogVerifiedAt:new Date(catalog.verifiedAt).toISOString(),
  billingModes:{},services:{},charges:{}
 };
 const plansById=new Map(),plansBySku=new Set();
 for(const plan of catalog.items){
  if(plan.migrationCharge?.endsWith('Storage')||!priceValidation(plan,catalog,{now}).valid)continue;
  plansById.set(plan.id,plan);
  plansBySku.add(JSON.stringify([plan.service,plan.billingMode,plan.sku]));
 }
 for(const [index,row] of rows.entries()){
  const service=row.service==='Unmapped'||!row.service?'UNMAPPED':scope(row.service,services);
  const billing=billingOf(row),mode=scope(billing,modes);
  data.billingModes[mode]=(data.billingModes[mode]??0)+1;
  const bucket=data.services[service]??=blankBucket(primaryFields);
  bucket.input++;
  bucket.identified+=Number(service!=='UNMAPPED');
  bucket.officialProfile+=Number(!!row.awsProfile?.type);
  const selected=plansById.get(row.targetId);
  const hasCandidate=selected&&selected.service===row.service&&selected.billingMode===billing||
   row.huaweiCandidates?.some(sku=>plansBySku.has(JSON.stringify([row.service,billing,sku])));
  bucket.hasCandidate+=Number(!!hasCandidate);
  const result=output[index];
  countResult(bucket,result);
  for(const {charge,result:part} of relatedHuaweiCharges(row,result)){
   countResult(data.charges[scope(charge,charges)]??=blankBucket(),part);
  }
 }
 validateHuaweiRegression(data);
 return data;
}

function verifyFields(value,keys){
 return record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function dated(value,stamp=false){
 if(typeof value!=='string'||value.length!==(stamp?24:10))return false;
 const time=Date.parse(value);
 if(!Number.isFinite(time))return false;
 const iso=new Date(time).toISOString();
 return value===(stamp?iso:iso.slice(0,10));
}
function verifyBucket(bucket,primary,service){
 const keys=[...fields,...(primary?primaryFields:[])];
 if(!verifyFields(bucket,[...keys,'pendingReasons'])||!keys.every(key=>safeCount(bucket[key])))return false;
 const reasons=bucket.pendingReasons;
 if(!record(reasons)||Object.entries(reasons).some(([key,value])=>!reasonCodes.has(key)||!safeCount(value)||!value)||
  Object.values(reasons).reduce((sum,value)=>sum+value,0)!==bucket.pending)return false;
 if(!primary)return true;
 return bucket.input>0&&total(bucket,fields)===bucket.input&&
  bucket.identified===(service==='UNMAPPED'?0:bucket.input)&&bucket.officialProfile<=bucket.input&&bucket.hasCandidate<=bucket.input;
}

export function validateHuaweiRegression(data){
 const keys=['schemaVersion','webVersion','region','stage','measuredOn','catalogVerifiedAt','billingModes','services','charges'];
 if(!verifyFields(data,keys)||data.schemaVersion!==1||typeof data.webVersion!=='string'||
  !/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-dev)?$/.test(data.webVersion)||data.region!==REGION||!stages.includes(data.stage)||
  !dated(data.measuredOn)||!dated(data.catalogVerifiedAt,true)||
  !record(data.billingModes)||!record(data.services)||!record(data.charges)||
  Object.entries(data.billingModes).some(([key,value])=>!modes.includes(key)||!safeCount(value)||!value)||
  Object.entries(data.services).some(([key,value])=>!services.includes(key)||!verifyBucket(value,true,key))||
  Object.entries(data.charges).some(([key,value])=>!charges.includes(key)||!verifyBucket(value,false,key))){
  throw Error('Invalid anonymized regression report.');
 }
 const totals=blankCounts([...primaryFields,...fields]);
 for(const bucket of Object.values(data.services)){
  for(const key of Object.keys(totals))totals[key]+=bucket[key];
 }
 if(!totals.input||totals.input!==Object.values(data.billingModes).reduce((sum,value)=>sum+value,0)){
  throw Error('Regression report counts do not reconcile.');
 }
 return totals;
}
