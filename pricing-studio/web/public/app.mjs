import {buildWorkbook} from './excel.mjs';
import {normalizeRows,parseText,recommend,calculate,parseBillPages,switchBilling,priceValidation,huaweiProductSpecIssue,huaweiQuoteLines,huaweiApprovalKey,finite,huaweiBudget} from './engine.mjs';
import {tcpQuoteRows,tcpQuoteTotals} from './providers.mjs';
import {t,billingLabel,dateLabel,translateMessage,readLanguage,saveLanguage,applyTranslations,serviceLabel,reasonLabel} from './i18n.mjs';
import {escapeHTML,icon,money,emptyResources,resourceHTML,tcpResourceHTML,summaryModel,breakdownHTML,catalogueHTML,migrationControls} from './ui.mjs';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const storage=(()=>{try{return window.localStorage;}catch{return undefined;}})();
const offlineBundle=window.PRICING_STUDIO_OFFLINE||null;
const huaweiMatching=offlineBundle?null:await import('./huawei-match.mjs');
const inventoryReview=offlineBundle?null:(await import('./inventory-review.mjs')).createInventoryReview({
 getLanguage:()=>language,onConfirm:incoming=>setRows(incoming),onError:error=>report(error)
});
let language=readLanguage(storage);
let catalog={items:[],ttlDays:7},rows=[],page=0,activeView='studio',mappingSelected=false,busy=false,catalogState='loading';
let tcpStatus={provider:'tcp',status:'NEVER_CHECKED'},tcpLoaded=false,tcpBusy=false;
let provider='huawei',tcpPublication={state:null,catalog:null},tcpQuoteLoading=false,tcpExpiryTimer;
let conditionAnchor=null,pendingOnly=false;
const T=(key,vars)=>t(key,language,vars);
const E=escapeHTML;

