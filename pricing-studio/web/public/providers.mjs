// Providers share exact money arithmetic and preserve independent pricing contracts.
import {priceValidation,calculate,cost,finite,sumMoney,family} from './engine.mjs';
const pending=reason=>({valid:false,status:'Pending',reason});
const tcpUsageUnits={ECS:['hour'],RDS:['hour'],EIP:['hour'],EVS:['GiB-month','piece'],OBS:['GiB-month','GiB']};
export const TCP_QUOTE_REGION='EU-DE';
const tcpSimpleVolumes=['EVS Common I/O','EVS High I/O'];

function tcpMapping(row){
 const service=row.sourceService??family(row.product),spec=row.specification.trim().replace(/\s+/g,' ').toLowerCase(),target=row.tcpTarget?.trim();
 if(!['ECS','EVS','RDS'].includes(service))return {reasonCode:'TCP_SERVICE'};
 if(row.tcpTargetRegion&&row.tcpTargetRegion!==TCP_QUOTE_REGION)return {service,reasonCode:'TCP_REGION'};
 if(row.tcpTargetBilling&&row.tcpTargetBilling!=='ONDEMAND')return {service,reasonCode:'TCP_MODE'};
 if(service==='EVS'){
  if(/\bv2\b|iops|throughput|mbps|mib\/s|snapshot/i.test(spec+' '+(target||'')))return {service,sku:target,reasonCode:'TCP_EVS_RULE'};
  if(!tcpSimpleVolumes.includes(target)||!/^(?:gp2|standard|evs common i\/o|evs high i\/o)$/.test(spec))return {service,sku:target,reasonCode:'TCP_EVS_MAPPING'};
  return {service,sku:target,unit:'GiB-month',basis:'Explicit TCP volume class'};
 }
 if(service==='ECS'&&/^(?:m5|m6i)\.large (?:open )?linux$/.test(spec)){
  return {service,sku:target||'s3.large.4',unit:'hour',cpu:2,memory:8,basis:'2 vCPU / 8 GiB, x86 open Linux'};
 }
 if(service==='RDS'&&/^db\.m5\.large mysql single[- ]az$/.test(spec)){
  return {service,sku:target||'db.n1.large.4.mysql',unit:'hour',cpu:2,memory:8,basis:'2 vCPU / 8 GiB, MySQL single instance'};
 }
 return {service,sku:target,reasonCode:service==='ECS'?'TCP_ECS_MAPPING':'TCP_RDS_MAPPING'};
}

function tcpQuote(row,catalog,{updateState=null,now=Date.now(),priceIndex}={}){
 const mapping=tcpMapping(row);
 const review=reasonCode=>({status:'Pending',reasonCode,mapping,termPublic:null});
 if(mapping.reasonCode)return review(mapping.reasonCode);
 if(!row.unitExplicit||!(mapping.unit==='hour'?/^(?:hours?|hrs?|instance-hrs)$/i.test(row.unit):/^gib[-/]month$/i.test(row.unit)))return review(mapping.unit==='hour'?'TCP_HOUR_UNIT':'TCP_STORAGE_UNIT');
 if(!['resource','aggregate'].includes(row.scope)||!['monthly','source-period'].includes(row.period))return review('INPUT_PERIOD');
 const aggregate=row.scope==='aggregate';
 const quantity=aggregate?1:row.targetQuantity??row.quantity;
 if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>1e12)return review('QUANTITY_INVALID');
 if(row.usage==null||row.usage==='')return review('USAGE_REQUIRED');
 const verified=Date.parse(updateState?.lastVerifiedAt);
 if(updateState?.effectiveState==='STALE'||Number.isFinite(verified)&&now-verified>48*3600000)return review('TCP_EXPIRED');
 if(!catalog||updateState?.effectiveState!=='ACTIVE')return review('TCP_UNAVAILABLE');
 const candidates=(priceIndex??tcpPriceIndex(catalog)).get(tcpPriceKey(mapping.service,mapping.sku))??[];
 if(candidates.length!==1)return review(candidates.length?'TCP_AMBIGUOUS':'TCP_PRICE_MISSING');
 const item=candidates[0];
 const spec=item.specification??{};
 if(item.unit!==mapping.unit||item.availability!=='AVAILABLE'||!tcp.validatePrice(item,catalog,{updateState,now}).valid)return review('TCP_PRICE_INVALID');
 if(mapping.service!=='EVS'&&(Number(spec.vCPU)!==mapping.cpu||Number(spec['GiB RAM'])!==mapping.memory))return review('TCP_SHAPE');
 if(mapping.service==='ECS'&&(!/^(?:s2|s3)\./.test(item.sku)||spec['Operating System']!=='open Linux'))return review('TCP_SHAPE');
 if(mapping.service==='RDS'&&(!/^db\.n1\.[a-z0-9]+\.\d+\.mys(?:ql)?$/i.test(item.sku)||!/^RDS MySQL GP \d/i.test(item.productLabel)))return review('TCP_SHAPE');
 try{
  const usage=finite(row.usage,'Usage');
  const amount=cost(quantity,usage,item.amount).monthly;
  return {status:row.period==='source-period'?'Period':'Valid',mapping,item,termPublic:amount,effectiveUsage:usage,quantity:aggregate?null:quantity};
 }catch(error){return review(error.code==='AMOUNT_PRECISION'?error.code:'INPUT_INVALID');}
}

