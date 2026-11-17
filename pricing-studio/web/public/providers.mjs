// Provider contracts wrap the existing Huawei engine; TCP quote arithmetic is not invented here.
import {priceValidation,calculate} from './engine.mjs';
const pending=reason=>({valid:false,status:'Pending',reason});
const tcp={
 id:'tcp',name:'T-Cloud Public',regions:['EU-DE','EU-NL'],currency:'EUR',
 listPrices:catalog=>catalog.provider==='tcp'?catalog.items:[],
 validatePrice(item,catalog,{approvedVersion=null,updateState=null,now=Date.now()}={}){
  if(catalog.provider!=='tcp'||catalog.schemaVersion!==1||approvedVersion!==catalog.versionId)return pending('CATALOG_NOT_APPROVED');
  const checkedAt=Date.parse(updateState?.lastCheckedAt);
  if(updateState?.currentVersion!==catalog.versionId||!['APPROVED','UPDATED','UNCHANGED'].includes(updateState?.status)||!Number.isFinite(checkedAt)||checkedAt>now||now-checkedAt>48*3600000)return pending('CATALOG_CHECK_OR_REVIEW_REQUIRED');
  if(!item||item.provider!=='tcp'||item.currency!=='EUR'||!['EU-DE','EU-NL'].includes(item.region))return pending('PROVIDER_REGION_OR_CURRENCY');
  if(item.verification?.status!=='AUTO_VALIDATED'||item.verification?.reasons?.length)return pending('ROW_REQUIRES_REVIEW');
  if(typeof item.amount!=='string'||!/^\d+(?:\.\d+)?$/.test(item.amount)||!Number.isFinite(Number(item.amount))||Number(item.amount)>1e12)return pending('INVALID_PRICE');
  if(!catalog.source||!/^https:\/\/(?:www\.)?t-cloud-public\.com\//.test(catalog.source.url)||!/^[a-f0-9]{64}$/.test(catalog.source.sha256)||item.evidence?.sha256!==catalog.source.sha256||item.evidence?.url!==catalog.source.url||!Array.isArray(item.evidence?.pages)||!item.evidence.pages.length||!item.evidence.pages.every(p=>Number.isInteger(p)&&p>0)||item.evidence.documentVersion!==catalog.source.documentVersion||item.evidence.revisionDate!==catalog.source.revisionDate)return pending('SOURCE_EVIDENCE');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(catalog.source.revisionDate)||!Number.isFinite(Date.parse(catalog.source.fetchedAt))||Date.parse(catalog.source.fetchedAt)>now)return pending('SOURCE_TIME');
  if(item.tier||!['hour','month','term','GiB-month','piece','GiB','IOPS-month'].includes(item.unit))return pending('UNIT_OR_TIER_REVIEW');
  if(!['OPEN_ELASTIC','RESERVED','RESERVED_UPFRONT'].includes(item.billingMode))return pending('BILLING_MODE_REVIEW');
  if(item.billingMode!=='OPEN_ELASTIC'&&(![12,24].includes(item.termMonths)||item.unit!==(item.billingMode==='RESERVED_UPFRONT'?'term':'month')))return pending('TERM_REVIEW');
  return {valid:true,status:'SourceValidated',reason:''};
 },
 calculateQuote(){throw Error('TCP quote mapping/calculation integration is not enabled in this catalog phase.');}
};
const huawei={id:'huawei',name:'Huawei Cloud',regions:['eu-west-101'],currency:'USD',listPrices:catalog=>catalog.items,validatePrice:priceValidation,calculateQuote:calculate};
export function getPricingProvider(id){
 if(id==='huawei')return huawei;if(id==='tcp')return tcp;
 throw Error('Unsupported pricing provider: '+id);
}
export function pinPricingCatalog(provider,catalog,options={}){
 const adapter=getPricingProvider(provider);
 const snapshot=structuredClone({provider,catalogVersion:catalog.versionId||catalog.verifiedAt,source:catalog.source,prices:adapter.listPrices(catalog).map(item=>({item,validation:adapter.validatePrice(item,catalog,options)}))});
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 return freeze(snapshot);
}
