const assets=/*ASSETS*/{};
const catalogue=/*CATALOG*/{};
const endpoint='https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'"};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
export default {async fetch(request){
 const url=new URL(request.url);
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
   const productInfos=group.map((p,i)=>({...p.evidence.request,id:String(i)}));
   const body={regionId:'eu-west-101',chargingMode:mode==='ONDEMAND'?1:0,subscriptionNum:1,siteCode:'HWC',productInfos};
   if(mode!=='ONDEMAND'){body.periodType=mode==='MONTHLY'?2:3;body.periodNum=1;}
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.huaweicloud.com'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok){pending.push(...group.map(p=>p.id));continue;}
    const result=await response.json();
    if(result.currency!=='USD'||!Array.isArray(result.productRatingResult)){pending.push(...group.map(p=>p.id));continue;}
    for(const quote of result.productRatingResult){const index=Number(quote.id),p=group[index];
     if(!p||quote.productId!==p.productId||typeof quote.officialWebsiteAmount!=='number'||!Number.isFinite(quote.officialWebsiteAmount)||quote.officialWebsiteAmount<0)continue;
     items.push({...p,rate:quote.officialWebsiteAmount,verifiedAt:new Date().toISOString(),evidence:{request:productInfos[index],inquiry:{...body,productInfos:undefined},response:quote,currency:result.currency}});
    }
    pending.push(...group.filter(p=>!items.some(item=>item.id===p.id)).map(p=>p.id));
   }catch{pending.push(...group.map(p=>p.id));}
  }
  return json({items,pending:[...new Set(pending)],...(pending.length?{error:'Some official prices could not be verified'}:{})},items.length?200:502);
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:security});
 const path=url.pathname==='/'?'/index.html':url.pathname;
 if(!Object.hasOwn(assets,path))return new Response('Not found',{status:404,headers:security});
 const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8'};
 const content=Uint8Array.from(atob(assets[path]),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:content,{headers:{...security,'Content-Type':types[path.split('.').pop()]||'application/octet-stream','Cache-Control':path.includes('/vendor/')?'public, max-age=86400':'no-cache'}});
}};
