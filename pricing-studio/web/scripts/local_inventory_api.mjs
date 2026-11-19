import {awsBatchKnowledge} from '../public/aws-specs.mjs';
import {decodeInventoryBatch,inventoryModelSchema,validateModelBatch} from '../public/inventory-batches.mjs';
import {completeInventoryHeader} from '../public/inventory-import.mjs';
import {createLocalInventoryModel,readBounded} from './inventory_model_adapter.mjs';

const path='/api/inventory/model';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const loopback=host=>['127.0.0.1','localhost','[::1]'].includes(host);

export function createLocalInventoryEndpoint({modelAdapter,timeout=120000,...local}={}){
 const analyze=modelAdapter??createLocalInventoryModel(local);
 let busy=false;
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!==path)return null;
  if(!analyze||!loopback(url.hostname))return response({available:false},request.method==='GET'?200:404);
  if(request.method==='GET')return response({available:true});
  if(request.method!=='POST')return response({error:'inventory.method'},405);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||
     request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response({error:'inventory.origin'},403);
  if(busy)return response({error:'inventory.busy'},409);
  busy=true;
  try{
   let input;
   try{
    input=JSON.parse(await readBounded(request,65536));
    if(Object.keys(input).some(key=>!['rows','header','retry'].includes(key)))throw Error('inventory.invalid');
    validateModelBatch(input.rows,input.header);
   }catch{return response({error:'inventory.limit'},400);}
   const timeoutSignal=AbortSignal.timeout(timeout),signal=AbortSignal.any([timeoutSignal,request.signal]);
   try{
    const {rows,header,retry}=input;
    const classifyOnly=completeInventoryHeader(header??rows[0]);
    const promptRow=({id,cells})=>({id,cells});
    const output=await analyze({rows:rows.map(promptRow),header:header?promptRow(header):null,
     schema:inventoryModelSchema(rows,{classifyOnly}),knowledge:awsBatchKnowledge(rows),signal,retry:retry===true,classifyOnly});
    signal.throwIfAborted();
    return response(decodeInventoryBatch(rows,output,{classifyOnly}));
   }catch(error){
    if(signal.aborted)return response({error:'inventory.timeout'},504);
    if(error.message==='inventory.modelLength')return response({error:'inventory.modelLength'},422);
    if(error.message==='inventory.unavailable')return response({error:'inventory.unavailable'},502);
    return response({error:'inventory.modelSyntax'},502);
   }
  }finally{busy=false;}
 };
}