const tcpPriceKey=(service,sku)=>JSON.stringify([service,sku]);
function tcpPriceIndex(catalog){
 const index=new Map();
 for(const item of catalog?.items??[]){
  if(item.region!==TCP_QUOTE_REGION||item.billingMode!=='OPEN_ELASTIC'||!['ECS','EVS','RDS'].includes(item.service))continue;
  if(item.service==='ECS'&&item.specification?.['Operating System']!=='open Linux')continue;
  const key=tcpPriceKey(item.service,item.sku??item.productLabel);
  if(!index.has(key))index.set(key,[]);
  index.get(key).push(item);
 }
 return index;
}

export function tcpQuoteRows(rows,catalog,options={}){
 const priceIndex=tcpPriceIndex(catalog);
 return rows.map(row=>tcp.calculateQuote(row,catalog,{...options,priceIndex}));
}

export function tcpQuoteTotals(output){
 const subtotal=status=>{
  const lines=output.filter(result=>result.status===status);
  return lines.length?sumMoney(lines.map(result=>result.termPublic)):null;
 };
 const pendingCount=output.filter(result=>result.status==='Pending').length;
 return {monthly:subtotal('Valid'),period:subtotal('Period'),pendingCount,ready:output.length-pendingCount};
}

const tcp={
 id:'tcp',name:'T-Cloud Public',regions:['EU-DE','EU-NL'],currency:'EUR',
 listPrices:catalog=>catalog.provider==='tcp'?catalog.items:[],
 validatePrice(item,catalog,{updateState=null,now=Date.now()}={}){
  if(catalog.provider!=='tcp'||catalog.schemaVersion!==1)return pending('CATALOG_IDENTITY');
  const verifiedAt=Date.parse(updateState?.lastVerifiedAt);
  if(updateState?.currentVersion!==catalog.versionId||updateState?.source?.sha256!==catalog.source?.sha256||updateState?.effectiveState!=='ACTIVE'||!['UPDATED','UNCHANGED'].includes(updateState?.status)||!Number.isFinite(verifiedAt)||!Number.isFinite(now)||verifiedAt>now||now-verifiedAt>48*3600000)return pending('CATALOG_VERIFICATION_REQUIRED');
  if(!item||item.provider!=='tcp'||item.currency!=='EUR'||!['EU-DE','EU-NL'].includes(item.region))return pending('PROVIDER_REGION_OR_CURRENCY');
  if(item.verification?.status!=='AUTO_VALIDATED'||item.verification?.reasons?.length)return pending('ROW_REQUIRES_REVIEW');
  if(typeof item.amount!=='string'||!/^\d+(?:\.\d+)?$/.test(item.amount)||!Number.isFinite(Number(item.amount))||Number(item.amount)>1e12)return pending('INVALID_PRICE');
  if(!catalog.source||!/^https:\/\/(?:www\.)?t-cloud-public\.com\//.test(catalog.source.url)||!/^[a-f0-9]{64}$/.test(catalog.source.sha256)||item.evidence?.sha256!==catalog.source.sha256||item.evidence?.url!==catalog.source.url||!Array.isArray(item.evidence?.pages)||!item.evidence.pages.length||!item.evidence.pages.every(p=>Number.isInteger(p)&&p>0)||item.evidence.documentVersion!==catalog.source.documentVersion||item.evidence.revisionDate!==catalog.source.revisionDate)return pending('SOURCE_EVIDENCE');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(catalog.source.revisionDate)||!Number.isFinite(Date.parse(catalog.source.fetchedAt))||Date.parse(catalog.source.fetchedAt)>now)return pending('SOURCE_TIME');
  if(item.tier)return pending('UNIT_OR_TIER_REVIEW');
  if(['ECS','RDS'].includes(item.service)&&!/^([a-z][a-z0-9-]*)(\.[a-z0-9]+){2,}$/i.test(item.sku||''))return pending('SKU_EVIDENCE_REQUIRED');
  if(!['OPEN_ELASTIC','RESERVED','RESERVED_UPFRONT'].includes(item.billingMode))return pending('BILLING_MODE_REVIEW');
  if(item.billingMode==='OPEN_ELASTIC'){
   if(item.termMonths!=null||!Object.hasOwn(tcpUsageUnits,item.service)||!tcpUsageUnits[item.service].includes(item.unit))return pending('UNIT_OR_TIER_REVIEW');
  }else if(!['ECS','RDS'].includes(item.service)||![12,24].includes(item.termMonths)||item.unit!==(item.billingMode==='RESERVED_UPFRONT'?'term':'month'))return pending('TERM_REVIEW');
  return {valid:true,status:'SourceValidated',reason:''};
 },
 calculateQuote:tcpQuote
};
const huawei={id:'huawei',name:'Huawei Cloud',regions:['eu-west-101'],currency:'USD',listPrices:catalog=>catalog.items,validatePrice:priceValidation,calculateQuote:calculate};
export function getPricingProvider(id){
 if(id==='huawei')return huawei;if(id==='tcp')return tcp;
 throw Error('Unsupported pricing provider: '+id);
}
export function pinPricingCatalog(provider,catalog,options={}){
 const adapter=getPricingProvider(provider);
 const snapshot=structuredClone({provider,...(provider==='tcp'?{lastVerifiedAt:options.updateState?.lastVerifiedAt??null}:{}),catalogVersion:catalog.versionId||catalog.verifiedAt,source:catalog.source,prices:adapter.listPrices(catalog).map(item=>({item,validation:adapter.validatePrice(item,catalog,options)}))});
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 return freeze(snapshot);
}
