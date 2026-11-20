// Local HTTP adapter for the same Worker used in production; no separate engine.
import {readFileSync} from 'node:fs';
import http from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';
import {handleLocalCatalogRequest} from './local_catalog_api.mjs';
import {createLocalInventoryEndpoint} from './local_inventory_api.mjs';

import {createHuaweiMatchEndpoint} from './huawei_match_model_api.mjs';

const port=Number(process.env.PORT||4173);
const modelEnabled=!!(process.env.INVENTORY_MODEL_PORT||process.env.HUAWEI_MATCH_MODEL_PORT);
const inventoryEndpoint=createLocalInventoryEndpoint({
 port:process.env.INVENTORY_MODEL_PORT,model:process.env.INVENTORY_MODEL,token:process.env.INVENTORY_MODEL_TOKEN
});
const matchEndpoint=createHuaweiMatchEndpoint({
 catalog:JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url))),
 port:process.env.HUAWEI_MATCH_MODEL_PORT||process.env.INVENTORY_MODEL_PORT,
 model:process.env.HUAWEI_MATCH_MODEL||process.env.INVENTORY_MODEL,
 token:process.env.HUAWEI_MATCH_MODEL_TOKEN||process.env.INVENTORY_MODEL_TOKEN
});
const server=http.createServer(async(incoming,outgoing)=>{
 try{
  const abort=new AbortController();
  outgoing.on('close',()=>abort.abort());
  const init={method:incoming.method,headers:incoming.headers,signal:abort.signal};
  if(!['GET','HEAD'].includes(incoming.method))Object.assign(init,{body:Readable.toWeb(incoming),duplex:'half'});
  // Preserve the browser origin when the managed preview terminates HTTPS.
  const protocol=incoming.headers['x-forwarded-proto']==='https'?'https':'http';
  const host=incoming.headers['x-forwarded-host']||incoming.headers.host;
  const request=new Request(`${protocol}://${host}${incoming.url}`,init);
  const localModelRequest=modelEnabled&&incoming.headers.host===`127.0.0.1:${port}`&&!incoming.headers['x-forwarded-host']&&!incoming.headers['x-forwarded-proto'];
  const response=(localModelRequest&&(await matchEndpoint(request)||await inventoryEndpoint(request)))||await handleLocalCatalogRequest(request)||await worker.fetch(request);
  if(abort.signal.aborted)return;
  outgoing.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)Readable.fromWeb(response.body).pipe(outgoing);else outgoing.end();
 }catch{
  if(outgoing.destroyed)return;
  outgoing.writeHead(500,{'Content-Type':'text/plain'});outgoing.end('Local Worker request failed');
 }
});
server.listen(port,modelEnabled?'127.0.0.1':'0.0.0.0',()=>console.log(`Local Pricing Studio Worker listening on ${port}`));
