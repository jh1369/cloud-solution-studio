import {buildWorkbook} from './excel.mjs';
import {normalizeRows,parseText,recommend,calculate,parseBillPages,switchBilling,priceValidation} from './engine.mjs';
import {t,billingLabel,dateLabel,translateMessage,readLanguage,saveLanguage,applyTranslations,serviceLabel} from './i18n.mjs';
import {escapeHTML,icon,money,emptyResources,resourceHTML,summaryModel,breakdownHTML,catalogueHTML} from './ui.mjs';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const storage=(()=>{try{return window.localStorage;}catch{return undefined;}})();
const offlineBundle=window.PRICING_STUDIO_OFFLINE||null;
let language=readLanguage(storage);
let catalog={items:[],ttlDays:7},rows=[],page=0,activeView='studio',mappingSelected=false,busy=false,catalogState='loading';
let tcpStatus={provider:'tcp',status:'NEVER_CHECKED'},tcpLoaded=false,tcpBusy=false;
const T=(key,vars)=>t(key,language,vars);
const E=escapeHTML;

function toast(message,error=false){
 const box=$('#message');box.textContent=message;box.classList.toggle('error',error);box.hidden=false;
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>{box.hidden=true;},error?9000:5500);
}
function report(error,fallback='error.file'){toast(translateMessage(error?.message||T(fallback),language),true);}
function settings(){
 const hours=Number($('#hours').value),discount=Number($('#discount').value)/100;
 if(!Number.isFinite(hours)||hours<=0||hours>744)throw Error(T('error.hours'));
 if(!Number.isFinite(discount)||discount<0||discount>1)throw Error(T('error.discount'));
 return {hours,discount};
}
function results(){return rows.map(row=>calculate(row,catalog,settings()));}
function refreshCrumb(){
 $('#crumb').textContent=T(mappingSelected?'nav.mapping':({studio:'nav.workspace',catalog:'nav.catalog',guide:'nav.guide'})[activeView]);
}
function view(next){
 activeView=next;mappingSelected=false;
 for(const name of ['studio','catalog','guide'])$('#'+name+'-view').hidden=name!==next;
 $$('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.view===next));
 refreshCrumb();if(next==='catalog'){renderCatalog();loadTCPStatus();}window.scrollTo({top:0});
}
function openMapping(){
 view('studio');mappingSelected=true;refreshCrumb();$$('.nav-item').forEach(button=>button.classList.toggle('active',button.id==='mapping-nav'));
 $('#mapping-section').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function renderConnection(){
 const connection=$('.connection');connection.classList.toggle('expired',catalogState==='expired');connection.classList.toggle('unavailable',catalogState==='unavailable');
 $('#connection-label').textContent=T(catalogState==='loading'?'top.loading':catalogState==='expired'?'top.expired':catalogState==='unavailable'?'top.unavailable':offlineBundle?'offline.snapshot':'top.connected');
}
function renderMetrics(output=[]){
 $('#metric-resources').textContent=rows.length.toLocaleString(language==='en'?'en-US':'zh-CN');
 const ready=output.filter(result=>result.status==='Valid'||result.status==='Period').length;
 $('#metric-confirmed').innerHTML=`${ready} <em>/ ${rows.length}</em>`;
 const count=catalog.items.filter(plan=>priceValidation(plan,catalog).valid).length;
 $('#metric-plans').textContent=catalog.items.length?count.toLocaleString(language==='en'?'en-US':'zh-CN'):'—';
}
function renderSummary(output){
 const summary=summaryModel(rows,output,language);
 $('#monthly-label').textContent=summary.monthlyLabel;
 $('#monthly-money').innerHTML=E(money(summary.monthly))+`<span> ${T(summary.onlyPeriod?'term.period':'term.monthly')}</span>`;
 $('#annual-label').textContent=summary.annualLabel;$('#annual-money').textContent=money(summary.annual);
 $('#scenario-label').textContent=summary.scenarioLabel;$('#scenario-money').textContent=money(summary.scenario);
 $('#upfront-row').hidden=!summary.hasPrepaid;$('#upfront-money').textContent=money(summary.upfront);
 $('#quote-status').textContent=summary.status;$('#quote-status').className='badge '+summary.statusClass;
 $('#coverage').textContent=summary.coverage;$('#quote-note').textContent=summary.note;
 $('#breakdown').innerHTML=breakdownHTML(summary,language);renderMetrics(output);
}
function render(){
 let output;
 try{output=results();renderSummary(output);}catch(error){
  $('#monthly-money').textContent='—';$('#annual-money').textContent='—';$('#scenario-money').textContent='—';
  $('#upfront-row').hidden=true;$('#upfront-money').textContent='—';$('#coverage').textContent='—';$('#breakdown').textContent='—';
  $('#quote-status').textContent=T('status.invalid');$('#quote-status').className='badge pending';
  $('#quote-note').textContent=translateMessage(error.message,language);
  $('#export').disabled=true;$('#quote-export').disabled=true;report(error);return;
 }
 page=Math.min(page,Math.max(0,Math.ceil(rows.length/10)-1));
 $('#resource-count').textContent=rows.length;
 $('#export').disabled=!rows.length;$('#quote-export').disabled=!rows.length;
 $('#confirm-all').disabled=!rows.some(row=>row.targetId&&!row.accepted);
 $('#refresh-prices').disabled=!!offlineBundle||busy||!rows.some(row=>row.targetId);
 $('#parse').disabled=busy;$('#file').disabled=busy;
 $('#resources').innerHTML=rows.length?resourceHTML(rows,output,catalog,language,page):emptyResources(language);
 $('#resource-pagination').hidden=rows.length<=10;
 $('#page-info').textContent=T('pagination.info',{start:page*10+1,end:Math.min(page*10+10,rows.length),total:rows.length});
 $('#prev-page').disabled=page===0;$('#next-page').disabled=(page+1)*10>=rows.length;
 renderConnection();
}
function renderCatalogueMetadata(){
 $('#catalog-summary').textContent=T('catalog.summary',{plans:catalog.items.length,services:new Set(catalog.items.map(plan=>plan.service)).size});
 $('#catalog-date').textContent=catalog.verifiedAt?T('catalog.date',{date:dateLabel(catalog.verifiedAt,language)}):T('error.catalog');
 const selected=$('#catalog-service').value;
 $('#catalog-service').innerHTML=`<option value="">${T('catalog.allServices')}</option>`+[...new Set(catalog.items.map(plan=>plan.service))].sort().map(service=>`<option value="${E(service)}">${E(serviceLabel(service,language))}</option>`).join('');
 $('#catalog-service').value=selected;
}
function renderCatalog(){
 renderCatalogueMetadata();
 const query=$('#catalog-search').value.trim().toLowerCase(),service=$('#catalog-service').value,mode=$('#catalog-mode').value;
 const matching=catalog.items.filter(plan=>(!service||plan.service===service)&&(!mode||plan.billingMode===mode)&&(!query||JSON.stringify([plan.service,plan.sku,plan.productId,plan.engine,plan.description]).toLowerCase().includes(query)));
 $('#catalog-rows').innerHTML=catalogueHTML(matching,catalog,language);
 $('#catalog-foot').textContent=T('catalog.foot',{count:matching.length,limit:matching.length>120?T('catalog.limit'):''});
 renderTCPStatus();
}
function renderTCPStatus(){
 const known=['NEVER_CHECKED','PENDING_REVIEW','UNCHANGED','UPDATED','APPROVED','CHECK_FAILED','DOCUMENT_CHANGED_REVIEW_REQUIRED'];
 $('#tcp-current').textContent=tcpStatus.currentVersion||T('tcp.noApproved');
 $('#tcp-candidate').textContent=tcpStatus.candidateVersion||T('tcp.noCandidate');
 $('#tcp-checked').textContent=tcpStatus.lastCheckedAt?dateLabel(tcpStatus.lastCheckedAt,language):'—';
 $('#tcp-state').textContent=T('tcp.state.'+(known.includes(tcpStatus.status)?tcpStatus.status:'PENDING_REVIEW'));
 const services=Object.values(tcpStatus.coverage?.services||{});
 $('#tcp-coverage').textContent=T('tcp.coverage',{total:services.reduce((n,s)=>n+s.total,0),validated:services.reduce((n,s)=>n+s.AUTO_VALIDATED,0)});
 $('#tcp-scope').textContent=T(offlineBundle?'tcp.offline':tcpStatus.checkScope==='LOCAL_PERSISTENT_UPDATER'?'tcp.local':'tcp.remote');
 $('#tcp-check').disabled=!!offlineBundle||tcpBusy;
}
async function loadTCPStatus(){
 if(tcpLoaded)return;
 try{
  if(offlineBundle)tcpStatus=offlineBundle.tcpStatus||tcpStatus;
  else{const response=await fetch('/api/catalog/tcp/status');if(!response.ok)throw Error();tcpStatus=await response.json();}
  tcpLoaded=true;
 }catch{tcpStatus={...tcpStatus,status:'CHECK_FAILED'};}
 renderTCPStatus();
}
$('#tcp-check').addEventListener('click',async()=>{
 if(offlineBundle||tcpBusy)return;tcpBusy=true;renderTCPStatus();toast(T('tcp.checking'));
 try{
  const response=await fetch('/api/catalog/tcp/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const state=await response.json();tcpStatus=state?.provider==='tcp'?{...tcpStatus,...state}:{...tcpStatus,status:'CHECK_FAILED'};
 }catch{tcpStatus={...tcpStatus,status:'CHECK_FAILED'};}
 finally{tcpBusy=false;renderTCPStatus();}
});
function localize(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=T('app.title');
 applyTranslations(document,language);refreshCrumb();
 renderTCPStatus();
 if(offlineBundle){
  $('#refresh-prices').title=T('offline.noRefresh');
  $('#offline-date').textContent=T('offline.date',{date:dateLabel(catalog.verifiedAt||offlineBundle.catalog.verifiedAt,language)});
 }
 $('#char-count').textContent=T('input.characters',{count:$('#description').value.length});
 render();renderCatalogueMetadata();if(activeView==='catalog')renderCatalog();
}
function setLanguage(next){
 const previous=language;language=next==='en'?'en':'zh';
 if($('#project-name').value===t('project.name',previous))$('#project-name').value=T('project.name');
 saveLanguage(storage,language);localize();
}
$('#language-toggle').addEventListener('click',()=>setLanguage(language==='en'?'zh':'en'));
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view)));
$('#mapping-nav').addEventListener('click',openMapping);
$$('[data-input]').forEach(button=>button.addEventListener('click',()=>{
 $$('[data-input]').forEach(tab=>{tab.classList.toggle('selected',tab===button);tab.setAttribute('aria-selected',String(tab===button));});
 $('#text-pane').hidden=button.dataset.input!=='text';$('#file-pane').hidden=button.dataset.input!=='file';
}));
$('#description').addEventListener('input',()=>{$('#char-count').textContent=T('input.characters',{count:$('#description').value.length});});
function setRows(incoming,append=false){
 if(!incoming.length)throw Error(T('error.noResources'));
 const candidate=append?rows.concat(incoming):incoming;if(candidate.length>2000)throw Error(T('error.limit'));
 incoming.forEach(row=>{row.targetId=recommend(row,catalog);});rows=candidate;page=0;render();
 toast(T('toast.parsed',{count:incoming.length}));
}
$('#parse').addEventListener('click',()=>{try{setRows(parseText($('#description').value));}catch(error){report(error);}});
function sample(){
 $('#description').value=language==='en'?'EC2 m6i.2xlarge Linux, quantity=2, usage=730 hours\nEBS gp3 500 GB, quantity=1\nRDS db.m5.large MySQL, quantity=1, usage=730 hours':'2 台 EC2 m6i.2xlarge Linux，每台每月 730 小时\n1 个 EBS gp3 500 GB，每月使用\n1 台 RDS db.m5.large MySQL，每月 730 小时';
 $('#char-count').textContent=T('input.characters',{count:$('#description').value.length});
 try{setRows(parseText($('#description').value));}catch(error){report(error);}
}
$('#sample').addEventListener('click',sample);
$('#add').addEventListener('click',()=>{
 rows.push({id:crypto.randomUUID(),product:'EC2',specification:'',region:'',quantity:null,usage:null,unit:'hour',billing:'未提供',targetBilling:'ONDEMAND',targetQuantity:null,capacity:null,service:'ECS',scope:'resource',period:'monthly',notes:'手动添加，请补全规格、数量和用量。',accepted:false,targetId:'',manualRate:null});
 page=Math.floor((rows.length-1)/10);render();
});
$('#resources').addEventListener('change',event=>{
 const field=event.target.dataset.field;if(!field)return;
 const owner=event.target.closest('[data-id]'),row=rows.find(item=>item.id===owner?.dataset.id);if(!row)return;
 const input=event.target;
 row[field]=field==='accepted'?input.checked:['quantity','targetQuantity','capacity','usage'].includes(field)?input.value===''?null:Number(input.value):input.value;
 if(field==='targetBilling')switchBilling(row,input.value,catalog);
 if(['targetId','service','targetQuantity','capacity','usage','unit','period'].includes(field)){row.accepted=false;if(field==='service')row.targetId='';}
 render();
});
$('#resources').addEventListener('click',event=>{
 if(event.target.closest('[data-sample]')){sample();return;}
 const button=event.target.closest('[data-delete]');if(!button)return;
 rows=rows.filter(row=>row.id!==button.dataset.delete);render();
});
$('#prev-page').onclick=()=>{page--;render();};$('#next-page').onclick=()=>{page++;render();};
$('#bulk-billing').addEventListener('change',event=>{
 if(!event.target.value)return;rows.forEach(row=>switchBilling(row,event.target.value,catalog));
 render();event.target.value='';toast(T('toast.switched'));
});
$('#hours').addEventListener('change',render);$('#discount').addEventListener('change',render);
$('#confirm-all').addEventListener('click',()=>{$('#confirm-check').checked=false;$('#apply-confirm').disabled=true;$('#confirm-dialog').showModal();});
$('#confirm-check').addEventListener('change',event=>{$('#apply-confirm').disabled=!event.target.checked;});
$('#cancel-confirm').addEventListener('click',()=>$('#confirm-dialog').close());
$('#apply-confirm').addEventListener('click',()=>{rows.forEach(row=>{if(row.targetId)row.accepted=true;});$('#confirm-dialog').close();render();toast(T('toast.confirmed'));});

