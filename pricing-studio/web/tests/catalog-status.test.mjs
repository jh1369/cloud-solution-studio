import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverTCPDocument,inspectTCPSource,TCP_PRICE_PAGE} from '../public/catalog_status.mjs';
import {handleLocalCatalogRequest} from '../scripts/local_catalog_api.mjs';
const path='https://www.t-cloud-public.com/current-service-description.pdf';
const pdf=new TextEncoder().encode('%PDF-1.4 FICTIONAL ONLY');
const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pdf))].map(v=>v.toString(16).padStart(2,'0')).join('');
test('TCP source detection discovers current URL without a hashed path',()=>{
 assert.equal(discoverTCPDocument(`<a href="${path}">PDF</a><a href="${path}">Again</a>`),path);
 for(const html of ['no pdf',`<a href="${path}">A</a><a href="/other-service-description.pdf">B</a>`,`<a href="https://evil.example/service-description.pdf">X</a>`])assert.throws(()=>discoverTCPDocument(html));
});
test('Hosted checks detect content changes but never promote catalog versions',async()=>{
 const fetcher=async url=>url===TCP_PRICE_PAGE?new Response(`<a href="${path}">PDF</a>`):new Response(pdf);
 const state={provider:'tcp',source:{sha256:sha},currentVersion:null,candidateVersion:'fictional-pending'};
 const unchanged=await inspectTCPSource(state,{fetcher});assert.equal(unchanged.status,'PENDING_REVIEW');assert.equal(unchanged.currentVersion,null);
 const changed=await inspectTCPSource({...state,source:{sha256:'b'.repeat(64)}},{fetcher});assert.equal(changed.status,'DOCUMENT_CHANGED_REVIEW_REQUIRED');assert.equal(changed.currentVersion,null);assert.equal(changed.documentRevision,null);
});
test('Invalid PDF, off-domain redirects and upstream failure preserve formal version',async()=>{
 for(const fetcher of [async()=>new Response('unavailable',{status:503}),async url=>url===TCP_PRICE_PAGE?new Response(`<a href="${path}">P</a>`):new Response('not a PDF'),async()=>new Response(null,{status:302,headers:{Location:'https://evil.example/x.pdf'}})]){
  const result=await inspectTCPSource({provider:'tcp',currentVersion:'existing-approved'},{fetcher});assert.equal(result.status,'CHECK_FAILED');assert.equal(result.currentVersion,'existing-approved');
 }
});
test('Local updater HTTP wrapper accepts fixed commands and blocks cross-origin calls',async()=>{
 const commands=[],run=async cmd=>{commands.push(cmd);return {provider:'tcp',status:'PENDING_REVIEW',currentVersion:null};};
 const response=await handleLocalCatalogRequest(new Request('http://local/api/catalog/tcp/check',{method:'POST',body:'{"url":"https://evil.example"}'}),{run});
 assert.equal(response.status,200);assert.deepEqual(commands,['check']);assert.equal((await response.json()).checkScope,'LOCAL_PERSISTENT_UPDATER');
 assert.equal((await handleLocalCatalogRequest(new Request('http://local/api/catalog/tcp/check',{method:'POST',headers:{Origin:'https://evil.example'}}),{run})).status,403);
 assert.equal(await handleLocalCatalogRequest(new Request('http://local/api/catalog/alibaba/check'),{run}),null);
});
