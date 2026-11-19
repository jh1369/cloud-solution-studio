const assets=/*ASSETS*/{};
const catalogue=/*CATALOG*/{};
const offlineDownload=/*OFFLINE_DOWNLOAD*/{};
/*TCP_INSPECTOR*/
/*TCP_PUBLICATION*/
const tcpRelease=tcpReleaseStore(/*TCP_RELEASE*/{});
const endpoint='https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'"};
function requestForPlan(plan,index){
 const mode=plan.billingMode,publicNatDay=mode==='ONDEMAND'&&plan.service==='NAT Gateway'&&plan.resourceType==='hws.resource.type.natgateway';
 const suffix=publicNatDay?'day':{ONDEMAND:'hour',MONTHLY:'month',YEARLY:'year'}[mode];
 if(!suffix||plan.region!=='eu-west-101'||plan.currency!=='USD'||typeof plan.size!=='boolean'||publicNatDay&&plan.size||plan.service==='EVS'&&!plan.size||plan.unit!==(plan.size?'GB-':'')+suffix||!plan.productId||!plan.sku||!plan.cloudServiceType||!plan.resourceType)return null;
 if(mode!=='ONDEMAND'&&(plan.periodType!==(mode==='MONTHLY'?2:3)||plan.periodNum!==1))return null;
 const product={id:String(index),cloudServiceType:plan.cloudServiceType,resourceType:plan.resourceType,resourceSpecCode:plan.sku,productId:plan.productId,productNum:1};
 if(mode==='ONDEMAND'){
  if(typeof plan.usageFactor!=='string'||!/duration/i.test(plan.usageFactor))return null;
  Object.assign(product,{usageFactor:plan.usageFactor,usageMeasureId:publicNatDay?0:4,usageValue:1});
 }
 if(plan.size)Object.assign(product,{resourceSize:1,resouceSizeMeasureId:17});
 return product;
}
function resultIndex(quote,count){
 if(!quote||typeof quote!=='object'||typeof quote.id!=='string'||!/^(0|[1-9]\d*)$/.test(quote.id))return null;
 const index=Number(quote.id);return Number.isSafeInteger(index)&&index<count?index:null;
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
   const productInfos=group.map(requestForPlan);
   if(productInfos.some(product=>product===null)){pending.push(...group.map(p=>p.id));continue;}
   const body={regionId:'eu-west-101',chargingMode:mode==='ONDEMAND'?1:0,subscriptionNum:1,siteCode:'HWC',productInfos};
   if(mode!=='ONDEMAND'){body.periodType=mode==='MONTHLY'?2:3;body.periodNum=1;}
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.huaweicloud.com'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok){pending.push(...group.map(p=>p.id));continue;}
    const result=await response.json();
    if(result.currency!=='USD'||!Array.isArray(result.productRatingResult)){pending.push(...group.map(p=>p.id));continue;}
    const matches=new Map();
    for(const quote of result.productRatingResult){
     const index=resultIndex(quote,group.length);if(index===null)continue;
     const bucket=matches.get(index)||[];bucket.push(quote);matches.set(index,bucket);
    }
    for(const [index,bucket] of matches){
     // A duplicate response ID is ambiguous even when one of the prices looks valid.
     if(bucket.length!==1)continue;
     const quote=bucket[0],plan=group[index];
     if(quote.productId!==plan.productId||typeof quote.officialWebsiteAmount!=='number'||!Number.isFinite(quote.officialWebsiteAmount)||quote.officialWebsiteAmount<0||quote.officialWebsiteAmount>1e12)continue;
     const {productInfos:ignored,...inquiry}=body;
     items.push({...plan,rate:quote.officialWebsiteAmount,verifiedAt:new Date().toISOString(),evidence:{request:productInfos[index],inquiry,response:quote,currency:result.currency,
      ...(plan.unit==='day'?{billingSource:plan.evidence?.billingSource}:{})}});
    }
    pending.push(...group.filter(p=>!items.some(item=>item.id===p.id)).map(p=>p.id));
   }catch{pending.push(...group.map(p=>p.id));}
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
