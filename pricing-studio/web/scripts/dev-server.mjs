// Local HTTP adapter for the same Worker used in production; no separate engine.
import http from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';
import {handleLocalCatalogRequest} from './local_catalog_api.mjs';
import {createLocalInventoryEndpoint} from './local_inventory_api.mjs';

const port=Number(process.env.PORT||4173);
const modelEnabled=!!process.env.INVENTORY_MODEL_PORT;
const inventoryEndpoint=createLocalInventoryEndpoint({
 port:process.env.INVENTORY_MODEL_PORT,model:process.env.INVENTORY_MODEL,token:process.env.INVENTORY_MODEL_TOKEN
});
const server=http.createServer(async(incoming,outgoing)=>{
 try{
  const init={method:incoming.method,headers:incoming.headers};
  if(!['GET','HEAD'].includes(incoming.method))Object.assign(init,{body:Readable.toWeb(incoming),duplex:'half'});
  // Preserve the browser origin when the managed preview terminates HTTPS.
  const protocol=incoming.headers['x-forwarded-proto']==='https'?'https':'http';
  const host=incoming.headers['x-forwarded-host']||incoming.headers.host;
  const request=new Request(`${protocol}://${host}${incoming.url}`,init);
  const localModelRequest=modelEnabled&&incoming.headers.host===`127.0.0.1:${port}`&&!incoming.headers['x-forwarded-host']&&!incoming.headers['x-forwarded-proto'];
  const response=(localModelRequest&&await inventoryEndpoint(request))||await handleLocalCatalogRequest(request)||await worker.fetch(request);
  outgoing.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)Readable.fromWeb(response.body).pipe(outgoing);else outgoing.end();
 }catch{
  outgoing.writeHead(500,{'Content-Type':'text/plain'});outgoing.end('Local Worker request failed');
 }
});
server.listen(port,modelEnabled?'127.0.0.1':'0.0.0.0',()=>console.log(`Local Pricing Studio Worker listening on ${port}`));
