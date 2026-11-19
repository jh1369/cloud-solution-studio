import {INVENTORY_FIELDS,INVENTORY_NUMBERS,readInventory,reviewInventory,confirmInventory,knownInventoryHeader} from './inventory-import.mjs';
import {inventoryBatches,mergeInventoryBatches} from './inventory-batches.mjs';
import {lookupAwsSpec} from './aws-specs.mjs';
import {escapeHTML} from './ui.mjs';
import {reasonLabel,t} from './i18n.mjs';

const loopback=['127.0.0.1','localhost','[::1]'];

export function createInventoryReview({getLanguage,onConfirm,onError}){
 const dialog=document.querySelector('#inventory-review');
 const list=dialog.querySelector('#inventory-drafts');
 const status=dialog.querySelector('#inventory-status');
 const analyze=dialog.querySelector('#inventory-analyze');
 const commit=dialog.querySelector('#inventory-apply');
 let source,review,identity;
 const cache=new Map();
 let pending=false;
 const T=(key,vars)=>t(key,getLanguage(),vars);
 function render(){
  analyze.disabled=pending||!!cache.get(identity)?.review;
  commit.disabled=pending;
  list.inert=pending;
  list.innerHTML=review.map(draft=>{
   const profile=lookupAwsSpec(draft.product,draft.specification);
   return `<article class="inventory-draft" data-draft="${draft.id}">
   <label><input type="checkbox" data-key="include" ${draft.include?'checked':''}> ${escapeHTML(draft.sheet)} · ${T('inventory.row')} ${draft.row}</label>
   <details><summary>${T('inventory.original')}</summary>
   ${draft.header?`<p>${T('inventory.headerRow',{row:draft.header.row})}</p><pre>${escapeHTML(JSON.stringify(draft.header.cells))}</pre>`:''}
   <pre>${escapeHTML(JSON.stringify(draft.cells))}</pre>
   ${draft.proposals?`<p>${T('inventory.modelSuggestions')}</p><pre>${escapeHTML(JSON.stringify(draft.proposals))}</pre>`:''}
   ${draft.fieldSources?`<pre>${escapeHTML(JSON.stringify(draft.fieldSources))}</pre>`:''}</details>
   ${profile?`<p class="row-notes">${escapeHTML([T('inventory.officialAws'),profile.type,profile.cpu?profile.cpu+' vCPU':null,
    profile.memory?profile.memory+' GiB':null,profile.architecture].filter(Boolean).join(' · '))}</p>`:''}
   ${draft.warnings.length?`<p class="row-notes">${T('inventory.verify')} ${draft.warnings.map(key=>escapeHTML(T('inventory.field.'+key))).join(', ')}</p>`:''}
   <div class="field-grid">${INVENTORY_FIELDS.map(key=>{
    const name=T('inventory.field.'+key);
    const options=key==='usage_scope'?['resource','aggregate']:key==='usage_period'?['monthly','source-period']:null;
    const control=options?`<select data-key="${key}"><option value=""></option>${options.map(value=>`<option value="${value}" ${draft[key]===value?'selected':''}>${T('inventory.option.'+value)}</option>`).join('')}</select>`
     :`<input data-key="${key}" ${key==='quantity'?'type="number" min="1" max="1000000000" step="1"':INVENTORY_NUMBERS.has(key)?'type="number" min="0" step="any"':'maxlength="1024"'} value="${escapeHTML(draft[key]??'')}">`;
    return `<label><span>${name}</span>${control}</label>`;
   }).join('')}</div>
   ${draft.needsReview.length?`<label class="check-line"><input type="checkbox" data-key="reviewed" ${draft.reviewed?'checked':''}> ${T('inventory.verifyFields')}</label>`:''}
  </article>`;
  }).join('');
 }
 list.addEventListener('input',event=>{
  const key=event.target.dataset.key,draft=review.find(row=>row.id===Number(event.target.closest('[data-draft]')?.dataset.draft));
  if(!key||!draft)return;
  draft[key]=event.target.type==='checkbox'?event.target.checked:event.target.value;
  if(key!=='reviewed')draft.edited=[...new Set([...(draft.edited??[]),key])];
 });
 async function sendBatch(rows,header){
  let failure='inventory.unavailable';
  for(let attempt=0;attempt<2;attempt++){
   try{
    const result=await fetch('/api/inventory/model',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({rows,header,retry:attempt>0}),signal:AbortSignal.timeout(125000)});
    const output=await result.json();
    if(result.ok)return mergeInventoryBatches(rows,[output]);
    failure=output.error||failure;
    if(result.status<500&&![409,422,429].includes(result.status))break;
   }catch(error){failure=error.name==='TimeoutError'?'inventory.timeout':error.message;}
  }
  throw Error(failure);
 }
 analyze.addEventListener('click',async()=>{
  if(pending||cache.get(identity)?.review)return;
  if(!loopback.includes(location.hostname)){status.textContent=T('inventory.localOnly');return;}
  pending=true;status.textContent=T('inventory.analyzing');render();
  try{
   const capability=await fetch('/api/inventory/model',{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!capability.ok||!(await capability.json()).available)throw Error('inventory.localOnly');
   const batches=inventoryBatches(source),headers=new Map();
   if(!cache.has(identity)){
    if(cache.size===4)cache.delete(cache.keys().next().value);
    cache.set(identity,{batches:new Map()});
   }
   const pendingReview=cache.get(identity);
   for(const [index,rows] of batches.entries()){
    const sheet=rows[0].sheet;
    status.textContent=T('inventory.progress',{batch:index+1,total:batches.length});
    if(!pendingReview.batches.has(index))pendingReview.batches.set(index,await sendBatch(rows,headers.get(sheet)));
    const decoded=new Map(pendingReview.batches.get(index).rows.map(row=>[row.id,row]));
    for(const row of rows)if(knownInventoryHeader(row)||decoded.get(row.id)?.kind==='header'&&
      Object.keys(decoded.get(row.id).columns??{}).length>=2)headers.set(sheet,row);
   }
   const output=mergeInventoryBatches(source,pendingReview.batches.values());
   const normalized=reviewInventory(source,output);
   pendingReview.review=structuredClone(normalized);
   normalized.forEach((draft,index)=>{
    const previous=review[index];
    draft.edited=previous.edited;draft.reviewed=previous.reviewed;
    for(const key of draft.edited??[])draft[key]=previous[key];
   });
   review=normalized;status.textContent=T('inventory.check');
  }catch(error){
   const key=error.name==='TimeoutError'?'inventory.timeout':error.message;
   status.textContent=T(key.startsWith('inventory.')?key:'inventory.unavailable');
  }finally{pending=false;render();}
 });
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
 dialog.querySelector('#inventory-cancel').addEventListener('click',()=>{if(!pending)dialog.close();});
 commit.addEventListener('click',()=>{
  if(pending)return;
  try{const rows=confirmInventory(review,{semantic:!!cache.get(identity)?.review});onConfirm(rows);dialog.close();}
  catch(error){status.textContent=error.message.startsWith('inventory.')?T(error.message):reasonLabel({reason:error.message},getLanguage());onError(error);}
 });
 return {
  read(book,XLSX,options){
   const result=readInventory(book,XLSX,options);
   if(result.standard)return result.standard;
   source=result.source;identity=JSON.stringify(source);
   const cached=cache.get(identity)?.review;
   review=cached?structuredClone(cached):reviewInventory(source,{rows:[]});
   status.textContent=T(cached?'inventory.cached':'inventory.ready');
   analyze.hidden=!loopback.includes(location.hostname);
   render();dialog.showModal();return null;
  }
 };
}
