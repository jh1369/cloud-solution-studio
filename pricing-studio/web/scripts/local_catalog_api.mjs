import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
let running;
export async function handleLocalCatalogRequest(request,{run=async command=>{
 const result=await execute(process.env.PRICING_CATALOG_PYTHON||'python3.12',['scripts/catalog_update.py',command],{cwd:root,timeout:180000,maxBuffer:1024*1024});
 return JSON.parse(result.stdout);
}}={}){
 const url=new URL(request.url);if(!/^\/api\/catalog\/tcp\/(?:status|check)$/.test(url.pathname))return null;
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const check=url.pathname.endsWith('/check');
 if(request.method!==(check?'POST':'GET'))return json({error:'Method not allowed'},405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
 if(check&&(await request.text()).length>4096)return json({error:'Request too large'},413);
 try{
  if(!check)return json({...await run('status'),checkScope:'LOCAL_PERSISTENT_UPDATER'});
  if(!running)running=run('check').finally(()=>{running=undefined;});
  return json({...await running,checkScope:'LOCAL_PERSISTENT_UPDATER'});
 }catch{
  try{return json({...await run('status'),provider:'tcp',status:'CHECK_FAILED',checkScope:'LOCAL_PERSISTENT_UPDATER',reasons:['LOCAL_UPDATER_FAILED']},502);}
  catch{return json({provider:'tcp',status:'CHECK_FAILED',reasons:['LOCAL_UPDATER_FAILED']},502);}
 }
}
