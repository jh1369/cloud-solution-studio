const assets=/*ASSETS*/{};
const catalogue=/*CATALOG*/{};
const offlineDownload=/*OFFLINE_DOWNLOAD*/{};
const huaweiRates=/*HUAWEI_RATES*/{};
/*TCP_INSPECTOR*/
/*TCP_PUBLICATION*/
const tcpRelease=tcpReleaseStore(/*TCP_RELEASE*/{});
const endpoint='https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'"};
function requestsForPlan(plan){
 const mode=plan.billingMode,publicNatDay=mode==='ONDEMAND'&&plan.service==='NAT Gateway'&&plan.resourceType==='hws.resource.type.natgateway';
 const product={cloudServiceType:plan.cloudServiceType,resourceType:plan.resourceType,resourceSpecCode:plan.sku,productId:plan.productId,productNum:1};
 if(plan.service==='EIP')return huaweiRates.eipPriceSamples(plan)?.map(sample=>({...product,...sample}))??[];
 const suffix=publicNatDay?'day':{ONDEMAND:'hour',MONTHLY:'month',YEARLY:'year'}[mode];
 if(!suffix||plan.region!=='eu-west-101'||plan.currency!=='USD'||typeof plan.size!=='boolean'||publicNatDay&&plan.size||plan.service==='EVS'&&!plan.size||plan.unit!==(plan.size?'GB-':'')+suffix||!plan.productId||!plan.sku||!plan.cloudServiceType||!plan.resourceType)return [];
 if(mode!=='ONDEMAND'&&(plan.periodType!==(mode==='MONTHLY'?2:3)||plan.periodNum!==1))return [];
 if(mode==='ONDEMAND'){
  if(typeof plan.usageFactor!=='string'||!/duration/i.test(plan.usageFactor))return [];
  Object.assign(product,{usageFactor:plan.usageFactor,usageMeasureId:publicNatDay?0:4,usageValue:1});
 }
 if(plan.size)Object.assign(product,{resourceSize:1,resouceSizeMeasureId:17});
 return ['rdsStorage','cssStorage'].includes(plan.migrationCharge)?[product,{...product,resourceSize:100}]:[product];
}
async function inquirePriceBatch(inquiry,productInfos){
 const matches=new Map(),expected=new Map(productInfos.map(product=>[product.id,product.productId]));
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.huaweicloud.com'},
   body:JSON.stringify({...inquiry,productInfos}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return matches;
  const result=await response.json();
  if(result.currency!=='USD'||!Array.isArray(result.productRatingResult))return matches;
  for(const quote of result.productRatingResult){
   if(!expected.has(quote?.id))continue;
   // A duplicate response ID makes its price ambiguous even when one record is valid.
   if(matches.has(quote.id)){matches.set(quote.id,null);continue;}
   const valid=quote.productId===expected.get(quote.id)&&typeof quote.officialWebsiteAmount==='number'&&
    Number.isFinite(quote.officialWebsiteAmount)&&quote.officialWebsiteAmount>=0&&quote.officialWebsiteAmount<=1e12;
   matches.set(quote.id,valid?quote:null);
  }
 }catch{return new Map();}
 return matches;
}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/catalog/tcp/status'||url.pathname==='/api/catalog/tcp/catalog'){
  if(request.method!=='GET')return json({error:'GET required'},405);
  const bucket=env?.TCP_CATALOG_BUCKET;
  const {state,catalog}=await readTCPPublication(bucket??tcpRelease);
  const onlineState={...state,checkScope:!bucket&&tcpRelease?'VERIFIED_RELEASE_SNAPSHOT':'PUBLISHED_OBJECT_STORAGE'};
  return json(url.pathname.endsWith('/status')?onlineState:{state:onlineState,catalog});
 }
 if(url.pathname==='/api/catalog/tcp/check'){
  if(request.method!=='POST')return json({error:'POST required'},405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
  if(Number(request.headers.get('Content-Length'))>4096||(await request.text()).length>4096)return json({error:'Request too large'},413);
  const state=await inspectTCPSource(undefined,{loadStatus:async()=>(await readTCPPublication(env?.TCP_CATALOG_BUCKET??tcpRelease)).state});
  return json({...state,catalog:state.effectiveState==='ACTIVE'?state.catalog:null},state.status==='CHECK_FAILED'?502:200);
 }
 if(url.pathname==='/api/rates'){
  if(request.method!=='POST')return json({error:'POST required'},405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
  if(Number(request.headers.get('Content-Length'))>4096)return json({error:'Request too large'},413);
  let ids;try{const text=await request.text();if(text.length>4096)return json({error:'Request too large'},413);ids=JSON.parse(text).ids;}catch{return json({error:'Invalid JSON'},400);}
  if(!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(v=>typeof v!=='string'))return json({error:'1 to 10 product IDs required'},400);
  const products=[...new Set(ids)].map(id=>catalogue.items.find(p=>p.id===id));
  if(products.some(p=>!p))return json({error:'Unknown product ID'},400);
  const items=[],pending=[];
  for(const mode of ['ONDEMAND','MONTHLY','YEARLY']){
   const group=products.filter(p=>(p.billingMode||'ONDEMAND')===mode);if(!group.length)continue;
   let id=0;
   const byPlan=group.map(plan=>requestsForPlan(plan).map(product=>({...product,id:String(id++)})));
   const requests=byPlan.flat(),inquiry={regionId:'eu-west-101',chargingMode:mode==='ONDEMAND'?1:0,subscriptionNum:1,siteCode:'HWC'};
   if(mode!=='ONDEMAND'){inquiry.periodType=mode==='MONTHLY'?2:3;inquiry.periodNum=1;}
   const batches=[];
   for(let start=0;start<requests.length;start+=10)batches.push(inquirePriceBatch(inquiry,requests.slice(start,start+10)));
   const matches=new Map((await Promise.all(batches)).flatMap(results=>[...results]));
   for(const [index,plan] of group.entries()){
    const verified=byPlan[index].map(request=>({request,response:matches.get(request.id)}));
    if(!verified.length||verified.some(entry=>!entry.response)){pending.push(plan.id);continue;}
    const [first,...probes]=verified,billingSource=plan.evidence?.billingSource;
    const next={...plan,rate:first.response.officialWebsiteAmount,verifiedAt:new Date().toISOString(),evidence:{...first,inquiry,currency:'USD',
     ...(billingSource?{billingSource}:{}),...(probes.length?{probes}:{})}};
    if((plan.service==='EIP'||['rdsStorage','cssStorage'].includes(plan.migrationCharge))&&
       !huaweiRates.priceValidation(next,catalogue).valid)pending.push(plan.id);
    else items.push(next);
   }
  }
  return json({items,pending:[...new Set(pending)],...(pending.length?{error:'Some official prices could not be verified'}:{})},items.length?200:502);
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:security});
 const path=url.pathname==='/'?'/index.html':url.pathname;
 if(!Object.hasOwn(assets,path))return new Response('Not found',{status:404,headers:security});
 const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',zip:'application/zip'};
 const content=Uint8Array.from(atob(assets[path]),c=>c.charCodeAt(0));
 const download=path===offlineDownload.path;
 return new Response(request.method==='HEAD'?null:content,{headers:{...security,'Content-Type':types[path.split('.').pop()]||'application/octet-stream','Cache-Control':download?'no-store':path.includes('/vendor/')?'public, max-age=86400':'no-cache',...(download?{'Content-Disposition':`attachment; filename="${offlineDownload.filename}"`,'Content-Length':String(content.byteLength)}:{})}});
}};