async function importFile(file){
 if(!file)return;if(file.size>10*1024*1024){toast(T('error.size'),true);return;}
 busy=true;render();toast(T('input.parsing'));
 let pdf;
 try{
  const bytes=await file.arrayBuffer();let parsed;
  if(/\.pdf$/i.test(file.name)){
   if(!window.pdfjsLib)throw Error(T('error.pdfModule'));
   window.pdfjsLib.GlobalWorkerOptions.workerSrc=offlineBundle?.pdfWorkerURL||'/vendor/pdf.worker.min.js';
   pdf=await window.pdfjsLib.getDocument({data:bytes,isEvalSupported:false}).promise;
   if(pdf.numPages>50)throw Error(T('error.pdfPages'));
   const pages=[];
   for(let number=1;number<=pdf.numPages;number++){
    const pdfPage=await pdf.getPage(number),content=await pdfPage.getTextContent(),grouped=[];
    for(const item of content.items){
     if(!item.str?.trim())continue;const y=item.transform[5];let line=grouped.find(group=>Math.abs(group.y-y)<2);
     if(!line){line={y,items:[]};grouped.push(line);}line.items.push({x:item.transform[4],text:item.str});
    }
    grouped.sort((a,b)=>b.y-a.y);pages.push(grouped.map(group=>group.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n'));
   }
   parsed=parseBillPages(pages);
  }else if(/\.(csv|xlsx)$/i.test(file.name)){
   if(!window.XLSX)throw Error(T('error.excelModule'));
   const book=window.XLSX.read(bytes,{type:'array',cellFormula:false,cellHTML:false});
   const worksheet=book.Sheets[book.SheetNames.includes('Input')?'Input':book.SheetNames[0]];
   parsed=normalizeRows(window.XLSX.utils.sheet_to_json(worksheet,{defval:''}));
  }else throw Error(T('error.fileType'));
  setRows(parsed);
 }catch(error){report(error);}finally{
  if(pdf){try{await pdf.destroy();}catch{/* Cleanup failure must not leave import controls locked. */}}
  $('#file').value='';busy=false;render();
 }
}
$('#file').addEventListener('change',event=>importFile(event.target.files[0]));
for(const name of ['dragenter','dragover'])$('#dropzone').addEventListener(name,event=>{event.preventDefault();if(!busy)$('#dropzone').classList.add('drag');});
for(const name of ['dragleave','drop'])$('#dropzone').addEventListener(name,event=>{event.preventDefault();$('#dropzone').classList.remove('drag');if(name==='drop'&&!busy)importFile(event.dataTransfer.files[0]);});
function download(data,name,type){
 const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
$('#template').addEventListener('click',()=>download('\uFEFFproduct,specification,region,quantity,usage,billing_method,unit\r\nEC2,m6i.2xlarge Linux,eu-central-1,2,730,on-demand,hour\r\nEBS,gp3,eu-central-1,1,500,on-demand,GB-month\r\nRDS,db.m5.large MySQL Single-AZ,eu-central-1,1,730,on-demand,hour\r\n','aws-resource-template.csv','text/csv;charset=utf-8'));
function exportExcel(){
 try{
  if(!window.XLSX)throw Error(T('error.excelModule'));
  const book=buildWorkbook(window.XLSX,rows,catalog,{...settings(),language,delivery:offlineBundle?'offline':'web'},$('#project-name').value);
  window.XLSX.writeFile(book,'Huawei-Cloud-Quotation-'+new Date().toISOString().slice(0,10)+'.xlsx');toast(T('toast.exported'));
 }catch(error){report(error);}
}
$('#export').addEventListener('click',exportExcel);$('#quote-export').addEventListener('click',exportExcel);
$('#catalog-search').addEventListener('input',renderCatalog);$('#catalog-service').addEventListener('change',renderCatalog);$('#catalog-mode').addEventListener('change',renderCatalog);
$('#export-evidence').addEventListener('click',()=>download(JSON.stringify(catalog,null,2),'huawei-official-price-evidence.json','application/json'));
$('#refresh-prices').addEventListener('click',async()=>{
 if(offlineBundle){toast(T('offline.noRefresh'),true);return;}
 const ids=[...new Set(rows.map(row=>row.targetId).filter(Boolean))];if(!ids.length||busy)return;
 busy=true;render();toast(T('toast.refreshing'));let count=0,failed=0;
 try{
  for(let start=0;start<ids.length;start+=10){
   const response=await fetch('/api/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.slice(start,start+10)})});
   if(!response.ok)throw Error(T('error.refresh'));
   const data=await response.json();
   for(const plan of data.items||[]){const index=catalog.items.findIndex(item=>item.id===plan.id);if(index>=0){catalog.items[index]=plan;count++;}}
   failed+=(data.pending||[]).length;
  }
  toast(T('toast.refreshed',{count})+(failed?' '+T('toast.refreshPartial',{count:failed}):''));
 }catch{
  // A later batch can fail after earlier plans were successfully refreshed.
  const message=count?`${T('toast.refreshed',{count})} ${T('toast.refreshPartial',{count:ids.length-count})}`:T('error.refresh');
  toast(message,true);
 }finally{
  busy=false;updateCatalogState();render();renderCatalogueMetadata();if(activeView==='catalog')renderCatalog();
 }
});
function updateCatalogState(){
 if(!catalog.items.length){catalogState='unavailable';return;}
 const validations=catalog.items.map(plan=>priceValidation(plan,catalog));
 catalogState=validations.some(result=>result.valid)?'ready':validations.every(result=>result.code==='PRICE_EXPIRED')?'expired':'unavailable';
}

if(offlineBundle)$('#refresh-prices [data-i18n]').dataset.i18n='offline.refresh';
$('#project-name').value=T('project.name');localize();
try{
 const data=offlineBundle?structuredClone(offlineBundle.catalog):await (async()=>{
  const response=await fetch('/catalog.json');if(!response.ok)throw Error(T('error.catalog'));return response.json();
 })();
 if(!Array.isArray(data.items))throw Error(T('error.catalog'));
 catalog=data;updateCatalogState();
 rows.forEach(row=>{if(!row.targetId&&!row.accepted)row.targetId=recommend(row,catalog);});
 render();renderCatalogueMetadata();
}catch(error){catalogState='unavailable';renderConnection();renderCatalogueMetadata();toast(T('error.catalog'),true);}