function toast(message,error=false){
 const box=$('#message');box.textContent=message;box.classList.toggle('error',error);box.hidden=false;
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>{box.hidden=true;},error?9000:5500);
}
function report(error,fallback='error.file'){
 const message=error?.message||T(fallback);
 toast(message.startsWith('inventory.')?T(message):translateMessage(message,language),true);
}
function selectHuawei(row){
 huaweiMatching.applyHuaweiMatch(huaweiMatching.identifyHuaweiRow(row),catalog);
}
function setBilling(row,mode){
 if(provider==='huawei'&&huaweiMatching)huaweiMatching.selectHuaweiBilling(row,mode,catalog);
 else switchBilling(row,mode,catalog);
}
function canConfirm(row){
 if(!row.targetId)return false;
 return provider!=='huawei'||!row.awsMatchIssue&&(!row.huaweiProductMatch||!huaweiProductSpecIssue(row,catalog.items.find(item=>item.id===row.targetId)));
}
function refreshIds(output){
 return [...new Set(huaweiQuoteLines(rows,output).filter(({row,result})=>row?.targetId&&result.status!=='Linked'&&
  (canConfirm(row)||row.huaweiMatch==='PRICE_EXPIRED')).map(({row})=>row.targetId))];
}
function settings(){
 const hours=Number($('#hours').value),discount=Number($('#discount').value)/100;
 if(!Number.isFinite(hours)||hours<=0||hours>744)throw Error(T('error.hours'));
 if(!Number.isFinite(discount)||discount<0||discount>1)throw Error(T('error.discount'));
 const storageBudget={};
 if(huaweiMatching&&provider==='huawei'){
  for(const [service,id] of [['RDS','#rds-budget-storage'],['CSS','#css-budget-storage']]){
   const value=finite($(id).value,T('migration.field.storageGiB'),true);
   if(value!==null&&value<=0)throw Error(T('budget.storageError'));
   storageBudget[service]=value;
  }
 }
 return {hours,discount,storageBudget};
}
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
 const expired=Date.now()-Date.parse(tcpPublication.state?.lastVerifiedAt)>48*3600000||tcpPublication.state?.effectiveState==='STALE';
 const state=provider==='huawei'?catalogState:tcpQuoteLoading?'loading':expired?'expired':tcpPublication.catalog?'ready':'unavailable';
 const connection=$('.connection');connection.classList.toggle('expired',state==='expired');connection.classList.toggle('unavailable',state==='unavailable');
 $('#connection-label').textContent=T(state==='loading'?'top.loading':state==='expired'?'top.expired':state==='unavailable'?'top.unavailable':offlineBundle?'offline.snapshot':'top.connected');
}
function renderMetrics(output,now,ready=output.filter(result=>result.status==='Valid'||result.status==='Period').length){
 $('#metric-resources').textContent=rows.length.toLocaleString(language==='en'?'en-US':'zh-CN');
 $('#metric-confirmed').innerHTML=`${ready} <em>/ ${rows.length}</em>`;
 const count=provider==='tcp'?(now-Date.parse(tcpPublication.state?.lastVerifiedAt)<=48*3600000?tcpPublication.catalog?.items.length:0):catalog.items.filter(plan=>priceValidation(plan,catalog,{now}).valid).length;
 $('#metric-plans').textContent=count?count.toLocaleString(language==='en'?'en-US':'zh-CN'):'—';
}
function renderSummary(output,now){
 const summary=summaryModel(rows,output,language);
 $('#monthly-label').textContent=summary.monthlyLabel;
 $('#monthly-money').innerHTML=E(money(summary.monthly))+`<span> ${T(summary.onlyPeriod?'term.period':'term.monthly')}</span>`;
 $('#annual-label').textContent=summary.annualLabel;$('#annual-money').textContent=money(summary.annual);
 $('#scenario-label').textContent=summary.scenarioLabel;$('#scenario-money').textContent=money(summary.scenario);
 $('#upfront-row').hidden=!summary.hasPrepaid;$('#upfront-money').textContent=money(summary.upfront);
 $('#quote-status').textContent=summary.status;$('#quote-status').className='badge '+summary.statusClass;
 $('#coverage').textContent=summary.coverage;$('#quote-note').textContent=summary.note;
 const conditional=$('#conditional-summary');
 conditional.hidden=!summary.conditionalCount;
 conditional.textContent=summary.conditionalCount?[
  T('quote.conditional',{count:summary.conditionalCount}),
  summary.conditionalMonthly==null?'':T('quote.conditionalMonthly',{amount:money(summary.conditionalMonthly)}),
  summary.conditionalPeriod==null?'':T('quote.conditionalPeriod',{amount:money(summary.conditionalPeriod)})
 ].filter(Boolean).join(' · '):'';
 $('#breakdown').innerHTML=breakdownHTML(summary,language);renderMetrics(output,now);
}
function renderBudget(output,now){
 const budget=huaweiBudget(rows,output),source=budget.headline==='sourcePeriod';
 const amount=budget[budget.headline];
 $('#monthly-label').textContent=T(source?'budget.sourcePeriod':'budget.monthly');
 $('#monthly-money').innerHTML=E(money(amount))+(amount===null?'':`<span> ${T(source?'term.period':'term.monthly')}</span>`);
 $('#budget-monthly-row').hidden=!source||budget.monthly===null;
 $('#budget-monthly-money').textContent=money(budget.monthly);
 $('#annual-row').hidden=budget.annual===null;
 $('#annual-label').textContent=T('budget.annual');
 $('#annual-money').textContent=money(budget.annual);
 $('#upfront-row').hidden=budget.prepaid===null;
 $('#upfront-money').textContent=money(budget.prepaid);
 const partial=budget.unpriced>0||budget.excludedCharges>0;
 $('#quote-status').textContent=T(!budget.input?'status.waiting':amount===null?'budget.unavailable':partial?'budget.partial':'budget.complete');
 $('#quote-status').className='badge '+(!budget.input?'neutral':partial||amount===null?'pending':'valid');
 $('#coverage').textContent=T('budget.coverage',{priced:budget.priced,input:budget.input});
 $('#budget-unpriced').hidden=!budget.input;
 $('#budget-unpriced').textContent=T('budget.unpriced',{rows:budget.unpriced,charges:budget.excludedCharges});
 $('#budget-show-unpriced').hidden=!budget.unpriced;
 $('#quote-note').textContent=budget.input?T('budget.detail'):T('budget.start');
 const conditional=$('#conditional-summary');
 conditional.hidden=!budget.conditionalCount;
 conditional.textContent=budget.conditionalCount?T('budget.conditional',{count:budget.conditionalCount}):'';
 $('#budget-assumptions').hidden=!budget.assumptions.length;
 $('#budget-assumption-list').replaceChildren(...budget.assumptions.map(([code,count])=>{
  const entry=document.createElement('li');
  entry.textContent=T('budget.assumptionLine',{text:reasonLabel({reasonCode:code},language),count});
  return entry;
 }));
 $('#breakdown-heading').textContent=T(source?'budget.periodBreakdown':'quote.breakdown');
 $('#breakdown').innerHTML=breakdownHTML({has:amount!==null,scenario:amount,groups:budget.groups},language);
 renderMetrics(output,now,budget.priced);
}
function renderTCPSummary(output,now){
 const totals=tcpQuoteTotals(output);
 $('#monthly-label').textContent=T('tcp.quote.subtotal');$('#monthly-money').textContent=money(totals.monthly,'EUR');
 $('#annual-label').textContent=T('tcp.quote.periodSubtotal');$('#annual-money').textContent=money(totals.period,'EUR');
 $('#upfront-row').hidden=true;
 $('#quote-status').textContent=T(!rows.length?'status.waiting':totals.pendingCount?'tcp.quote.pendingCount':'tcp.quote.priced',{count:totals.pendingCount});
 $('#quote-status').className='badge '+(!rows.length?'neutral':totals.pendingCount?'pending':'valid');
 $('#coverage').textContent=T('quote.coverage',{ready:totals.ready,total:rows.length});
 $('#conditional-summary').hidden=true;
 $('#quote-note').textContent=T('tcp.quote.note');
 renderMetrics(output,now);
}
function render({now=Date.now()}={}){
 let output;
 const isTCP=provider==='tcp';
 try{
  if(isTCP){
   output=tcpQuoteRows(rows,tcpPublication.catalog,{updateState:tcpPublication.state,now});
   renderTCPSummary(output,now);
  }else{
   const options={...settings(),now};
   output=huaweiMatching?huaweiMatching.quoteHuaweiRows(rows,catalog,options):rows.map(row=>calculate(row,catalog,options));
   if(huaweiMatching)renderBudget(output,now);else renderSummary(output,now);
  }
 }catch(error){
  $('#monthly-money').textContent='—';$('#annual-money').textContent='—';$('#scenario-money').textContent='—';
  $('#upfront-row').hidden=true;$('#upfront-money').textContent='—';$('#coverage').textContent='—';$('#breakdown').textContent='—';
  for(const id of ['#budget-monthly-row','#budget-assumptions','#budget-unpriced','#budget-show-unpriced','#conditional-summary'])$(id).hidden=true;
  $('#quote-status').textContent=T('status.invalid');$('#quote-status').className='badge pending';
  $('#quote-note').textContent=translateMessage(error.message,language);
  $('#export').disabled=true;$('#quote-export').disabled=true;$('#export-regression').disabled=true;report(error);return;
 }
 const filtered=!isTCP&&!!huaweiMatching&&pendingOnly;
 const visibleRows=filtered?rows.filter((_,i)=>output[i].status==='Pending'):rows;
 const visibleOutput=filtered?output.filter(result=>result.status==='Pending'):output;
 page=Math.min(page,Math.max(0,Math.ceil(visibleRows.length/10)-1));
 $('#resource-count').textContent=rows.length;
 $('#export').disabled=!rows.length||(isTCP&&tcpQuoteLoading);$('#quote-export').disabled=$('#export').disabled;
 $('#export-regression').disabled=!rows.length||busy||isTCP||!!offlineBundle;
 $('#confirm-all').disabled=!rows.some(row=>!row.accepted&&!row.huaweiConditionKey&&canConfirm(row));
 $('#refresh-prices').disabled=!!offlineBundle||busy||(isTCP?tcpQuoteLoading:!refreshIds(output).length);
 $('#parse').disabled=busy;$('#file').disabled=busy;
 $('#resources').innerHTML=!rows.length?emptyResources(language):isTCP?tcpResourceHTML(rows,output,tcpPublication.state,language,page):
  resourceHTML(visibleRows,visibleOutput,catalog,language,page,now)||`<p class="row-notes">${E(T('budget.noneUnpriced'))}</p>`;
 $('#unpriced-toggle').hidden=isTCP||!huaweiMatching||!rows.length;
 $('#unpriced-toggle').textContent=T(filtered?'budget.showAll':'budget.showUnpriced');
 $('#unpriced-toggle').setAttribute('aria-pressed',String(filtered));
 $('#resource-pagination').hidden=visibleRows.length<=10;
 $('#page-info').textContent=T('pagination.info',{start:page*10+1,end:Math.min(page*10+10,visibleRows.length),total:visibleRows.length});
 $('#prev-page').disabled=page===0;$('#next-page').disabled=(page+1)*10>=visibleRows.length;
 renderConnection();
 return output;
}
function renderProvider(){
 const isTCP=provider==='tcp';
 const onlineHuawei=!isTCP&&!!huaweiMatching;
 $('#export-regression').hidden=!onlineHuawei;
 $('#inventory-ai-option').hidden=!onlineHuawei||!['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 for(const element of $$('[data-huawei-quote]'))element.hidden=isTCP;
 for(const element of $$('[data-tcp-quote]'))element.hidden=!isTCP;
 $('#target-provider-control').hidden=!!offlineBundle;
 for(const element of $$('[data-budget]'))element.hidden=!onlineHuawei;
 $('#annual-row').hidden=false;
 $('#discounted-scenario').hidden=isTCP||onlineHuawei;
 $('#quote-title').textContent=T(onlineHuawei?'budget.title':'quote.title');
 $('#metric-priced-label').textContent=T(onlineHuawei?'budget.priced':'metric.confirmed');
 $('#metric-priced-hint').textContent=T(onlineHuawei?'budget.pricedHint':'metric.confirmedHint');
 $('[data-i18n="app.heading"]').textContent=T(onlineHuawei?'budget.heading':'app.heading');
 $('[data-i18n="app.subtitle"]').textContent=T(onlineHuawei?'budget.subtitle':'app.subtitle');
 document.title=T(onlineHuawei?'budget.pageTitle':'app.title');
 $('#refresh-prices span').textContent=T(isTCP?'tcp.quote.reload':offlineBundle?'offline.refresh':'quote.refresh');
 $('#mapping-notice').textContent=T(isTCP?'tcp.quote.notice':onlineHuawei?'mapping.hwNotice':'mapping.notice');
 $('[data-i18n="input.file"]').textContent=T(onlineHuawei?'input.hwFile':'input.file');
 $('[data-i18n="input.schema"]').textContent=T(onlineHuawei?'input.hwSchema':'input.schema');
 $('#quote-evidence').textContent=T(isTCP?'tcp.quote.evidence':'evidence.text');
 $('#metric-plans-hint').textContent=T(isTCP?'tcp.quote.hint':'metric.plansHint');
 $('.migration-hero').setAttribute('aria-label',isTCP?'AWS to T-Cloud Public':'AWS to Huawei Cloud Public');
}
async function loadTCPQuote(){
 if(tcpQuoteLoading)return;
 tcpQuoteLoading=true;render();clearTimeout(tcpExpiryTimer);
 try{
  const response=await fetch('/api/catalog/tcp/catalog',{cache:'no-store'});
  if(!response.ok)throw Error('TCP catalog unavailable');
  const data=await response.json();
  if(data?.state?.provider!=='tcp')throw Error('Invalid TCP publication');
  tcpPublication=data;
  if(data.catalog&&data.state.effectiveState==='ACTIVE'){
   const deadline=Date.parse(data.state.lastVerifiedAt)+48*3600000;
   if(Number.isFinite(deadline)&&deadline>Date.now())tcpExpiryTimer=setTimeout(()=>{if(provider==='tcp')render();},deadline-Date.now()+1);
  }
 }catch{
  tcpPublication={state:null,catalog:null};
 }finally{
  tcpQuoteLoading=false;
  if(provider==='tcp')render();
 }
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
 const known=['NEVER_CHECKED','PENDING_REVIEW','PENDING_VALIDATION','UNCHANGED','UPDATED','CHECK_FAILED','DOCUMENT_CHANGED'];
 $('#tcp-current').textContent=tcpStatus.currentVersion||T('tcp.noEffective');
 $('#tcp-candidate').textContent=tcpStatus.candidateVersion||T('tcp.noCandidate');
 $('#tcp-checked').textContent=tcpStatus.lastCheckedAt?dateLabel(tcpStatus.lastCheckedAt,language):'—';
 $('#tcp-verified').textContent=tcpStatus.lastVerifiedAt?dateLabel(tcpStatus.lastVerifiedAt,language):'—';
 const effective=['UNINITIALIZED','ACTIVE','PENDING','STALE'].includes(tcpStatus.effectiveState)?tcpStatus.effectiveState:'PENDING';
 $('#tcp-effective').textContent=T('tcp.effective.'+effective);
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
 }catch{tcpStatus={...tcpStatus,status:'CHECK_FAILED',effectiveState:'PENDING'};}
 renderTCPStatus();
}
$('#tcp-check').addEventListener('click',async()=>{
 if(offlineBundle||tcpBusy)return;tcpBusy=true;renderTCPStatus();toast(T('tcp.checking'));
 try{
  const response=await fetch('/api/catalog/tcp/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const state=await response.json();tcpStatus=state?.provider==='tcp'?{...tcpStatus,...state}:{...tcpStatus,status:'CHECK_FAILED',effectiveState:'PENDING'};
 }catch{tcpStatus={...tcpStatus,status:'CHECK_FAILED',effectiveState:'PENDING'};}
 finally{tcpBusy=false;renderTCPStatus();}
});
function localize(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=T('app.title');
 applyTranslations(document,language);refreshCrumb();renderProvider();
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
$('#target-provider').addEventListener('change',event=>{
 if(offlineBundle)return;
 provider=event.target.value;page=0;renderProvider();
 if(provider==='tcp')loadTCPQuote();
 else if(huaweiMatching)rows.forEach(selectHuawei);
 render();
});
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
 incoming.forEach(row=>{
  if(provider==='huawei'&&huaweiMatching)selectHuawei(row);
  else row.targetId=recommend(row,catalog);
 });
 rows=candidate;page=0;pendingOnly=false;render();
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
 pendingOnly=false;page=Math.floor((rows.length-1)/10);render();
});
$('#resources').addEventListener('change',event=>{
 const field=event.target.dataset.field;if(!field)return;
 const owner=event.target.closest('[data-id]'),row=rows.find(item=>item.id===owner?.dataset.id);if(!row)return;
 const input=event.target;
 row[field]=field==='accepted'?input.checked:['quantity','targetQuantity','capacity','usage'].includes(field)?input.value===''?null:Number(input.value):input.value;
 if(field==='unit')row.unitExplicit=!!input.value;
 if(field==='specification'&&provider==='tcp'){row.targetId=recommend(row,catalog);row.accepted=false;}
 if(field==='targetBilling')setBilling(row,input.value);
 if(provider==='huawei'&&huaweiMatching){
  if(field!=='accepted')row.huaweiConditionApproval=null;
  const importFields={targetQuantity:'quantity',capacity:'capacity_gb',unit:'unit',period:'usage_period',usage:'usage',
   service:'product',specification:'specification',huaweiTargetRegion:'huawei_target_region'};
  if(row.huaweiImportIssues?.length&&importFields[field])row.huaweiImportIssues=row.huaweiImportIssues.filter(key=>key!==importFields[field]);
  if(row.importSource?.fieldSources&&importFields[field])row.importSource.fieldSources[importFields[field]]={origin:'confirmed'};
  if(field==='huaweiTargetRegion')row.huaweiRegionFromSpec=false;
  if(row.service==='NAT Gateway'&&(field==='usage'||field==='unit'))row.huaweiNatUsageFromText=false;
  if(field==='capacity'&&['EVS','DCS'].includes(row.service))row.huaweiCapacityExplicit=row.capacity!==null;
  if(row.service==='EVS'){
   if(field==='usage'){
    row.huaweiUsageFromSpec=false;row.evsUsageConflict=false;
   }else if(field==='unit'&&!row.evsUsageConflict)row.huaweiUsageFromSpec=false;
  }
  if(field==='targetId'||field==='accepted'){
   if(row.targetId==='__auto__'){
    row.huaweiSelection=null;row.huaweiPreferredSku=null;
    if(row.huaweiDesign?.candidateId)delete row.huaweiDesign.candidateId;
    selectHuawei(row);
   }else{
    row.huaweiSelection='manual';row.huaweiCandidates=null;
    row.huaweiPreferredSku=catalog.items.find(item=>item.id===row.targetId)?.sku;
    if(field==='targetId'){row.accepted=false;row.huaweiAssumptions=[];row.huaweiMatch=row.targetId?'HW_MATCHED':'HW_MANUAL_SERVICE';}
    if(huaweiMatching.revalidateHuaweiSelection(row))selectHuawei(row);
    else huaweiMatching.setHuaweiUsageAssumption(row,catalog.items.find(item=>item.id===row.targetId));
    if(field==='accepted'&&row.huaweiConditionKey)row.huaweiConditionApproval=row.accepted?
     huaweiApprovalKey(row,catalog.items.find(item=>item.id===row.targetId),settings()):null;
   }
  }else if(['service','targetQuantity','capacity','usage','unit','period','specification','huaweiTargetRegion'].includes(field)){
   if(field==='service'){row.targetId='';row.huaweiSelection=null;row.huaweiPreferredSku=null;}
   row.accepted=false;
   if(row.huaweiSelection!=='manual'||huaweiMatching.revalidateHuaweiSelection(row))selectHuawei(row);
   else{
    if(['specification','capacity'].includes(field))huaweiMatching.identifyHuaweiRow(row);
    huaweiMatching.setHuaweiUsageAssumption(row,catalog.items.find(item=>item.id===row.targetId));
   }
  }
 }else if(['targetId','service','targetQuantity','capacity','usage','unit','period'].includes(field)){
  row.accepted=false;if(field==='service')row.targetId='';
 }
 render();
});
$('#resources').addEventListener('click',event=>{
 if(event.target.closest('[data-sample]')){sample();return;}
 const review=event.target.closest('[data-review-condition]');
 if(review&&provider==='huawei'&&huaweiMatching){
  conditionAnchor=rows.find(row=>row.id===review.dataset.reviewCondition);
  if(!conditionAnchor)return;
  const migration=huaweiMatching.migrationGroup(conditionAnchor);
  if(!conditionAnchor.huaweiConditionKey&&!migration)return;
  const group=rows.filter(row=>migration?huaweiMatching.migrationGroup(row)===migration:
   row.huaweiConditionKey===conditionAnchor.huaweiConditionKey).length;
  const sku=catalog.items.find(plan=>plan.id===conditionAnchor.targetId)?.sku;
  $('#condition-detail').textContent=[T('quote.conditionGroup',{count:group,sku:sku??'—'}),
   ...(conditionAnchor.huaweiConditions??[]).map(reasonCode=>reasonLabel({reasonCode},language))].join(' ');
  const form=$('#migration-form');
  form.hidden=!migration;
  form.innerHTML=migration?migrationControls(conditionAnchor,language):'';
  $('#save-migration').hidden=!migration;
  $('#condition-audit').open=false;
  $('#condition-audit').hidden=!conditionAnchor.huaweiConditionKey||conditionAnchor.huaweiMigration?.canApprove===false;
  $('#migration-check-label').hidden=!migration;
  $('#migration-check').checked=false;
  $('#apply-condition').disabled=!!migration;
  $('#condition-dialog').showModal();return;
 }
 const button=event.target.closest('[data-delete]');if(!button)return;
 rows=rows.filter(row=>row.id!==button.dataset.delete);render();
});
$('#prev-page').onclick=()=>{page--;render();};$('#next-page').onclick=()=>{page++;render();};
$('#unpriced-toggle').onclick=()=>{pendingOnly=!pendingOnly;page=0;render();};
$('#budget-show-unpriced').onclick=()=>{pendingOnly=true;page=0;render();openMapping();};
$('#bulk-billing').addEventListener('change',event=>{
 if(!event.target.value)return;rows.forEach(row=>setBilling(row,event.target.value));
 render();event.target.value='';toast(T('toast.switched'));
});
for(const selector of ['#hours','#discount'])$(selector).addEventListener('change',()=>{
 rows.forEach(row=>{if(row.huaweiConditionKey)row.huaweiConditionApproval=null;});
 render();
});
for(const selector of ['#rds-budget-storage','#css-budget-storage'])$(selector).addEventListener('change',()=>render());
$('#confirm-all').addEventListener('click',()=>{$('#confirm-check').checked=false;$('#apply-confirm').disabled=true;$('#confirm-dialog').showModal();});
$('#confirm-check').addEventListener('change',event=>{$('#apply-confirm').disabled=!event.target.checked;});
$('#cancel-confirm').addEventListener('click',()=>$('#confirm-dialog').close());
$('#apply-confirm').addEventListener('click',()=>{rows.forEach(row=>{if(!row.huaweiConditionKey&&canConfirm(row))row.accepted=true;});$('#confirm-dialog').close();render();toast(T('toast.confirmed'));});
$('#cancel-condition').addEventListener('click',()=>$('#condition-dialog').close());
$('#migration-form').addEventListener('submit',event=>event.preventDefault());
$('#migration-form').addEventListener('change',event=>{
 if(event.target.name!=='engine'||conditionAnchor?.huaweiMigration?.kind!=='RDS')return;
 const version=event.currentTarget.elements.namedItem('version');
 for(const option of version.options){
  option.disabled=option.hidden=!!option.dataset.engine&&option.dataset.engine!==event.target.value;
 }
 version.value='';
});
$('#migration-check').addEventListener('change',()=>{
 $('#apply-condition').disabled=!$('#migration-check').checked||!conditionAnchor?.huaweiConditionKey||
  conditionAnchor.huaweiMigration?.canApprove===false;
});
$('#save-migration').addEventListener('click',()=>{
 const form=$('#migration-form');
 if(!conditionAnchor||!huaweiMatching||!form.reportValidity())return;
 const design=Object.fromEntries([...new FormData(form)].flatMap(([key,value])=>{
  const text=value.trim();
  if(!text)return [];
  return [[key,form.elements.namedItem(key)?.type==='number'?Number(text):text]];
 }));
 const previous=conditionAnchor.huaweiMigration?.settings??{};
 if(design.candidateId===conditionAnchor.huaweiDesign?.candidateId&&
    Object.entries(design).some(([key,value])=>key!=='candidateId'&&previous[key]?.value!==value))delete design.candidateId;
 const count=huaweiMatching.configureHuaweiMigrationGroup(rows,conditionAnchor,design,catalog,settings());
 $('#condition-dialog').close();render();toast(T('migration.saved',{count}));
});
$('#apply-condition').addEventListener('click',()=>{
 if(!conditionAnchor||provider!=='huawei'||!huaweiMatching)return;
 const count=huaweiMatching.confirmHuaweiConditionGroup(rows,conditionAnchor,catalog,settings());
 $('#condition-dialog').close();render();toast(T('toast.groupConfirmed',{count}));
});

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
   const huaweiCSV=provider==='huawei'&&inventoryReview&&/\.csv$/i.test(file.name);
   let input=bytes;
   if(huaweiCSV){
    try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{throw Error('inventory.encoding');}
   }
   const book=window.XLSX.read(input,{type:huaweiCSV?'string':'array',cellFormula:false,cellHTML:false,...(huaweiCSV?{raw:true}:{})});
   if(provider==='huawei'&&inventoryReview)parsed=inventoryReview.read(book,window.XLSX,{reviewAws:$('#inventory-ai-review').checked});
   else{
    const worksheet=book.Sheets[book.SheetNames.includes('Input')?'Input':book.SheetNames[0]];
    parsed=normalizeRows(window.XLSX.utils.sheet_to_json(worksheet,{defval:''}));
   }
  }else throw Error(T('error.fileType'));
  if(parsed)setRows(parsed);
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
  const now=Date.now();
  // A displayed plan can expire while the page is idle or a refresh is pending.
  const output=render({now});
  if(!output||provider==='tcp'&&tcpQuoteLoading)return;
  const options={now,language,delivery:offlineBundle?'offline':'web'};
  const isTCP=provider==='tcp';
  const book=buildWorkbook(window.XLSX,rows,isTCP?tcpPublication.catalog:catalog,
   isTCP?{...options,provider,output,updateState:tcpPublication.state}:{...options,...settings(),output},$('#project-name').value);
  window.XLSX.writeFile(book,(isTCP?'TCP':'Huawei-Cloud')+'-Quotation-'+new Date(now).toISOString().slice(0,10)+'.xlsx');toast(T('toast.exported'));
 }catch(error){report(error);}
}
$('#export').addEventListener('click',exportExcel);$('#quote-export').addEventListener('click',exportExcel);
const regressionDialog=$('#regression-dialog');
$('#export-regression').addEventListener('click',()=>regressionDialog.showModal());
regressionDialog.addEventListener('submit',async event=>{
 event.preventDefault();
 const stage=event.submitter?.value;
 regressionDialog.close();
 if(!['initial','reviewed'].includes(stage)||offlineBundle||provider!=='huawei'||busy)return;
 try{
  const {collectHuaweiRegression}=await import('./huawei-regression.mjs');
  const now=Date.now(),output=render({now});
  if(!output||provider!=='huawei'||busy)return;
  const webVersion=$('.version').textContent.trim().replace(/^V/,'');
  const data=collectHuaweiRegression(rows,output,catalog,{webVersion,stage,now});
  download(JSON.stringify(data,null,2),'huawei-regression-'+webVersion+'-'+stage+'.json','application/json');
 }catch{toast(T('regression.error'),true);}
});
$('#catalog-search').addEventListener('input',renderCatalog);$('#catalog-service').addEventListener('change',renderCatalog);$('#catalog-mode').addEventListener('change',renderCatalog);
$('#export-evidence').addEventListener('click',()=>download(JSON.stringify(catalog,null,2),'huawei-official-price-evidence.json','application/json'));
$('#refresh-prices').addEventListener('click',async()=>{
 if(offlineBundle){toast(T('offline.noRefresh'),true);return;}
 if(provider==='tcp'){await loadTCPQuote();return;}
 const output=render(),ids=output?refreshIds(output):[];
 if(!ids.length||busy)return;
 const updates=new Map();
 busy=true;render();toast(T('toast.refreshing'));
 try{
  for(let start=0;start<ids.length;start+=10){
   const batch=ids.slice(start,start+10);
   try{
    const response=await fetch('/api/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:batch})});
    if(!response.ok)continue;
    const data=await response.json();
    for(const plan of data.items){
     if(batch.includes(plan?.id)&&priceValidation(plan,catalog).valid)updates.set(plan.id,plan);
    }
   }catch{
    // Keep the original evidence for this batch and attempt the remaining IDs.
    continue;
   }
  }
  // Until this synchronous commit, both export buttons use the displayed catalog.
  catalog.items=catalog.items.map(plan=>updates.get(plan.id)??plan);
 if(updates.size&&huaweiMatching)rows.filter(row=>row.huaweiMigration).forEach(selectHuawei);
  const failed=ids.length-updates.size;
  const summary=T('toast.refreshed',{count:updates.size});
  if(!updates.size)toast(T('error.refresh'),true);
  else if(failed)toast(summary+' '+T('toast.refreshPartial',{count:failed}),true);
  else toast(summary);
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
 rows.forEach(row=>{
  if(!row.targetId&&!row.accepted){
   if(provider==='huawei'&&huaweiMatching)selectHuawei(row);
   else row.targetId=recommend(row,catalog);
  }
 });
 render();renderCatalogueMetadata();
}catch(error){catalogState='unavailable';renderConnection();renderCatalogueMetadata();toast(T('error.catalog'),true);}
