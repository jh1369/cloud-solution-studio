import {readInventory,reviewInventory,confirmInventory} from './inventory-import.mjs';
import {escapeHTML} from './ui.mjs';
import {reasonLabel,t} from './i18n.mjs';

const loopback=['127.0.0.1','localhost','[::1]'];
const displayFields=['product','specification','region','quantity','usage','unit','capacity_gb','billing_method','usage_scope','usage_period'];
const numeric=new Set(['quantity','usage','capacity_gb']);

export function createInventoryReview({getLanguage,onConfirm,onError}){
 const dialog=document.querySelector('#inventory-review');
 const list=dialog.querySelector('#inventory-drafts');
 const status=dialog.querySelector('#inventory-status');
 const analyze=dialog.querySelector('#inventory-analyze');
 const commit=dialog.querySelector('#inventory-apply');
 let source,review,cache,identity;
 let pending=false;
 const T=key=>t(key,getLanguage());
 function render(){
  analyze.disabled=pending||cache?.identity===identity;
  commit.disabled=pending;
  list.inert=pending;
  list.innerHTML=review.map(draft=>`<article class="inventory-draft" data-draft="${draft.id}">
   <label><input type="checkbox" data-key="include" ${draft.include?'checked':''}> ${escapeHTML(draft.sheet)} · ${T('inventory.row')} ${draft.row}</label>
   <details><summary>${T('inventory.original')}</summary><pre>${escapeHTML(JSON.stringify(draft.cells))}</pre></details>
   ${draft.warnings.length?`<p class="row-notes">${T('inventory.verify')} ${draft.warnings.map(key=>escapeHTML(T('inventory.field.'+key))).join(', ')}</p>`:''}
   <div class="field-grid">${displayFields.map(key=>{
    const name=T('inventory.field.'+key);
    const options=key==='usage_scope'?['resource','aggregate']:key==='usage_period'?['monthly','source-period']:null;
    const control=options?`<select data-key="${key}"><option value=""></option>${options.map(value=>`<option value="${value}" ${draft[key]===value?'selected':''}>${T('inventory.option.'+value)}</option>`).join('')}</select>`
     :`<input data-key="${key}" ${numeric.has(key)?'type="number" min="0" step="any"':'maxlength="1024"'} value="${escapeHTML(draft[key]??'')}">`;
    return `<label><span>${name}</span>${control}</label>`;
   }).join('')}</div>
  </article>`).join('');
 }
 list.addEventListener('input',event=>{
  const key=event.target.dataset.key,draft=review.find(row=>row.id===Number(event.target.closest('[data-draft]')?.dataset.draft));
  if(!key||!draft)return;
  draft[key]=key==='include'?event.target.checked:event.target.value;
 });
 analyze.addEventListener('click',async()=>{
  if(pending)return;
  if(cache?.identity===identity){review=structuredClone(cache.review);status.textContent=T('inventory.cached');render();return;}
  if(!loopback.includes(location.hostname)){status.textContent=T('inventory.localOnly');return;}
  pending=true;status.textContent=T('inventory.analyzing');render();
  try{
   const capability=await fetch('/api/inventory/model',{cache:'no-store'});
   if(!capability.ok||!(await capability.json()).available)throw Error('inventory.localOnly');
   const result=await fetch('/api/inventory/model',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rows:source}),signal:AbortSignal.timeout(125000)});
   const output=await result.json();
   if(!result.ok)throw Error(output.error||'inventory.unavailable');
   const normalized=reviewInventory(source,output);
   cache={identity,review:structuredClone(normalized)};
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
  try{const rows=confirmInventory(review);onConfirm(rows);dialog.close();}
  catch(error){status.textContent=error.message.startsWith('inventory.')?T(error.message):reasonLabel({reason:error.message},getLanguage());onError(error);}
 });
 return {
  read(book,XLSX){
   const result=readInventory(book,XLSX);
   if(result.standard)return result.standard;
   source=result.source;identity=JSON.stringify(source);
   review=cache?.identity===identity?structuredClone(cache.review):reviewInventory(source,{rows:[]});
   status.textContent=T(cache?.identity===identity?'inventory.cached':'inventory.ready');
   analyze.hidden=!loopback.includes(location.hostname);
   render();dialog.showModal();return null;
  }
 };
}
